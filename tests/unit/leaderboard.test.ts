import { describe, expect, it } from "vitest";
import { rankRows, visibleWindow, xpToNextRank } from "@/features/leaderboard/ranking";

const row = (userId: string, xp: number) => ({ userId, displayName: userId, avatar: "owl", xp });

describe("weekly leaderboard ranking", () => {
  it("ranks by XP with shared ranks for ties", () => {
    const r = rankRows([row("c", 10), row("a", 50), row("b", 50), row("d", 0)]);
    expect(r.map((x) => [x.userId, x.rank])).toEqual([
      ["a", 1],
      ["b", 1],
      ["c", 3],
      ["d", 4],
    ]);
  });
  it("computes XP needed to pass the next student", () => {
    const r = rankRows([row("a", 50), row("b", 30), row("me", 25)]);
    expect(xpToNextRank(r, "me")).toBe(6);
    expect(xpToNextRank(r, "a")).toBeNull();
  });
  it("shows the top N plus the student's neighbourhood", () => {
    const r = rankRows(Array.from({ length: 30 }, (_, i) => row(`u${i}`, 300 - i * 10)));
    const w = visibleWindow(r, "u20", 10, 2);
    expect(w.head).toHaveLength(10);
    expect(w.tail.map((x) => x.userId)).toEqual(["u18", "u19", "u20", "u21", "u22"]);
    expect(visibleWindow(r, "u3").tail).toEqual([]);
  });
});
