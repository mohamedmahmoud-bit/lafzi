import "server-only";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb, type DbOrTx, type Tx } from "@/db/client";
import { approvedMediaFor, type ApprovedMedia } from "@/features/media/service";
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
import { checkMissionCompletion } from "@/features/missions/service";
import { addInteractions, maybeQualifyDay } from "@/features/streaks/daily-rule";
import { defaultSrs, emptyProgress, MASTERY_LABELS, type MasteryState } from "@/features/vocabulary/srs";
import { isProduction } from "@/lib/env";
import { addDays, learningDay } from "@/lib/time";
import { hashString, seededRandom } from "@/lib/utils";
import { meaningRounds } from "@/features/games/vocab-builders";

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

export type VocabWodView =
  | { status: "unavailable" }
  | {
      status: "ready";
      day: string;
      word: string;
      categories: string[];
      /** «ما معنى الكلمة؟» — four approved meanings (the word's own + three that are wrong for it). */
      choices: { id: string; text: string }[];
      /** Set once the student answered (graded on the server); the card opens only then. */
      answered: null | { choiceId: string; correctId: string; isCorrect: boolean };
      /** Shown only after the student tried to recall the meaning. */
      card: null | {
        meanings: { text: string; example: string | null }[];
        relations: { label: string; other: string; direction: "to" | "from" }[];
        mastery: string;
        /** Approved pictures / sounds / clips — after recall, never before. */
        media: ApprovedMedia[];
      };
    };

export const DONT_KNOW = "dont_know";

/** The day's check is the same for everyone (seeded by day + word). */
function wodCheck(lx: Lexicon, entryId: string, day: string) {
  const [round] = meaningRounds(lx, { n: 1, onlyEntries: [entryId], rand: seededRandom(hashString(`${day}:${entryId}`)) });
  return round ?? null;
}

export async function getVocabWod(userId: string, day = learningDay()): Promise<VocabWodView> {
  const db = getDb();
  const lx = await loadLexicon(db, { isProduction: isProduction() });
  const entryId = await ensureVocabWod(day, db, lx);
  const entry = entryId ? lx.entries.get(entryId) : null;
  if (!entryId || !entry) return { status: "unavailable" };
  const check = wodCheck(lx, entryId, day);
  const [row] = await db.select().from(studentVocabularyWordOfDay).where(and(eq(studentVocabularyWordOfDay.userId, userId), eq(studentVocabularyWordOfDay.day, day))).limit(1);
  const done = !!row?.attemptedAt;
  let card = null;
  if (done) {
    const [prog] = await db.select().from(studentVocabularyProgress).where(and(eq(studentVocabularyProgress.userId, userId), eq(studentVocabularyProgress.entryId, entryId))).limit(1);
    card = {
      meanings: lx.senses.filter((x) => x.entryId === entryId).map((x) => ({ text: x.meaning, example: x.example })),
      relations: lx.relations
        .filter((r) => r.fromId === entryId || r.toId === entryId)
        .map((r) => ({ label: RELATION_TEXT[r.type].label, other: lx.entries.get(r.fromId === entryId ? r.toId : r.fromId)!.lemma, direction: (r.fromId === entryId ? "to" : "from") as "to" | "from" })),
      mastery: MASTERY_LABELS[(prog?.state ?? "new") as MasteryState],
      media: (await approvedMediaFor(db, [entryId])).get(entryId) ?? [],
    };
  }
  return {
    status: "ready",
    day,
    word: entry.lemma,
    categories: entry.categories,
    choices: check?.choices ?? [],
    answered: done ? { choiceId: row!.selectedChoiceId ?? DONT_KNOW, correctId: check?.correctId ?? "", isCorrect: !!row!.isCorrect } : null,
    card,
  };
}

/**
 * The student picks the meaning (or «لا أعرف»). Graded on the server; once per day. XP for taking
 * part, a bonus only for a correct answer — nothing for self-reported knowledge.
 */
export async function answerVocabWod(userId: string, choiceId: string): Promise<RewardSummary & { view: VocabWodView }> {
  const day = learningDay();
  const db = getDb();
  const lx = await loadLexicon(db, { isProduction: isProduction() });
  const entryId = await ensureVocabWod(day, db, lx);
  if (!entryId) throw new VocabWodError("unavailable");
  const check = wodCheck(lx, entryId, day);
  if (choiceId !== DONT_KNOW && !check?.choices.some((c) => c.id === choiceId)) throw new VocabWodError("bad_option");
  // Any of the word's own approved meanings is right.
  const own = new Set(lx.senses.filter((x) => x.entryId === entryId).map((x) => x.id));
  const isCorrect = own.has(choiceId);
  const rewards = new RewardCollector();
  let first = false;
  await db.transaction(async (tx) => {
    await lockProfile(tx, userId);
    await tx.insert(studentVocabularyWordOfDay).values({ userId, day, entryId, viewedAt: new Date() }).onConflictDoNothing();
    const done = await tx
      .update(studentVocabularyWordOfDay)
      .set({ attemptedAt: new Date(), isCorrect, selectedChoiceId: choiceId })
      .where(and(eq(studentVocabularyWordOfDay.userId, userId), eq(studentVocabularyWordOfDay.day, day), isNull(studentVocabularyWordOfDay.attemptedAt)))
      .returning({ day: studentVocabularyWordOfDay.day });
    if (!done.length) return;
    first = true;
    const [p] = await tx.select().from(studentVocabularyProgress).where(and(eq(studentVocabularyProgress.userId, userId), eq(studentVocabularyProgress.entryId, entryId))).limit(1);
    const next = defaultSrs.review(p ?? emptyProgress(), isCorrect, new Date());
    await tx.insert(studentVocabularyProgress).values({ userId, entryId, ...next }).onConflictDoUpdate({ target: [studentVocabularyProgress.userId, studentVocabularyProgress.entryId], set: next });
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
    await analytics.track("word_of_day_completed", { day, correct: isCorrect }, { userId });
  }
  return { ...rewards.toJSON(), view: await getVocabWod(userId, day) };
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
