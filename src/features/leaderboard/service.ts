import "server-only";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  leaderboardEntries,
  leaderboardPeriods,
  studentProfiles,
  xpTransactions,
} from "@/db/schema";
import { addDays, learningDay, weekRange } from "@/lib/time";
import { rankRows, xpToNextRank, type RankedRow } from "./ranking";

async function cohortWeekRows(cohortId: string, start: string, end: string) {
  const weekXp = getDb()
    .select({
      userId: xpTransactions.userId,
      xp: sql<number>`sum(${xpTransactions.xp})::int`.as("xp"),
    })
    .from(xpTransactions)
    .where(and(gte(xpTransactions.day, start), lte(xpTransactions.day, end)))
    .groupBy(xpTransactions.userId)
    .as("week_xp");
  return getDb()
    .select({
      userId: studentProfiles.userId,
      displayName: studentProfiles.displayName,
      avatar: studentProfiles.avatar,
      xp: sql<number>`coalesce(${weekXp.xp}, 0)::int`,
    })
    .from(studentProfiles)
    .leftJoin(weekXp, eq(weekXp.userId, studentProfiles.userId))
    .where(eq(studentProfiles.cohortId, cohortId));
}

/** Persist last week's final standings once (lazy, idempotent via unique keys). */
async function snapshotPreviousWeek(cohortId: string, today: string) {
  const prev = weekRange(addDays(weekRange(today).start, -1));
  const db = getDb();
  const [exists] = await db
    .select({ id: leaderboardPeriods.id })
    .from(leaderboardPeriods)
    .where(
      and(eq(leaderboardPeriods.cohortId, cohortId), eq(leaderboardPeriods.weekStart, prev.start)),
    )
    .limit(1);
  if (exists) return;
  const ranked = rankRows(await cohortWeekRows(cohortId, prev.start, prev.end)).filter(
    (r) => r.xp > 0,
  );
  if (!ranked.length) return;
  await db.transaction(async (tx) => {
    const [period] = await tx
      .insert(leaderboardPeriods)
      .values({ cohortId, weekStart: prev.start, weekEnd: prev.end })
      .onConflictDoNothing()
      .returning({ id: leaderboardPeriods.id });
    if (!period) return;
    await tx
      .insert(leaderboardEntries)
      .values(
        ranked.map((r) => ({ periodId: period.id, userId: r.userId, xp: r.xp, rank: r.rank })),
      );
  });
}

export type WeeklyLeaderboard = {
  week: { start: string; end: string; daysLeft: number };
  rows: RankedRow[];
  me: RankedRow | null;
  xpToNext: number | null;
  lastWeek: { rank: number; xp: number; size: number } | null;
};

export async function getWeeklyLeaderboard(user: {
  id: string;
  cohortId: string | null;
}): Promise<WeeklyLeaderboard> {
  const today = learningDay();
  const week = weekRange(today);
  const daysLeft = Math.max(0, Math.round((Date.parse(week.end) - Date.parse(today)) / 86_400_000));
  if (!user.cohortId) {
    return { week: { ...week, daysLeft }, rows: [], me: null, xpToNext: null, lastWeek: null };
  }
  await snapshotPreviousWeek(user.cohortId, today);
  const rows = rankRows(await cohortWeekRows(user.cohortId, week.start, week.end));

  const prevStart = weekRange(addDays(week.start, -1)).start;
  const [last] = await getDb()
    .select({
      rank: leaderboardEntries.rank,
      xp: leaderboardEntries.xp,
      size: sql<number>`(select count(*)::int from ${leaderboardEntries} e where e.period_id = ${leaderboardPeriods.id})`,
    })
    .from(leaderboardEntries)
    .innerJoin(leaderboardPeriods, eq(leaderboardPeriods.id, leaderboardEntries.periodId))
    .where(
      and(
        eq(leaderboardPeriods.cohortId, user.cohortId),
        eq(leaderboardPeriods.weekStart, prevStart),
        eq(leaderboardEntries.userId, user.id),
      ),
    )
    .limit(1);

  return {
    week: { ...week, daysLeft },
    rows,
    me: rows.find((r) => r.userId === user.id) ?? null,
    xpToNext: xpToNextRank(rows, user.id),
    lastWeek: last ?? null,
  };
}
