/**
 * Badge criteria are data-driven: each badge row has a `criteria_type` + `threshold`, and each
 * criteria type has one evaluator here. Add a new type by adding an enum value + evaluator.
 */
export type BadgeCriteriaType =
  | "first_activity"
  | "streak_days"
  | "words_learned"
  | "words_mastered"
  | "comeback"
  | "synonyms_mastered"
  | "sessions_completed";

export type BadgeDefinition = {
  id: string;
  code: string;
  criteriaType: BadgeCriteriaType;
  threshold: number;
  enabled: boolean;
};

/** Snapshot of the student's stats used for evaluation (computed by the badge service). */
export type BadgeStats = {
  qualifiedDays: number;
  currentStreak: number;
  longestStreak: number;
  wordsLearned: number;
  wordsMastered: number;
  synonymCorrect: number;
  sessionsCompleted: number;
  /** Largest gap (days) before the most recent qualifying day; 0 if not applicable. */
  comebackGapDays: number;
};

/** Returns [current, target] so the UI can show "37 / 50". */
export function badgeProgress(def: BadgeDefinition, s: BadgeStats): [number, number] {
  const t = def.threshold;
  switch (def.criteriaType) {
    case "first_activity":
      return [Math.min(s.qualifiedDays, 1), 1];
    case "streak_days":
      return [Math.min(Math.max(s.currentStreak, s.longestStreak), t), t];
    case "words_learned":
      return [Math.min(s.wordsLearned, t), t];
    case "words_mastered":
      return [Math.min(s.wordsMastered, t), t];
    case "synonyms_mastered":
      return [Math.min(s.synonymCorrect, t), t];
    case "sessions_completed":
      return [Math.min(s.sessionsCompleted, t), t];
    case "comeback":
      return [s.comebackGapDays >= t ? 1 : 0, 1];
  }
}

export function isEarned(def: BadgeDefinition, s: BadgeStats): boolean {
  if (!def.enabled) return false;
  const [cur, target] = badgeProgress(def, s);
  return cur >= target;
}

/** Badges newly earned given already-earned ids. */
export function newlyEarned<T extends BadgeDefinition>(
  defs: T[],
  stats: BadgeStats,
  alreadyEarned: Set<string>,
): T[] {
  return defs.filter((d) => !alreadyEarned.has(d.id) && isEarned(d, stats));
}
