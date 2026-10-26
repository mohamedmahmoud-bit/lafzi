import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { analytics } from "@/features/analytics/analytics";
import { getIdentityProvider } from "@/features/auth/providers";
import { createSession } from "@/features/auth/session";
import { upsertUserFromIdentity } from "@/features/auth/users";
import { audit } from "@/features/admin/audit";
import { redirectTo } from "@/lib/request";

const OIDC_COOKIE = "lafzi_oidc";

/** OAuth 2.0 / OIDC redirect URI (NOON_AUTH_REDIRECT_URI). */
export async function GET(req: NextRequest) {
  const jar = await cookies();
  const raw = jar.get(OIDC_COOKIE)?.value;
  jar.delete({ name: OIDC_COOKIE, path: "/api/auth/callback" });

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!raw || !code || !state) return redirectTo("/login?error=sso");

  let stored: { s: string; n: string; v: string };
  try {
    stored = JSON.parse(raw);
  } catch {
    return redirectTo("/login?error=sso");
  }
  if (stored.s !== state) return redirectTo("/login?error=sso");

  try {
    const identity = await getIdentityProvider().authenticate({
      kind: "callback",
      code,
      codeVerifier: stored.v,
      nonce: stored.n,
    });
    const userId = await upsertUserFromIdentity(identity);
    await createSession(userId, identity.tokens?.refreshToken);
    await analytics.track("login", { provider: identity.provider }, { userId });
    return redirectTo("/");
  } catch (err) {
    console.error("[auth] SSO callback failed", err);
    await audit({
      actorUserId: null,
      action: "auth.sso_failed",
      metadata: { reason: err instanceof Error ? err.message : "unknown" },
    });
    return redirectTo("/login?error=sso");
  }
}
