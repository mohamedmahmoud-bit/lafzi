import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { studentDailyActivity } from "@/db/schema";
import { awardXp } from "@/features/gamification/xp.service";
import type { RewardCollector } from "@/features/gamification/rewards";
import { missionProgress } from "./config";

/** Completes today's mission (once) when all tasks are done. Caller holds the profile lock. */
export async function checkMissionCompletion(
  tx: Tx,
  userId: string,
  day: string,
  rewards: RewardCollector,
) {
  const [a] = await tx
    .select()
    .from(studentDailyActivity)
    .where(and(eq(studentDailyActivity.userId, userId), eq(studentDailyActivity.day, day)))
    .limit(1);
  if (!a || a.missionCompletedAt) return;
  const progress = missionProgress({
    wordOfDayCompleted: a.wordOfDayCompleted,
    dailySessionCompleted: a.sessionsCompleted > 0,
  });
  if (!progress.completed) return;
  const updated = await tx
    .update(studentDailyActivity)
    .set({ missionCompletedAt: new Date() })
    .where(and(eq(studentDailyActivity.id, a.id), isNull(studentDailyActivity.missionCompletedAt)))
    .returning({ id: studentDailyActivity.id });
  if (!updated.length) return;
  rewards.missionCompleted = true;
  await awardXp(
    tx,
    {
      userId,
      action: "mission_completed",
      idempotencyKey: `mission_completed:${userId}:${day}`,
      day,
    },
    rewards,
  );
}
