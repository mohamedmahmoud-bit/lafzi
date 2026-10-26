import { hashString } from "@/lib/utils";
import { VERBAL_SKILLS, type SkillId } from "./skills";
import {
  levelFromMastery,
  type NoonLearningIntegration,
  type NoonStudentContext,
  type SkillSummaryResult,
} from "./types";
import { buildNoonPracticeUrl, type NoonUrlConfig } from "./urls";

/**
 * ⚠️ DEVELOPMENT DATA ONLY. Produces a stable, per-student fake heat map so the product loop can
 * be experienced locally. The factory refuses to use this adapter in production.
 */
/** Fixed profile for the demo persona so the documented demo flow is predictable. */
const DEV_FIXTURES: Record<string, Partial<Record<SkillId, number>>> = {
  "DEV-NOON-1001": {
    sentence_completion: 42,
    reading_comprehension: 64,
    verbal_analogy: 76,
    association_difference: 81,
    contextual_error: 91,
  },
};

export class MockNoonLearningIntegration implements NoonLearningIntegration {
  readonly id = "mock" as const;
  constructor(private readonly urls: NoonUrlConfig) {}

  async getStudentSkillSummary(ctx: NoonStudentContext): Promise<SkillSummaryResult> {
    const seed = ctx.noonStudentId ?? ctx.userId;
    const skills = (Object.keys(VERBAL_SKILLS) as SkillId[]).map((skillId) => {
      const mastery = DEV_FIXTURES[seed]?.[skillId] ?? 35 + (hashString(`${seed}:${skillId}`) % 60);
      return {
        skillId,
        name: VERBAL_SKILLS[skillId].name,
        mastery,
        level: levelFromMastery(mastery),
      };
    });
    return {
      status: "available",
      source: "mock",
      isDevelopmentData: true,
      skills,
      fetchedAt: new Date().toISOString(),
    };
  }

  getPracticeUrl(ctx: NoonStudentContext, skillId?: SkillId): string {
    return buildNoonPracticeUrl(this.urls, ctx.noonStudentId, skillId);
  }
}
