import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/dal";
import { getNoonFocus } from "@/features/noon-integration/service";
import { noonGoHref } from "@/features/noon-integration/urls";
import { getSessionView } from "@/features/vocabulary/session.service";
import { SessionRunner } from "./session-runner";

export const metadata = { title: "جلسة تدريب" };

export default async function SessionPage({ params }: PageProps<"/practice/[sessionId]">) {
  const user = await requireUser();
  const { sessionId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) notFound();
  const [view, noon] = await Promise.all([getSessionView(user.id, sessionId), getNoonFocus(user)]);
  if (!view) notFound();
  return (
    <SessionRunner
      view={view}
      focus={{
        summary: noon.summary,
        focus: noon.focus,
        ctaHref: noonGoHref("session_reward", noon.focus?.skillId),
        heatmapHref: noonGoHref("session_heatmap"),
      }}
    />
  );
}
