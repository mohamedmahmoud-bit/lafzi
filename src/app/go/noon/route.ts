import { and, eq, isNotNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { outboundPracticeEvents, studentDailyActivity } from "@/db/schema";
import { analytics } from "@/features/analytics/analytics";
import { getCurrentUser } from "@/features/auth/dal";
import { getTaxonomy } from "@/features/curriculum/service";
import { awardXp, lockProfile } from "@/features/gamification/xp.service";
import { platformFromUserAgent } from "@/features/noon-practice/policy";
import { resolvePractice } from "@/features/noon-practice/service";
import { learningDay } from "@/lib/time";
import { redirectTo } from "@/lib/request";

/**
 * Tracked hand-off to Noon. Resolves skill → heat map → general practice from VERIFIED destinations
 * only; otherwise shows an honest "not available yet" page. Never builds or guesses a Noon URL,
 * never forwards student identifiers. XP bonus (once a day) only after today's mission.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return redirectTo("/login", 302);

  const tax = await getTaxonomy();
  const sp = req.nextUrl.searchParams;
  const topicId = tax.topic(sp.get("topic") ?? "")?.id ?? null;
  const sub = tax.subskill(sp.get("subskill") ?? "");
  const subskillId = sub && (!topicId || sub.topicId === topicId) ? sub.id : null;
  const src = (sp.get("src") ?? "unknown").replace(/[^a-z_]/g, "").slice(0, 40);
  const platform = platformFromUserAgent(req.headers.get("user-agent"));
  const day = learningDay();

  const resolution = await resolvePractice({ topicId: topicId ?? sub?.topicId ?? null, subskillId, platform });
  const db = getDb();
  await db.insert(outboundPracticeEvents).values({
    userId: user.id,
    source: src,
    topicId,
    subskillId,
    destinationId: resolution.kind === "destination" ? resolution.destination.destinationId : null,
    destinationKind: resolution.kind === "destination" ? resolution.destination.type : null,
    outcome: resolution.kind === "destination" ? "redirected" : "fallback",
    day,
  });

  if (resolution.kind === "unavailable") {
    await analytics.track("noon_practice_unavailable", { src, topicId, subskillId }, { userId: user.id });
    const qs = new URLSearchParams();
    if (topicId) qs.set("topic", topicId);
    if (subskillId) qs.set("subskill", subskillId);
    return redirectTo(`/noon/unavailable${qs.size ? `?${qs}` : ""}`, 302);
  }

  const [activity] = await db
    .select({ id: studentDailyActivity.id })
    .from(studentDailyActivity)
    .where(and(eq(studentDailyActivity.userId, user.id), eq(studentDailyActivity.day, day), isNotNull(studentDailyActivity.missionCompletedAt)))
    .limit(1);
  if (activity) {
    await db.transaction(async (tx) => {
      await lockProfile(tx, user.id);
      await awardXp(tx, { userId: user.id, action: "noon_practice_clicked", idempotencyKey: `noon_practice_clicked:${user.id}:${day}`, day });
    });
  }
  const props = { src, topicId, subskillId, kind: resolution.destination.type, missionDone: !!activity };
  await analytics.track("noon_practice_clicked", props, { userId: user.id });
  if (resolution.destination.type === "heatmap") await analytics.track("noon_heatmap_cta_clicked", props, { userId: user.id });
  return redirectTo(resolution.destination.url, 302);
}
