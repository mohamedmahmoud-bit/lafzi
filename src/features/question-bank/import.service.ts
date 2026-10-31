import { and, eq, inArray, isNull, ne, notInArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { noonQuestions, questionSyncRuns } from "@/db/schema";
import { ingestQuestion, type SyncStats } from "./sync.service";
import type { NoonQuestionDTO } from "./types";

/**
 * Admin import of an authorised Noon export, processed in small batches so each request stays
 * well inside serverless time limits. Same ingest + validation as the scheduled sync.
 */
export async function beginImport(db: Db, p: { chapters: number[]; total: number; triggeredBy: string | null; fileNames: string[] }) {
  // An import abandoned mid-way (tab closed, network drop) must not block the next attempt.
  await db
    .update(questionSyncRuns)
    .set({ status: "failed", error: "Import abandoned before finishing", finishedAt: new Date() })
    .where(and(eq(questionSyncRuns.status, "running"), eq(questionSyncRuns.provider, "file")));
  const [active] = await db.select({ id: questionSyncRuns.id }).from(questionSyncRuns).where(and(eq(questionSyncRuns.status, "running"), sql`${questionSyncRuns.startedAt} > now() - interval '30 minutes'`)).limit(1);
  if (active) throw new Error("A question-bank sync or import is already running");
  const [run] = await db
    .insert(questionSyncRuns)
    .values({ provider: "file", mode: "manual", scope: { chapters: p.chapters, total: p.total, files: p.fileNames }, status: "running", triggeredBy: p.triggeredBy })
    .returning({ id: questionSyncRuns.id });
  return run.id;
}

export async function importBatch(db: Db, runId: string, items: NoonQuestionDTO[], isProduction: boolean) {
  const [run] = await db.select().from(questionSyncRuns).where(eq(questionSyncRuns.id, runId)).limit(1);
  if (!run || run.status !== "running") throw new Error("Import run is not active");
  const stats = { ...(run.stats as Partial<SyncStats>) } as Record<string, number>;
  const bump = (k: string) => (stats[k] = (stats[k] ?? 0) + 1);
  const errors: string[] = [];
  const now = new Date();
  for (const dto of items) {
    bump("seen");
    try {
      const r = await ingestQuestion(db, dto, { runId, isMock: false, isProduction, now });
      bump(r.change);
      if (r.pipeline) {
        if (r.pipeline.suspended) bump("suspended");
        bump(r.pipeline.outcome === "ready" ? "ready" : r.pipeline.outcome === "review_required" ? "reviewRequired" : "rejected");
      }
    } catch (e) {
      bump("failed");
      errors.push(`question ${dto?.id}: ${(e as Error).message}`);
    }
  }
  await db
    .update(questionSyncRuns)
    .set({ stats, error: errors.length ? [run.error, ...errors].filter(Boolean).join("\n").slice(0, 4000) : run.error })
    .where(eq(questionSyncRuns.id, runId));
  return stats;
}

/** Close the run; questions in the imported chapters that are absent from a COMPLETE export are archived. */
export async function finishImport(db: Db, runId: string, p: { chapters: number[]; seenIds: number[]; complete: boolean }) {
  const [run] = await db.select().from(questionSyncRuns).where(eq(questionSyncRuns.id, runId)).limit(1);
  if (!run || run.status !== "running") throw new Error("Import run is not active");
  const stats = { ...(run.stats as Record<string, number>) };
  if (p.complete && !stats.failed && p.seenIds.length && p.chapters.length) {
    const removed = await db
      .update(noonQuestions)
      .set({ status: "archived", publishedVersionId: null, removedAt: new Date(), statusReason: "Not in the latest Noon export" })
      .where(
        and(
          eq(noonQuestions.isMock, false),
          isNull(noonQuestions.removedAt),
          ne(noonQuestions.status, "archived"),
          notInArray(noonQuestions.noonQuestionId, p.seenIds),
          inArray(noonQuestions.id, sql`(
            select q.id from noon_questions q join noon_question_versions v on v.id = q.current_version_id
            where exists (select 1 from jsonb_array_elements(v.payload->'curriculum') c
                          where (c->>'chapterId')::int in (${sql.join(p.chapters.map((c) => sql`${c}`), sql`, `)})))`),
        ),
      )
      .returning({ id: noonQuestions.id });
    stats.removed = removed.length;
  }
  const status = stats.failed ? "partial" : "succeeded";
  const [done] = await db.update(questionSyncRuns).set({ status, stats, finishedAt: new Date() }).where(eq(questionSyncRuns.id, runId)).returning();
  return done;
}

/**
 * Reviewer bulk decision: publish every question whose current version passed ALL checks (READY).
 * Questions needing review are untouched. Set-based so it is fast on thousands of rows.
 */
export async function publishAllReady(db: Db, p: { reviewerId: string | null; isProduction: boolean }) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(noonQuestions)
      .set({ status: "published", publishedVersionId: sql`${noonQuestions.currentVersionId}`, statusReason: null })
      .where(and(eq(noonQuestions.status, "ready"), sql`${noonQuestions.topicId} is not null`, ...(p.isProduction ? [eq(noonQuestions.isMock, false)] : [])))
      .returning({ id: noonQuestions.id, versionId: noonQuestions.currentVersionId });
    if (!rows.length) return 0;
    const ids = rows.map((r) => r.id);
    await tx.execute(sql`update question_skill_mappings set status = 'approved', decided_by = ${p.reviewerId} where source = 'noon_tag' and question_id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`);
    await tx.execute(sql`update question_game_compatibility set status = 'approved', decided_by = ${p.reviewerId} where basis = 'native' and question_id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`);
    await tx.execute(sql`insert into question_review_decisions (question_id, version_id, decision, reason, reviewer_id)
      select q.id, q.current_version_id, 'approve', 'bulk: all checks passed', ${p.reviewerId}::uuid from noon_questions q
      where q.id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`);
    return rows.length;
  });
}
