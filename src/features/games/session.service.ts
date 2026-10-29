import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  competitionEntries,
  competitions,
  gameSessionAnswers,
  gameSessions,
  gameTypes,
  skillProgress,
  studentDailyActivity,
  studentVocabularyProgress,
  verbalSubskills,
} from "@/db/schema";
import { analytics } from "@/features/analytics/analytics";
import { evaluateBadges } from "@/features/badges/service";
import { RewardCollector, type RewardSummary } from "@/features/gamification/rewards";
import { awardXp, ensureDailyActivity, lockProfile } from "@/features/gamification/xp.service";
import { checkMissionCompletion } from "@/features/missions/service";
import { publishedQuestionById, publishedQuestions } from "@/features/question-bank/pool";
import { recordQualifiedActivity } from "@/features/streaks/service";
import { defaultSrs, emptyProgress } from "@/features/vocabulary/srs";
import { emitRewardAnalytics } from "@/features/gamification/reward-analytics";
import { approvedRelations } from "@/features/word-bank/service";
import { refreshVocabCounters } from "@/features/word-bank/wod.service";
import { isProduction } from "@/lib/env";
import { addDays, learningDay, weekRange } from "@/lib/time";
import { hashString, seededRandom, shuffle } from "@/lib/utils";
import { completionMultiplier, eliminationHint, MAX_ROUNDS, MIN_ROUNDS, pickRounds, scoreRound, TIMED_ROUND_MS, updateMastery } from "./engine";
import { gameById } from "./modes";
import type { ClientRound, GameSummary, Round, SubskillResult } from "./types";

export class GameError extends Error {
  constructor(public code: "unknown_game" | "not_live" | "content_unavailable" | "not_found" | "not_in_progress" | "bad_round" | "incomplete" | "answered") {
    super(code);
  }
}

const REPEAT_WINDOW_DAYS = 14;
const RELATION_LABEL = { synonym: "ترادف", antonym: "تضاد" } as const;

/** Noon's options, never rewritten; reordered only when Noon marks them shuffleable. */
export function orderChoices(q: { choices: { id: string; text: string }[]; shuffleChoices?: boolean }, rand: () => number) {
  const choices = q.choices.map((c) => ({ id: c.id, text: c.text }));
  return q.shuffleChoices ? shuffle(choices, rand) : choices;
}

