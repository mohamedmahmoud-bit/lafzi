import "server-only";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb, type DbOrTx, type Tx } from "@/db/client";
import {
  studentDailyActivity,
  studentProfiles,
  studentVocabularyProgress,
  studentVocabularyWordOfDay,
  vocabularyWordOfDay,
} from "@/db/schema";
import { analytics } from "@/features/analytics/analytics";
import { evaluateBadges } from "@/features/badges/service";
import { emitRewardAnalytics } from "@/features/gamification/reward-analytics";
import { RewardCollector, type RewardSummary } from "@/features/gamification/rewards";
import { awardXp, ensureDailyActivity, lockProfile } from "@/features/gamification/xp.service";
import { loadLexicon, type Lexicon } from "@/features/lexicon/content";
import { RELATION_TEXT } from "@/features/lexicon/mapping";
import { meaningKey } from "@/features/lexicon/normalize";
import { checkMissionCompletion } from "@/features/missions/service";
import { addInteractions, maybeQualifyDay } from "@/features/streaks/daily-rule";
import { defaultSrs, emptyProgress, MASTERY_LABELS, type MasteryState } from "@/features/vocabulary/srs";
import { isProduction } from "@/lib/env";
import { addDays, learningDay } from "@/lib/time";
import { hashString, seededRandom, shuffle } from "@/lib/utils";

export const WOD_NO_REPEAT_DAYS = 90;

export class VocabWodError extends Error {
  constructor(public code: "unavailable" | "bad_option") {
    super(code);
  }
}

/** Global word of the day: an approved word that has an approved meaning. Null if none exist yet. */
export async function ensureVocabWod(day: string, db: DbOrTx = getDb(), lx?: Lexicon): Promise<string | null> {
  const [existing] = await db.select().from(vocabularyWordOfDay).where(eq(vocabularyWordOfDay.day, day)).limit(1);
  if (existing) return existing.entryId;
  lx ??= await loadLexicon(db, { isProduction: isProduction() });
  const ids = [...new Set(lx.senses.map((s) => s.entryId))].sort();
  if (!ids.length) return null;
  const recent = new Set(
    (await db.select({ id: vocabularyWordOfDay.entryId }).from(vocabularyWordOfDay).where(gte(vocabularyWordOfDay.day, addDays(day, -WOD_NO_REPEAT_DAYS)))).map((r) => r.id),
  );
  const fresh = ids.filter((id) => !recent.has(id));
  const pool = fresh.length ? fresh : ids;
  await db.insert(vocabularyWordOfDay).values({ day, entryId: pool[hashString(day) % pool.length], source: "auto" }).onConflictDoNothing();
  const [row] = await db.select().from(vocabularyWordOfDay).where(eq(vocabularyWordOfDay.day, day)).limit(1);
  return row.entryId;
}

type Choice = { id: string; text: string };

/** Meaning options for a word: its approved meaning + 3 approved meanings of unrelated words. */
function meaningChoices(lx: Lexicon, entryId: string, rand: () => number): { choices: Choice[]; correctId: string } | null {
  const own = lx.senses.filter((s) => s.entryId === entryId);
  if (!own.length) return null;
  const syn = new Set([entryId, ...lx.relations.filter((r) => r.type === "synonym" && (r.fromId === entryId || r.toId === entryId)).flatMap((r) => [r.fromId, r.toId])]);
  const ownKeys = new Set(own.map((s) => meaningKey(s.meaning)));
  const distractors: Choice[] = [];
  for (const s of shuffle(lx.senses.filter((x) => !syn.has(x.entryId) && !ownKeys.has(meaningKey(x.meaning))), rand)) {
    if (distractors.length >= 3) break;
    if (!distractors.some((d) => meaningKey(d.text) === meaningKey(s.meaning))) distractors.push({ id: s.id, text: s.meaning });
  }
  if (distractors.length < 2) return null;
  return { choices: shuffle([{ id: own[0].id, text: own[0].meaning }, ...distractors], rand), correctId: own[0].id };
}

export type VocabWodView =
  | { status: "unavailable" }
  | {
      status: "ready";
      day: string;
      word: string;
      categories: string[];
      choices: Choice[];
      answered: null | { choiceId: string; isCorrect: boolean; correctId: string };
      /** Revealed after the guess: approved meanings, examples and relationships. */
      card: null | {
        meanings: { text: string; example: string | null }[];
        relations: { label: string; other: string; direction: "to" | "from" }[];
        mastery: string;
        nextReviewAt: string | null;
      };
    };

export async function getVocabWod(userId: string, day = learningDay()): Promise<VocabWodView> {
  const db = getDb();
  const lx = await loadLexicon(db, { isProduction: isProduction() });
  const entryId = await ensureVocabWod(day, db, lx);
  const entry = entryId ? lx.entries.get(entryId) : null;
  if (!entryId || !entry) return { status: "unavailable" };
  const mc = meaningChoices(lx, entryId, seededRandom(hashString(`${userId}:${day}:wod`)));
  if (!mc) return { status: "unavailable" };
  const [row] = await db.select().from(studentVocabularyWordOfDay).where(and(eq(studentVocabularyWordOfDay.userId, userId), eq(studentVocabularyWordOfDay.day, day))).limit(1);
  const answered = row?.attemptedAt ? { choiceId: row.selectedChoiceId!, isCorrect: !!row.isCorrect, correctId: mc.correctId } : null;
  let card = null;
  if (answered) {
    const [prog] = await db.select().from(studentVocabularyProgress).where(and(eq(studentVocabularyProgress.userId, userId), eq(studentVocabularyProgress.entryId, entryId))).limit(1);
    card = {
      meanings: lx.senses.filter((s) => s.entryId === entryId).map((s) => ({ text: s.meaning, example: s.example })),
      relations: lx.relations
        .filter((r) => r.fromId === entryId || r.toId === entryId)
        .map((r) => ({ label: RELATION_TEXT[r.type].label, other: lx.entries.get(r.fromId === entryId ? r.toId : r.fromId)!.lemma, direction: (r.fromId === entryId ? "to" : "from") as "to" | "from" })),
      mastery: MASTERY_LABELS[(prog?.state ?? "new") as MasteryState],
      nextReviewAt: prog?.nextReviewAt?.toISOString() ?? null,
    };
  }
  return { status: "ready", day, word: entry.lemma, categories: entry.categories, choices: mc.choices, answered, card };
}

