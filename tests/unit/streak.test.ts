import { describe, expect, it } from "vitest";
import {
  applyQualifiedActivity,
  displayStreak,
  reachedMilestone,
  type StreakState,
} from "@/features/streaks/streak";

const base: StreakState = {
  currentStreak: 0,
  longestStreak: 0,
  lastQualifiedDate: null,
  streakFreezes: 0,
};

describe("applyQualifiedActivity", () => {
  it("starts a streak on the first qualifying day", () => {
    const r = applyQualifiedActivity(base, "2026-10-25");
    expect(r.outcome).toBe("started");
    expect(r.state).toMatchObject({
      currentStreak: 1,
      longestStreak: 1,
      lastQualifiedDate: "2026-10-25",
    });
  });

  it("extends on the next learning day and tracks longest", () => {
    const r = applyQualifiedActivity(
      { ...base, currentStreak: 4, longestStreak: 4, lastQualifiedDate: "2026-10-24" },
      "2026-10-25",
    );
    expect(r.outcome).toBe("extended");
    expect(r.state.currentStreak).toBe(5);
    expect(r.state.longestStreak).toBe(5);
  });

  it("is idempotent within the same day (refreshing / repeating does nothing)", () => {
    const s = { ...base, currentStreak: 3, longestStreak: 3, lastQualifiedDate: "2026-10-25" };
    const r = applyQualifiedActivity(s, "2026-10-25");
    expect(r.outcome).toBe("same_day");
    expect(r.extended).toBe(false);
    expect(r.state).toEqual(s);
  });

  it("restarts after a missed day but keeps the longest streak", () => {
    const r = applyQualifiedActivity(
      { ...base, currentStreak: 9, longestStreak: 12, lastQualifiedDate: "2026-10-20" },
      "2026-10-25",
    );
    expect(r.outcome).toBe("restarted");
    expect(r.state.currentStreak).toBe(1);
    expect(r.state.longestStreak).toBe(12);
  });

  it("handles month and year boundaries", () => {
    expect(
      applyQualifiedActivity(
        { ...base, currentStreak: 2, lastQualifiedDate: "2026-12-31" },
        "2027-01-01",
      ).outcome,
    ).toBe("extended");
    expect(
      applyQualifiedActivity(
        { ...base, currentStreak: 2, lastQualifiedDate: "2028-02-28" },
        "2028-02-29",
      ).outcome,
    ).toBe("extended");
  });

  describe("streak freeze (feature-flagged)", () => {
    const s = {
      ...base,
      currentStreak: 6,
      longestStreak: 6,
      lastQualifiedDate: "2026-10-22",
      streakFreezes: 2,
    };
    it("is ignored when the flag is off", () => {
      expect(applyQualifiedActivity(s, "2026-10-25").outcome).toBe("restarted");
    });
    it("bridges missed days when enough freezes are available", () => {
      const r = applyQualifiedActivity(s, "2026-10-25", { freezeEnabled: true });
      expect(r.outcome).toBe("frozen_extended");
      expect(r.freezesUsed).toBe(2);
      expect(r.state).toMatchObject({ currentStreak: 7, streakFreezes: 0 });
    });
    it("restarts when freezes are insufficient", () => {
      const r = applyQualifiedActivity({ ...s, streakFreezes: 1 }, "2026-10-25", {
        freezeEnabled: true,
      });
      expect(r.outcome).toBe("restarted");
      expect(r.state.streakFreezes).toBe(1);
    });
  });
});

describe("displayStreak", () => {
  const s = { currentStreak: 4, lastQualifiedDate: "2026-10-24" };
  it("shows done_today, at_risk, broken", () => {
    expect(displayStreak({ ...s, lastQualifiedDate: "2026-10-25" }, "2026-10-25")).toEqual({
      count: 4,
      status: "done_today",
    });
    expect(displayStreak(s, "2026-10-25")).toEqual({ count: 4, status: "at_risk" });
    expect(displayStreak(s, "2026-10-26")).toEqual({ count: 0, status: "broken" });
    expect(displayStreak({ currentStreak: 0, lastQualifiedDate: null }, "2026-10-26")).toEqual({
      count: 0,
      status: "none",
    });
  });
});

it("detects milestones", () => {
  expect(reachedMilestone(7)).toBe(7);
  expect(reachedMilestone(8)).toBeNull();
  expect(reachedMilestone(30)).toBe(30);
});
