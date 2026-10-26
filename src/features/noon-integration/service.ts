import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { noonSkillSnapshots, practiceAnswers, practiceSessions } from "@/db/schema";
import { env } from "@/lib/env";
import { addDays, learningDay } from "@/lib/time";
import { chooseFocusSkill, type FocusRecommendation, type LocalSkillSignal } from "./focus";
import { HttpNoonLearningIntegration, NoHeatmapIntegration } from "./http";
import { MockNoonLearningIntegration } from "./mock";
import { QUESTION_TYPE_TO_SKILL } from "./skills";
import type { NoonLearningIntegration, NoonStudentContext, SkillSummaryResult } from "./types";
import { noonGoHref, parseSkillIdMap, type NoonUrlConfig } from "./urls";

export { noonGoHref };

const SNAPSHOT_TTL_MS = 6 * 3_600_000;
let integration: NoonLearningIntegration | undefined;

export function noonUrlConfig(): NoonUrlConfig {
  const e = env();
  return {
    practiceUrlTemplate: e.NOON_PRACTICE_URL_TEMPLATE || undefined,
    heatmapUrl: e.NOON_HEATMAP_URL || undefined,
    skillIdMap: parseSkillIdMap(e.NOON_SKILL_ID_MAP),
  };
}

export function getLearningIntegration(): NoonLearningIntegration {
  if (integration) return integration;
  const e = env();
  const urls = noonUrlConfig();
  if (e.NOON_LEARNING_PROVIDER === "mock" && e.NODE_ENV === "production") {
    console.warn("[noon] mock learning provider refused in production; heat map disabled");
    integration = new NoHeatmapIntegration(urls);
  } else if (e.NOON_LEARNING_PROVIDER === "mock") {
    integration = new MockNoonLearningIntegration(urls);
  } else if (e.NOON_LEARNING_PROVIDER === "http") {
    integration = new HttpNoonLearningIntegration({
      baseUrl: e.NOON_API_BASE_URL,
      timeoutMs: e.NOON_API_TIMEOUT_MS,
      urls,
    });
  } else {
    integration = new NoHeatmapIntegration(urls);
  }
  return integration;
}

/** Fetch the student's skill summary with a short-lived cache. Never throws. */
export async function getSkillSummary(
  ctx: NoonStudentContext,
  provider: NoonLearningIntegration = getLearningIntegration(),
): Promise<SkillSummaryResult> {
  const db = getDb();
  try {
    if (provider.id !== "mock") {
      const [cached] = await db
        .select()
        .from(noonSkillSnapshots)
        .where(
          and(
            eq(noonSkillSnapshots.userId, ctx.userId),
            gte(noonSkillSnapshots.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (cached) return cached.payload as SkillSummaryResult;
    }
    const result = await provider.getStudentSkillSummary(ctx);
    if (result.status === "available" && provider.id !== "mock") {
      const values = {
        source: provider.id,
        payload: result,
        fetchedAt: new Date(),
        expiresAt: new Date(Date.now() + SNAPSHOT_TTL_MS),
      };
      await db
        .insert(noonSkillSnapshots)
        .values({ userId: ctx.userId, ...values })
        .onConflictDoUpdate({ target: noonSkillSnapshots.userId, set: values });
    }
    return result;
  } catch (err) {
    console.error("[noon] skill summary failed", err);
    return { status: "unavailable", reason: "error" };
  }
}

/** Honest local signal: accuracy on analogy/context questions inside لفظي (last 30 days). */
export async function getLocalSkillSignals(userId: string): Promise<LocalSkillSignal[]> {
  const since = addDays(learningDay(), -30);
  const rows = await getDb()
    .select({
      type: practiceAnswers.questionType,
      answered: sql<number>`count(*)::int`,
      correct: sql<number>`count(*) filter (where ${practiceAnswers.isCorrect})::int`,
    })
    .from(practiceAnswers)
    .innerJoin(practiceSessions, eq(practiceSessions.id, practiceAnswers.sessionId))
    .where(and(eq(practiceSessions.userId, userId), gte(practiceSessions.day, since)))
    .groupBy(practiceAnswers.questionType);
  return rows.flatMap((r) => {
    const skillId = QUESTION_TYPE_TO_SKILL[r.type];
    return skillId
      ? [{ skillId, answered: r.answered, accuracy: r.answered ? r.correct / r.answered : 0 }]
      : [];
  });
}

export type NoonFocus = {
  summary: SkillSummaryResult;
  focus: FocusRecommendation | null;
  /** Internal tracking route that redirects to the real Noon deep link. */
  ctaHref: (src: string) => string;
};

export async function getNoonFocus(user: {
  id: string;
  noonStudentId: string | null;
}): Promise<NoonFocus> {
  const ctx: NoonStudentContext = { userId: user.id, noonStudentId: user.noonStudentId };
  const [summary, local] = await Promise.all([getSkillSummary(ctx), getLocalSkillSignals(user.id)]);
  const focus = chooseFocusSkill(summary, local);
  return { summary, focus, ctaHref: (src) => noonGoHref(src, focus?.skillId) };
}
