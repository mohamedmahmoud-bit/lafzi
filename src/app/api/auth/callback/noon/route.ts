import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { analytics } from "@/features/analytics/analytics";
import { getIdentityProvider } from "@/features/auth/providers";
import { createSession } from "@/features/auth/session";
import { upsertUserFromIdentity } from "@/features/auth/users";
import { audit } from "@/features/admin/audit";
import { redirectTo } from "@/lib/request";

const OIDC_COOKIE = "lafzi_oidc";

/** Short, secret-free failure code shown on /login and logged, so a failed sign-in is diagnosable. */
function fail(reason: string, detail: Record<string, unknown> = {}) {
  console.error(`[auth] SSO callback failed: ${reason}`, JSON.stringify(detail));
  return redirectTo(`/login?error=sso&reason=${encodeURIComponent(reason)}`);
}

/** OAuth 2.0 / OIDC / Citadel redirect URI (NOON_AUTH_REDIRECT_URI). */
export async function GET(req: NextRequest) {
  const jar = await cookies();
  const raw = jar.get(OIDC_COOKIE)?.value;
  jar.delete({ name: OIDC_COOKIE, path: "/api/auth/callback" });

  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  // Names only — never values (they may carry codes or tokens).
  const received = [...params.keys()];
  if (params.get("error")) return fail(`provider_${params.get("error")}`.slice(0, 60), { received });
  if (!code) return fail("no_code", { received });
  if (!state) return fail("no_state", { received });
  if (!raw) return fail("no_cookie", { received });

  let stored: { s: string; n: string; v: string };
  try {
    stored = JSON.parse(raw);
  } catch {
    return fail("bad_cookie");
  }
  if (stored.s !== state) return fail("state_mismatch");

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
    const reason = (err as { code?: string }).code ?? "exchange_failed";
    const message = err instanceof Error ? err.message : "unknown";
    await audit({ actorUserId: null, action: "auth.sso_failed", metadata: { reason, message } }).catch(() => {});
    return fail(reason, { message });
  }
}
