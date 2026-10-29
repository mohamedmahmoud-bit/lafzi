import { and, eq, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { curriculumNodes, noonQuestions, noonQuestionVersions, questionSyncRuns } from "@/db/schema";
import { contentHash, correctnessHash, normalizeDTO } from "./normalize";
import { latestVersionNumber, runPipeline } from "./pipeline";
import type { NoonQuestionBankProvider, NoonQuestionDTO } from "./types";

export type SyncStats = {
  pages: number;
  seen: number;
  new: number;
  modified: number;
  unchanged: number;
  restored: number;
  removed: number;
  suspended: number;
  ready: number;
  reviewRequired: number;
  rejected: number;
  failedPages: number;
  curriculumNodes: number;
};

const emptyStats = (): SyncStats => ({
  pages: 0, seen: 0, new: 0, modified: 0, unchanged: 0, restored: 0, removed: 0,
  suspended: 0, ready: 0, reviewRequired: 0, rejected: 0, failedPages: 0, curriculumNodes: 0,
});

/** A sync running longer than this is considered dead and no longer blocks new runs. */
const STALE_RUN_MS = 30 * 60_000;

async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseMs = 500): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
    }
  }
  throw last;
}

/**
 * Store one question from the source. Idempotent: same content → no new version.
 * Returns what happened so the caller can revalidate.
 */
export async function ingestQuestion(
  db: Db,
  dto: NoonQuestionDTO,
  ctx: { runId: string | null; isMock: boolean; isProduction: boolean; now: Date },
): Promise<{ change: "new" | "modified" | "unchanged" | "restored"; pipeline?: Awaited<ReturnType<typeof runPipeline>> }> {
  const q = normalizeDTO(dto);
  const hash = contentHash(q);
  const cHash = correctnessHash(q);

  return db.transaction(async (tx) => {
    // Serialise per Noon question id so concurrent runs can't create duplicate rows/versions.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('noon_q:' || ${String(q.noonQuestionId)}))`);
    const [existing] = await tx.select().from(noonQuestions).where(eq(noonQuestions.noonQuestionId, q.noonQuestionId)).limit(1);

    if (!existing) {
      const [row] = await tx
        .insert(noonQuestions)
        .values({ noonQuestionId: q.noonQuestionId, status: "imported", isMock: ctx.isMock, lastSeenAt: ctx.now, difficulty: q.difficulty })
        .returning({ id: noonQuestions.id });
      const [ver] = await tx
        .insert(noonQuestionVersions)
        .values({ questionId: row.id, version: 1, contentHash: hash, correctnessHash: cHash, payload: q as unknown as Record<string, unknown>, raw: dto as Record<string, unknown>, syncRunId: ctx.runId })
        .returning({ id: noonQuestionVersions.id });
      await tx.update(noonQuestions).set({ currentVersionId: ver.id }).where(eq(noonQuestions.id, row.id));
      return { change: "new" as const, pipeline: await runPipeline(tx, row.id, ctx) };
    }

    const [same] = await tx
      .select({ id: noonQuestionVersions.id })
      .from(noonQuestionVersions)
      .where(and(eq(noonQuestionVersions.questionId, existing.id), eq(noonQuestionVersions.contentHash, hash)))
      .limit(1);

    if (same && same.id === existing.currentVersionId) {
      const wasRemoved = existing.removedAt !== null;
      await tx.update(noonQuestions).set({ lastSeenAt: ctx.now, removedAt: null }).where(eq(noonQuestions.id, existing.id));
      if (wasRemoved) {
        // Back in the bank: revalidate, never auto-republish.
        await tx.update(noonQuestions).set({ status: "imported", publishedVersionId: null }).where(eq(noonQuestions.id, existing.id));
        return { change: "restored" as const, pipeline: await runPipeline(tx, existing.id, ctx) };
      }
      return { change: "unchanged" as const };
    }

    // Content changed (or reverted to an older snapshot): new immutable version unless that exact
    // snapshot already exists, in which case we point back at it.
    let versionId = same?.id;
    if (!versionId) {
      const [ver] = await tx
        .insert(noonQuestionVersions)
        .values({
          questionId: existing.id,
          version: (await latestVersionNumber(tx, existing.id)) + 1,
          contentHash: hash,
          correctnessHash: cHash,
          payload: q as unknown as Record<string, unknown>,
          raw: dto as Record<string, unknown>,
          syncRunId: ctx.runId,
        })
        .returning({ id: noonQuestionVersions.id });
      versionId = ver.id;
    }
    await tx
      .update(noonQuestions)
      .set({ currentVersionId: versionId, lastSeenAt: ctx.now, removedAt: null })
      .where(eq(noonQuestions.id, existing.id));
    return { change: "modified" as const, pipeline: await runPipeline(tx, existing.id, ctx) };
  });
}

export type SyncOptions = {
  provider: NoonQuestionBankProvider;
  mode: "scheduled" | "manual" | "seed";
  chapters: number[];
  triggeredBy?: string | null;
  isProduction: boolean;
  pageSize?: number;
  /** Max pages per chapter (safety valve). */
  maxPages?: number;
};

/**
 * Paginated reconciliation. Noon exposes no modification timestamps or webhooks, so every run
 * re-reads the configured scope and compares content hashes. Removal is only inferred after a
 * COMPLETE successful pass of the scope (a partial run never archives anything).
 */
