import "server-only";
import { after } from "next/server";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { getDb, type Tx } from "@/db/client";
import {
  challengeParticipants,
  competitionEntries,
  competitions,
  gameSessionAnswers,
  gameSessions,
  journeyLevels,
  gameTypes,
  skillProgress,
  studentDailyActivity,
  studentVocabularyProgress,
  verbalSubskills,
} from "@/db/schema";
import { analytics } from "@/features/analytics/analytics";
import { evaluateBadges } from "@/features/badges/service";
import { emitRewardAnalytics } from "@/features/gamification/reward-analytics";
import { RewardCollector, type RewardSummary } from "@/features/gamification/rewards";
import { awardXp, ensureDailyActivity, lockProfile } from "@/features/gamification/xp.service";
import { loadLexicon, type Lexicon } from "@/features/lexicon/content";
import { RELATION_CATEGORY, type RelationType } from "@/features/lexicon/mapping";
import { checkMissionCompletion } from "@/features/missions/service";
import { publishedQuestions } from "@/features/question-bank/pool";
import { addInteractions, maybeQualifyDay } from "@/features/streaks/daily-rule";
import { defaultSrs, emptyProgress } from "@/features/vocabulary/srs";
import { refreshVocabCounters } from "@/features/word-bank/wod.service";
import { isProduction } from "@/lib/env";
import { addDays, learningDay, weekRange } from "@/lib/time";
import { hashString, seededRandom, shuffle } from "@/lib/utils";
import { eliminationHint, MAX_ROUNDS, MIN_ROUNDS, pickRounds, scoreRound, TIMED_ROUND_MS, updateMastery } from "./engine";
import { gameById, type GameDef } from "./modes";
import type { ClientRound, GameSummary, Round, SubskillResult } from "./types";
import { boardRounds, meaningRounds, playableTypes, relationForCategory, relationRounds } from "./vocab-builders";
import { publishedTeacherQuestions, type TeacherQuestion } from "@/features/questions/service";
import { currentLevel, finishLevel, levelRounds } from "@/features/journey/service";
import { MAX_LEVEL_ROUNDS } from "@/features/journey/plan";

export class GameError extends Error {
  constructor(public code: "unknown_game" | "not_live" | "locked" | "content_unavailable" | "not_found" | "not_in_progress" | "bad_round" | "incomplete" | "answered" | "time_up") {
    super(code);
  }
}

export const RACE_MS = 75_000;
const RACE_GRACE_MS = 3_000;
const REPEAT_WINDOW_DAYS = 14;
const BOARD_SIZE = 5;
const MEMORY_PAIRS = 6;

/** Noon's options, never rewritten; reordered only when Noon marks them shuffleable. */
export function orderChoices(q: { choices: { id: string; text: string }[]; shuffleChoices?: boolean }, rand: () => number) {
  const choices = q.choices.map((c) => ({ id: c.id, text: c.text }));
  return q.shuffleChoices ? shuffle(choices, rand) : choices;
}

async function masteryMap(userId: string) {
  const rows = await getDb().select().from(skillProgress).where(eq(skillProgress.userId, userId));
  return Object.fromEntries(rows.map((r) => [r.subskillId, r.mastery])) as Record<string, number>;
}

/** Spaced repetition: words due again (shown first) and words already well known (skipped). */
async function studentWords(userId: string) {
  const rows = await getDb()
    .select({ entryId: studentVocabularyProgress.entryId, next: studentVocabularyProgress.nextReviewAt, box: studentVocabularyProgress.box })
    .from(studentVocabularyProgress)
    .where(eq(studentVocabularyProgress.userId, userId));
  const now = Date.now();
  const due = rows.filter((r) => r.next && r.next.getTime() <= now).map((r) => r.entryId);
  const known = rows.filter((r) => r.box >= 3 && (!r.next || r.next.getTime() > now)).map((r) => r.entryId);
  return { due, known };
}

/** Teacher questions this student saw in the last week (avoid repeats while enough remain). */
async function recentTeacherQuestions(userId: string) {
  const rows = await getDb()
    .select({ rounds: gameSessions.rounds })
    .from(gameSessions)
    .where(and(eq(gameSessions.userId, userId), gte(gameSessions.day, addDays(learningDay(), -7))));
  return rows.flatMap((r) => (r.rounds as { teacherQuestionId?: string }[]).map((x) => x.teacherQuestionId).filter((x): x is string => !!x));
}

async function recentlyAnswered(userId: string) {
  const since = addDays(learningDay(), -REPEAT_WINDOW_DAYS);
  const rows = await getDb()
    .select({ questionId: gameSessionAnswers.questionId })
    .from(gameSessionAnswers)
    .innerJoin(gameSessions, eq(gameSessions.id, gameSessionAnswers.sessionId))
    .where(and(eq(gameSessions.userId, userId), gte(gameSessions.day, since)));
  return rows.map((r) => r.questionId).filter((x): x is string => !!x);
}

