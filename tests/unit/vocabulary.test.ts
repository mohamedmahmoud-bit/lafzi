import { describe, expect, it } from "vitest";
import { planDeck } from "@/features/vocabulary/deck";
import {
  blankOut,
  buildQuestion,
  toClientQuestion,
  type QuizWord,
} from "@/features/vocabulary/questions";
import { seededRandom } from "@/lib/utils";

const w = (id: string, word: string, syn: string[], ant: string[] = []): QuizWord => ({
  id,
  word,
  meaning: `معنى ${word}`,
  example: `جملة فيها ${word} واضحة.`,
  synonyms: syn,
  antonyms: ant,
  difficulty: 2,
});
const pool = [
  w("1", "جسور", ["شجاع", "مقدام"], ["جبان"]),
  w("2", "سخي", ["كريم"], ["بخيل"]),
  w("3", "فطن", ["ذكي"], ["غبي"]),
  w("4", "شاسع", ["واسع"], ["ضيق"]),
  w("5", "وجل", ["خائف"], ["آمن"]),
];

describe("question generation", () => {
  const types = ["meaning", "synonym", "reverse", "antonym", "context", "analogy"] as const;
  it.each(types)("%s questions have 4 unique options with exactly one correct", (type) => {
    const q = buildQuestion(type, pool[0], pool, seededRandom(7))!;
    expect(q).not.toBeNull();
    expect(q.options).toHaveLength(4);
    expect(new Set(q.options.map((o) => o.text)).size).toBe(4);
    expect(q.options.filter((o) => o.id === q.correctOptionId)).toHaveLength(1);
  });
  it("antonym questions include a synonym trap but never mark it correct", () => {
    const q = buildQuestion("antonym", pool[0], pool, seededRandom(1))!;
    const correct = q.options.find((o) => o.id === q.correctOptionId)!.text;
    expect(correct).toBe("جبان");
    expect(q.options.some((o) => ["شجاع", "مقدام"].includes(o.text))).toBe(true);
  });
  it("never sends the answer key to the client", () => {
    const q = buildQuestion("synonym", pool[0], pool, seededRandom(3))!;
    expect(JSON.stringify(toClientQuestion(q))).not.toContain("correctOptionId");
    expect(toClientQuestion(q)).not.toHaveProperty("explanation");
  });
  it("blanks the word out of the example", () => {
    expect(blankOut("كان خالد جسور القلب", "جسور")).toBe("كان خالد ــــــــ القلب");
    expect(blankOut("لا يوجد", "جسور")).toBeNull();
  });
});

describe("deck planning", () => {
  it("builds a short daily deck: reviews + new words + one challenge", () => {
    const slots = planDeck(
      { due: ["d1", "d2", "d3", "d4"], fresh: ["n1", "n2", "n3", "n4", "n5", "n6"], known: [] },
      "daily",
    );
    expect(slots.filter((s) => s.role === "review")).toHaveLength(3);
    expect(slots.filter((s) => s.role === "new")).toHaveLength(5);
    expect(slots.filter((s) => s.role === "challenge")).toHaveLength(1);
    expect(slots.length).toBeLessThanOrEqual(9);
  });
  it("fills with new words when nothing is due, and never repeats a word in the main slots", () => {
    const slots = planDeck(
      { due: [], fresh: Array.from({ length: 10 }, (_, i) => `n${i}`), known: [] },
      "daily",
    );
    const main = slots.filter((s) => s.role !== "challenge").map((s) => s.wordId);
    expect(main).toHaveLength(8);
    expect(new Set(main).size).toBe(8);
  });
  it("review decks contain no new words", () => {
    const slots = planDeck({ due: ["a"], fresh: ["n1"], known: ["a", "b", "c"] }, "review");
    expect(slots.some((s) => s.role === "new")).toBe(false);
  });
});
