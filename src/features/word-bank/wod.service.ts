import "server-only";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb, type DbOrTx, type Tx } from "@/db/client";
import {
  studentDailyActivity,
  studentProfiles,
  studentVocabularyProgress,
  studentVocabularyWordOfDay,
  vocabularyEntries,
  vocabularyWordOfDay,
} from "@/db/schema";
import { analytics } from "@/features/analytics/analytics";
import { evaluateBadges } from "@/features/badges/service";
import { RewardCollector, type RewardSummary } from "@/features/gamification/rewards";
import { awardXp, ensureDailyActivity, lockProfile } from "@/features/gamification/xp.service";
import { checkMissionCompletion } from "@/features/missions/service";
import { publishedQuestionById } from "@/features/question-bank/pool";
import { recordQualifiedActivity } from "@/features/streaks/service";
import { defaultSrs, emptyProgress } from "@/features/vocabulary/srs";
import { emitRewardAnalytics } from "@/features/gamification/reward-analytics";
import { isProduction } from "@/lib/env";
import { addDays, learningDay } from "@/lib/time";
import { hashString, seededRandom } from "@/lib/utils";
import { orderChoices } from "@/features/games/session.service";
import { approvedRelations, type ApprovedRelation } from "./service";

export const WOD_NO_REPEAT_DAYS = 90;

export class VocabWodError extends Error {
  constructor(public code: "unavailable" | "bad_option") {
    super(code);
  }
}

