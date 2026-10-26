import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { studentProfiles, studentWordProgress } from "@/db/schema";
import { defaultSrs, emptyProgress, type SrsProgress } from "./srs";

/** Apply one graded answer to the student's SRS state for a word. */
export async function recordWordAnswer(
  tx: Tx,
  userId: string,
  wordId: string,
  correct: boolean,
  opts: { synonymQuestion?: boolean; now?: Date } = {},
) {
  const now = opts.now ?? new Date();
  const [row] = await tx
    .select()
    .from(studentWordProgress)
    .where(and(eq(studentWordProgress.userId, userId), eq(studentWordProgress.wordId, wordId)))
    .limit(1);
  const prev: SrsProgress = row
    ? {
        box: row.box,
        exposureCount: row.exposureCount,
        correctCount: row.correctCount,
        incorrectCount: row.incorrectCount,
        masteryScore: row.masteryScore,
        state: row.state,
        lastSeenAt: row.lastSeenAt,
        nextReviewAt: row.nextReviewAt,
      }
    : emptyProgress();
  const next = defaultSrs.review(prev, correct, now);
  const synonymCorrectCount =
    (row?.synonymCorrectCount ?? 0) + (correct && opts.synonymQuestion ? 1 : 0);
  await tx
    .insert(studentWordProgress)
    .values({ userId, wordId, ...next, synonymCorrectCount })
    .onConflictDoUpdate({
      target: [studentWordProgress.userId, studentWordProgress.wordId],
      set: { ...next, synonymCorrectCount },
    });
  return next;
}

/** Recompute cached word counters on the profile from the progress table. */
export async function refreshWordCounters(tx: Tx, userId: string) {
  await tx
    .update(studentProfiles)
    .set({
      totalWordsLearned: sql`(select count(*) from ${studentWordProgress} where ${studentWordProgress.userId} = ${userId} and ${studentWordProgress.correctCount} > 0)`,
      masteredWords: sql`(select count(*) from ${studentWordProgress} where ${studentWordProgress.userId} = ${userId} and ${studentWordProgress.state} = 'mastered')`,
    })
    .where(eq(studentProfiles.userId, userId));
}