export async function syncQuestionBank(db: Db, o: SyncOptions) {
  const stats = emptyStats();
  const now = new Date();

  if (o.provider.unavailableReason) {
    const [run] = await db
      .insert(questionSyncRuns)
      .values({ provider: o.provider.id, mode: o.mode, scope: { chapters: o.chapters }, status: "not_configured", error: o.provider.unavailableReason, triggeredBy: o.triggeredBy ?? null, finishedAt: now })
      .returning();
    return run;
  }
  if (o.isProduction && o.provider.id === "mock") throw new Error("Mock question bank is refused in production");

  // Single-run lock: an active run blocks a second one (stale runs are marked failed).
  await db
    .update(questionSyncRuns)
    .set({ status: "failed", error: "Timed out (stale run)", finishedAt: now })
    .where(and(eq(questionSyncRuns.status, "running"), lt(questionSyncRuns.startedAt, new Date(now.getTime() - STALE_RUN_MS))));
  const [active] = await db
    .select({ id: questionSyncRuns.id })
    .from(questionSyncRuns)
    .where(and(eq(questionSyncRuns.status, "running"), gte(questionSyncRuns.startedAt, new Date(now.getTime() - STALE_RUN_MS))))
    .limit(1);
  if (active) throw new Error("A question-bank sync is already running");

  const [run] = await db
    .insert(questionSyncRuns)
    .values({ provider: o.provider.id, mode: o.mode, scope: { chapters: o.chapters }, status: "running", triggeredBy: o.triggeredBy ?? null, startedAt: now })
    .returning();

  const errors: string[] = [];
  try {
    // 1) Curriculum (API when available, otherwise the bundled snapshot).
    const nodes = await withRetry(() => o.provider.getCurriculum());
    for (const n of nodes) {
      const key = `${n.level}:${n.noonId}`;
      await db
        .insert(curriculumNodes)
        .values({ key, level: n.level, noonId: n.noonId, parentKey: n.parentNoonId ? `${n.level === "subtopic" ? "topic" : "chapter"}:${n.parentNoonId}` : null, name: n.name, sequence: n.sequence, deleted: n.deleted, syncedAt: now })
        .onConflictDoUpdate({ target: curriculumNodes.key, set: { name: n.name, sequence: n.sequence, deleted: n.deleted, syncedAt: now } });
    }
    stats.curriculumNodes = nodes.length;

    // 2) Questions, chapter by chapter, page by page.
    const ctx = { runId: run.id, isMock: o.provider.id === "mock", isProduction: o.isProduction, now };
    for (const chapter of o.chapters) {
      let cursor: string | undefined;
      for (let page = 0; page < (o.maxPages ?? 500); page++) {
        let res;
        try {
          res = await withRetry(() => o.provider.listQuestions({ cursor, limit: o.pageSize ?? 100, curriculumIds: [`chapter:${chapter}`] }));
        } catch (e) {
          stats.failedPages++;
          errors.push(`chapter ${chapter} page ${page}: ${(e as Error).message}`);
          break;
        }
        stats.pages++;
        for (const dto of res.items) {
          stats.seen++;
          try {
            const r = await ingestQuestion(db, dto, ctx);
            stats[r.change]++;
            if (r.pipeline) {
              if (r.pipeline.suspended) stats.suspended++;
              if (r.pipeline.outcome === "ready") stats.ready++;
              else if (r.pipeline.outcome === "review_required") stats.reviewRequired++;
              else stats.rejected++;
            }
          } catch (e) {
            errors.push(`question ${dto?.id}: ${(e as Error).message}`);
          }
        }
        if (!res.nextCursor) break;
        cursor = res.nextCursor;
      }
    }

    // 3) Removals — only after a clean, complete pass.
    if (errors.length === 0) {
      const removed = await db
        .update(noonQuestions)
        .set({ status: "archived", publishedVersionId: null, removedAt: now, statusReason: "No longer returned by the Noon question bank" })
        .where(
          and(
            lt(noonQuestions.lastSeenAt, now),
            isNull(noonQuestions.removedAt),
            ne(noonQuestions.status, "archived"),
            eq(noonQuestions.isMock, o.provider.id === "mock"),
            inArray(noonQuestions.id, sql`(
              select q.id from noon_questions q join noon_question_versions v on v.id = q.current_version_id
              where exists (select 1 from jsonb_array_elements(v.payload->'curriculum') c
                            where (c->>'chapterId')::int in (${sql.join(o.chapters.map((c) => sql`${c}`), sql`, `)})))`),
          ),
        )
        .returning({ id: noonQuestions.id });
      stats.removed = removed.length;
    }

    const status = errors.length === 0 ? "succeeded" : stats.seen > 0 ? "partial" : "failed";
    const [done] = await db
      .update(questionSyncRuns)
      .set({ status, stats, error: errors.length ? errors.slice(0, 20).join("\n") : null, finishedAt: new Date() })
      .where(eq(questionSyncRuns.id, run.id))
      .returning();
    return done;
  } catch (e) {
    const [failed] = await db
      .update(questionSyncRuns)
      .set({ status: "failed", stats, error: (e as Error).message, finishedAt: new Date() })
      .where(eq(questionSyncRuns.id, run.id))
      .returning();
    return failed;
  }
}