/** Global word for the day from the APPROVED, bank-derived repository; null if it is empty. */
export async function ensureVocabWod(day: string, db: DbOrTx = getDb()): Promise<string | null> {
  const [existing] = await db.select().from(vocabularyWordOfDay).where(eq(vocabularyWordOfDay.day, day)).limit(1);
  if (existing) return existing.entryId;
  const rels = await approvedRelations(db, { isProduction: isProduction() });
  const ids = [...new Set(rels.flatMap((r) => [r.from.id, r.to.id]))].sort();
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

async function sourceFor(db: DbOrTx, entryId: string, rels: ApprovedRelation[]) {
  for (const r of rels.filter((x) => x.from.id === entryId || x.to.id === entryId)) {
    for (const e of r.evidence) {
      const q = await publishedQuestionById(db, e.questionId, isProduction());
      if (q && q.versionId === e.versionId) return q;
    }
  }
  return null;
}

export type VocabWodView =
  | { status: "unavailable" }
  | {
      status: "ready";
      day: string;
      word: string;
      question: { noonQuestionId: number; stem: string; choices: { id: string; text: string }[] };
      answered: null | { choiceId: string; isCorrect: boolean; correctId: string; explanation: string | null };
      /** Revealed only after answering (students first reason from the question itself). */
      card: null | {
        relations: { type: "synonym" | "antonym"; other: string; noonQuestionIds: number[] }[];
        meaning: string | null;
        meaningSource: number | null;
      };
    };

export async function getVocabWod(userId: string, day = learningDay()): Promise<VocabWodView> {
  const db = getDb();
  const entryId = await ensureVocabWod(day, db);
  if (!entryId) return { status: "unavailable" };
  const rels = await approvedRelations(db, { isProduction: isProduction() });
  const [entry] = await db.select().from(vocabularyEntries).where(eq(vocabularyEntries.id, entryId)).limit(1);

  let [row] = await db.select().from(studentVocabularyWordOfDay).where(and(eq(studentVocabularyWordOfDay.userId, userId), eq(studentVocabularyWordOfDay.day, day))).limit(1);
  let q = row?.questionId ? await publishedQuestionById(db, row.questionId, isProduction()) : null;
  if (!row) {
    q = await sourceFor(db, entryId, rels);
    if (!q) return { status: "unavailable" };
    await db.insert(studentVocabularyWordOfDay).values({ userId, day, entryId, questionId: q.questionId, questionVersionId: q.versionId }).onConflictDoNothing();
    [row] = await db.select().from(studentVocabularyWordOfDay).where(and(eq(studentVocabularyWordOfDay.userId, userId), eq(studentVocabularyWordOfDay.day, day))).limit(1);
  }
  // The question was suspended/changed since it was assigned: never show a stale version.
  if (!q || q.versionId !== row.questionVersionId) return { status: "unavailable" };

  const answered = row.attemptedAt !== null;
  const correctId = q.payload.correctChoiceIds[0];
  const mine = rels.filter((r) => r.from.id === entryId || r.to.id === entryId);
  return {
    status: "ready",
    day,
    word: entry.lemma,
    question: { noonQuestionId: q.payload.noonQuestionId, stem: q.payload.stem, choices: orderChoices(q.payload, seededRandom(hashString(`${userId}:${day}`))) },
    answered: answered ? { choiceId: row.selectedChoiceId!, isCorrect: !!row.isCorrect, correctId, explanation: q.payload.explanation } : null,
    card: answered
      ? {
          relations: mine.map((r) => ({
            type: r.type,
            other: r.from.id === entryId ? r.to.lemma : r.from.lemma,
            noonQuestionIds: [...new Set(r.evidence.map((e) => e.noonQuestionId))],
          })),
          meaning: entry.meaningStatus === "approved" ? entry.meaning : null,
          meaningSource: entry.meaningStatus === "approved" ? ((entry.meaningEvidence[0] as { noonQuestionId?: number })?.noonQuestionId ?? null) : null,
        }
      : null,
  };
}

export async function markVocabWodViewed(userId: string) {
  const day = learningDay();
  const v = await getVocabWod(userId, day);
  if (v.status !== "ready") return 0;
  const rewards = new RewardCollector();
  await getDb().transaction(async (tx) => {
    await lockProfile(tx, userId);
    await tx.update(studentVocabularyWordOfDay).set({ viewedAt: new Date() }).where(and(eq(studentVocabularyWordOfDay.userId, userId), eq(studentVocabularyWordOfDay.day, day), isNull(studentVocabularyWordOfDay.viewedAt)));
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

/** One graded attempt per day on the ORIGINAL Noon question; resubmits return the first result. */
export async function answerVocabWod(userId: string, choiceId: string): Promise<RewardSummary & { view: VocabWodView }> {
  const day = learningDay();
  const before = await getVocabWod(userId, day);
  if (before.status !== "ready") throw new VocabWodError("unavailable");
  if (!before.question.choices.some((c) => c.id === choiceId)) throw new VocabWodError("bad_option");
  const rewards = new RewardCollector();
  let first = false;
  await getDb().transaction(async (tx) => {
    await lockProfile(tx, userId);
    const [row] = await tx.select().from(studentVocabularyWordOfDay).where(and(eq(studentVocabularyWordOfDay.userId, userId), eq(studentVocabularyWordOfDay.day, day))).for("update").limit(1);
    if (row.attemptedAt) return;
    const q = await publishedQuestionById(tx, row.questionId!, isProduction());
    if (!q || q.versionId !== row.questionVersionId) throw new VocabWodError("unavailable");
    const isCorrect = choiceId === q.payload.correctChoiceIds[0];
    await tx.update(studentVocabularyWordOfDay).set({ attemptedAt: new Date(), selectedChoiceId: choiceId, isCorrect, viewedAt: row.viewedAt ?? new Date() }).where(and(eq(studentVocabularyWordOfDay.userId, userId), eq(studentVocabularyWordOfDay.day, day)));
    first = true;

    const [p] = await tx.select().from(studentVocabularyProgress).where(and(eq(studentVocabularyProgress.userId, userId), eq(studentVocabularyProgress.entryId, row.entryId))).limit(1);
    const next = defaultSrs.review(p ?? emptyProgress(), isCorrect, new Date());
    await tx.insert(studentVocabularyProgress).values({ userId, entryId: row.entryId, ...next }).onConflictDoUpdate({ target: [studentVocabularyProgress.userId, studentVocabularyProgress.entryId], set: next });

    await awardXp(tx, { userId, action: "wod_opened", idempotencyKey: `wod_opened:${userId}:${day}`, day }, rewards);
    await awardXp(tx, { userId, action: "wod_answered", idempotencyKey: `wod_answered:${userId}:${day}`, day }, rewards);
    if (isCorrect) await awardXp(tx, { userId, action: "wod_correct", idempotencyKey: `wod_correct:${userId}:${day}`, day }, rewards);
    await ensureDailyActivity(tx, userId, day);
    await tx.update(studentDailyActivity).set({ wordOfDayCompleted: true }).where(and(eq(studentDailyActivity.userId, userId), eq(studentDailyActivity.day, day)));
    await recordQualifiedActivity(tx, userId, day, rewards);
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
