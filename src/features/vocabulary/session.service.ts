import "server-only";
import { and, asc, eq, isNotNull, lte, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  practiceAnswers,
  practiceSessions,
  studentDailyActivity,
  studentWordOfDay,
  studentWordProgress,
  vocabularyWords,
  type StoredQuestion,
} from "@/db/schema";
import { analytics } from "@/features/analytics/analytics";
import { evaluateBadges } from "@/features/badges/service";
import { RewardCollector, type RewardSummary } from "@/features/gamification/rewards";
import { awardXp, ensureDailyActivity, lockProfile } from "@/features/gamification/xp.service";
import { checkMissionCompletion } from "@/features/missions/service";
import { recordQualifiedActivity } from "@/features/streaks/service";
import { learningDay } from "@/lib/time";
import { hashString, seededRandom } from "@/lib/utils";
import { planDeck, type DeckKind } from "./deck";
import { refreshWordCounters, recordWordAnswer } from "./progress.service";
import { buildFirstPossible, toClientQuestion, type ClientQuestion } from "./questions";
import { loadWords } from "./words.repo";

export class SessionError extends Error {
  constructor(
    public code: "not_found" | "not_in_progress" | "bad_item" | "incomplete" | "no_words",
  ) {
    super(code);
  }
}

/** Return today's in-progress session, or create a new one (daily first, then extra review). */
export async function startSession(userId: string): Promise<{ id: string; created: boolean }> {
  const db = getDb();
  const day = learningDay();
  const [open] = await db
    .select({ id: practiceSessions.id })
    .from(practiceSessions)
    .where(
      and(
        eq(practiceSessions.userId, userId),
        eq(practiceSessions.day, day),
        eq(practiceSessions.status, "in_progress"),
      ),
    )
    .limit(1);
  if (open) return { id: open.id, created: false };

  const [{ dailyDone }] = await db
    .select({ dailyDone: sql<number>`count(*)::int` })
    .from(practiceSessions)
    .where(
      and(
        eq(practiceSessions.userId, userId),
        eq(practiceSessions.day, day),
        eq(practiceSessions.kind, "daily"),
        eq(practiceSessions.status, "completed"),
      ),
    );
  const kind: DeckKind = dailyDone > 0 ? "review" : "daily";
  const now = new Date();

  const seen = await db
    .select({
      wordId: studentWordProgress.wordId,
      nextReviewAt: studentWordProgress.nextReviewAt,
      masteryScore: studentWordProgress.masteryScore,
    })
    .from(studentWordProgress)
    .where(eq(studentWordProgress.userId, userId))
    .orderBy(asc(studentWordProgress.masteryScore), asc(studentWordProgress.nextReviewAt));
  const due = seen.filter((s) => s.nextReviewAt && s.nextReviewAt <= now).map((s) => s.wordId);
  const known = seen.map((s) => s.wordId);
  const seenIds = seen.map((s) => s.wordId);

  const fresh = await db
    .select({ id: vocabularyWords.id })
    .from(vocabularyWords)
    .where(
      and(
        eq(vocabularyWords.active, true),
        seenIds.length ? notInArray(vocabularyWords.id, seenIds) : undefined,
      ),
    )
    .orderBy(asc(vocabularyWords.difficulty), sql`md5(${vocabularyWords.id}::text || ${userId})`)
    .limit(20);

  const seed = hashString(`${userId}:${day}:${kind}:${now.getTime()}`);
  const slots = planDeck({ due, fresh: fresh.map((f) => f.id), known }, kind, seed % 7);
  if (!slots.length) throw new SessionError("no_words");

  const pool = await loadWords(db);
  const byId = new Map(pool.map((w) => [w.id, w]));
  const rand = seededRandom(seed);
  const items = slots
    .map((s) => {
      const w = byId.get(s.wordId);
      return w ? buildFirstPossible(s.types, w, pool, rand) : null;
    })
    .filter((q): q is StoredQuestion => q !== null);
  if (!items.length) throw new SessionError("no_words");

  const [session] = await db
    .insert(practiceSessions)
    .values({ userId, day, kind, items, totalCount: items.length })
    .returning({ id: practiceSessions.id });
  await analytics.track(
    "vocabulary_session_started",
    { sessionId: session.id, kind, items: items.length },
    { userId },
  );
  return { id: session.id, created: true };
}

export type SessionView = {
  id: string;
  kind: DeckKind;
  status: "in_progress" | "completed" | "abandoned";
  total: number;
  questions: ClientQuestion[];
  answers: {
    index: number;
    selectedOptionId: string;
    isCorrect: boolean;
    correctOptionId: string;
    explanation: string;
  }[];
};

/** Client-safe view: answer keys only for items already answered. */
export async function getSessionView(
  userId: string,
  sessionId: string,
): Promise<SessionView | null> {
  const db = getDb();
  const [s] = await db
    .select()
    .from(practiceSessions)
    .where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.userId, userId)))
    .limit(1);
  if (!s) return null;
  const answers = await db
    .select()
    .from(practiceAnswers)
    .where(eq(practiceAnswers.sessionId, s.id));
  return {
    id: s.id,
    kind: s.kind,
    status: s.status,
    total: s.totalCount,
    questions: s.items.map(toClientQuestion),
    answers: answers.map((a) => ({
      index: a.itemIndex,
      selectedOptionId: a.selectedOptionId,
      isCorrect: a.isCorrect,
      correctOptionId: s.items[a.itemIndex].correctOptionId,
      explanation: s.items[a.itemIndex].explanation,
    })),
  };
}