async function masteryMap(userId: string) {
  const rows = await getDb().select().from(skillProgress).where(eq(skillProgress.userId, userId));
  return Object.fromEntries(rows.map((r) => [r.subskillId, r.mastery])) as Record<string, number>;
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

/** How many rounds a game could serve right now (for "content unavailable" states). */
export async function availableRounds(gameId: string) {
  const g = gameById(gameId);
  if (!g) return 0;
  if (g.source === "vocabulary") {
    const rels = await approvedRelations(getDb(), { isProduction: isProduction() });
    return rels.length;
  }
  return (await publishedQuestions(getDb(), { topicId: g.topicId, gameMode: g.id, limit: MAX_ROUNDS, isProduction: isProduction() })).length;
}

async function buildQuestionRounds(userId: string, gameId: string, topicId: string, rand: () => number): Promise<Round[]> {
  const db = getDb();
  const prod = isProduction();
  const recent = await recentlyAnswered(userId);
  let pool = await publishedQuestions(db, { topicId, gameMode: gameId, excludeIds: recent, isProduction: prod });
  // Not enough unseen questions: allow repeats rather than failing (still official content only).
  if (pool.length < MIN_ROUNDS) pool = await publishedQuestions(db, { topicId, gameMode: gameId, isProduction: prod });
  if (pool.length < MIN_ROUNDS) return [];
  const picked = pickRounds(pool, { n: MAX_ROUNDS, mastery: await masteryMap(userId), rand });
  return picked.map((q) => ({
    kind: "noon_question" as const,
    questionId: q.questionId,
    versionId: q.versionId,
    noonQuestionId: q.payload.noonQuestionId,
    subskillId: q.subskillId,
    difficulty: q.difficulty,
    stem: q.payload.stem,
    passage: q.passage,
    // Same options and answer; order shuffled only where Noon allows it (shuffleChoices).
    choices: orderChoices(q.payload, rand),
    correctId: q.payload.correctChoiceIds[0],
    explanation: q.payload.explanation,
    hintRemoved: null,
  }));
}

/**
 * كنز الكلمات: each approved relationship yields (a) the ORIGINAL Noon question it came from and
 * (b) a recall card on the approved relation itself. Nothing is invented.
 */
async function buildVocabularyRounds(userId: string, rand: () => number): Promise<Round[]> {
  const db = getDb();
  const rels = await approvedRelations(db, { isProduction: isProduction() });
  if (rels.length < 2) return [];
  const progress = await db.select().from(studentVocabularyProgress).where(eq(studentVocabularyProgress.userId, userId));
  const due = new Map(progress.map((p) => [p.entryId, p.nextReviewAt?.getTime() ?? 0]));
  // Due/unseen words first.
  const ordered = shuffle(rels, rand).sort((a, b) => (due.get(a.from.id) ?? 0) - (due.get(b.from.id) ?? 0));

  const rounds: Round[] = [];
  const usedQuestions = new Set<string>();
  for (const r of ordered) {
    if (rounds.length >= MAX_ROUNDS) break;
    rounds.push({
      kind: "relation_recall",
      questionId: null,
      versionId: null,
      noonQuestionId: r.evidence[0]?.noonQuestionId ?? null,
      subskillId: r.type === "synonym" ? "vo_synonym" : "vo_antonym",
      difficulty: null,
      stem: `${r.from.lemma} — ${r.to.lemma}`,
      passage: null,
      choices: [
        { id: "synonym", text: RELATION_LABEL.synonym },
        { id: "antonym", text: RELATION_LABEL.antonym },
      ],
      correctId: r.type,
      explanation: r.evidence.find((e) => e.kind === "explanation_statement")?.excerpt ?? null,
      relationshipId: r.id,
      entryIds: [r.from.id, r.to.id],
      hintRemoved: null,
    });
    const src = r.evidence.find((e) => !usedQuestions.has(e.questionId));
    if (src && rounds.length < MAX_ROUNDS) {
      usedQuestions.add(src.questionId);
      const q = await publishedQuestionById(db, src.questionId, isProduction());
      if (q && q.versionId === src.versionId) {
        rounds.push({
          kind: "noon_question",
          questionId: q.questionId,
          versionId: q.versionId,
          noonQuestionId: q.payload.noonQuestionId,
          subskillId: r.type === "synonym" ? "vo_synonym" : "vo_antonym",
          difficulty: q.difficulty,
          stem: q.payload.stem,
          passage: null,
          choices: orderChoices(q.payload, rand),
          correctId: q.payload.correctChoiceIds[0],
          explanation: q.payload.explanation,
          entryIds: [r.from.id, r.to.id],
          hintRemoved: null,
        });
      }
    }
  }
  return rounds.length >= MIN_ROUNDS ? rounds : [];
}

/** Resume today's open session of this game, or start a new one from the published pool. */
export async function startGame(userId: string, gameId: string, opts: { timed: boolean }) {
  const g = gameById(gameId);
  if (!g) throw new GameError("unknown_game");
  const db = getDb();
  const [type] = await db.select().from(gameTypes).where(eq(gameTypes.id, gameId)).limit(1);
  if ((type?.status ?? g.status) !== "live") throw new GameError("not_live");
  const day = learningDay();
  const [open] = await db
    .select({ id: gameSessions.id })
    .from(gameSessions)
    .where(and(eq(gameSessions.userId, userId), eq(gameSessions.gameTypeId, gameId), eq(gameSessions.day, day), eq(gameSessions.status, "in_progress")))
    .limit(1);
  if (open) return { id: open.id, created: false };

  const rand = seededRandom(hashString(`${userId}:${gameId}:${Date.now()}`));
  const rounds = g.source === "vocabulary" ? await buildVocabularyRounds(userId, rand) : await buildQuestionRounds(userId, gameId, g.topicId, rand);
  if (!rounds.length) throw new GameError("content_unavailable");

  const [s] = await db
    .insert(gameSessions)
    .values({ userId, gameTypeId: gameId, timed: opts.timed, day, rounds: rounds as unknown as Record<string, unknown>[], plannedRounds: rounds.length })
    .returning({ id: gameSessions.id });
  await analytics.track("game_started", { gameId, sessionId: s.id, rounds: rounds.length, timed: opts.timed }, { userId });
  return { id: s.id, created: true };
}

export type GameView = {
  id: string;
  gameId: string;
  status: string;
  timed: boolean;
  roundMs: number;
  total: number;
  score: number;
  rounds: ClientRound[];
  summary: (GameSummary & { rewards?: RewardSummary }) | null;
};

/** Client-safe view: answer keys/explanations only for answered rounds. */
export async function getGameView(userId: string, sessionId: string): Promise<GameView | null> {
  const db = getDb();
  const [s] = await db.select().from(gameSessions).where(and(eq(gameSessions.id, sessionId), eq(gameSessions.userId, userId))).limit(1);
  if (!s) return null;
  const answers = await db.select().from(gameSessionAnswers).where(eq(gameSessionAnswers.sessionId, s.id));
  const byRound = new Map(answers.map((a) => [a.roundIndex, a]));
  const rounds = (s.rounds as unknown as Round[]).map((r, index): ClientRound => {
    const a = byRound.get(index);
    return {
      index,
      kind: r.kind,
      noonQuestionId: r.noonQuestionId,
      subskillId: r.subskillId,
      difficulty: r.difficulty,
      stem: r.stem,
      passage: r.passage,
      choices: r.choices,
      hintRemoved: r.hintRemoved,
      answered: a
        ? { choiceId: String(a.response.choiceId), isCorrect: a.isCorrect, correctId: r.correctId, explanation: r.explanation, points: a.points, hintUsed: a.hintUsed }
        : null,
    };
  });
  return {
    id: s.id,
    gameId: s.gameTypeId,
    status: s.status,
    timed: s.timed,
    roundMs: TIMED_ROUND_MS,
    total: s.plannedRounds,
    score: s.score,
    rounds,
    summary: (s.summary as GameView["summary"]) ?? null,
  };
}

/** Faithful hint: remove one wrong option. Halves the round's points. */
export async function useHint(userId: string, sessionId: string, roundIndex: number) {
  return getDb().transaction(async (tx) => {
    const [s] = await tx.select().from(gameSessions).where(and(eq(gameSessions.id, sessionId), eq(gameSessions.userId, userId))).for("update").limit(1);
    if (!s) throw new GameError("not_found");
    if (s.status !== "in_progress") throw new GameError("not_in_progress");
    const rounds = s.rounds as unknown as Round[];
    const r = rounds[roundIndex];
    if (!r) throw new GameError("bad_round");
    const [a] = await tx.select({ id: gameSessionAnswers.id }).from(gameSessionAnswers).where(and(eq(gameSessionAnswers.sessionId, s.id), eq(gameSessionAnswers.roundIndex, roundIndex))).limit(1);
    if (a) throw new GameError("answered");
    if (!r.hintRemoved) {
      r.hintRemoved = eliminationHint(r.choices.map((c) => c.id), r.correctId, hashString(`${s.id}:${roundIndex}`));
      await tx.update(gameSessions).set({ rounds: rounds as unknown as Record<string, unknown>[] }).where(eq(gameSessions.id, s.id));
    }
    return { removed: r.hintRemoved };
  });
}

/** Grade one round on the server. Idempotent; timing is measured server-side. */
export async function answerRound(userId: string, sessionId: string, roundIndex: number, choiceId: string) {
  return getDb().transaction(async (tx) => {
    const [s] = await tx.select().from(gameSessions).where(and(eq(gameSessions.id, sessionId), eq(gameSessions.userId, userId))).for("update").limit(1);
    if (!s) throw new GameError("not_found");
    const rounds = s.rounds as unknown as Round[];
    const r = rounds[roundIndex];
    if (!r || !r.choices.some((c) => c.id === choiceId)) throw new GameError("bad_round");
    const answers = await tx.select().from(gameSessionAnswers).where(eq(gameSessionAnswers.sessionId, s.id)).orderBy(desc(gameSessionAnswers.answeredAt));
    const prior = answers.find((a) => a.roundIndex === roundIndex);
    if (prior) return { isCorrect: prior.isCorrect, correctId: r.correctId, explanation: r.explanation, points: 0, replay: true };
    if (s.status !== "in_progress") throw new GameError("not_in_progress");

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
    const points = scoreRound({ correct: isCorrect, difficulty: r.difficulty, hintUsed, timed: s.timed, timeMs, combo });

    await tx.insert(gameSessionAnswers).values({
      sessionId: s.id,
      roundIndex,
      questionId: r.questionId,
      questionVersionId: r.versionId,
      subskillId: r.subskillId,
      response: { choiceId },
      isCorrect,
      points,
      hintUsed,
      timeMs,
    });
    await tx
      .update(gameSessions)
      .set({ score: sql`${gameSessions.score} + ${points}`, correctCount: sql`${gameSessions.correctCount} + ${isCorrect ? 1 : 0}` })
      .where(eq(gameSessions.id, s.id));

    // Vocabulary SRS for words in this round (Leitner, per student).
    for (const entryId of r.entryIds ?? []) {
      const [p] = await tx.select().from(studentVocabularyProgress).where(and(eq(studentVocabularyProgress.userId, userId), eq(studentVocabularyProgress.entryId, entryId))).limit(1);
      const next = defaultSrs.review(p ?? emptyProgress(), isCorrect, now);
      await tx
        .insert(studentVocabularyProgress)
        .values({ userId, entryId, ...next })
        .onConflictDoUpdate({ target: [studentVocabularyProgress.userId, studentVocabularyProgress.entryId], set: next });
    }
    return { isCorrect, correctId: r.correctId, explanation: r.explanation, points, replay: false };
  });
}

/** Finish once: XP (accuracy-weighted, daily-capped), streak, mission, badges, mastery, weekly topic board. */
export async function completeGame(userId: string, sessionId: string): Promise<GameSummary & { rewards: RewardSummary; gameId: string }> {
  const rewards = new RewardCollector();
  const day = learningDay();
  const out = await getDb().transaction(async (tx) => {
    await lockProfile(tx, userId);
    const [s] = await tx.select().from(gameSessions).where(and(eq(gameSessions.id, sessionId), eq(gameSessions.userId, userId))).for("update").limit(1);
    if (!s) throw new GameError("not_found");
    if (s.status !== "in_progress") throw new GameError("not_in_progress");
    const answers = await tx.select().from(gameSessionAnswers).where(eq(gameSessionAnswers.sessionId, s.id));
    if (answers.length < s.plannedRounds) throw new GameError("incomplete");

    // Mastery per subskill (local لفظي data — never presented as Noon's official heat map).
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
    const total = answers.length;
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

    await ensureDailyActivity(tx, userId, day);
    await tx
      .update(studentDailyActivity)
      .set({ gamesCompleted: sql`${studentDailyActivity.gamesCompleted} + 1` })
      .where(and(eq(studentDailyActivity.userId, userId), eq(studentDailyActivity.day, day)));
    await awardXp(
      tx,
      { userId, action: "game_completed", idempotencyKey: `game_completed:${s.id}`, day, sourceId: s.id, multiplier: completionMultiplier(correct, total) },
      rewards,
    );
    await recordQualifiedActivity(tx, userId, day, rewards);
    await refreshVocabCounters(tx, userId);
    await checkMissionCompletion(tx, userId, day, rewards);
    await evaluateBadges(tx, userId, rewards);

    // Weekly topic competition (server-computed scores only).
    const g = gameById(s.gameTypeId)!;
    const wk = weekRange(day);
    await tx
      .insert(competitions)
      .values({ kind: "weekly_topic", topicId: g.topicId, startsOn: wk.start, endsOn: wk.end, title: `تحدي الأسبوع — ${g.nameAr}` })
      .onConflictDoNothing();
    const [comp] = await tx
      .select({ id: competitions.id })
      .from(competitions)
      .where(and(eq(competitions.kind, "weekly_topic"), eq(competitions.topicId, g.topicId), eq(competitions.startsOn, wk.start)))
      .limit(1);
    await tx
      .insert(competitionEntries)
      .values({ competitionId: comp.id, userId, score, sessions: 1 })
      .onConflictDoUpdate({
        target: [competitionEntries.competitionId, competitionEntries.userId],
        set: { score: sql`${competitionEntries.score} + ${score}`, sessions: sql`${competitionEntries.sessions} + 1` },
      });

    await tx
      .update(gameSessions)
      .set({ status: "completed", completedAt: new Date(), xpAwarded: rewards.totalXp, summary: { ...summary, rewards: rewards.toJSON() } as unknown as Record<string, unknown> })
      .where(eq(gameSessions.id, s.id));
    return { ...summary, gameId: s.gameTypeId };
  });
  await emitRewardAnalytics(userId, rewards, { sessionId, gameId: out.gameId });
  await analytics.track("game_completed", { sessionId, gameId: out.gameId, correct: out.correct, total: out.total, score: out.score }, { userId });
  return { ...out, rewards: rewards.toJSON() };
}
