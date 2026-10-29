import "server-only";
import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  noonQuestions,
  noonQuestionVersions,
  questionGameCompatibility,
  questionReviewDecisions,
  questionSyncRuns,
  questionValidationResults,
} from "@/db/schema";
import type { NoonQuestion } from "./types";

export async function questionBankStats() {
  const db = getDb();
  const byStatus = Object.fromEntries(
    (await db.select({ s: noonQuestions.status, n: sql<number>`count(*)::int` }).from(noonQuestions).groupBy(noonQuestions.status)).map((r) => [r.s, r.n]),
  ) as Record<string, number>;
  const [{ missingAnswer }] = await db
    .select({ missingAnswer: sql<number>`count(distinct ${questionValidationResults.versionId})::int` })
    .from(questionValidationResults)
    .innerJoin(noonQuestions, eq(noonQuestions.currentVersionId, questionValidationResults.versionId))
    .where(and(eq(questionValidationResults.check, "correct_answer"), eq(questionValidationResults.passed, false)));
  const [{ unmapped }] = await db.select({ unmapped: sql<number>`count(*)::int` }).from(noonQuestions).where(and(isNull(noonQuestions.subskillId), sql`${noonQuestions.status} <> 'archived'`));
  const [{ updatedPending }] = await db
    .select({ updatedPending: sql<number>`count(*)::int` })
    .from(noonQuestions)
    .where(and(eq(noonQuestions.status, "review_required"), sql`(select count(*) from ${noonQuestionVersions} v where v.question_id = ${noonQuestions.id}) > 1`));
  const runs = await db.select().from(questionSyncRuns).orderBy(desc(questionSyncRuns.startedAt)).limit(10);
  const lastOk = runs.find((r) => r.status === "succeeded" || r.status === "partial") ?? null;
  const [{ failed }] = await db.select({ failed: sql<number>`count(*)::int` }).from(questionSyncRuns).where(eq(questionSyncRuns.status, "failed"));
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  return {
    total,
    published: byStatus.published ?? 0,
    ready: byStatus.ready ?? 0,
    pending: (byStatus.ready ?? 0) + (byStatus.review_required ?? 0) + (byStatus.imported ?? 0) + (byStatus.validating ?? 0),
    reviewRequired: byStatus.review_required ?? 0,
    updatedPending,
    rejected: byStatus.rejected ?? 0,
    archived: byStatus.archived ?? 0,
    missingAnswer,
    unmapped,
    failedSyncs: failed,
    lastSync: lastOk,
    runs,
  };
}

export type QuestionFilter = { status?: string; topicId?: string; subskillId?: string; difficulty?: number; noonId?: number; page?: number };

export async function listQuestions(f: QuestionFilter) {
  const conds: SQL[] = [];
  if (f.status) conds.push(sql`${noonQuestions.status} = ${f.status}`);
  if (f.topicId) conds.push(eq(noonQuestions.topicId, f.topicId));
  if (f.subskillId) conds.push(eq(noonQuestions.subskillId, f.subskillId));
  if (f.difficulty) conds.push(eq(noonQuestions.difficulty, f.difficulty));
  if (f.noonId) conds.push(eq(noonQuestions.noonQuestionId, f.noonId));
  const size = 50;
  const rows = await getDb()
    .select({
      id: noonQuestions.id,
      noonId: noonQuestions.noonQuestionId,
      status: noonQuestions.status,
      topicId: noonQuestions.topicId,
      subskillId: noonQuestions.subskillId,
      difficulty: noonQuestions.difficulty,
      isMock: noonQuestions.isMock,
      reason: noonQuestions.statusReason,
      version: noonQuestionVersions.version,
      stem: sql<string>`${noonQuestionVersions.payload}->>'stem'`,
      updatedAt: noonQuestions.updatedAt,
    })
    .from(noonQuestions)
    .leftJoin(noonQuestionVersions, eq(noonQuestionVersions.id, noonQuestions.currentVersionId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(noonQuestions.updatedAt))
    .limit(size + 1)
    .offset(((f.page ?? 1) - 1) * size);
  return { rows: rows.slice(0, size), hasMore: rows.length > size };
}

export async function questionDetail(id: string) {
  const db = getDb();
  const [q] = await db.select().from(noonQuestions).where(eq(noonQuestions.id, id)).limit(1);
  if (!q) return null;
  const versions = await db.select().from(noonQuestionVersions).where(eq(noonQuestionVersions.questionId, id)).orderBy(desc(noonQuestionVersions.version));
  const current = versions.find((v) => v.id === q.currentVersionId) ?? null;
  const checks = current ? await db.select().from(questionValidationResults).where(eq(questionValidationResults.versionId, current.id)) : [];
  const decisions = await db.select().from(questionReviewDecisions).where(eq(questionReviewDecisions.questionId, id)).orderBy(desc(questionReviewDecisions.createdAt));
  const compat = await db.select().from(questionGameCompatibility).where(eq(questionGameCompatibility.questionId, id));
  return {
    q,
    current: current ? { ...current, payload: current.payload as unknown as NoonQuestion } : null,
    versions: versions.map((v) => ({ id: v.id, version: v.version, fetchedAt: v.fetchedAt, correctnessHash: v.correctnessHash })),
    checks,
    decisions,
    compat,
  };
}
