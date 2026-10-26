/**
 * Spaced repetition — a deliberately simple Leitner system so it is easy to explain to students
 * and teachers. Swap `defaultSrs` for another `SrsAlgorithm` (e.g. SM-2/FSRS) without touching
 * callers.
 */
export type MasteryState = "new" | "learning" | "familiar" | "mastered";

export type SrsProgress = {
  box: number; // 0 = never answered
  exposureCount: number;
  correctCount: number;
  incorrectCount: number;
  masteryScore: number; // 0..100
  state: MasteryState;
  lastSeenAt: Date | null;
  nextReviewAt: Date | null;
};

export interface SrsAlgorithm {
  review(prev: SrsProgress, correct: boolean, now: Date): SrsProgress;
}

export const MAX_BOX = 5;
/** Days until the next review after landing in box N. */
export const BOX_INTERVAL_DAYS = [0, 1, 2, 4, 8, 16] as const;
const DAY_MS = 86_400_000;

export const MASTERY_LABELS: Record<MasteryState, string> = {
  new: "جديدة",
  learning: "قيد التعلم",
  familiar: "مألوفة",
  mastered: "متقنة",
};

export function emptyProgress(): SrsProgress {
  return {
    box: 0,
    exposureCount: 0,
    correctCount: 0,
    incorrectCount: 0,
    masteryScore: 0,
    state: "new",
    lastSeenAt: null,
    nextReviewAt: null,
  };
}

export function stateFor(box: number, correctCount: number): MasteryState {
  if (box <= 0) return "new";
  if (box >= MAX_BOX && correctCount >= 4) return "mastered";
  if (box >= 3) return "familiar";
  return "learning";
}

export const leitnerSrs: SrsAlgorithm = {
  review(prev, correct, now) {
    const box = correct ? Math.min(prev.box + 1, MAX_BOX) : 1;
    const correctCount = prev.correctCount + (correct ? 1 : 0);
    const incorrectCount = prev.incorrectCount + (correct ? 0 : 1);
    const masteryScore = clamp(prev.masteryScore + (correct ? 20 : -15), 0, 100);
    // Wrong answers come back on the next day; correct ones wait longer per box.
    const days = correct ? BOX_INTERVAL_DAYS[box] : 1;
    return {
      box,
      exposureCount: prev.exposureCount + 1,
      correctCount,
      incorrectCount,
      masteryScore,
      state: stateFor(box, correctCount),
      lastSeenAt: now,
      nextReviewAt: new Date(now.getTime() + days * DAY_MS),
    };
  },
};

export const defaultSrs: SrsAlgorithm = leitnerSrs;

export function isDue(p: Pick<SrsProgress, "nextReviewAt">, now: Date): boolean {
  return p.nextReviewAt !== null && p.nextReviewAt.getTime() <= now.getTime();
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
