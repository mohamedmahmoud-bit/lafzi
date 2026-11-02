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

import { pickBestBoard } from "@/features/leaderboard/ranking";
describe("home page board: the one where the student ranks highest", () => {
  it("1st today and 10th overall → today; the reverse → overall", () => {
    expect(pickBestBoard([{ period: "all", rank: 10 }, { period: "week", rank: 4 }, { period: "day", rank: 1 }])).toBe("day");
    expect(pickBestBoard([{ period: "all", rank: 1 }, { period: "week", rank: 3 }, { period: "day", rank: 10 }])).toBe("all");
  });
  it("ties prefer overall, then the week; periods without points don't count", () => {
    expect(pickBestBoard([{ period: "all", rank: 2 }, { period: "week", rank: 2 }, { period: "day", rank: 2 }])).toBe("all");
    expect(pickBestBoard([{ period: "all", rank: 5 }, { period: "week", rank: 2 }, { period: "day", rank: 2 }])).toBe("week");
    expect(pickBestBoard([{ period: "all", rank: 7 }, { period: "week", rank: null }, { period: "day", rank: null }])).toBe("all");
    expect(pickBestBoard([{ period: "all", rank: null }, { period: "week", rank: null }, { period: "day", rank: null }])).toBe("all");
  });
});
