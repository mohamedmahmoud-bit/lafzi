import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { gameTypes, studentDailyActivity, studentProfiles, studentVocabularyWordOfDay, vocabularyEntries } from "@/db/schema";
import type { CurrentUser } from "@/features/auth/dal";
import { latestBadge } from "@/features/badges/service";
import { getTopicChallenge } from "@/features/competitions/service";
import { getTaxonomy } from "@/features/curriculum/service";
import { MIN_ROUNDS } from "@/features/games/engine";
import { GAMES } from "@/features/games/modes";
import { availableRounds } from "@/features/games/session.service";
import { getLevels, getXpRule } from "@/features/gamification/xp.service";
import type { XpAction } from "@/features/gamification/xp-rules";
import { levelFor } from "@/features/gamification/levels";
import { getWeeklyLeaderboard } from "@/features/leaderboard/service";
import { MISSION_MINUTES, missionProgress } from "@/features/missions/config";
import { practiceHref } from "@/features/noon-practice/service";
import { getLocalSkills } from "@/features/progress/skills";
import { displayStreak } from "@/features/streaks/streak";
import { recommendedForStudent } from "@/features/study/service";
import { ensureVocabWod } from "@/features/word-bank/wod.service";
import { learningDay } from "@/lib/time";

export async function getDashboard(user: CurrentUser) {
  const db = getDb();
  const today = learningDay();
  const [profile] = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, user.id));
  const [activity] = await db
    .select()
    .from(studentDailyActivity)
    .where(and(eq(studentDailyActivity.userId, user.id), eq(studentDailyActivity.day, today)));

  const wodEntryId = await ensureVocabWod(today);
  const [wodWord] = wodEntryId ? await db.select({ lemma: vocabularyEntries.lemma }).from(vocabularyEntries).where(eq(vocabularyEntries.id, wodEntryId)) : [];
  const [wodStatus] = await db
    .select({ attemptedAt: studentVocabularyWordOfDay.attemptedAt })
    .from(studentVocabularyWordOfDay)
    .where(and(eq(studentVocabularyWordOfDay.userId, user.id), eq(studentVocabularyWordOfDay.day, today)));

  const missionActions: XpAction[] = ["wod_opened", "wod_answered", "wod_correct", "game_completed", "mission_completed"];
  const tax = await getTaxonomy();
  const status = new Map((await db.select().from(gameTypes)).map((g) => [g.id, g.status]));
  const [[levels, missionXp], badge, leaderboard, local, study] = await Promise.all([
    db.transaction(async (tx) => {
      const rules = [];
      for (const a of missionActions) rules.push(await getXpRule(tx, a));
      return [await getLevels(tx), rules.reduce((s, r) => s + (r.enabled ? r.xp : 0), 0)] as const;
    }),
    latestBadge(user.id),
    getWeeklyLeaderboard(user),
    getLocalSkills(user.id),
    recommendedForStudent(user.id, 2),
  ]);

  const games = [];
  for (const g of GAMES) {
    const live = (status.get(g.id) ?? g.status) === "live";
    const available = live ? await availableRounds(g.id) : 0;
    const playable = live && available >= (g.source === "vocabulary" ? 2 : MIN_ROUNDS);
    games.push({ id: g.id, letter: g.letter, nameAr: g.nameAr, topicId: g.topicId, topicName: tax.topic(g.topicId)?.nameAr ?? "", live, playable, mastery: local.byTopic[g.topicId]?.mastery ?? null });
  }
  // Recommend the playable game on the student's weakest (or least practised) topic.
  const recommended =
    games.find((g) => g.playable && local.weak && g.topicId === local.weak.topicId) ??
    [...games].filter((g) => g.playable).sort((a, b) => (a.mastery ?? -1) - (b.mastery ?? -1))[0] ??
    null;
  const challenge = recommended ? await getTopicChallenge(user, recommended.topicId) : null;

  const mission = missionProgress({
    wordOfDayCompleted: activity?.wordOfDayCompleted ?? false,
    dailySessionCompleted: (activity?.sessionsCompleted ?? 0) > 0 || (activity?.gamesCompleted ?? 0) > 0,
  });

  return {
    today,
    profile: { displayName: profile.displayName, avatar: profile.avatar, xpTotal: profile.xpTotal, wordsLearned: profile.totalWordsLearned, masteredWords: profile.masteredWords },
    level: levelFor(profile.xpTotal, levels),
    streak: displayStreak(profile, today),
    longestStreak: profile.longestStreak,
    xpToday: activity?.xpEarned ?? 0,
    mission: { ...mission, minutes: MISSION_MINUTES, missionXp },
    wod: { word: wodWord?.lemma ?? null, completed: !!wodStatus?.attemptedAt },
    games,
    recommended,
    challenge: challenge && recommended ? { ...challenge, gameName: recommended.nameAr, topicName: recommended.topicName } : null,
    weak: local.weak,
    noonHref: practiceHref("dashboard_focus", { topicId: local.weak?.topicId ?? recommended?.topicId, subskillId: local.weak?.subskillId }),
    study,
    badge,
    leaderboard: { rank: leaderboard.me?.rank ?? null, size: leaderboard.rows.length, weekXp: leaderboard.me?.xp ?? 0, xpToNext: leaderboard.xpToNext },
  };
}
export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