export type AnswerResult = {
  isCorrect: boolean;
  correctOptionId: string;
  explanation: string;
  xp: number;
};

/** Grade one item. Idempotent: re-submitting returns the original verdict and no extra XP. */
export async function answerItem(
  userId: string,
  sessionId: string,
  itemIndex: number,
  optionId: string,
): Promise<AnswerResult> {
  return getDb().transaction(async (tx) => {
    await lockProfile(tx, userId);
    const [s] = await tx
      .select()
      .from(practiceSessions)
      .where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.userId, userId)))
      .limit(1);
    if (!s) throw new SessionError("not_found");
    const item = s.items[itemIndex];
    if (!item || !item.options.some((o) => o.id === optionId)) throw new SessionError("bad_item");

    const [existing] = await tx
      .select()
      .from(practiceAnswers)
      .where(and(eq(practiceAnswers.sessionId, s.id), eq(practiceAnswers.itemIndex, itemIndex)))
      .limit(1);
    if (existing) {
      return {
        isCorrect: existing.isCorrect,
        correctOptionId: item.correctOptionId,
        explanation: item.explanation,
        xp: 0,
      };
    }
    if (s.status !== "in_progress") throw new SessionError("not_in_progress");

    const isCorrect = optionId === item.correctOptionId;
    await tx.insert(practiceAnswers).values({
      sessionId: s.id,
      itemIndex,
      questionType: item.type,
      selectedOptionId: optionId,
      isCorrect,
    });
    if (isCorrect) {
      await tx
        .update(practiceSessions)
        .set({ correctCount: sql`${practiceSessions.correctCount} + 1` })
        .where(eq(practiceSessions.id, s.id));
    }
    await recordWordAnswer(tx, userId, item.wordId, isCorrect, {
      synonymQuestion: item.type === "synonym" || item.type === "reverse",
    });
    // A past word of the day showing up again in practice counts as "reviewed".
    await tx
      .update(studentWordOfDay)
      .set({ reviewedAt: new Date() })
      .where(
        and(
          eq(studentWordOfDay.userId, userId),
          eq(studentWordOfDay.wordId, item.wordId),
          isNotNull(studentWordOfDay.attemptedAt),
          lte(studentWordOfDay.day, sql`${s.day}::date - 1`),
        ),
      );

    let xp = 0;
    if (isCorrect && s.kind === "review") {
      xp = await awardXp(tx, {
        userId,
        action: "review_correct",
        idempotencyKey: `review_correct:${s.id}:${itemIndex}`,
        day: learningDay(),
        sourceId: s.id,
      });
    }
    return { isCorrect, correctOptionId: item.correctOptionId, explanation: item.explanation, xp };
  });
}

export type SessionCompletion = RewardSummary & { correct: number; total: number; kind: DeckKind };

/** Finish a session (once). Grants XP, advances streak, checks mission + badges. */
export async function completeSession(
  userId: string,
  sessionId: string,
): Promise<SessionCompletion> {
  const rewards = new RewardCollector();
  const day = learningDay();
  const result = await getDb().transaction(async (tx) => {
    await lockProfile(tx, userId);
    const [s] = await tx
      .select()
      .from(practiceSessions)
      .where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.userId, userId)))
      .for("update")
      .limit(1);
    if (!s) throw new SessionError("not_found");
    if (s.status !== "in_progress") throw new SessionError("not_in_progress");
    const [{ answered }] = await tx
      .select({ answered: sql<number>`count(*)::int` })
      .from(practiceAnswers)
      .where(eq(practiceAnswers.sessionId, s.id));
    if (answered < s.totalCount) throw new SessionError("incomplete");

    await tx
      .update(practiceSessions)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(practiceSessions.id, s.id));

    await ensureDailyActivity(tx, userId, day);
    await tx
      .update(studentDailyActivity)
      .set({ sessionsCompleted: sql`${studentDailyActivity.sessionsCompleted} + 1` })
      .where(and(eq(studentDailyActivity.userId, userId), eq(studentDailyActivity.day, day)));

    if (s.kind === "daily") {
      await awardXp(
        tx,
        {
          userId,
          action: "session_completed",
          idempotencyKey: `session_completed:${userId}:${day}`,
          day,
          sourceId: s.id,
        },
        rewards,
      );
    }
    await recordQualifiedActivity(tx, userId, day, rewards);
    await refreshWordCounters(tx, userId);
    await checkMissionCompletion(tx, userId, day, rewards);
    await evaluateBadges(tx, userId, rewards);
    return { correct: s.correctCount, total: s.totalCount, kind: s.kind };
  });

  await emitRewardAnalytics(userId, rewards, { sessionId, ...result });
  await analytics.track("vocabulary_session_completed", { sessionId, ...result }, { userId });
  return { ...rewards.toJSON(), ...result };
}

export async function emitRewardAnalytics(
  userId: string,
  rewards: RewardCollector,
  context: Record<string, unknown>,
) {
  for (const a of rewards.awards)
    await analytics.track("xp_awarded", { ...a, ...context }, { userId });
  if (rewards.streak?.extended) {
    await analytics.track(
      "streak_extended",
      { streak: rewards.streak.state.currentStreak, outcome: rewards.streak.outcome },
      { userId },
    );
  }
  if (rewards.missionCompleted)
    await analytics.track("daily_mission_completed", context, { userId });
  if (rewards.levelUp) await analytics.track("level_up", rewards.levelUp, { userId });
  for (const b of rewards.badges)
    await analytics.track("badge_earned", { code: b.code }, { userId });
}
