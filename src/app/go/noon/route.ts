import { and, eq, isNotNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { studentDailyActivity } from "@/db/schema";
import { analytics } from "@/features/analytics/analytics";
import { getCurrentUser } from "@/features/auth/dal";
import { awardXp, lockProfile } from "@/features/gamification/xp.service";
import { getLearningIntegration } from "@/features/noon-integration/service";
import { isSkillId } from "@/features/noon-integration/skills";
import { learningDay } from "@/lib/time";
import { redirectTo } from "@/lib/request";

/**
 * Tracked hand-off to Noon. Records the click (the key "return to Noon" metric), grants a small
 * once-per-day XP bonus only after today's mission is complete, and 302s to a URL built purely from
 * server configuration (no open redirect).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return redirectTo("/login", 302);

  const skillParam = req.nextUrl.searchParams.get("skill");
  const skillId = isSkillId(skillParam) ? skillParam : undefined;
  const src = (req.nextUrl.searchParams.get("src") ?? "unknown")
    .replace(/[^a-z_]/g, "")
    .slice(0, 40);
  const day = learningDay();

  const db = getDb();
  const [activity] = await db
    .select({ id: studentDailyActivity.id })
    .from(studentDailyActivity)
    .where(
      and(
        eq(studentDailyActivity.userId, user.id),
        eq(studentDailyActivity.day, day),
        isNotNull(studentDailyActivity.missionCompletedAt),
      ),
    )
    .limit(1);
  if (activity) {
    await db.transaction(async (tx) => {
      await lockProfile(tx, user.id);
      await awardXp(tx, {
        userId: user.id,
        action: "noon_practice_clicked",
        idempotencyKey: `noon_practice_clicked:${user.id}:${day}`,
        day,
      });
    });
  }

  const props = { src, skill: skillId ?? null, missionDone: !!activity };
  await analytics.track("noon_practice_clicked", props, { userId: user.id });
  if (src.includes("focus") || src.includes("heatmap") || src.includes("reward")) {
    await analytics.track("noon_heatmap_cta_clicked", props, { userId: user.id });
  }

  const url = getLearningIntegration().getPracticeUrl(
    { userId: user.id, noonStudentId: user.noonStudentId },
    skillId,
  );
  return redirectTo(url, 302);
}