async function buildQuestionRounds(userId: string, gameId: string, topicId: string, rand: () => number): Promise<Round[]> {
  const db = getDb();
  const prod = isProduction();
  let pool = await publishedQuestions(db, { topicId, gameMode: gameId, excludeIds: await recentlyAnswered(userId), isProduction: prod });
  if (pool.length < MIN_ROUNDS) pool = await publishedQuestions(db, { topicId, gameMode: gameId, isProduction: prod });
  if (pool.length < MIN_ROUNDS) return [];
  return pickRounds(pool, { n: MAX_ROUNDS, mastery: await masteryMap(userId), rand }).map((q) => ({
    kind: "noon_question" as const,
    questionId: q.questionId,
    versionId: q.versionId,
    noonQuestionId: q.payload.noonQuestionId,
    subskillId: q.subskillId,
    difficulty: q.difficulty,
    stem: q.payload.stem,
    passage: q.passage,
    choices: orderChoices(q.payload, rand),
    correctId: q.payload.correctChoiceIds[0],
    explanation: q.payload.explanation,
    hintRemoved: null,
  }));
}

export type BuildOptions = { category?: string; relationType?: RelationType; preferEntries?: string[]; skipEntries?: string[]; recentQuestions?: string[] };

/** What the vocabulary games may use: approved word pairs (boards) and teacher-written questions. */
export type GameContent = { lx: Lexicon; questions: TeacherQuestion[] };

export async function loadGameContent(): Promise<GameContent> {
  const db = getDb();
  const [lx, questions] = [await loadLexicon(db, { isProduction: isProduction() }), await publishedTeacherQuestions(db)];
  return { lx, questions };
}

/** Teacher questions exactly as written (stem, options, answer, explanation) — never generated. */
function teacherRounds(questions: TeacherQuestion[], p: { n: number; rand: () => number; category?: string; recent?: string[] }): Round[] {
  let pool = questions.filter((q) => !p.category || q.categoryId === p.category);
  const recent = new Set(p.recent ?? []);
  const fresh = pool.filter((q) => !recent.has(q.id));
  if (fresh.length >= Math.min(p.n, MIN_ROUNDS)) pool = fresh;
  return shuffle(pool, p.rand)
    .slice(0, p.n)
    .map((q) => ({
      kind: "teacher" as const,
      teacherQuestionId: q.id,
      questionId: null,
      versionId: null,
      noonQuestionId: null,
      subskillId: q.categoryId,
      difficulty: q.difficulty,
      stem: q.stem,
      passage: null,
      choices: q.choices,
      correctId: q.correctId,
      explanation: q.explanation,
      hintRemoved: null,
    }));
}

function board(lx: Lexicon, mechanic: "match" | "memory", rand: () => number, o: BuildOptions): Round[] {
  const size = mechanic === "match" ? BOARD_SIZE : MEMORY_PAIRS;
  const types = playableTypes(lx, size, rand);
  const wanted = o.relationType ?? (o.category ? relationForCategory(o.category) ?? undefined : undefined);
  if (wanted && !types.includes(wanted)) return [];
  const type = wanted ?? shuffle(types, rand)[0];
  return type ? boardRounds(lx, type, size, rand, mechanic) : [];
}

/**
 * Teacher questions first; when there aren't enough yet, «ما معنى الكلمة؟» rounds built only from the
 * approved dictionary (word → its approved meaning among other approved, non-synonym meanings).
 */
function withMeaningFallback(teacher: Round[], lx: Lexicon, n: number, rand: () => number, o: BuildOptions): Round[] {
  if (teacher.length >= Math.min(n, MIN_ROUNDS)) return teacher;
  const type = o.relationType ?? (o.category ? relationForCategory(o.category) : null);
  const pick = { rand, preferEntries: o.preferEntries, skipEntries: o.skipEntries };
  // Pair categories (sounds, young, homes, plurals…) ask about the pair itself, e.g. «ما اسم صوت «البقرة»؟».
  if (type) return relationRounds(lx, type, { n, ...pick });
  return meaningRounds(lx, { n, category: o.category, rand, preferEntries: o.preferEntries, skipEntries: o.skipEntries, minHardness: 3 });
}

/**
 * Build a vocabulary game's rounds. Multiple-choice games use ONLY teacher-written questions;
 * boards pair approved words (no question text is composed).
 */
