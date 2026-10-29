import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { noonQuestions, noonQuestionVersions, questionGameCompatibility, readingPassages } from "@/db/schema";
import type { NoonQuestion } from "./types";

export type PoolQuestion = {
  questionId: string;
  versionId: string;
  subskillId: string | null;
  topicId: string;
  difficulty: number | null;
  payload: NoonQuestion;
  passage: string | null;
};

/**
 * The ONLY source of questions for games: published + approved for the game mode.
 * Mock questions are excluded in production. Never generates anything.
 */
export async function publishedQuestions(
  db: DbOrTx,
  p: { topicId: string; gameMode: string; subskillIds?: string[]; excludeIds?: string[]; limit?: number; isProduction: boolean },
): Promise<PoolQuestion[]> {
  const conds = [
    eq(noonQuestions.status, "published"),
    eq(noonQuestions.topicId, p.topicId),
    eq(questionGameCompatibility.gameMode, p.gameMode),
    eq(questionGameCompatibility.status, "approved"),
  ];
  if (p.isProduction) conds.push(eq(noonQuestions.isMock, false));
  if (p.subskillIds?.length) conds.push(inArray(noonQuestions.subskillId, p.subskillIds));
  if (p.excludeIds?.length) conds.push(notInArray(noonQuestions.id, p.excludeIds));
  const rows = await db
    .select({
      questionId: noonQuestions.id,
      versionId: noonQuestionVersions.id,
      subskillId: noonQuestions.subskillId,
      topicId: noonQuestions.topicId,
      difficulty: noonQuestions.difficulty,
      payload: noonQuestionVersions.payload,
      passage: readingPassages.body,
    })
    .from(noonQuestions)
    .innerJoin(noonQuestionVersions, eq(noonQuestionVersions.id, noonQuestions.publishedVersionId))
    .innerJoin(questionGameCompatibility, eq(questionGameCompatibility.questionId, noonQuestions.id))
    .leftJoin(readingPassages, eq(readingPassages.id, noonQuestions.passageId))
    .where(and(...conds))
    .orderBy(sql`random()`)
    .limit(p.limit ?? 200);
  return rows.map((r) => ({ ...r, topicId: r.topicId!, payload: r.payload as unknown as NoonQuestion }));
}

export async function publishedCountByTopic(db: DbOrTx, isProduction: boolean) {
  const rows = await db
    .select({ topicId: noonQuestions.topicId, n: sql<number>`count(*)::int` })
    .from(noonQuestions)
    .where(and(eq(noonQuestions.status, "published"), ...(isProduction ? [eq(noonQuestions.isMock, false)] : [])))
    .groupBy(noonQuestions.topicId);
  return Object.fromEntries(rows.map((r) => [r.topicId ?? "", r.n])) as Record<string, number>;
}

/** One specific question, only if it is currently published (its published version). */
export async function publishedQuestionById(db: DbOrTx, questionId: string, isProduction: boolean): Promise<PoolQuestion | null> {
  const conds = [eq(noonQuestions.id, questionId), eq(noonQuestions.status, "published")];
  if (isProduction) conds.push(eq(noonQuestions.isMock, false));
  const [r] = await db
    .select({
      questionId: noonQuestions.id,
      versionId: noonQuestionVersions.id,
      subskillId: noonQuestions.subskillId,
      topicId: noonQuestions.topicId,
      difficulty: noonQuestions.difficulty,
      payload: noonQuestionVersions.payload,
      passage: readingPassages.body,
    })
    .from(noonQuestions)
    .innerJoin(noonQuestionVersions, eq(noonQuestionVersions.id, noonQuestions.publishedVersionId))
    .leftJoin(readingPassages, eq(readingPassages.id, noonQuestions.passageId))
    .where(and(...conds))
    .limit(1);
  return r ? { ...r, topicId: r.topicId ?? "", payload: r.payload as unknown as NoonQuestion } : null;
}
