import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  practiceSessions,
  studentDailyActivity,
  studentProfiles,
  xpTransactions,
} from "@/db/schema";
import { getMasteryBreakdown } from "@/features/dashboard/service";
import { levelFor } from "@/features/gamification/levels";
import { getLevels } from "@/features/gamification/xp.service";
import { displayStreak } from "@/features/streaks/streak";
import { addDays, lastNDays, learningDay, weekRange } from "@/lib/time";

export async function getProgress(userId: string) {
  const db = getDb();
  const today = learningDay();
  const since = addDays(today, -34);
  const [profile] = await db
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, userId));
  const activity = await db
    .select()
    .from(studentDailyActivity)
    .where(and(eq(studentDailyActivity.userId, userId), gte(studentDailyActivity.day, since)));
  const xpByDay = await db
    .select({ day: xpTransactions.day, xp: sql<number>`sum(${xpTransactions.xp})::int` })
    .from(xpTransactions)
    .where(and(eq(xpTransactions.userId, userId), gte(xpTransactions.day, addDays(today, -6))))
    .groupBy(xpTransactions.day);
  const [{ learningDays }] = await db
    .select({ learningDays: sql<number>`count(*)::int` })
    .from(studentDailyActivity)
    .where(and(eq(studentDailyActivity.userId, userId), eq(studentDailyActivity.qualified, true)));
  const [{ sessions }] = await db
    .select({ sessions: sql<number>`count(*)::int` })
    .from(practiceSessions)
    .where(and(eq(practiceSessions.userId, userId), eq(practiceSessions.status, "completed")));
  const week = weekRange(today);
  const [{ weekXp }] = await db
    .select({ weekXp: sql<number>`coalesce(sum(${xpTransactions.xp}), 0)::int` })
    .from(xpTransactions)
    .where(and(eq(xpTransactions.userId, userId), gte(xpTransactions.day, week.start)));

  const actByDay = new Map(activity.map((a) => [a.day, a]));
  const xpMap = new Map(xpByDay.map((x) => [x.day, x.xp]));
  const levels = await db.transaction((tx) => getLevels(tx));

  return {
    today,
    streak: displayStreak(profile, today),
    longestStreak: profile.longestStreak,
    level: levelFor(profile.xpTotal, levels),
    xpTotal: profile.xpTotal,
    weekXp,
    learningDays,
    sessions,
    wordsLearned: profile.totalWordsLearned,
    masteredWords: profile.masteredWords,
    mastery: await getMasteryBreakdown(userId),
    last7: lastNDays(today, 7).map((day) => ({
      day,
      xp: xpMap.get(day) ?? 0,
      qualified: actByDay.get(day)?.qualified ?? false,
    })),
    /** 5 full weeks for the streak calendar, Sunday-aligned. */
    calendar: lastNDays(weekRange(today).end, 35).map((day) => ({
      day,
      future: day > today,
      qualified: actByDay.get(day)?.qualified ?? false,
      mission: !!actByDay.get(day)?.missionCompletedAt,
    })),
  };
}
export type ProgressData = Awaited<ReturnType<typeof getProgress>>;
