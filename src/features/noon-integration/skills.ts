/**
 * Local registry of Qudurat Verbal skills. These ids are OURS. Real Noon skill ids are mapped via
 * NOON_SKILL_ID_MAP once Noon provides its taxonomy. [NOON-REQUIRED]
 */
export const VERBAL_SKILLS = {
  verbal_analogy: { name: "التناظر اللفظي" },
  sentence_completion: { name: "إكمال الجمل" },
  contextual_error: { name: "الخطأ السياقي" },
  reading_comprehension: { name: "استيعاب المقروء" },
  association_difference: { name: "الارتباط والاختلاف" },
} as const;

export type SkillId = keyof typeof VERBAL_SKILLS;

export function isSkillId(v: unknown): v is SkillId {
  return typeof v === "string" && Object.hasOwn(VERBAL_SKILLS, v);
}

export function skillName(id: SkillId): string {
  return VERBAL_SKILLS[id].name;
}

/** Which companion question types give an (honest) local signal for which Qudurat skill. */
export const QUESTION_TYPE_TO_SKILL: Partial<Record<string, SkillId>> = {
  analogy: "verbal_analogy",
  context: "sentence_completion",
};
