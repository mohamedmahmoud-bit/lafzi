import { describe, expect, it } from "vitest";
import {
  BOX_INTERVAL_DAYS,
  emptyProgress,
  isDue,
  leitnerSrs,
  stateFor,
} from "@/features/vocabulary/srs";

const now = new Date("2026-10-25T10:00:00Z");
const DAY = 86_400_000;

describe("Leitner SRS", () => {
  it("moves a new word to box 1 on a correct answer, due tomorrow", () => {
    const p = leitnerSrs.review(emptyProgress(), true, now);
    expect(p).toMatchObject({ box: 1, correctCount: 1, exposureCount: 1, state: "learning" });
    expect(p.nextReviewAt!.getTime() - now.getTime()).toBe(BOX_INTERVAL_DAYS[1] * DAY);
  });

  it("spaces consecutive correct answers further apart", () => {
    let p = emptyProgress();
    const gaps: number[] = [];
    for (let i = 0; i < 5; i++) {
      p = leitnerSrs.review(p, true, now);
      gaps.push(p.nextReviewAt!.getTime() - now.getTime());
    }
    expect(gaps).toEqual([...gaps].sort((a, b) => a - b));
    expect(p.box).toBe(5);
    expect(p.state).toBe("mastered");
  });

  it("brings wrong answers back sooner and lowers mastery", () => {
    let p = emptyProgress();
    for (let i = 0; i < 4; i++) p = leitnerSrs.review(p, true, now);
    const wrong = leitnerSrs.review(p, false, now);
    expect(wrong.box).toBe(1);
    expect(wrong.masteryScore).toBe(p.masteryScore - 15);
    expect(wrong.nextReviewAt!.getTime() - now.getTime()).toBeLessThan(
      p.nextReviewAt!.getTime() - now.getTime(),
    );
    expect(wrong.state).toBe("learning");
  });

  it("clamps mastery score to 0..100", () => {
    let p = emptyProgress();
    p = leitnerSrs.review(p, false, now);
    expect(p.masteryScore).toBe(0);
    for (let i = 0; i < 10; i++) p = leitnerSrs.review(p, true, now);
    expect(p.masteryScore).toBe(100);
  });

  it("maps boxes to Arabic-labelled states", () => {
    expect(stateFor(0, 0)).toBe("new");
    expect(stateFor(2, 2)).toBe("learning");
    expect(stateFor(4, 4)).toBe("familiar");
    expect(stateFor(5, 3)).toBe("familiar"); // box 5 needs ≥4 correct to count as mastered
    expect(stateFor(5, 4)).toBe("mastered");
  });

  it("reports due words", () => {
    expect(isDue({ nextReviewAt: new Date(now.getTime() - 1) }, now)).toBe(true);
    expect(isDue({ nextReviewAt: null }, now)).toBe(false);
  });
});
