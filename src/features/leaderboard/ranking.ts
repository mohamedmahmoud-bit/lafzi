export type LeaderboardRow = {
  userId: string;
  displayName: string;
  avatar: string;
  xp: number;
};

export type RankedRow = LeaderboardRow & { rank: number };

/**
 * Standard competition ranking ("1224"): ties share a rank. Ties are ordered by name for stable
 * display. Students with 0 XP this week are still listed so newcomers see where they stand.
 */
export function rankRows(rows: LeaderboardRow[]): RankedRow[] {
  const sorted = [...rows].sort(
    (a, b) => b.xp - a.xp || a.displayName.localeCompare(b.displayName, "ar"),
  );
  let lastXp: number | null = null;
  let lastRank = 0;
  return sorted.map((r, i) => {
    const rank = r.xp === lastXp ? lastRank : i + 1;
    lastXp = r.xp;
    lastRank = rank;
    return { ...r, rank };
  });
}

/**
 * Show the top N plus a window around the current student so a student ranked 40th still sees
 * the people just above them (a reachable goal) instead of only the unreachable top.
 */
export function visibleWindow(ranked: RankedRow[], userId: string, top = 10, around = 2) {
  const me = ranked.findIndex((r) => r.userId === userId);
  const head = ranked.slice(0, top);
  if (me < top) return { head, tail: [] as RankedRow[], me: ranked[me] ?? null };
  const tail = ranked.slice(Math.max(top, me - around), me + around + 1);
  return { head, tail, me: ranked[me] };
}

/** XP needed to overtake the student directly above. */
export function xpToNextRank(ranked: RankedRow[], userId: string): number | null {
  const me = ranked.find((r) => r.userId === userId);
  if (!me) return null;
  const above = ranked.filter((r) => r.xp > me.xp).at(-1);
  return above ? above.xp - me.xp + 1 : null;
}
