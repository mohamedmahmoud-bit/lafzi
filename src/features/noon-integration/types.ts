import type { SkillId } from "./skills";

export type SkillLevel = "needs_practice" | "developing" | "good" | "excellent";

export const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  needs_practice: "بحاجة إلى تدريب",
  developing: "يتحسّن",
  good: "جيد",
  excellent: "ممتاز",
};

export type StudentSkill = {
  skillId: SkillId;
  name: string;
  /** 0..100 when the source provides a score. */
  mastery: number | null;
  level: SkillLevel;
};

export type SkillSummaryResult =
  | {
      status: "available";
      source: "noon" | "mock";
      /** True for mock data — the UI must label it. */
      isDevelopmentData: boolean;
      skills: StudentSkill[];
      fetchedAt: string;
    }
  | { status: "unavailable"; reason: "not_configured" | "error" | "no_data" | "not_linked" };

export type NoonStudentContext = {
  userId: string;
  noonStudentId: string | null;
  /** Present only when a real SSO session holds a Noon access token. */
  accessToken?: string;
};

export interface NoonLearningIntegration {
  readonly id: "mock" | "http" | "none";
  getStudentSkillSummary(ctx: NoonStudentContext): Promise<SkillSummaryResult>;
  getPracticeUrl(ctx: NoonStudentContext, skillId?: SkillId): string;
}

export function levelFromMastery(mastery: number): SkillLevel {
  if (mastery < 50) return "needs_practice";
  if (mastery < 70) return "developing";
  if (mastery < 85) return "good";
  return "excellent";
}