export function buildLexiconRounds(g: GameDef, c: GameContent, rand: () => number, o: BuildOptions = {}): Round[] {
  switch (g.mechanic) {
    case "mcq":
      if (g.id === "daily_challenge") {
        const qs = teacherRounds(c.questions, { n: 10, rand });
        return qs.length >= 10 ? qs : board(c.lx, "match", rand, {});
      }
      return withMeaningFallback(teacherRounds(c.questions, { n: 8, rand, category: o.category, recent: o.recentQuestions }), c.lx, 8, rand, o);
    case "race":
      return withMeaningFallback(teacherRounds(c.questions, { n: 20, rand, category: o.category, recent: o.recentQuestions }), c.lx, 20, rand, o);
    case "odd":
      return [];
    case "match":
    case "memory":
      return board(c.lx, g.mechanic, rand, o);
  }
}

const minRoundsFor = (g: GameDef) => (g.mechanic === "match" ? BOARD_SIZE : g.mechanic === "memory" ? MEMORY_PAIRS : g.id === "daily_challenge" ? BOARD_SIZE : MIN_ROUNDS);

/** How many rounds a game could serve right now (for "content unavailable" states). */
export async function availableRounds(gameId: string) {
  const g = gameById(gameId);
  if (!g) return 0;
  if (g.source === "question_bank") {
    return (await publishedQuestions(getDb(), { topicId: g.topicId, gameMode: g.id, limit: MAX_ROUNDS, isProduction: isProduction() })).length;
  }
  return buildLexiconRounds(g, await loadGameContent(), seededRandom(7)).length;
}
export const isPlayable = async (gameId: string) => {
  const g = gameById(gameId);
  return !!g && (await availableRounds(gameId)) >= minRoundsFor(g);
};

async function insertSession(userId: string, g: GameDef, rounds: Round[], p: { timed: boolean; kind: string; challengeId?: string | null; categoryId?: string | null; levelId?: string | null; levelMode?: string }) {
  const now = new Date();
  const [s] = await getDb()
    .insert(gameSessions)
    .values({
      userId,
      gameTypeId: g.id,
      timed: p.timed,
      kind: p.kind,
      challengeId: p.challengeId ?? null,
      categoryId: p.categoryId ?? null,
      levelId: p.levelId ?? null,
      levelMode: p.levelMode ?? "play",
      deadlineAt: g.mechanic === "race" ? new Date(now.getTime() + RACE_MS) : null,
      day: learningDay(),
      rounds: rounds as unknown as Record<string, unknown>[],
      plannedRounds: rounds.length,
      startedAt: now,
    })
    .returning({ id: gameSessions.id });
  await analytics.track("game_started", { gameId: g.id, sessionId: s.id, rounds: rounds.length, kind: p.kind }, { userId });
  return s.id;
}

/** Resume today's open session of this game, or start a new one. */
export async function startGame(userId: string, gameId: string, opts: { timed?: boolean } & BuildOptions = {}) {
  const g = gameById(gameId);
  if (!g) throw new GameError("unknown_game");
  const db = getDb();
  const [type] = await db.select().from(gameTypes).where(eq(gameTypes.id, gameId)).limit(1);
  if ((type?.status ?? g.status) !== "live") throw new GameError("not_live");
  const day = learningDay();
  // A board's category is its relation's category, so a «الأصوات» board never resumes as «الجموع».
  const categoryId = opts.category ?? (opts.relationType ? RELATION_CATEGORY[opts.relationType] : null);
  // Resume only an unfinished round of the SAME choice; a new category always starts fresh.
  const [open] = await db
    .select({ id: gameSessions.id, deadline: gameSessions.deadlineAt })
    .from(gameSessions)
    .where(
      and(
        eq(gameSessions.userId, userId),
        eq(gameSessions.gameTypeId, gameId),
        eq(gameSessions.day, day),
        eq(gameSessions.status, "in_progress"),
        isNull(gameSessions.challengeId),
        categoryId ? eq(gameSessions.categoryId, categoryId) : isNull(gameSessions.categoryId),
      ),
    )
    .limit(1);
  if (open && (!open.deadline || open.deadline.getTime() > Date.now())) return { id: open.id, created: false };

  let rounds: Round[];
  if (g.source === "question_bank") {
    rounds = await buildQuestionRounds(userId, gameId, g.topicId, seededRandom(hashString(`${userId}:${gameId}:${Date.now()}`)));
  } else {
    const content = await loadGameContent();
    // Daily challenge: the same set for every student today (fair to compare with friends).
    const seed = g.id === "daily_challenge" ? hashString(`daily:${day}`) : hashString(`${userId}:${gameId}:${Date.now()}`);
    const words = g.id === "daily_challenge" ? { due: undefined, known: undefined } : await studentWords(userId);
    rounds = buildLexiconRounds(g, content, seededRandom(seed), { ...opts, preferEntries: words.due, skipEntries: words.known, recentQuestions: g.id === "daily_challenge" ? undefined : await recentTeacherQuestions(userId) });
  }
  if (rounds.length < minRoundsFor(g)) throw new GameError("content_unavailable");
  const id = await insertSession(userId, g, rounds, { timed: !!opts.timed, kind: g.id === "daily_challenge" ? "daily" : "normal", categoryId });
  return { id, created: true };
}

