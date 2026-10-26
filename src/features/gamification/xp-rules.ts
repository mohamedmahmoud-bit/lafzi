/**
 * XP actions and their default values. Defaults are seeded into `xp_rules` and can be edited by
 * admins; code falls back to these if a row is missing. The browser never sends XP amounts.
 */
export const XP_ACTIONS = [
  "wod_opened",
  "wod_answered",
  "wod_correct",
  "session_completed",
  "review_correct",
  "mission_completed",
  "noon_practice_clicked",
  "streak_milestone",
] as const;

export type XpAction = (typeof XP_ACTIONS)[number];

export type XpRule = {
  action: XpAction;
  xp: number;
  dailyCap: number | null;
  description: string;
  enabled: boolean;
};

export const DEFAULT_XP_RULES: Record<XpAction, XpRule> = {
  wod_opened: {
    action: "wod_opened",
    xp: 2,
    dailyCap: 2,
    description: "فتح كلمة اليوم",
    enabled: true,
  },
  wod_answered: {
    action: "wod_answered",
    xp: 5,
    dailyCap: 5,
    description: "الإجابة عن سؤال كلمة اليوم",
    enabled: true,
  },
  wod_correct: {
    action: "wod_correct",
    xp: 5,
    dailyCap: 5,
    description: "إجابة صحيحة لكلمة اليوم",
    enabled: true,
  },
  session_completed: {
    action: "session_completed",
    xp: 20,
    dailyCap: 20,
    description: "إنهاء تدريب الكلمات اليومي",
    enabled: true,
  },
  review_correct: {
    action: "review_correct",
    xp: 1,
    dailyCap: 30,
    description: "إجابة صحيحة في جلسة مراجعة إضافية",
    enabled: true,
  },
  mission_completed: {
    action: "mission_completed",
    xp: 25,
    dailyCap: 25,
    description: "إكمال مهمة اليوم",
    enabled: true,
  },
  noon_practice_clicked: {
    action: "noon_practice_clicked",
    xp: 5,
    dailyCap: 5,
    description: "الانتقال للتدريب على نون بعد إنهاء المهمة",
    enabled: true,
  },
  streak_milestone: {
    action: "streak_milestone",
    xp: 10,
    dailyCap: null,
    description: "إنجاز سلسلة (٧/٣٠/١٠٠ يوم) — القيمة تتضاعف حسب المرحلة",
    enabled: true,
  },
};

export function isXpAction(v: string): v is XpAction {
  return (XP_ACTIONS as readonly string[]).includes(v);
}

/**
 * Decide how much XP to grant given the rule and what was already earned today for the action.
 * Pure: idempotency is enforced separately by the ledger's unique key.
 */
export function computeAward(
  rule: Pick<XpRule, "xp" | "dailyCap" | "enabled">,
  earnedTodayForAction: number,
  multiplier = 1,
): number {
  if (!rule.enabled) return 0;
  const requested = Math.max(0, Math.floor(rule.xp * multiplier));
  if (rule.dailyCap === null) return requested;
  const remaining = Math.max(0, rule.dailyCap - earnedTodayForAction);
  return Math.min(requested, remaining);
}

/** Streak milestone multipliers: 7 → ×1, 30 → ×3, 100 → ×10. */
export function milestoneMultiplier(milestone: number): number {
  return milestone >= 100 ? 10 : milestone >= 30 ? 3 : 1;
}
