import "server-only";
import { and, eq, gte, isNull, notInArray, sql } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db/client";
import { studentDailyActivity, studentWordOfDay, vocabularyWords, wordOfDay } from "@/db/schema";
import { analytics } from "@/features/analytics/analytics";
import { evaluateBadges } from "@/features/badges/service";
import { RewardCollector, type RewardSummary } from "@/features/gamification/rewards";
import { awardXp, ensureDailyActivity, lockProfile } from "@/features/gamification/xp.service";
import { checkMissionCompletion } from "@/features/missions/service";
import { recordQualifiedActivity } from "@/features/streaks/service";
import { refreshWordCounters, recordWordAnswer } from "@/features/vocabulary/progress.service";
import {
  buildFirstPossible,
  buildQuestion,
  toClientQuestion,
} from "@/features/vocabulary/questions";
import { emitRewardAnalytics } from "@/features/vocabulary/session.service";
import { loadWords, type WordCard } from "@/features/vocabulary/words.repo";
import { addDays, learningDay } from "@/lib/time";
import { hashString, seededRandom } from "@/lib/utils";

/** A word may not be word-of-the-day again within this many days (for everyone). */
export const WOD_NO_REPEAT_DAYS = 90;

export class WodError extends Error {
  constructor(public code: "no_words" | "not_guessed" | "bad_option") {
    super(code);
  }
}

/**
 * Global word for a day: a manual schedule wins; otherwise pick deterministically among active
 * words not used within WOD_NO_REPEAT_DAYS (falls back to least-recently used if the bank is small).
 */
export async function ensureWordOfDay(day: string, db: DbOrTx = getDb()): Promise<string> {
  const [existing] = await db.select().from(wordOfDay).where(eq(wordOfDay.day, day)).limit(1);
  if (existing) return existing.wordId;

  const recent = await db
    .select({ wordId: wordOfDay.wordId })
    .from(wordOfDay)
    .where(gte(wordOfDay.day, addDays(day, -WOD_NO_REPEAT_DAYS)));
  const recentIds = recent.map((r) => r.wordId);
  let candidates = await db
    .select({ id: vocabularyWords.id })
    .from(vocabularyWords)
    .where(
      and(
        eq(vocabularyWords.active, true),
        recentIds.length ? notInArray(vocabularyWords.id, recentIds) : undefined,
      ),
    )
    .orderBy(vocabularyWords.normalizedWord);
  if (!candidates.length) {
    // Small bank: reuse the least recently featured active word.
    candidates = await db
      .select({ id: vocabularyWords.id })
      .from(vocabularyWords)
      .leftJoin(wordOfDay, eq(wordOfDay.wordId, vocabularyWords.id))
      .where(eq(vocabularyWords.active, true))
      .groupBy(vocabularyWords.id)
      .orderBy(sql`max(${wordOfDay.day}) asc nulls first`)
      .limit(1);
  }
  if (!candidates.length) throw new WodError("no_words");
  const pick = candidates[hashString(day) % candidates.length];
  await db.insert(wordOfDay).values({ day, wordId: pick.id, source: "auto" }).onConflictDoNothing();
  const [row] = await db.select().from(wordOfDay).where(eq(wordOfDay.day, day)).limit(1);
  return row.wordId;
}

export type WodView = {
  day: string;
  card: Omit<WordCard, "id"> & { id: string };
  guess: ReturnType<typeof toClientQuestion>;
  question: ReturnType<typeof toClientQuestion>;
  status: {
    guessed: boolean;
    guessCorrect: boolean | null;
    guessCorrectOptionId: string | null;
    answered: boolean;
    isCorrect: boolean | null;
    selectedOptionId: string | null;
    correctOptionId: string | null;
    explanation: string | null;
  };
};

/** Get (and lazily create) the student's word-of-the-day record for today. */
export async function getStudentWod(userId: string, day = learningDay()): Promise<WodView> {
  const db = getDb();
  const wordId = await ensureWordOfDay(day, db);
  let [row] = await db
    .select()
    .from(studentWordOfDay)
    .where(and(eq(studentWordOfDay.userId, userId), eq(studentWordOfDay.day, day)))
    .limit(1);

  const pool = await loadWords(db);
  const target = pool.find((w) => w.id === wordId) ?? (await loadWords(db, [wordId]))[0];
  if (!row) {
    const rand = seededRandom(hashString(`${userId}:${day}:wod`));
    const guessQuestion = buildQuestion("meaning", target, pool, rand);
    const question = buildFirstPossible(["synonym", "antonym"], target, pool, rand);
    if (!guessQuestion || !question) throw new WodError("no_words");
    guessQuestion.prompt = "من سياق الجملة، ماذا تتوقع أن تعني الكلمة؟";
    guessQuestion.stem = target.example;
    await db
      .insert(studentWordOfDay)
      .values({ userId, day, wordId, guessQuestion, question })
      .onConflictDoNothing();
    [row] = await db
      .select()
      .from(studentWordOfDay)
      .where(and(eq(studentWordOfDay.userId, userId), eq(studentWordOfDay.day, day)))
      .limit(1);
  }

  const answered = row.attemptedAt !== null;
  const guessed = row.guessOptionId !== null;
  return {
    day,
    card: target,
    guess: toClientQuestion(row.guessQuestion),
    question: toClientQuestion(row.question),
    status: {
      guessed,
      guessCorrect: guessed ? row.guessOptionId === row.guessQuestion.correctOptionId : null,
      guessCorrectOptionId: guessed ? row.guessQuestion.correctOptionId : null,
      answered,
      isCorrect: row.isCorrect,
      selectedOptionId: row.selectedOptionId,
      correctOptionId: answered ? row.question.correctOptionId : null,
      explanation: answered ? row.question.explanation : null,
    },
  };
}