/**
 * «رحلة لفظي»: start (or resume) a level. Levels open in order — any passed level can be replayed,
 * plus the first one not yet passed.
 */
export async function startLevel(userId: string, number: number, mode: "play" | "corrective" = "play") {
  const db = getDb();
  const g = gameById("journey")!;
  const [level] = await db.select().from(journeyLevels).where(eq(journeyLevels.number, number)).limit(1);
  if (!level) throw new GameError("not_found");
  const cur = await currentLevel(db, userId);
  if (cur && level.number > cur.number) throw new GameError("locked");
  const [open] = await db
    .select({ id: gameSessions.id, rounds: gameSessions.rounds })
    .from(gameSessions)
    .where(and(eq(gameSessions.userId, userId), eq(gameSessions.levelId, level.id), eq(gameSessions.levelMode, mode), eq(gameSessions.status, "in_progress"), eq(gameSessions.day, learningDay())))
    .limit(1);
  if (open) {
    // Resume only a round built with the mastery loop; an older one is set aside and rebuilt.
    if ((open.rounds as unknown as Round[]).some((r) => r.item)) return { id: open.id, created: false };
    await db.update(gameSessions).set({ status: "abandoned" }).where(eq(gameSessions.id, open.id));
  }
  const lx = (await loadGameContent()).lx;
  if (mode === "corrective" && level.kind !== "test") throw new GameError("not_found");
  const rounds = await levelRounds(db, userId, level, lx, seededRandom(hashString(`${userId}:level:${level.number}:${Date.now()}`)), mode);
  if (rounds.length < (mode === "corrective" ? 1 : MIN_ROUNDS)) throw new GameError("content_unavailable");
  const id = await insertSession(userId, g, rounds, { timed: false, kind: "level", categoryId: level.categoryId, levelId: level.id, levelMode: mode });
  return { id, created: true };
}

/** Start a session on a frozen round set (friend challenges). */
export async function startFrozenSession(userId: string, gameId: string, rounds: Round[], challengeId: string) {
  const g = gameById(gameId);
  if (!g) throw new GameError("unknown_game");
  return insertSession(userId, g, rounds.map((r) => ({ ...r, hintRemoved: null })), { timed: false, kind: "challenge", challengeId });
}

export type GameView = {
  id: string;
  gameId: string;
  mechanic: GameDef["mechanic"];
  kind: string;
  challengeId: string | null;
  categoryId: string | null;
  /** «رحلة لفظي» level number (level sessions only), its kind and whether this is the corrective round. */
  level: number | null;
  levelKind: string | null;
  levelMode: string;
  status: string;
  timed: boolean;
  roundMs: number;
  deadlineAt: string | null;
  mistakes: number;
  total: number;
  score: number;
  rounds: ClientRound[];
  summary: (GameSummary & { rewards?: RewardSummary }) | null;
};

/** A round as the browser sees it: the answer key and explanation only once it's answered. */
function toClientRound(r: Round, index: number, a: typeof gameSessionAnswers.$inferSelect | undefined): ClientRound {
  return {
    index,
    kind: r.kind,
    prompt: r.prompt,
    noonQuestionId: r.noonQuestionId,
    subskillId: r.subskillId,
    difficulty: r.difficulty,
    stem: r.stem,
    passage: r.passage,
    choices: r.choices,
    hintRemoved: r.hintRemoved,
    answered: a ? { choiceId: String(a.response.choiceId), isCorrect: a.isCorrect, correctId: r.correctId, explanation: r.explanation, points: a.points, hintUsed: a.hintUsed } : null,
  };
}

