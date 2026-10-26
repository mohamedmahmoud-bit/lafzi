import type { NextRequest } from "next/server";
import { analytics } from "@/features/analytics/analytics";
import { getCurrentUser } from "@/features/auth/dal";
import { destroySession } from "@/features/auth/session";
import { isSameOrigin, redirectTo } from "@/lib/request";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return new Response("Forbidden", { status: 403 });
  const user = await getCurrentUser();
  await destroySession();
  if (user) await analytics.track("logout", {}, { userId: user.id });
  return redirectTo("/login");
}
