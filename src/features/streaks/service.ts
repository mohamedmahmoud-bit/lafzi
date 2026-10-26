import "server-only";
import { and, eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { studentDailyActivity, studentProfiles } from "@/db/schema";
import { awardXp, ensureDailyActivity } from "@/features/gamification/xp.service";
import type { RewardCollector } from "@/features/gamification/rewards";
import { milestoneMultiplier } from "@/features/gamification/xp-rules";
import { env } from "@/lib/env";
import { applyQualifiedActivity, reachedMilestone } from "./streak";

/**
 * Mark today as a qualifying learning day and advance the streak. Idempotent per day.
 * Caller must hold the profile lock.
 */
export async function recordQualifiedActivity(
  tx: Tx,
  userId: string,
  day: string,
  rewards: RewardCollector,
) {
  const [p] = await tx
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, userId))
    .limit(1);
  const result = applyQualifiedActivity(
    {
      currentStreak: p.currentStreak,
      longestStreak: p.longestStreak,
      lastQualifiedDate: p.lastQualifiedDate,
      streakFreezes: p.streakFreezes,
    },
    day,
    { freezeEnabled: env().STREAK_FREEZE_ENABLED },
  );

  await ensureDailyActivity(tx, userId, day);
  await tx
    .update(studentDailyActivity)
    .set({ qualified: true, ...(result.freezesUsed ? { freezeUsed: true } : {}) })
    .where(and(eq(studentDailyActivity.userId, userId), eq(studentDailyActivity.day, day)));

  if (result.outcome === "same_day") {
    rewards.streak ??= result;
    return result;
  }

  await tx
    .update(studentProfiles)
    .set({
      currentStreak: result.state.currentStreak,
      longestStreak: result.state.longestStreak,
      lastQualifiedDate: result.state.lastQualifiedDate,
      streakFreezes: result.state.streakFreezes,
      lastActivityAt: new Date(),
    })
    .where(eq(studentProfiles.userId, userId));
  rewards.streak = result;

  const milestone = reachedMilestone(result.state.currentStreak);
  if (milestone) {
    await awardXp(
      tx,
      {
        userId,
        action: "streak_milestone",
        // Keyed by the day the milestone is reached, so a later streak run can earn it again.
        idempotencyKey: `streak_milestone:${userId}:${milestone}:${day}`,
        day,
        multiplier: milestoneMultiplier(milestone),
      },
      rewards,
    );
  }
  return result;
}