/** Client-safe view: answer keys/explanations only for answered rounds. */
export async function getGameView(userId: string, sessionId: string): Promise<GameView | null> {
  const db = getDb();
  const [s] = await db.select().from(gameSessions).where(and(eq(gameSessions.id, sessionId), eq(gameSessions.userId, userId))).limit(1);
  if (!s) return null;
  const answers = await db.select().from(gameSessionAnswers).where(eq(gameSessionAnswers.sessionId, s.id));
  const byRound = new Map(answers.map((a) => [a.roundIndex, a]));
  const rounds = (s.rounds as unknown as Round[]).map((r, index): ClientRound => toClientRound(r, index, byRound.get(index)));
  return {
    id: s.id,
    gameId: s.gameTypeId,
    // The daily challenge falls back to a word-pair board when there aren't enough teacher questions.
    mechanic: (rounds[0] as { kind?: string } | undefined)?.kind === "match" ? "match" : (gameById(s.gameTypeId)?.mechanic ?? "mcq"),
    kind: s.kind,
    challengeId: s.challengeId,
    categoryId: s.categoryId,
    ...(await (async () => {
      const [l] = s.levelId ? await db.select({ n: journeyLevels.number, kind: journeyLevels.kind }).from(journeyLevels).where(eq(journeyLevels.id, s.levelId)).limit(1) : [];
      return { level: l?.n ?? null, levelKind: l?.kind ?? null, levelMode: s.levelMode };
    })()),
    status: s.status,
    timed: s.timed,
    roundMs: TIMED_ROUND_MS,
    deadlineAt: s.deadlineAt?.toISOString() ?? null,
    mistakes: s.mistakes,
    total: s.plannedRounds,
    score: s.score,
    rounds,
    summary: (s.summary as GameView["summary"]) ?? null,
  };
}

/** Faithful hint: remove one wrong option. Halves the round's points. MCQ only. */
export async function useHint(userId: string, sessionId: string, roundIndex: number) {
  return getDb().transaction(async (tx) => {
    const [s] = await tx.select().from(gameSessions).where(and(eq(gameSessions.id, sessionId), eq(gameSessions.userId, userId))).for("update").limit(1);
    if (!s) throw new GameError("not_found");
    if (s.status !== "in_progress") throw new GameError("not_in_progress");
    const rounds = s.rounds as unknown as Round[];
    const r = rounds[roundIndex];
    if (!r || ["match", "memory"].includes(r.kind)) throw new GameError("bad_round");
    const [a] = await tx.select({ id: gameSessionAnswers.id }).from(gameSessionAnswers).where(and(eq(gameSessionAnswers.sessionId, s.id), eq(gameSessionAnswers.roundIndex, roundIndex))).limit(1);
    if (a) throw new GameError("answered");
    if (!r.hintRemoved) {
      r.hintRemoved = eliminationHint(r.choices.map((c) => c.id), r.correctId, hashString(`${s.id}:${roundIndex}`));
      await tx.update(gameSessions).set({ rounds: rounds as unknown as Record<string, unknown>[] }).where(eq(gameSessions.id, s.id));
    }
    return { removed: r.hintRemoved };
  });
}

/** Spaced repetition + "word mastered" XP for the words in a round. Caller holds the profile lock. */
async function reviewWords(tx: Tx, userId: string, entryIds: string[], isCorrect: boolean, day: string, rewards?: RewardCollector) {
  const now = new Date();
  for (const entryId of entryIds) {
    const [p] = await tx.select().from(studentVocabularyProgress).where(and(eq(studentVocabularyProgress.userId, userId), eq(studentVocabularyProgress.entryId, entryId))).limit(1);
    const next = defaultSrs.review(p ?? emptyProgress(), isCorrect, now);
    await tx
      .insert(studentVocabularyProgress)
      .values({ userId, entryId, ...next })
      .onConflictDoUpdate({ target: [studentVocabularyProgress.userId, studentVocabularyProgress.entryId], set: next });
    if (next.state === "mastered" && p?.state !== "mastered") {
      await awardXp(tx, { userId, action: "word_mastered", idempotencyKey: `word_mastered:${userId}:${entryId}`, day }, rewards);
    }
  }
}

/**
 * Per-answer bookkeeping (streak interactions, spaced repetition, mastery XP) runs right AFTER the
 * graded answer is sent back, so feedback isn't waiting on it. Outside a request (tests, scripts)
 * it runs inline.
 */
async function recordPractice(userId: string, entryIds: string[], isCorrect: boolean) {
  const work = async () => {
    const day = learningDay();
    await getDb().transaction(async (tx) => {
      await lockProfile(tx, userId);
      await addInteractions(tx, userId, day, 1);
      await reviewWords(tx, userId, entryIds, isCorrect, day);
    });
  };
  try {
    after(() => work().catch((e) => console.error("[games] practice bookkeeping failed", e)));
  } catch {
    await work();
  }
}

function assertWithinDeadline(s: typeof gameSessions.$inferSelect) {
  if (s.deadlineAt && Date.now() > s.deadlineAt.getTime() + RACE_GRACE_MS) throw new GameError("time_up");
}

