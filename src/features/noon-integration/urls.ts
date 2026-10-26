import type { SkillId } from "./skills";

export type NoonUrlConfig = {
  /** e.g. "https://<noon-host>/<practice-path>/{skillId}?student={studentId}" — format from Noon. */
  practiceUrlTemplate?: string;
  /** The student's general Noon learning / heat-map area. */
  heatmapUrl?: string;
  /** Local skill id → Noon skill id. */
  skillIdMap?: Partial<Record<SkillId, string>>;
};

/** Development placeholder used until Noon provides real deep-link formats. [NOON-REQUIRED] */
export const DEV_PLACEHOLDER_PATH = "/dev/noon-placeholder";

function isSafeAbsoluteUrl(u: string): boolean {
  try {
    const parsed = new URL(u);
    return parsed.protocol === "https:" || parsed.hostname === "localhost";
  } catch {
    return false;
  }
}

/**
 * Build the Noon deep link for a student + optional skill. URLs come only from server config —
 * never from user input — so this cannot become an open redirect.
 */
export function buildNoonPracticeUrl(
  config: NoonUrlConfig,
  studentId: string | null,
  skillId?: SkillId,
): string {
  const noonSkillId = skillId ? (config.skillIdMap?.[skillId] ?? skillId) : undefined;

  if (noonSkillId && config.practiceUrlTemplate) {
    const url = config.practiceUrlTemplate
      .replaceAll("{skillId}", encodeURIComponent(noonSkillId))
      .replaceAll("{studentId}", encodeURIComponent(studentId ?? ""));
    if (isSafeAbsoluteUrl(url)) return url;
  }
  if (config.heatmapUrl && isSafeAbsoluteUrl(config.heatmapUrl)) {
    return config.heatmapUrl.replaceAll("{studentId}", encodeURIComponent(studentId ?? ""));
  }
  const qs = new URLSearchParams();
  if (skillId) qs.set("skill", skillId);
  return `${DEV_PLACEHOLDER_PATH}${qs.size ? `?${qs}` : ""}`;
}

export function parseSkillIdMap(raw: string | undefined): Partial<Record<SkillId, string>> {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

/** Internal tracking route; it records the click and 302s to the real Noon deep link. */
export function noonGoHref(src: string, skillId?: SkillId) {
  const qs = new URLSearchParams({ src });
  if (skillId) qs.set("skill", skillId);
  return `/go/noon?${qs}`;
}
