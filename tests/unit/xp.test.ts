import { describe, expect, it } from "vitest";
import { DEFAULT_LEVELS, levelFor } from "@/features/gamification/levels";
import {
  computeAward,
  DEFAULT_XP_RULES,
  milestoneMultiplier,
} from "@/features/gamification/xp-rules";

describe("computeAward", () => {
  it("grants the rule amount within the daily cap", () => {
    expect(computeAward(DEFAULT_XP_RULES.session_completed, 0)).toBe(20);
  });
  it("grants nothing once the daily cap is reached", () => {
    expect(computeAward(DEFAULT_XP_RULES.session_completed, 20)).toBe(0);
    expect(computeAward(DEFAULT_XP_RULES.review_correct, 30)).toBe(0);
  });
  it("trims to the remaining cap", () => {
    expect(computeAward({ xp: 10, dailyCap: 25, enabled: true }, 20)).toBe(5);
  });
  it("grants nothing for disabled rules or negative values", () => {
    expect(computeAward({ ...DEFAULT_XP_RULES.wod_opened, enabled: false }, 0)).toBe(0);
    expect(computeAward({ xp: -5, dailyCap: null, enabled: true }, 0)).toBe(0);
  });
  it("applies streak milestone multipliers", () => {
    expect(computeAward(DEFAULT_XP_RULES.streak_milestone, 0, milestoneMultiplier(30))).toBe(30);
    expect(milestoneMultiplier(100)).toBe(10);
  });
  it("mission rewards sum to the advertised daily total", () => {
    const r = DEFAULT_XP_RULES;
    expect(
      r.wod_opened.xp +
        r.wod_answered.xp +
        r.wod_correct.xp +
        r.session_completed.xp +
        r.mission_completed.xp,
    ).toBe(57);
  });
});

describe("levelFor", () => {
  it("maps XP to level and progress", () => {
    expect(levelFor(0).current.name).toBe("مبتدئ");
    const l = levelFor(255);
    expect(l.current.level).toBe(2);
    expect(l.xpForNext).toBe(45);
    expect(l.progress).toBeCloseTo(155 / 200);
    expect(levelFor(300).current.name).toBe("صياد المعاني");
  });
  it("caps at the top level", () => {
    const l = levelFor(99_999);
    expect(l.current.level).toBe(DEFAULT_LEVELS.length);
    expect(l.next).toBeNull();
    expect(l.progress).toBe(1);
  });
  it("works with an unsorted, admin-edited table", () => {
    expect(
      levelFor(50, [
        { level: 2, name: "b", minXp: 40 },
        { level: 1, name: "a", minXp: 0 },
      ]).current.name,
    ).toBe("b");
  });
});
