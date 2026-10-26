import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  studentDailyActivity,
  studentProfiles,
  studentWordOfDay,
  studentWordProgress,
  vocabularyWords,
} from "@/db/schema";
import type { CurrentUser } from "@/features/auth/dal";
import { latestBadge } from "@/features/badges/service";
import { ensureWordOfDay } from "@/features/daily-word/service";
import { getLevels, getXpRule } from "@/features/gamification/xp.service";
import type { XpAction } from "@/features/gamification/xp-rules";
import { levelFor } from "@/features/gamification/levels";
import { getWeeklyLeaderboard } from "@/features/leaderboard/service";
import { MISSION_MINUTES, missionProgress } from "@/features/missions/config";
import { getNoonFocus } from "@/features/noon-integration/service";
import { displayStreak } from "@/features/streaks/streak";
import type { MasteryState } from "@/features/vocabulary/srs";
import { learningDay } from "@/lib/time";

export async function getMasteryBreakdown(userId: string) {
  const db = getDb();
  const rows = await db
    .select({ state: studentWordProgress.state, n: sql<number>`count(*)::int` })
    .from(studentWordProgress)
    .where(eq(studentWordProgress.userId, userId))
    .groupBy(studentWordProgress.state);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(vocabularyWords)
    .where(eq(vocabularyWords.active, true));
  const counts: Record<MasteryState, number> = { new: 0, learning: 0, familiar: 0, mastered: 0 };
  for (const r of rows) counts[r.state] = r.n;
  const seen = counts.learning + counts.familiar + counts.mastered + counts.new;
  counts.new += Math.max(0, total - seen);
  return { counts, total };
}

export async function getDashboard(user: CurrentUser) {
  const db = getDb();
  const today = learningDay();
  const [profile] = await db
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, user.id));
  const [activity] = await db
    .select()
    .from(studentDailyActivity)
    .where(and(eq(studentDailyActivity.userId, user.id), eq(studentDailyActivity.day, today)));

  const wodWordId = await ensureWordOfDay(today);
  const [[wodWord], [wodStatus]] = await Promise.all([
    db
      .select({ word: vocabularyWords.word, meaning: vocabularyWords.meaning })
      .from(vocabularyWords)
      .where(eq(vocabularyWords.id, wodWordId)),
    db
      .select({
        guessed: studentWordOfDay.guessOptionId,
        attemptedAt: studentWordOfDay.attemptedAt,
      })
      .from(studentWordOfDay)
      .where(and(eq(studentWordOfDay.userId, user.id), eq(studentWordOfDay.day, today))),
  ]);

  const missionActions: XpAction[] = [
    "wod_opened",
    "wod_answered",
    "wod_correct",
    "session_completed",
    "mission_completed",
  ];
  const [[levels, missionXp], badge, leaderboard, noon, mastery] = await Promise.all([
    db.transaction(async (tx) => {
      const rules = [];
      for (const a of missionActions) rules.push(await getXpRule(tx, a));
      return [await getLevels(tx), rules.reduce((s, r) => s + (r.enabled ? r.xp : 0), 0)] as const;
    }),
    latestBadge(user.id),
    getWeeklyLeaderboard(user),
    getNoonFocus(user),
    getMasteryBreakdown(user.id),
  ]);

  const mission = missionProgress({
    wordOfDayCompleted: activity?.wordOfDayCompleted ?? false,
    dailySessionCompleted: (activity?.sessionsCompleted ?? 0) > 0,
  });

  return {
    today,
    profile: {
      displayName: profile.displayName,
      avatar: profile.avatar,
      xpTotal: profile.xpTotal,
      wordsLearned: profile.totalWordsLearned,
      masteredWords: profile.masteredWords,
    },
    level: levelFor(profile.xpTotal, levels),
    streak: displayStreak(profile, today),
    longestStreak: profile.longestStreak,
    xpToday: activity?.xpEarned ?? 0,
    mission: { ...mission, minutes: MISSION_MINUTES, missionXp },
    wod: {
      word: wodWord?.word ?? "",
      // Meaning is revealed only after the student has made a guess (active learning).
      meaning: wodStatus?.guessed ? wodWord?.meaning : null,
      guessed: !!wodStatus?.guessed,
      completed: !!wodStatus?.attemptedAt,
    },
    badge,
    leaderboard: {
      rank: leaderboard.me?.rank ?? null,
      size: leaderboard.rows.length,
      weekXp: leaderboard.me?.xp ?? 0,
      xpToNext: leaderboard.xpToNext,
    },
    noon,
    mastery,
  };
}
export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
