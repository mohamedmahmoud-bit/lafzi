import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { gameSessions, studentDailyActivity, studentProfiles, studentVocabularyProgress, studentVocabularyWordOfDay } from "@/db/schema";
import type { CurrentUser } from "@/features/auth/dal";
import { latestBadge } from "@/features/badges/service";
import { getTaxonomy } from "@/features/curriculum/service";
import { PLAY_GAMES } from "@/features/games/modes";
import { isPlayable } from "@/features/games/session.service";
import { getLevels, getXpRule } from "@/features/gamification/xp.service";
import { levelFor } from "@/features/gamification/levels";
import { getFriendsBoard } from "@/features/leaderboard/service";
import { loadLexicon } from "@/features/lexicon/content";
import { MISSION_MINUTES, missionProgress } from "@/features/missions/config";
import { listFriends, myChallenges } from "@/features/social/service";
import { MIN_DAILY_INTERACTIONS } from "@/features/streaks/daily-rule";
import { displayStreak } from "@/features/streaks/streak";
import { ensureVocabWod } from "@/features/word-bank/wod.service";
import { isProduction } from "@/lib/env";
import { learningDay } from "@/lib/time";

export async function getDashboard(user: CurrentUser) {
  const db = getDb();
  const today = learningDay();
  const [profile] = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, user.id));
  const [activity] = await db.select().from(studentDailyActivity).where(and(eq(studentDailyActivity.userId, user.id), eq(studentDailyActivity.day, today)));
  const lx = await loadLexicon(db, { isProduction: isProduction() });
  const wodEntryId = await ensureVocabWod(today, db, lx);
  const [wodStatus] = await db
    .select({ attemptedAt: studentVocabularyWordOfDay.attemptedAt })
    .from(studentVocabularyWordOfDay)
    .where(and(eq(studentVocabularyWordOfDay.userId, user.id), eq(studentVocabularyWordOfDay.day, today)));
  const [openDaily] = await db
    .select({ id: gameSessions.id })
    .from(gameSessions)
    .where(and(eq(gameSessions.userId, user.id), eq(gameSessions.day, today), eq(gameSessions.kind, "daily"), eq(gameSessions.status, "in_progress")))
    .limit(1);

  const tax = await getTaxonomy();
  const [[levels, dailyXp], badge, friends, challenges, mastery] = await Promise.all([
    db.transaction(async (tx) => [await getLevels(tx), (await getXpRule(tx, "daily_challenge")).xp + (await getXpRule(tx, "game_completed")).xp] as const),
    latestBadge(user.id),
    listFriends(user.id),
    myChallenges(user.id, 3),
    db
      .select({ state: studentVocabularyProgress.state, n: sql<number>`count(*)::int` })
      .from(studentVocabularyProgress)
      .where(eq(studentVocabularyProgress.userId, user.id))
      .groupBy(studentVocabularyProgress.state),
  ]);
  const board = await getFriendsBoard(user.id, friends.map((f) => f.userId));
  const dailyPlayable = await isPlayable("daily_challenge");
  const games = await Promise.all(PLAY_GAMES.map(async (g) => ({ id: g.id, nameAr: g.nameAr, icon: g.icon, tagline: g.tagline, playable: await isPlayable(g.id) })));
  const categories = tax.subskillsOf("vocabulary").map((c) => ({ id: c.id, nameAr: c.nameAr, words: [...lx.entries.values()].filter((e) => e.categories.includes(c.id)).length })).filter((c) => c.words > 0);
  const byState = Object.fromEntries(mastery.map((m) => [m.state, m.n])) as Record<string, number>;

  const mission = missionProgress({ wordOfDayCompleted: activity?.wordOfDayCompleted ?? false, dailySessionCompleted: activity?.dailyChallengeCompleted ?? false });
  const level = levelFor(profile.xpTotal, levels);
  return {
    today,
    name: profile.officialFullName ?? profile.displayName,
    avatar: profile.avatar,
    xpTotal: profile.xpTotal,
    xpToday: activity?.xpEarned ?? 0,
    level,
    streak: displayStreak(profile, today),
    longestStreak: profile.longestStreak,
    interactions: { done: activity?.wordInteractions ?? 0, needed: MIN_DAILY_INTERACTIONS },
    mission: { ...mission, minutes: MISSION_MINUTES },
    daily: { done: activity?.dailyChallengeCompleted ?? false, open: openDaily?.id ?? null, playable: dailyPlayable, xp: dailyXp },
    wod: { word: wodEntryId ? lx.entries.get(wodEntryId)?.lemma ?? null : null, done: !!wodStatus?.attemptedAt },
    games,
    categories,
    friends: friends.slice(0, 6),
    friendCount: friends.length,
    challenges,
    board: board.slice(0, 5),
    myRank: board.find((r) => r.isMe)?.rank ?? null,
    badge,
    collection: { learned: profile.totalWordsLearned, mastered: profile.masteredWords, learning: (byState.learning ?? 0) + (byState.familiar ?? 0), total: lx.entries.size },
  };
}
export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