/** Grade one round on the server. Idempotent; timing is measured server-side. */
export async function answerRound(userId: string, sessionId: string, roundIndex: number, choiceId: string) {
  const out = await getDb().transaction(async (tx) => {
    const [s] = await tx.select().from(gameSessions).where(and(eq(gameSessions.id, sessionId), eq(gameSessions.userId, userId))).for("update").limit(1);
    if (!s) throw new GameError("not_found");
    const rounds = s.rounds as unknown as Round[];
    const r = rounds[roundIndex];
    if (!r || !r.choices.some((c) => c.id === choiceId) || r.kind === "memory") throw new GameError("bad_round");
    const answers = await tx.select().from(gameSessionAnswers).where(eq(gameSessionAnswers.sessionId, s.id)).orderBy(desc(gameSessionAnswers.answeredAt));
    const prior = answers.find((a) => a.roundIndex === roundIndex);
    if (prior) return { isCorrect: prior.isCorrect, correctId: r.correctId, explanation: r.explanation, points: 0, replay: true };
    if (s.status !== "in_progress") throw new GameError("not_in_progress");
    assertWithinDeadline(s);
    // On a match board, a right already used by a correct answer can't be reused.
    if (r.kind === "match" && answers.some((a) => a.isCorrect && String(a.response.choiceId) === choiceId)) throw new GameError("bad_round");

    const now = new Date();
    const since = answers[0]?.answeredAt ?? s.startedAt;
    const timeMs = Math.max(0, now.getTime() - since.getTime());
    let combo = 0;
    for (const a of [...answers].sort((x, y) => y.roundIndex - x.roundIndex)) {
      if (!a.isCorrect) break;
      combo++;
    }
    const isCorrect = choiceId === r.correctId;
    const hintUsed = r.hintRemoved !== null;
    const points = scoreRound({ correct: isCorrect, difficulty: r.difficulty, hintUsed, timed: s.timed || !!s.deadlineAt, timeMs, combo });
    await tx.insert(gameSessionAnswers).values({ sessionId: s.id, roundIndex, questionId: r.questionId, questionVersionId: r.versionId, subskillId: r.subskillId, response: { choiceId }, isCorrect, points, hintUsed, timeMs });
    await tx
      .update(gameSessions)
      .set({ score: sql`${gameSessions.score} + ${points}`, correctCount: sql`${gameSessions.correctCount} + ${isCorrect ? 1 : 0}` })
      .where(eq(gameSessions.id, s.id));
    // Mastery loop (journey levels): a missed word comes back later in the level, asked another way.
    let appended: ClientRound | null = null;
    if (!isCorrect && s.levelId && r.alt && rounds.length < MAX_LEVEL_ROUNDS) {
      const retry: Round = { ...r, choices: r.alt.choices, correctId: r.alt.correctId, alt: { choices: r.choices, correctId: r.correctId }, hintRemoved: null };
      await tx
        .update(gameSessions)
        .set({ rounds: [...rounds, retry] as unknown as Record<string, unknown>[], plannedRounds: sql`${gameSessions.plannedRounds} + 1` })
        .where(eq(gameSessions.id, s.id));
      appended = toClientRound(retry, rounds.length, undefined);
    }
    return { isCorrect, correctId: r.correctId, explanation: r.explanation, points, replay: false, appended, entryIds: r.entryIds ?? [] };
  });
  const { entryIds, ...result } = { entryIds: [] as string[], ...out };
  if (!result.replay) await recordPractice(userId, entryIds, result.isCorrect);
  return result;
}

/**
 * ذاكرة لفظي: flip a word card and an answer card. A correct pair is recorded once; a wrong pair
 * only counts a mistake (memory games need retries), so it never locks the round.
 */
/**
 * One memory pair attempt. `counted` is false when the student hadn't seen one of the two cards
 * before (an exploring flip) — only a real memory slip lowers the score.
 */
export async function memoryAttempt(userId: string, sessionId: string, roundIndex: number, choiceId: string, counted = true) {
  const out = await getDb().transaction(async (tx) => {
    const [s] = await tx.select().from(gameSessions).where(and(eq(gameSessions.id, sessionId), eq(gameSessions.userId, userId))).for("update").limit(1);
    if (!s) throw new GameError("not_found");
    if (s.status !== "in_progress") throw new GameError("not_in_progress");
    const r = (s.rounds as unknown as Round[])[roundIndex];
    if (!r || r.kind !== "memory" || !r.choices.some((c) => c.id === choiceId)) throw new GameError("bad_round");
    const [prior] = await tx.select().from(gameSessionAnswers).where(and(eq(gameSessionAnswers.sessionId, s.id), eq(gameSessionAnswers.roundIndex, roundIndex))).limit(1);
    if (prior) return { matched: true, points: 0, mistakes: s.mistakes };
    if (choiceId !== r.correctId) {
      if (!counted) return { matched: false, points: 0, mistakes: s.mistakes };
      await tx.update(gameSessions).set({ mistakes: sql`${gameSessions.mistakes} + 1` }).where(eq(gameSessions.id, s.id));
      return { matched: false, points: 0, mistakes: s.mistakes + 1 };
    }
    const points = Math.max(4, 12 - s.mistakes);
    await tx.insert(gameSessionAnswers).values({ sessionId: s.id, roundIndex, subskillId: r.subskillId, response: { choiceId }, isCorrect: true, points, hintUsed: false, timeMs: null });
    await tx.update(gameSessions).set({ score: sql`${gameSessions.score} + ${points}`, correctCount: sql`${gameSessions.correctCount} + 1` }).where(eq(gameSessions.id, s.id));
    return { matched: true, points, mistakes: s.mistakes, entryIds: r.entryIds ?? [] };
  });
  const { entryIds, ...result } = { entryIds: [] as string[], ...out };
  if (entryIds.length || (result.matched && result.points > 0)) await recordPractice(userId, entryIds, true);
  return result;
}

