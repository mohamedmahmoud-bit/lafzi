export type Level = { level: number; name: string; minXp: number };

/** Default thresholds (seeded into `levels`; admins can edit them). */
export const DEFAULT_LEVELS: Level[] = [
  { level: 1, name: "مبتدئ", minXp: 0 },
  { level: 2, name: "مستكشف الكلمات", minXp: 100 },
  { level: 3, name: "صياد المعاني", minXp: 300 },
  { level: 4, name: "خبير المفردات", minXp: 700 },
  { level: 5, name: "محترف اللفظي", minXp: 1500 },
  { level: 6, name: "سيد الكلمات", minXp: 3000 },
];

export type LevelProgress = {
  current: Level;
  next: Level | null;
  xpIntoLevel: number;
  xpForNext: number | null;
  /** 0..1 */
  progress: number;
};

export function levelFor(xp: number, table: Level[] = DEFAULT_LEVELS): LevelProgress {
  const sorted = [...table].sort((a, b) => a.minXp - b.minXp);
  let idx = 0;
  for (let i = 0; i < sorted.length; i++) if (xp >= sorted[i].minXp) idx = i;
  const current = sorted[idx];
  const next = sorted[idx + 1] ?? null;
  const xpIntoLevel = xp - current.minXp;
  const span = next ? next.minXp - current.minXp : null;
  return {
    current,
    next,
    xpIntoLevel,
    xpForNext: next ? next.minXp - xp : null,
    progress: span ? Math.min(1, xpIntoLevel / span) : 1,
  };
}
