import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { competitionEntries, competitions, studentProfiles } from "@/db/schema";
import type { CurrentUser } from "@/features/auth/dal";
import { learningDay, weekRange } from "@/lib/time";

/** This week's topic challenge, ranked within the student's cohort. Scores are server-computed game points. */
export async function getTopicChallenge(user: CurrentUser, topicId: string) {
  const db = getDb();
  const wk = weekRange(learningDay());
  const [comp] = await db
    .select()
    .from(competitions)
    .where(and(eq(competitions.kind, "weekly_topic"), eq(competitions.topicId, topicId), eq(competitions.startsOn, wk.start)))
    .limit(1);
  const [me] = await db.select({ cohortId: studentProfiles.cohortId }).from(studentProfiles).where(eq(studentProfiles.userId, user.id)).limit(1);
  if (!comp || !me?.cohortId) return { topicId, endsOn: wk.end, rows: [] as { userId: string; displayName: string; avatar: string; score: number; rank: number }[], me: null };
  const rows = await db
    .select({ userId: competitionEntries.userId, displayName: studentProfiles.displayName, avatar: studentProfiles.avatar, score: competitionEntries.score })
    .from(competitionEntries)
    .innerJoin(studentProfiles, eq(studentProfiles.userId, competitionEntries.userId))
    .where(and(eq(competitionEntries.competitionId, comp.id), eq(studentProfiles.cohortId, me.cohortId)))
    .orderBy(desc(competitionEntries.score))
    .limit(50);
  let rank = 0;
  let prev = -1;
  const ranked = rows.map((r, i) => {
    if (r.score !== prev) rank = i + 1;
    prev = r.score;
    return { ...r, rank };
  });
  return { topicId, endsOn: wk.end, rows: ranked, me: ranked.find((r) => r.userId === user.id) ?? null };
}
