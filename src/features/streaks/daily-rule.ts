import "server-only";
import { and, eq, or, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { friendships, studentDailyActivity, userBlocks } from "@/db/schema";
import type { RewardCollector } from "@/features/gamification/rewards";
import { ensureDailyActivity } from "@/features/gamification/xp.service";
import { addDays } from "@/lib/time";
import { recordQualifiedActivity } from "./service";

/** A streak day needs this many valid word interactions (answers), not just opening the app. */
export const MIN_DAILY_INTERACTIONS = 5;

export async function addInteractions(tx: Tx, userId: string, day: string, n: number) {
  if (n <= 0) return;
  await ensureDailyActivity(tx, userId, day);
  await tx
    .update(studentDailyActivity)
    .set({ wordInteractions: sql`${studentDailyActivity.wordInteractions} + ${n}` })
    .where(and(eq(studentDailyActivity.userId, userId), eq(studentDailyActivity.day, day)));
}

/** Qualify the day (streak) once ≥ MIN_DAILY_INTERACTIONS; also advance friendship streaks. Idempotent. */
export async function maybeQualifyDay(tx: Tx, userId: string, day: string, rewards: RewardCollector) {
  const [a] = await tx.select().from(studentDailyActivity).where(and(eq(studentDailyActivity.userId, userId), eq(studentDailyActivity.day, day))).limit(1);
  if (!a || a.wordInteractions < MIN_DAILY_INTERACTIONS) return false;
  const wasQualified = a.qualified;
  await recordQualifiedActivity(tx, userId, day, rewards);
  if (!wasQualified) await advanceFriendStreaks(tx, userId, day);
  return true;
}

/** A friendship streak advances on days when BOTH friends qualified independently. */
export async function advanceFriendStreaks(tx: Tx, userId: string, day: string) {
  const pairs = await tx
    .select()
    .from(friendships)
    .where(and(eq(friendships.status, "accepted"), or(eq(friendships.userLow, userId), eq(friendships.userHigh, userId))));
  for (const f of pairs) {
    const friend = f.userLow === userId ? f.userHigh : f.userLow;
    const [blocked] = await tx.select().from(userBlocks).where(or(and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, friend)), and(eq(userBlocks.blockerId, friend), eq(userBlocks.blockedId, userId)))).limit(1);
    if (blocked || f.streakLastDay === day) continue;
    const [fa] = await tx.select({ q: studentDailyActivity.qualified }).from(studentDailyActivity).where(and(eq(studentDailyActivity.userId, friend), eq(studentDailyActivity.day, day))).limit(1);
    if (!fa?.q) continue;
    const streak = f.streakLastDay === addDays(day, -1) ? f.streak + 1 : 1;
    await tx
      .update(friendships)
      .set({ streak, longestStreak: Math.max(streak, f.longestStreak), streakLastDay: day, updatedAt: new Date() })
      .where(and(eq(friendships.userLow, f.userLow), eq(friendships.userHigh, f.userHigh)));
  }
}
