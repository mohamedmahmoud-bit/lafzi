import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { studentDailyActivity } from "@/db/schema";
import { requireUser } from "@/features/auth/dal";
import { getStudentWod } from "@/features/daily-word/service";
import { getNoonFocus } from "@/features/noon-integration/service";
import { noonGoHref } from "@/features/noon-integration/urls";
import { learningDay } from "@/lib/time";
import { WodFlow } from "./wod-flow";

export const metadata = { title: "كلمة اليوم" };

export default async function WordOfTheDayPage() {
  const user = await requireUser();
  const [wod, noon, [activity]] = await Promise.all([
    getStudentWod(user.id),
    getNoonFocus(user),
    getDb()
      .select({ sessions: studentDailyActivity.sessionsCompleted })
      .from(studentDailyActivity)
      .where(
        and(eq(studentDailyActivity.userId, user.id), eq(studentDailyActivity.day, learningDay())),
      ),
  ]);
  return (
    <WodFlow
      wod={wod}
      practiceDone={(activity?.sessions ?? 0) > 0}
      focus={{
        summary: noon.summary,
        focus: noon.focus,
        ctaHref: noonGoHref("wod_reward", noon.focus?.skillId),
        heatmapHref: noonGoHref("wod_heatmap"),
      }}
    />
  );
}
