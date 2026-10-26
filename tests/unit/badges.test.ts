import { describe, expect, it } from "vitest";
import {
  badgeProgress,
  isEarned,
  newlyEarned,
  type BadgeDefinition,
  type BadgeStats,
} from "@/features/badges/criteria";

const stats: BadgeStats = {
  qualifiedDays: 5,
  currentStreak: 4,
  longestStreak: 6,
  wordsLearned: 37,
  wordsMastered: 4,
  synonymCorrect: 10,
  sessionsCompleted: 9,
  comebackGapDays: 1,
};
const def = (
  criteriaType: BadgeDefinition["criteriaType"],
  threshold: number,
  id: string = criteriaType,
): BadgeDefinition => ({ id, code: id, criteriaType, threshold, enabled: true });

describe("badge criteria", () => {
  it("shows progress like 37 / 50", () => {
    expect(badgeProgress(def("words_learned", 50), stats)).toEqual([37, 50]);
  });
  it("uses the longest streak so a broken streak keeps earned progress", () => {
    expect(isEarned(def("streak_days", 6), stats)).toBe(true);
    expect(isEarned(def("streak_days", 7), stats)).toBe(false);
  });
  it("comeback requires a gap of at least the threshold", () => {
    expect(isEarned(def("comeback", 3), stats)).toBe(false);
    expect(isEarned(def("comeback", 3), { ...stats, comebackGapDays: 4 })).toBe(true);
  });
  it("never awards disabled badges", () => {
    expect(isEarned({ ...def("first_activity", 1), enabled: false }, stats)).toBe(false);
  });
  it("returns only badges not already earned", () => {
    const defs = [
      def("first_activity", 1, "a"),
      def("sessions_completed", 10, "b"),
      def("sessions_completed", 5, "c"),
    ];
    expect(newlyEarned(defs, stats, new Set(["a"])).map((d) => d.id)).toEqual(["c"]);
    expect(
      newlyEarned(defs, { ...stats, sessionsCompleted: 10 }, new Set(["a", "c"])).map((d) => d.id),
    ).toEqual(["b"]);
  });
});