/** Finish once: XP (accuracy-weighted, capped), streak rule, mission, badges, mastery, leaderboards, challenges. */
export async function completeGame(userId: string, sessionId: string): Promise<GameSummary & { rewards: RewardSummary; gameId: string; challengeId: string | null }> {
  const rewards = new RewardCollector();
  const day = learningDay();
  const out = await getDb().transaction(async (tx) => {
    await lockProfile(tx, userId);
    const [s] = await tx.select().from(gameSessions).where(and(eq(gameSessions.id, sessionId), eq(gameSessions.userId, userId))).for("update").limit(1);
    if (!s) throw new GameError("not_found");
    if (s.status !== "in_progress") throw new GameError("not_in_progress");
    const answers = await tx.select().from(gameSessionAnswers).where(eq(gameSessionAnswers.sessionId, s.id));
    const raceOver = !!s.deadlineAt && Date.now() >= s.deadlineAt.getTime();
    if (answers.length < s.plannedRounds && !raceOver) throw new GameError("incomplete");
    const g = gameById(s.gameTypeId)!;

    // Mastery per category/subskill (local data — never presented as Noon's official map).
    const bySkill = new Map<string, boolean[]>();
    for (const a of answers.sort((x, y) => x.roundIndex - y.roundIndex)) {
      if (!a.subskillId) continue;
      bySkill.set(a.subskillId, [...(bySkill.get(a.subskillId) ?? []), a.isCorrect]);
    }
    const skillIds = [...bySkill.keys()];
    const names = skillIds.length
      ? new Map((await tx.select({ id: verbalSubskills.id, nameAr: verbalSubskills.nameAr }).from(verbalSubskills).where(inArray(verbalSubskills.id, skillIds))).map((x) => [x.id, x.nameAr]))
      : new Map<string, string>();
    const results: SubskillResult[] = [];
    for (const [subskillId, res] of bySkill) {
      if (!names.has(subskillId)) continue;
      const [prev] = await tx.select().from(skillProgress).where(and(eq(skillProgress.userId, userId), eq(skillProgress.subskillId, subskillId))).limit(1);
      const next = updateMastery(prev ?? { attempts: 0, correct: 0, recent: [] }, res);
      await tx
        .insert(skillProgress)
        .values({ userId, subskillId, ...next, lastPlayedAt: new Date() })
        .onConflictDoUpdate({ target: [skillProgress.userId, skillProgress.subskillId], set: { ...next, lastPlayedAt: new Date() } });
      results.push({ subskillId, nameAr: names.get(subskillId)!, correct: res.filter(Boolean).length, total: res.length, masteryBefore: prev?.mastery ?? 0, masteryAfter: next.mastery });
    }

    const correct = answers.filter((a) => a.isCorrect).length;
    // A race is scored on what was answered; everything else on the full set.
    const total = g.mechanic === "race" ? Math.max(answers.length, 1) : s.plannedRounds;
    const score = answers.reduce((n, a) => n + a.points, 0);
    const weakest = [...results].sort((a, b) => a.correct / a.total - b.correct / b.total || a.masteryAfter - b.masteryAfter)[0];
    const summary: GameSummary = {
      accuracy: total ? correct / total : 0,
      score,
      correct,
      total,
      subskills: results,
      weakest: weakest && weakest.correct < weakest.total ? { subskillId: weakest.subskillId, nameAr: weakest.nameAr } : null,
      improved: results.filter((r) => r.masteryAfter > r.masteryBefore).map((r) => ({ subskillId: r.subskillId, nameAr: r.nameAr, delta: r.masteryAfter - r.masteryBefore })),
    };

    if (s.levelId) {
      const level = await finishLevel(tx, userId, { id: s.id, levelId: s.levelId, levelMode: s.levelMode, rounds: s.rounds as unknown as Round[], plannedRounds: s.plannedRounds });
      if (level) {
        summary.level = level;
        if (level.firstPass) await awardXp(tx, { userId, action: "level_passed", idempotencyKey: `level_passed:${userId}:${s.levelId}`, day, sourceId: s.id }, rewards);
      }
    }

    await ensureDailyActivity(tx, userId, day);
    await tx
      .update(studentDailyActivity)
      .set({ gamesCompleted: sql`${studentDailyActivity.gamesCompleted} + 1`, ...(s.kind === "daily" ? { dailyChallengeCompleted: true } : {}) })
      .where(and(eq(studentDailyActivity.userId, userId), eq(studentDailyActivity.day, day)));

    // Random guessing earns little: the multiplier follows accuracy and short games earn nothing.
    const minForXp = g.mechanic === "race" ? 5 : Math.min(MIN_ROUNDS, s.plannedRounds);
    await awardXp(tx, { userId, action: "game_completed", idempotencyKey: `game_completed:${s.id}`, day, sourceId: s.id, multiplier: answers.length >= minForXp ? 0.5 + correct / total : 0 }, rewards);
    if (s.kind === "daily" && correct / Math.max(total, 1) >= 0.5) {
      await awardXp(tx, { userId, action: "daily_challenge", idempotencyKey: `daily_challenge:${userId}:${day}`, day, sourceId: s.id }, rewards);
    }
    if (s.kind === "challenge" && s.challengeId) {
      await awardXp(tx, { userId, action: "challenge_completed", idempotencyKey: `challenge_completed:${userId}:${s.challengeId}`, day, sourceId: s.challengeId }, rewards);
      await tx.update(challengeParticipants).set({ score, correct, completedAt: new Date(), sessionId: s.id }).where(and(eq(challengeParticipants.challengeId, s.challengeId), eq(challengeParticipants.userId, userId)));
      // When both have played, the winner gets the win XP (both rows are final now).
      const parts = await tx.select().from(challengeParticipants).where(eq(challengeParticipants.challengeId, s.challengeId));
      if (parts.length === 2 && parts.every((p) => p.completedAt)) {
        const [a, b] = parts;
        const winner = a.score! > b.score! ? a.userId : b.score! > a.score! ? b.userId : null;
        if (winner) {
          if (winner !== userId) await lockProfile(tx, winner);
          await awardXp(tx, { userId: winner, action: "challenge_won", idempotencyKey: `challenge_won:${winner}:${s.challengeId}`, day, sourceId: s.challengeId }, winner === userId ? rewards : undefined);
        }
      }
    }

    await maybeQualifyDay(tx, userId, day, rewards);
    await refreshVocabCounters(tx, userId);
    await checkMissionCompletion(tx, userId, day, rewards);
    await evaluateBadges(tx, userId, rewards);

    // Weekly category board (server-computed points only).
    const wk = weekRange(day);
    const categoryId = s.categoryId ?? (g.source === "question_bank" ? null : "all");
    const kind = g.source === "question_bank" ? "weekly_topic" : "weekly_category";
    const [comp] = await tx
      .select({ id: competitions.id })
      .from(competitions)
      .where(and(eq(competitions.kind, kind), eq(competitions.startsOn, wk.start), categoryId ? eq(competitions.categoryId, categoryId) : eq(competitions.topicId, g.topicId)))
      .limit(1);
    const compId =
      comp?.id ??
      (
        await tx
          .insert(competitions)
          .values({ kind, topicId: g.source === "question_bank" ? g.topicId : null, categoryId, startsOn: wk.start, endsOn: wk.end, title: `تحدي الأسبوع — ${g.nameAr}` })
          .returning({ id: competitions.id })
      )[0].id;
    await tx
      .insert(competitionEntries)
      .values({ competitionId: compId, userId, score, sessions: 1 })
      .onConflictDoUpdate({ target: [competitionEntries.competitionId, competitionEntries.userId], set: { score: sql`${competitionEntries.score} + ${score}`, sessions: sql`${competitionEntries.sessions} + 1` } });

    await tx
      .update(gameSessions)
      .set({ status: "completed", completedAt: new Date(), xpAwarded: rewards.totalXp, summary: { ...summary, rewards: rewards.toJSON() } as unknown as Record<string, unknown> })
      .where(eq(gameSessions.id, s.id));
    return { ...summary, gameId: s.gameTypeId, challengeId: s.challengeId };
  });
  await emitRewardAnalytics(userId, rewards, { sessionId, gameId: out.gameId });
  await analytics.track("game_completed", { sessionId, gameId: out.gameId, correct: out.correct, total: out.total, score: out.score }, { userId });
  return { ...out, rewards: rewards.toJSON() };
}

