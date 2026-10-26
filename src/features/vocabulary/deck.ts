import type { QuestionType } from "@/db/schema";

export type DeckKind = "daily" | "review";

export type DeckSlot = {
  wordId: string;
  role: "new" | "review" | "challenge";
  types: QuestionType[];
};

export const DECK_LIMITS = {
  daily: { newWords: 5, reviews: 3, total: 8 },
  review: { newWords: 0, reviews: 8, total: 8 },
} as const;

const TYPES_FOR_ROLE: Record<DeckSlot["role"], QuestionType[]> = {
  // First encounter: build meaning (with context for derivation).
  new: ["context", "meaning"],
  // Retrieval with discrimination.
  review: ["synonym", "antonym", "reverse"],
  // Qudurat-style transfer.
  challenge: ["analogy", "antonym"],
};

/**
 * Plan a short deck. Inputs are already ordered by priority:
 * - due: words whose nextReviewAt has passed (weakest first)
 * - fresh: words the student has never seen
 * - known: other seen words (weakest first), used to fill gaps
 * Pure — the caller turns slots into questions.
 */
export function planDeck(
  input: { due: string[]; fresh: string[]; known: string[] },
  kind: DeckKind,
  rotate = 0,
): DeckSlot[] {
  const limits = DECK_LIMITS[kind];
  const used = new Set<string>();
  const take = (src: string[], n: number) => {
    const out: string[] = [];
    for (const id of src) {
      if (out.length >= n) break;
      if (used.has(id)) continue;
      used.add(id);
      out.push(id);
    }
    return out;
  };

  const reviews = take(input.due, limits.reviews);
  // Daily decks top up missing reviews with new words; review decks never introduce new words.
  const shortfall = kind === "daily" ? limits.reviews - reviews.length : 0;
  const news = take(input.fresh, limits.newWords + shortfall);
  const fill = take(input.known, limits.total - reviews.length - news.length);
  const reviewIds = [...reviews, ...fill];

  // Interleave: new, new, review, new, review, …
  const slots: DeckSlot[] = [];
  let n = 0;
  let r = 0;
  while (n < news.length || r < reviewIds.length) {
    if (n < news.length) slots.push(mk(news[n++], "new"));
    if (n < news.length && slots.length % 3 === 1) slots.push(mk(news[n++], "new"));
    if (r < reviewIds.length) slots.push(mk(reviewIds[r++], "review"));
  }

  // One challenge item on a word the student has already met (or any word as a fallback).
  const challengeWord = reviewIds[0] ?? news[0];
  if (challengeWord) slots.push(mk(challengeWord, "challenge"));

  return slots.map((s, i) => ({ ...s, types: rotateArr(s.types, rotate + i) }));
}

function mk(wordId: string, role: DeckSlot["role"]): DeckSlot {
  return { wordId, role, types: TYPES_FOR_ROLE[role] };
}

function rotateArr<T>(arr: T[], k: number): T[] {
  if (arr.length < 2) return arr;
  const s = k % arr.length;
  return [...arr.slice(s), ...arr.slice(0, s)];
}