/**
 * Step 1 — the student guesses the meaning from context (ungraded, active-learning hook).
 * Marks the word as viewed and grants the one-time "opened" XP.
 */
export async function submitWodGuess(userId: string, optionId: string) {
  const day = learningDay();
  await getStudentWod(userId, day);
  const rewards = new RewardCollector();
  const out = await getDb().transaction(async (tx) => {
    await lockProfile(tx, userId);
    const [row] = await tx
      .select()
      .from(studentWordOfDay)
      .where(and(eq(studentWordOfDay.userId, userId), eq(studentWordOfDay.day, day)))
      .limit(1);
    if (!row.guessQuestion.options.some((o) => o.id === optionId)) throw new WodError("bad_option");
    if (!row.guessOptionId) {
      await tx
        .update(studentWordOfDay)
        .set({ guessOptionId: optionId, viewedAt: row.viewedAt ?? new Date() })
        .where(and(eq(studentWordOfDay.id, row.id), isNull(studentWordOfDay.guessOptionId)));
    }
    await awardXp(
      tx,
      { userId, action: "wod_opened", idempotencyKey: `wod_opened:${userId}:${day}`, day },
      rewards,
    );
    const chosen = row.guessOptionId ?? optionId;
    return {
      correct: chosen === row.guessQuestion.correctOptionId,
      correctOptionId: row.guessQuestion.correctOptionId,
      firstTime: !row.guessOptionId,
    };
  });
  if (out.firstTime) {
    await analytics.track("word_of_day_viewed", { day }, { userId });
    await analytics.track("word_of_day_guessed", { day, correct: out.correct }, { userId });
  }
  return { ...out, xp: rewards.totalXp };
}

/** Step 2 — graded retrieval question. One attempt per day; resubmits return the original result. */
export async function answerWod(
  userId: string,
  optionId: string,
): Promise<RewardSummary & { isCorrect: boolean; correctOptionId: string; explanation: string }> {
  const day = learningDay();
  const rewards = new RewardCollector();
  const result = await getDb().transaction(async (tx) => {
    await lockProfile(tx, userId);
    const [row] = await tx
      .select()
      .from(studentWordOfDay)
      .where(and(eq(studentWordOfDay.userId, userId), eq(studentWordOfDay.day, day)))
      .limit(1);
    if (!row?.guessOptionId) throw new WodError("not_guessed");
    const q = row.question;
    if (!q.options.some((o) => o.id === optionId)) throw new WodError("bad_option");

    if (row.attemptedAt) {
      return {
        isCorrect: !!row.isCorrect,
        correctOptionId: q.correctOptionId,
        explanation: q.explanation,
        firstTime: false,
      };
    }
    const isCorrect = optionId === q.correctOptionId;
    const updated = await tx
      .update(studentWordOfDay)
      .set({ attemptedAt: new Date(), selectedOptionId: optionId, isCorrect })
      .where(and(eq(studentWordOfDay.id, row.id), isNull(studentWordOfDay.attemptedAt)))
      .returning({ id: studentWordOfDay.id });
    if (!updated.length) {
      return {
        isCorrect: !!row.isCorrect,
        correctOptionId: q.correctOptionId,
        explanation: q.explanation,
        firstTime: false,
      };
    }

    await awardXp(
      tx,
      { userId, action: "wod_answered", idempotencyKey: `wod_answered:${userId}:${day}`, day },
      rewards,
    );
    if (isCorrect) {
      await awardXp(
        tx,
        { userId, action: "wod_correct", idempotencyKey: `wod_correct:${userId}:${day}`, day },
        rewards,
      );
    }
    await recordWordAnswer(tx, userId, row.wordId, isCorrect, {
      synonymQuestion: q.type === "synonym",
    });
    await ensureDailyActivity(tx, userId, day);
    await tx
      .update(studentDailyActivity)
      .set({ wordOfDayCompleted: true })
      .where(and(eq(studentDailyActivity.userId, userId), eq(studentDailyActivity.day, day)));
    await recordQualifiedActivity(tx, userId, day, rewards);
    await refreshWordCounters(tx, userId);
    await checkMissionCompletion(tx, userId, day, rewards);
    await evaluateBadges(tx, userId, rewards);
    return {
      isCorrect,
      correctOptionId: q.correctOptionId,
      explanation: q.explanation,
      firstTime: true,
    };
  });

  if (result.firstTime) {
    await emitRewardAnalytics(userId, rewards, { source: "word_of_day" });
    await analytics.track("word_of_day_completed", { day, correct: result.isCorrect }, { userId });
  }
  return {
    ...rewards.toJSON(),
    isCorrect: result.isCorrect,
    correctOptionId: result.correctOptionId,
    explanation: result.explanation,
  };
}
