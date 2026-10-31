import { describe, expect, it } from "vitest";
import { completionMultiplier, eliminationHint, MIN_HUMAN_MS, MIN_ROUNDS, pickRounds, scoreRound, targetDifficulty, updateMastery } from "@/features/games/engine";
import { GAMES, nativeModesForTopic } from "@/features/games/modes";
import { seededRandom } from "@/lib/utils";

describe("scoring", () => {
  const base = { correct: true, difficulty: 3, hintUsed: false, timed: false, timeMs: 5000, combo: 0 };
  it("wrong answers score nothing; harder questions score more", () => {
    expect(scoreRound({ ...base, correct: false })).toBe(0);
    expect(scoreRound({ ...base, difficulty: 5 })).toBeGreaterThan(scoreRound({ ...base, difficulty: 1 }));
  });
  it("hints halve the points; combos add a capped bonus", () => {
    expect(scoreRound({ ...base, hintUsed: true })).toBe(Math.floor(scoreRound(base) / 2));
    expect(scoreRound({ ...base, combo: 10 })).toBe(scoreRound({ ...base, combo: 4 }));
  });
  it("speed bonus only in timed mode and never for inhumanly fast answers", () => {
    expect(scoreRound({ ...base, timed: true, timeMs: 3000 })).toBeGreaterThan(scoreRound(base));
    expect(scoreRound({ ...base, timed: true, timeMs: MIN_HUMAN_MS - 1 })).toBe(scoreRound(base));
  });
});

describe("difficulty + selection", () => {
  it("maps mastery to Noon's 1–5 band", () => {
    expect(targetDifficulty(0)).toBe(1);
    expect(targetDifficulty(1)).toBe(5);
  });
  it("weakest subskill first, no repeats, spread across skills", () => {
    const pool = [
      ...Array.from({ length: 5 }, (_, i) => ({ questionId: `a${i}`, subskillId: "strong", difficulty: 3 })),
      ...Array.from({ length: 5 }, (_, i) => ({ questionId: `b${i}`, subskillId: "weak", difficulty: i + 1 })),
    ];
    const out = pickRounds(pool, { n: 6, mastery: { strong: 0.9, weak: 0.1 }, rand: seededRandom(1) });
    expect(out[0].subskillId).toBe("weak");
    expect(out[0].difficulty).toBe(1); // near the weak skill's target
    expect(new Set(out.map((q) => q.questionId)).size).toBe(6);
    expect(out.filter((q) => q.subskillId === "strong").length).toBeGreaterThan(0);
  });
});

describe("hints", () => {
  it("removes exactly one wrong option, never the answer", () => {
    for (let seed = 0; seed < 10; seed++) {
      const h = eliminationHint(["1", "2", "3", "4"], "2", seed);
      expect(h).not.toBe("2");
      expect(["1", "3", "4"]).toContain(h);
    }
    expect(eliminationHint(["1", "2"], "1", 0)).toBeNull();
  });
});

describe("mastery", () => {
  it("needs evidence before claiming mastery and weights recent answers", () => {
    expect(updateMastery({ attempts: 0, correct: 0, recent: [] }, [true]).mastery).toBeLessThan(0.3);
    const improving = updateMastery({ attempts: 0, correct: 0, recent: [] }, [false, false, false, true, true, true]);
    const declining = updateMastery({ attempts: 0, correct: 0, recent: [] }, [true, true, true, false, false, false]);
    expect(improving.mastery).toBeGreaterThan(declining.mastery);
    expect(updateMastery({ attempts: 0, correct: 0, recent: [] }, Array(24).fill(true)).level).toBe(5);
  });
  it("completion XP rewards accuracy, not volume; short games earn nothing", () => {
    expect(completionMultiplier(8, 8)).toBe(1.5);
    expect(completionMultiplier(0, 8)).toBe(0.5);
    expect(completionMultiplier(MIN_ROUNDS - 1, MIN_ROUNDS - 1)).toBe(0);
  });
});

describe("registry", () => {
  it("has the five vocabulary games on the play shelf; question-bank games map to their topic natively", () => {
    expect(GAMES.filter((g) => g.section === "play").map((g) => g.id)).toEqual(["meaning_hunter", "match_pairs", "word_race", "odd_one_out", "memory"]);
    expect(nativeModesForTopic("verbal_analogy")).toEqual(["relations_hunter"]);
    expect(nativeModesForTopic("vocabulary")).toEqual([]);
  });
});
