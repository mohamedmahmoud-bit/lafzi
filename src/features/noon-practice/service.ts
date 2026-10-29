import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db/client";
import { noonIntegrationVerifications, noonPracticeDestinations, noonSkillMappings } from "@/db/schema";
import { env } from "@/lib/env";
import { computeVerificationStatus, pickDestination, type DestinationKind, type Platform, type PracticeDestination } from "./policy";

export type PracticeContext = { topicId?: string | null; subskillId?: string | null; platform: Platform };

export type PracticeResolution =
  | { kind: "destination"; destination: PracticeDestination }
  | { kind: "unavailable"; tried: DestinationKind[] };

export interface NoonPracticeIntegration {
  resolveSkillPractice(ctx: PracticeContext): Promise<PracticeDestination | null>;
  resolveStudentHeatmap(ctx: PracticeContext): Promise<PracticeDestination | null>;
  resolveGeneralPractice(ctx: PracticeContext): Promise<PracticeDestination | null>;
}

export const allowedHosts = () =>
  env()
    .NOON_PRACTICE_ALLOWED_HOSTS.split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

/** DB-backed resolver: only destinations an admin added AND verified are ever returned. */
export class DbNoonPracticeIntegration implements NoonPracticeIntegration {
  constructor(private readonly db: DbOrTx = getDb(), private readonly now = () => new Date()) {}

  private async rows() {
    return this.db.select().from(noonPracticeDestinations).where(eq(noonPracticeDestinations.verificationStatus, "verified"));
  }

  async resolveSkillPractice(ctx: PracticeContext) {
    if (!ctx.topicId) return null;
    const maps = await this.db.select().from(noonSkillMappings).where(eq(noonSkillMappings.topicId, ctx.topicId));
    const exact = maps.find((m) => ctx.subskillId && m.subskillId === ctx.subskillId)?.id;
    const topicLevel = maps.find((m) => m.subskillId === null)?.id;
    const mappingIds = [exact, topicLevel].filter((x): x is string => !!x);
    if (!mappingIds.length) return null;
    return pickDestination(await this.rows(), { kind: "skill_practice", mappingIds, platform: ctx.platform, now: this.now(), allowedHosts: allowedHosts() });
  }
  async resolveStudentHeatmap(ctx: PracticeContext) {
    return pickDestination(await this.rows(), { kind: "heatmap", platform: ctx.platform, now: this.now(), allowedHosts: allowedHosts() });
  }
  async resolveGeneralPractice(ctx: PracticeContext) {
    return pickDestination(await this.rows(), { kind: "general_practice", platform: ctx.platform, now: this.now(), allowedHosts: allowedHosts() });
  }
}

/** Priority: skill → heat map → general → truthful "unavailable" (never a guessed URL). */
export async function resolvePractice(ctx: PracticeContext, integration: NoonPracticeIntegration = new DbNoonPracticeIntegration()): Promise<PracticeResolution> {
  const tried: DestinationKind[] = [];
  if (ctx.topicId) {
    tried.push("skill_practice");
    const d = await integration.resolveSkillPractice(ctx);
    if (d) return { kind: "destination", destination: d };
  }
  tried.push("heatmap");
  const h = await integration.resolveStudentHeatmap(ctx);
  if (h) return { kind: "destination", destination: h };
  tried.push("general_practice");
  const g = await integration.resolveGeneralPractice(ctx);
  if (g) return { kind: "destination", destination: g };
  return { kind: "unavailable", tried };
}

/** Recompute a destination's status from its verification log (called after each log entry). */
export async function refreshVerificationStatus(db: DbOrTx, destinationId: string) {
  const log = await db
    .select()
    .from(noonIntegrationVerifications)
    .where(eq(noonIntegrationVerifications.destinationId, destinationId))
    .orderBy(desc(noonIntegrationVerifications.createdAt));
  const status = computeVerificationStatus(log);
  const lastPass = log.find((l) => l.scenario === "desktop_authenticated" && l.result === "pass");
  await db
    .update(noonPracticeDestinations)
    .set({ verificationStatus: status, verifiedAt: status === "verified" ? (lastPass?.createdAt ?? null) : null })
    .where(eq(noonPracticeDestinations.id, destinationId));
  return status;
}

export async function topicLevelMapping(db: DbOrTx, topicId: string) {
  const [m] = await db.select().from(noonSkillMappings).where(and(eq(noonSkillMappings.topicId, topicId), isNull(noonSkillMappings.subskillId))).limit(1);
  return m ?? null;
}

export { practiceHref } from "./href";
