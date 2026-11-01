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
import { hashString } from "@/lib/utils";

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
      revealed: boolean;
      rated: null | { knew: boolean };
      /** Shown only after the student tried to recall the meaning. */
      card: null | {
        meanings: { text: string; example: string | null }[];
        relations: { label: string; other: string; direction: "to" | "from" }[];
        mastery: string;
        /** Approved pictures / sounds / clips — after recall, never before. */
        media: ApprovedMedia[];
      };
    };

export async function getVocabWod(userId: string, day = learningDay()): Promise<VocabWodView> {
  const db = getDb();
  const lx = await loadLexicon(db, { isProduction: isProduction() });
  const entryId = await ensureVocabWod(day, db, lx);
  const entry = entryId ? lx.entries.get(entryId) : null;
  if (!entryId || !entry) return { status: "unavailable" };
  const [row] = await db.select().from(studentVocabularyWordOfDay).where(and(eq(studentVocabularyWordOfDay.userId, userId), eq(studentVocabularyWordOfDay.day, day))).limit(1);
  const revealed = !!row?.viewedAt;
  let card = null;
  if (revealed) {
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
  return { status: "ready", day, word: entry.lemma, categories: entry.categories, revealed, rated: row?.attemptedAt ? { knew: !!row.isCorrect } : null, card };
}

/** Step 1 — the student recalled in their head, then reveals the card. */
export async function revealVocabWod(userId: string) {
  const day = learningDay();
  const db = getDb();
  const entryId = await ensureVocabWod(day, db);
  if (!entryId) throw new VocabWodError("unavailable");
  const rewards = new RewardCollector();
  await db.transaction(async (tx) => {
    await lockProfile(tx, userId);
    await tx.insert(studentVocabularyWordOfDay).values({ userId, day, entryId, viewedAt: new Date() }).onConflictDoNothing();
    await awardXp(tx, { userId, action: "wod_opened", idempotencyKey: `wod_opened:${userId}:${day}`, day }, rewards);
  });
  if (rewards.totalXp) await analytics.track("word_of_day_viewed", { day }, { userId });
  return getVocabWod(userId, day);
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

/** Step 2 — the student says honestly whether they knew it. Once per day; feeds spaced repetition. */
export async function rateVocabWod(userId: string, knew: boolean): Promise<RewardSummary & { view: VocabWodView }> {
  const day = learningDay();
  const rewards = new RewardCollector();
  let first = false;
  await getDb().transaction(async (tx) => {
    await lockProfile(tx, userId);
    const [row] = await tx.select().from(studentVocabularyWordOfDay).where(and(eq(studentVocabularyWordOfDay.userId, userId), eq(studentVocabularyWordOfDay.day, day))).for("update").limit(1);
    if (!row?.viewedAt) throw new VocabWodError("unavailable");
    if (row.attemptedAt) return;
    await tx.update(studentVocabularyWordOfDay).set({ attemptedAt: new Date(), isCorrect: knew, selectedChoiceId: knew ? "knew" : "didnt" }).where(and(eq(studentVocabularyWordOfDay.userId, userId), eq(studentVocabularyWordOfDay.day, day), isNull(studentVocabularyWordOfDay.attemptedAt)));
    first = true;
    const [p] = await tx.select().from(studentVocabularyProgress).where(and(eq(studentVocabularyProgress.userId, userId), eq(studentVocabularyProgress.entryId, row.entryId))).limit(1);
    const next = defaultSrs.review(p ?? emptyProgress(), knew, new Date());
    await tx.insert(studentVocabularyProgress).values({ userId, entryId: row.entryId, ...next }).onConflictDoUpdate({ target: [studentVocabularyProgress.userId, studentVocabularyProgress.entryId], set: next });
    // Self-rated: XP for doing it, never extra XP for claiming "I knew it".
    await awardXp(tx, { userId, action: "wod_answered", idempotencyKey: `wod_answered:${userId}:${day}`, day }, rewards);
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
    await analytics.track("word_of_day_completed", { day, knew }, { userId });
  }
  return { ...rewards.toJSON(), view: await getVocabWod(userId, day) };
}
