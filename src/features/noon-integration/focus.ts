import { skillName, type SkillId } from "./skills";
import type { SkillSummaryResult } from "./types";

export type LocalSkillSignal = { skillId: SkillId; answered: number; accuracy: number };

export type FocusRecommendation = {
  skillId: SkillId;
  name: string;
  /** noon = from Noon heat map (or its mock); local = from practice inside لفظي. */
  basis: "noon" | "local";
  message: string;
};

export const LOCAL_SIGNAL_MIN_ANSWERS = 5;
const LOCAL_WEAK_ACCURACY = 0.7;

/**
 * Pick the single skill the student should practise on Noon next.
 * Priority: Noon's own heat map → honest local signal from لفظي practice → null (generic CTA).
 * Never fabricates a weakness.
 */
export function chooseFocusSkill(
  summary: SkillSummaryResult,
  local: LocalSkillSignal[],
): FocusRecommendation | null {
  if (summary.status === "available" && summary.skills.length) {
    const weakest = [...summary.skills].sort((a, b) => (a.mastery ?? 100) - (b.mastery ?? 100))[0];
    if (weakest.level === "needs_practice" || weakest.level === "developing") {
      return {
        skillId: weakest.skillId,
        name: weakest.name,
        basis: "noon",
        message: `مستواك في ${weakest.name} يحتاج تدريبًا`,
      };
    }
  }
  const weakLocal = local
    .filter((s) => s.answered >= LOCAL_SIGNAL_MIN_ANSWERS && s.accuracy < LOCAL_WEAK_ACCURACY)
    .sort((a, b) => a.accuracy - b.accuracy)[0];
  if (weakLocal) {
    const name = skillName(weakLocal.skillId);
    return {
      skillId: weakLocal.skillId,
      name,
      basis: "local",
      message: `أسئلة ${name} في تدريبك هنا تحتاج تركيزًا`,
    };
  }
  return null;
}