export async function markVocabWodViewed(userId: string) {
  const day = learningDay();
  const v = await getVocabWod(userId, day);
  if (v.status !== "ready") return 0;
  const rewards = new RewardCollector();
  await getDb().transaction(async (tx) => {
    await lockProfile(tx, userId);
    await awardXp(tx, { userId, action: "wod_opened", idempotencyKey: `wod_opened:${userId}:${day}`, day }, rewards);
  });
  if (rewards.totalXp) await analytics.track("word_of_day_viewed", { day }, { userId });
  return rewards.totalXp;
}

export async function refreshVocabCounters(tx: Tx, userId: string) {
  await tx
    .update(studentProfiles)
    .set({
      totalWordsLearned: sql`(select count(*) from ${studentVocabularyProgress} where ${studentVocabularyProgress.userId} = ${userId} and ${studentVocabularyProgress.correctCount} > 0)`,
      masteredWords: sql`(select count(*) from ${studentVocabularyProgress} where ${studentVocabularyProgress.userId} = ${userId} and ${studentVocabularyProgress.state} = 'mastered')`,
    })
    .where(eq(studentProfiles.userId, userId));
}

/** One graded guess per day; resubmits return the first result. Then the word enters spaced review. */
export async function answerVocabWod(userId: string, choiceId: string): Promise<RewardSummary & { view: VocabWodView }> {
  const day = learningDay();
  const before = await getVocabWod(userId, day);
  if (before.status !== "ready") throw new VocabWodError("unavailable");
  if (!before.choices.some((c) => c.id === choiceId)) throw new VocabWodError("bad_option");
  const correctId = await correctFor(userId, day);
  const rewards = new RewardCollector();
  let first = false;
  await getDb().transaction(async (tx) => {
    await lockProfile(tx, userId);
    const entryId = (await tx.select().from(vocabularyWordOfDay).where(eq(vocabularyWordOfDay.day, day)).limit(1))[0].entryId;
    const isCorrect = choiceId === correctId;
    const inserted = await tx
      .insert(studentVocabularyWordOfDay)
      .values({ userId, day, entryId, viewedAt: new Date(), attemptedAt: new Date(), selectedChoiceId: choiceId, isCorrect })
      .onConflictDoNothing()
      .returning({ day: studentVocabularyWordOfDay.day });
    if (!inserted.length) {
      const [row] = await tx.select().from(studentVocabularyWordOfDay).where(and(eq(studentVocabularyWordOfDay.userId, userId), eq(studentVocabularyWordOfDay.day, day), isNull(studentVocabularyWordOfDay.attemptedAt))).limit(1);
      if (!row) return;
      await tx.update(studentVocabularyWordOfDay).set({ attemptedAt: new Date(), selectedChoiceId: choiceId, isCorrect }).where(and(eq(studentVocabularyWordOfDay.userId, userId), eq(studentVocabularyWordOfDay.day, day)));
    }
    first = true;
    const [p] = await tx.select().from(studentVocabularyProgress).where(and(eq(studentVocabularyProgress.userId, userId), eq(studentVocabularyProgress.entryId, entryId))).limit(1);
    const next = defaultSrs.review(p ?? emptyProgress(), isCorrect, new Date());
    await tx.insert(studentVocabularyProgress).values({ userId, entryId, ...next }).onConflictDoUpdate({ target: [studentVocabularyProgress.userId, studentVocabularyProgress.entryId], set: next });

    await awardXp(tx, { userId, action: "wod_opened", idempotencyKey: `wod_opened:${userId}:${day}`, day }, rewards);
    await awardXp(tx, { userId, action: "wod_answered", idempotencyKey: `wod_answered:${userId}:${day}`, day }, rewards);
    if (isCorrect) await awardXp(tx, { userId, action: "wod_correct", idempotencyKey: `wod_correct:${userId}:${day}`, day }, rewards);
    await ensureDailyActivity(tx, userId, day);
    await tx.update(studentDailyActivity).set({ wordOfDayCompleted: true }).where(and(eq(studentDailyActivity.userId, userId), eq(studentDailyActivity.day, day)));
    await addInteractions(tx, userId, day, 1);
    await maybeQualifyDay(tx, userId, day, rewards);
    await refreshVocabCounters(tx, userId);
    await checkMissionCompletion(tx, userId, day, rewards);
    await evaluateBadges(tx, userId, rewards);
  });
  if (first) {
    await emitRewardAnalytics(userId, rewards, { source: "word_of_day" });
    await analytics.track("word_of_day_completed", { day }, { userId });
  }
  return { ...rewards.toJSON(), view: await getVocabWod(userId, day) };
}

async function correctFor(userId: string, day: string) {
  const db = getDb();
  const lx = await loadLexicon(db, { isProduction: isProduction() });
  const entryId = await ensureVocabWod(day, db, lx);
  return entryId ? meaningChoices(lx, entryId, seededRandom(hashString(`${userId}:${day}:wod`)))?.correctId ?? null : null;
}
