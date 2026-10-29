/**
 * Pure game engine: scoring, difficulty targeting, round selection, hints and mastery.
 * No I/O — everything here is unit-tested and the server is the only caller.
 */

export const MIN_ROUNDS = 5;
export const MAX_ROUNDS = 8;
export const TIMED_ROUND_MS = 45_000;
/** Answers faster than this can't have been read — they score but never earn a speed bonus. */
export const MIN_HUMAN_MS = 1_500;

export type RoundScoreInput = {
  correct: boolean;
  difficulty: number | null;
  hintUsed: boolean;
  timed: boolean;
  timeMs: number | null;
  /** Consecutive correct answers immediately before this one. */
  combo: number;
};

export function scoreRound(i: RoundScoreInput): number {
  if (!i.correct) return 0;
  const d = Math.min(5, Math.max(1, i.difficulty ?? 2));
  let pts = 10 + (d - 1) * 3; // 10..22
  if (i.hintUsed) pts = Math.floor(pts / 2);
  if (i.timed && i.timeMs !== null && i.timeMs >= MIN_HUMAN_MS && i.timeMs < TIMED_ROUND_MS) {
    pts += Math.round(8 * (1 - i.timeMs / TIMED_ROUND_MS));
  }
  pts += Math.min(i.combo, 4) * 2;
  return pts;
}

/** Mastery 0..1 → the Noon difficulty band (1..5) we try to serve. */
export function targetDifficulty(mastery: number): number {
  return Math.min(5, Math.max(1, Math.round(1 + mastery * 4)));
}

export type Candidate = { questionId: string; subskillId: string | null; difficulty: number | null };

/**
 * Pick rounds: weakest subskills first, questions near the target difficulty, no repeats.
 * `rand` must be seeded by the caller for reproducibility in tests.
 */
export function pickRounds<T extends Candidate>(
  pool: T[],
  p: { n: number; mastery: Record<string, number>; rand: () => number },
): T[] {
  const bySkill = new Map<string, T[]>();
  for (const q of pool) {
    const k = q.subskillId ?? "_";
    bySkill.set(k, [...(bySkill.get(k) ?? []), q]);
  }
  const skills = [...bySkill.keys()].sort((a, b) => (p.mastery[a] ?? 0) - (p.mastery[b] ?? 0) || p.rand() - 0.5);
  for (const k of skills) {
    const target = targetDifficulty(p.mastery[k] ?? 0);
    bySkill.get(k)!.sort((a, b) => Math.abs((a.difficulty ?? 2) - target) - Math.abs((b.difficulty ?? 2) - target) || p.rand() - 0.5);
  }
  const out: T[] = [];
  // Round-robin across skills (weakest first) so one session covers several subskills.
  while (out.length < p.n) {
    let added = false;
    for (const k of skills) {
      const next = bySkill.get(k)!.shift();
      if (next) {
        out.push(next);
        added = true;
        if (out.length >= p.n) break;
      }
    }
    if (!added) break;
  }
  return out;
}

/** The faithful hint: remove one wrong option (same task, same answer). Deterministic per seed. */
export function eliminationHint(choiceIds: string[], correctId: string, seed: number): string | null {
  const wrong = choiceIds.filter((c) => c !== correctId);
  return wrong.length > 1 ? wrong[seed % wrong.length] : null;
}

export type MasteryState = { attempts: number; correct: number; recent: number[] };

/** Recency-weighted accuracy, shrunk toward 0 until there is enough evidence. */
export function updateMastery(prev: MasteryState, results: boolean[]) {
  const recent = [...prev.recent, ...results.map((r) => (r ? 1 : 0))].slice(-12);
  const attempts = prev.attempts + results.length;
  const correct = prev.correct + results.filter(Boolean).length;
  let wSum = 0;
  let acc = 0;
  recent.forEach((r, i) => {
    const w = 1 + i / recent.length; // newer answers weigh more
    wSum += w;
    acc += w * r;
  });
  const recentAcc = wSum ? acc / wSum : 0;
  const confidence = attempts / (attempts + 4);
  const mastery = Math.round(recentAcc * confidence * 1000) / 1000;
  return { attempts, correct, recent, mastery, level: masteryLevel(mastery) };
}

export function masteryLevel(m: number): number {
  return m >= 0.85 ? 5 : m >= 0.7 ? 4 : m >= 0.5 ? 3 : m >= 0.3 ? 2 : 1;
}

/** XP multiplier for finishing a game: rewards accuracy, never volume (daily cap applies on top). */
export function completionMultiplier(correct: number, total: number): number {
  if (total < MIN_ROUNDS) return 0;
  return 0.5 + correct / total;
}
