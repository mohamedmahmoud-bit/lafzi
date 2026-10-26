import type { SkillId } from "./skills";
import type {
  NoonLearningIntegration,
  NoonStudentContext,
  SkillSummaryResult,
  StudentSkill,
} from "./types";
import { buildNoonPracticeUrl, type NoonUrlConfig } from "./urls";

export class NoonSpecMissingError extends Error {
  constructor(what: string) {
    super(`Noon integration not implemented: ${what}. See docs/ARCHITECTURE.md §7.`);
  }
}

export type HttpNoonConfig = {
  baseUrl?: string;
  timeoutMs: number;
  urls: NoonUrlConfig;
  fetchImpl?: typeof fetch;
};

/**
 * Real Noon heat-map adapter. The transport (timeout, auth header, error handling, fallback) is
 * implemented; the endpoint path and response mapping are NOT, because Noon has not published
 * them. Fill in `skillSummaryPath` and `mapNoonSkills` once the spec arrives. [NOON-REQUIRED]
 */
export class HttpNoonLearningIntegration implements NoonLearningIntegration {
  readonly id = "http" as const;
  constructor(private readonly cfg: HttpNoonConfig) {}

  /** [NOON-REQUIRED] e.g. `/students/${id}/skills` — intentionally not guessed. */
  protected skillSummaryPath(_noonStudentId: string): string {
    throw new NoonSpecMissingError("skill summary endpoint path");
  }

  /** [NOON-REQUIRED] Map Noon's response to our StudentSkill shape (and skill ids). */
  protected mapNoonSkills(_json: unknown): StudentSkill[] {
    throw new NoonSpecMissingError("skill summary response mapping");
  }

  async getStudentSkillSummary(ctx: NoonStudentContext): Promise<SkillSummaryResult> {
    if (!this.cfg.baseUrl) return { status: "unavailable", reason: "not_configured" };
    if (!ctx.noonStudentId) return { status: "unavailable", reason: "not_linked" };

    let path: string;
    try {
      path = this.skillSummaryPath(ctx.noonStudentId);
    } catch (err) {
      if (err instanceof NoonSpecMissingError)
        return { status: "unavailable", reason: "not_configured" };
      throw err;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
    try {
      const res = await (this.cfg.fetchImpl ?? fetch)(new URL(path, this.cfg.baseUrl), {
        headers: {
          accept: "application/json",
          ...(ctx.accessToken ? { authorization: `Bearer ${ctx.accessToken}` } : {}),
        },
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok) return { status: "unavailable", reason: "error" };
      const skills = this.mapNoonSkills(await res.json());
      if (!skills.length) return { status: "unavailable", reason: "no_data" };
      return {
        status: "available",
        source: "noon",
        isDevelopmentData: false,
        skills,
        fetchedAt: new Date().toISOString(),
      };
    } catch {
      return { status: "unavailable", reason: "error" };
    } finally {
      clearTimeout(timer);
    }
  }

  getPracticeUrl(ctx: NoonStudentContext, skillId?: SkillId): string {
    return buildNoonPracticeUrl(this.cfg.urls, ctx.noonStudentId, skillId);
  }
}

/** No heat-map source: the UI shows the generic "see your strengths on Noon" CTA. */
export class NoHeatmapIntegration implements NoonLearningIntegration {
  readonly id = "none" as const;
  constructor(private readonly urls: NoonUrlConfig) {}
  async getStudentSkillSummary(): Promise<SkillSummaryResult> {
    return { status: "unavailable", reason: "not_configured" };
  }
  getPracticeUrl(ctx: NoonStudentContext, skillId?: SkillId): string {
    return buildNoonPracticeUrl(this.urls, ctx.noonStudentId, skillId);
  }
}
