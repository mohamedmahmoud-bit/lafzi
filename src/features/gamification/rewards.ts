import type { StreakResult } from "@/features/streaks/streak";
import type { XpAction } from "./xp-rules";

export type EarnedBadge = { code: string; name: string; icon: string; description: string };

/**
 * Collects everything a student earned during one server-side transaction so the UI can show a
 * single reward moment, and analytics can be emitted after commit.
 */
export class RewardCollector {
  awards: { action: XpAction; xp: number }[] = [];
  badges: EarnedBadge[] = [];
  streak: StreakResult | null = null;
  levelUp: { from: number; to: number; name: string } | null = null;
  missionCompleted = false;

  get totalXp() {
    return this.awards.reduce((s, a) => s + a.xp, 0);
  }

  toJSON(): RewardSummary {
    return {
      totalXp: this.totalXp,
      awards: this.awards,
      badges: this.badges,
      streak: this.streak
        ? {
            count: this.streak.state.currentStreak,
            extended: this.streak.extended,
            outcome: this.streak.outcome,
          }
        : null,
      levelUp: this.levelUp,
      missionCompleted: this.missionCompleted,
    };
  }
}

export type RewardSummary = {
  totalXp: number;
  awards: { action: XpAction; xp: number }[];
  badges: EarnedBadge[];
  streak: { count: number; extended: boolean; outcome: string } | null;
  levelUp: { from: number; to: number; name: string } | null;
  missionCompleted: boolean;
};
