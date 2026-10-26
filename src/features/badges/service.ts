import "server-only";
import { and, asc, count, desc, eq, gte, sql, sum } from "drizzle-orm";
import { getDb, type DbOrTx, type Tx } from "@/db/client";
import {
  badges,
  practiceSessions,
  studentBadges,
  studentDailyActivity,
  studentProfiles,
  studentWordProgress,
} from "@/db/schema";
import type { RewardCollector } from "@/features/gamification/rewards";
import { daysBetween } from "@/lib/time";
import { badgeProgress, newlyEarned, type BadgeStats } from "./criteria";

export async function getBadgeStats(db: DbOrTx, userId: string): Promise<BadgeStats> {
  const [profile] = await db
    .select({
      currentStreak: studentProfiles.currentStreak,
      longestStreak: studentProfiles.longestStreak,
    })
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, userId));
  const lastTwo = await db
    .select({ day: studentDailyActivity.day })
    .from(studentDailyActivity)
    .where(and(eq(studentDailyActivity.userId, userId), eq(studentDailyActivity.qualified, true)))
    .orderBy(desc(studentDailyActivity.day))
    .limit(2);
  const [{ qualifiedDays }] = await db
    .select({ qualifiedDays: count() })
    .from(studentDailyActivity)
    .where(and(eq(studentDailyActivity.userId, userId), eq(studentDailyActivity.qualified, true)));
  const [words] = await db
    .select({
      learned: sql<number>`count(*) filter (where ${studentWordProgress.correctCount} > 0)::int`,
      mastered: sql<number>`count(*) filter (where ${studentWordProgress.state} = 'mastered')::int`,
      synonymCorrect: sql<number>`coalesce(${sum(studentWordProgress.synonymCorrectCount)}, 0)::int`,
    })
    .from(studentWordProgress)
    .where(eq(studentWordProgress.userId, userId));
  const [{ sessions }] = await db
    .select({ sessions: count() })
    .from(practiceSessions)
    .where(and(eq(practiceSessions.userId, userId), eq(practiceSessions.status, "completed")));

  return {
    qualifiedDays,
    currentStreak: profile?.currentStreak ?? 0,
    longestStreak: profile?.longestStreak ?? 0,
    wordsLearned: words?.learned ?? 0,
    wordsMastered: words?.mastered ?? 0,
    synonymCorrect: words?.synonymCorrect ?? 0,
    sessionsCompleted: sessions,
    comebackGapDays: lastTwo.length === 2 ? daysBetween(lastTwo[1].day, lastTwo[0].day) : 0,
  };
}

/** Evaluate all enabled badges and award new ones (idempotent via PK). */
export async function evaluateBadges(tx: Tx, userId: string, rewards: RewardCollector) {
  const defs = await tx.select().from(badges).where(eq(badges.enabled, true));
  const earned = await tx
    .select({ badgeId: studentBadges.badgeId })
    .from(studentBadges)
    .where(eq(studentBadges.userId, userId));
  const stats = await getBadgeStats(tx, userId);
  for (const def of newlyEarned(defs, stats, new Set(earned.map((e) => e.badgeId)))) {
    const inserted = await tx
      .insert(studentBadges)
      .values({ userId, badgeId: def.id })
      .onConflictDoNothing()
      .returning({ badgeId: studentBadges.badgeId });
    if (inserted.length) {
      rewards.badges.push({
        code: def.code,
        name: def.name,
        icon: def.icon,
        description: def.description,
      });
    }
  }
}

export type BadgeView = {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: Date | null;
  progress: [number, number];
};

export async function listBadgesForStudent(userId: string): Promise<BadgeView[]> {
  const db = getDb();
  const defs = await db
    .select()
    .from(badges)
    .where(eq(badges.enabled, true))
    .orderBy(asc(badges.sortOrder));
  const earned = await db.select().from(studentBadges).where(eq(studentBadges.userId, userId));
  const earnedMap = new Map(earned.map((e) => [e.badgeId, e.earnedAt]));
  const stats = await getBadgeStats(db, userId);
  return defs.map((d) => ({
    id: d.id,
    code: d.code,
    name: d.name,
    description: d.description,
    icon: d.icon,
    earnedAt: earnedMap.get(d.id) ?? null,
    progress: earnedMap.has(d.id) ? [d.threshold, d.threshold] : badgeProgress(d, stats),
  }));
}

export async function latestBadge(userId: string) {
  const [row] = await getDb()
    .select({
      name: badges.name,
      icon: badges.icon,
      description: badges.description,
      earnedAt: studentBadges.earnedAt,
    })
    .from(studentBadges)
    .innerJoin(badges, eq(badges.id, studentBadges.badgeId))
    .where(
      and(
        eq(studentBadges.userId, userId),
        gte(studentBadges.earnedAt, new Date(Date.now() - 14 * 86_400_000)),
      ),
    )
    .orderBy(desc(studentBadges.earnedAt))
    .limit(1);
  return row ?? null;
}
