import "server-only";
import { analytics } from "@/features/analytics/analytics";
import type { RewardCollector } from "./rewards";

/** Emit analytics for everything earned in one transaction (call after commit). */
export async function emitRewardAnalytics(userId: string, rewards: RewardCollector, context: Record<string, unknown>) {
  for (const a of rewards.awards) await analytics.track("xp_awarded", { ...a, ...context }, { userId });
  if (rewards.streak?.extended) {
    await analytics.track("streak_extended", { streak: rewards.streak.state.currentStreak, outcome: rewards.streak.outcome }, { userId });
  }
  if (rewards.missionCompleted) await analytics.track("daily_mission_completed", context, { userId });
  if (rewards.levelUp) await analytics.track("level_up", rewards.levelUp, { userId });
  for (const b of rewards.badges) await analytics.track("badge_earned", { code: b.code }, { userId });
}
