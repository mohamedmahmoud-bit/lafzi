import { daysBetween } from "@/lib/time";

export type StreakState = {
  currentStreak: number;
  longestStreak: number;
  /** Last learning day that qualified ('YYYY-MM-DD'), or null if never. */
  lastQualifiedDate: string | null;
  streakFreezes: number;
};

export type StreakOutcome =
  | "started" // first ever qualifying day
  | "extended" // consecutive day
  | "same_day" // already counted today
  | "restarted" // gap too large, streak restarts at 1
  | "frozen_extended"; // gap bridged by streak freezes

export type StreakResult = {
  state: StreakState;
  outcome: StreakOutcome;
  freezesUsed: number;
  /** True when the streak went up today (for XP/analytics). */
  extended: boolean;
};

/**
 * Apply a qualifying learning activity on `today`. Pure — the caller persists the result.
 * Only meaningful activities call this (completing كلمة اليوم or a practice session),
 * never page views.
 */
export function applyQualifiedActivity(
  prev: StreakState,
  today: string,
  opts: { freezeEnabled?: boolean } = {},
): StreakResult {
  if (!prev.lastQualifiedDate) {
    return result({ ...prev, currentStreak: 1 }, today, "started", 0);
  }
  const gap = daysBetween(prev.lastQualifiedDate, today);
  if (gap <= 0) {
    // Same day (or clock skew): nothing changes.
    return { state: prev, outcome: "same_day", freezesUsed: 0, extended: false };
  }
  if (gap === 1) {
    return result({ ...prev, currentStreak: prev.currentStreak + 1 }, today, "extended", 0);
  }
  const missedDays = gap - 1;
  if (opts.freezeEnabled && prev.streakFreezes >= missedDays) {
    return result(
      {
        ...prev,
        currentStreak: prev.currentStreak + 1,
        streakFreezes: prev.streakFreezes - missedDays,
      },
      today,
      "frozen_extended",
      missedDays,
    );
  }
  return result({ ...prev, currentStreak: 1 }, today, "restarted", 0);
}

function result(
  state: StreakState,
  today: string,
  outcome: StreakOutcome,
  freezesUsed: number,
): StreakResult {
  const next = {
    ...state,
    lastQualifiedDate: today,
    longestStreak: Math.max(state.longestStreak, state.currentStreak),
  };
  return { state: next, outcome, freezesUsed, extended: true };
}

export type StreakStatus = "done_today" | "at_risk" | "broken" | "none";

/**
 * What the student should see right now. A stored streak is still "alive" until the end of the
 * day after the last qualifying day; after that it displays as 0.
 */
export function displayStreak(
  state: Pick<StreakState, "currentStreak" | "lastQualifiedDate">,
  today: string,
): { count: number; status: StreakStatus } {
  if (!state.lastQualifiedDate || state.currentStreak === 0) return { count: 0, status: "none" };
  const gap = daysBetween(state.lastQualifiedDate, today);
  if (gap <= 0) return { count: state.currentStreak, status: "done_today" };
  if (gap === 1) return { count: state.currentStreak, status: "at_risk" };
  return { count: 0, status: "broken" };
}

/** Streak milestones that grant XP (once per streak run). */
export const STREAK_MILESTONES = [7, 30, 100] as const;

export function reachedMilestone(newStreak: number): number | null {
  return (STREAK_MILESTONES as readonly number[]).includes(newStreak) ? newStreak : null;
}
