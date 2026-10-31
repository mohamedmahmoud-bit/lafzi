import "server-only";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  competitionEntries,
  competitions,
  leaderboardEntries,
  leaderboardPeriods,
  studentProfiles,
  xpTransactions,
} from "@/db/schema";
import { env } from "@/lib/env";
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
      displayName: sql<string>`coalesce(${studentProfiles.officialFullName}, ${studentProfiles.displayName})`,
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

// ─── Lafzi 2.0 scopes: friends first, privacy-aware cohort, categories ─────────

export type BoardRow = RankedRow & { level: number; isMe: boolean };

async function weekXpFor(userIds: string[], start: string, end: string) {
  if (!userIds.length) return [];
  const rows = await getDb()
    .select({
      userId: studentProfiles.userId,
      displayName: sql<string>`coalesce(${studentProfiles.officialFullName}, ${studentProfiles.displayName})`,
      avatar: studentProfiles.avatar,
      level: studentProfiles.currentLevel,
      xp: sql<number>`coalesce((select sum(${xpTransactions.xp}) from ${xpTransactions} where ${xpTransactions.userId} = ${studentProfiles.userId} and ${xpTransactions.day} between ${start} and ${end}), 0)::int`,
    })
    .from(studentProfiles)
    .where(inArray(studentProfiles.userId, userIds));
  return rows;
}

/** Friends board: you + accepted, unblocked friends. Names are visible to friends. */
export async function getFriendsBoard(userId: string, friendIds: string[]): Promise<BoardRow[]> {
  const week = weekRange(learningDay());
  const rows = await weekXpFor([userId, ...friendIds], week.start, week.end);
  const lv = new Map(rows.map((r) => [r.userId, r.level]));
  return rankRows(rows).map((r) => ({ ...r, level: lv.get(r.userId) ?? 1, isMe: r.userId === userId }));
}

/**
 * Cohort board. Only students who opted in to share scores are listed. Full names of non-friends
 * appear only when COHORT_LEADERBOARD_NAMES is authorised; otherwise the audience is restricted to
 * friends (no invented nicknames) and the student just sees their own position.
 */
export async function getCohortBoard(user: { id: string; cohortId: string | null }, friendIds: string[]) {
  const week = weekRange(learningDay());
  if (!user.cohortId) return { authorized: false, rows: [] as BoardRow[], me: null as BoardRow | null, size: 0 };
  const members = await getDb()
    .select({ userId: studentProfiles.userId, share: studentProfiles.shareScores })
    .from(studentProfiles)
    .where(eq(studentProfiles.cohortId, user.cohortId));
  const eligible = members.filter((m) => m.share || m.userId === user.id).map((m) => m.userId);
  const all = await weekXpFor(eligible, week.start, week.end);
  const lv = new Map(all.map((r) => [r.userId, r.level]));
  const ranked: BoardRow[] = rankRows(all).map((r) => ({ ...r, level: lv.get(r.userId) ?? 1, isMe: r.userId === user.id }));
  const me = ranked.find((r) => r.isMe) ?? null;
  const authorized = env().COHORT_LEADERBOARD_NAMES;
  const friends = new Set(friendIds);
  const rows = authorized ? ranked : ranked.filter((r) => r.isMe || friends.has(r.userId));
  return { authorized, rows, me, size: ranked.length };
}

/** Category board (this week's game points in one vocabulary category), friends only. */
export async function getCategoryBoard(userId: string, friendIds: string[], categoryId: string) {
  const week = weekRange(learningDay());
  const [comp] = await getDb()
    .select({ id: competitions.id })
    .from(competitions)
    .where(and(eq(competitions.kind, "weekly_category"), eq(competitions.categoryId, categoryId), eq(competitions.startsOn, week.start)))
    .limit(1);
  const ids = [userId, ...friendIds];
  const profiles = await getDb().select().from(studentProfiles).where(inArray(studentProfiles.userId, ids));
  const scores = comp
    ? await getDb().select().from(competitionEntries).where(and(eq(competitionEntries.competitionId, comp.id), inArray(competitionEntries.userId, ids)))
    : [];
  return rankRows(
    profiles.map((p) => ({ userId: p.userId, displayName: p.officialFullName ?? p.displayName, avatar: p.avatar, xp: scores.find((s) => s.userId === p.userId)?.score ?? 0 })),
  ).map((r) => ({ ...r, level: profiles.find((p) => p.userId === r.userId)?.currentLevel ?? 1, isMe: r.userId === userId }));
}
