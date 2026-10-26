import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { analytics } from "@/features/analytics/analytics";
import { getIdentityProvider } from "@/features/auth/providers";
import { createSession } from "@/features/auth/session";
import { upsertUserFromIdentity } from "@/features/auth/users";
import { isProduction } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp, isSameOrigin, redirectTo } from "@/lib/request";

const OIDC_COOKIE = "lafzi_oidc";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return new Response("Forbidden", { status: 403 });
  if (!(await rateLimit(`login:${clientIp(req)}`, 20, 60))) return redirectTo("/login?error=rate");

  const provider = getIdentityProvider();
  const authRequest = await provider.getAuthorizationRequest();

  if (authRequest) {
    // Redirect-based SSO (OIDC): stash state/nonce/PKCE verifier in a short-lived httpOnly cookie.
    (await cookies()).set(
      OIDC_COOKIE,
      JSON.stringify({ s: authRequest.state, n: authRequest.nonce, v: authRequest.codeVerifier }),
      {
        httpOnly: true,
        secure: isProduction(),
        sameSite: "lax",
        path: "/api/auth/callback",
        maxAge: 600,
      },
    );
    return redirectTo(authRequest.url);
  }

  // Development mock login.
  const form = await req.formData();
  const persona = z.string().max(40).safeParse(form.get("persona"));
  if (!persona.success) return redirectTo("/login?error=invalid");
  try {
    const identity = await provider.authenticate({ kind: "mock", persona: persona.data });
    const userId = await upsertUserFromIdentity(identity);
    await createSession(userId);
    await analytics.track("login", { provider: identity.provider }, { userId });
    return redirectTo(identity.role === "admin" ? "/admin" : "/");
  } catch {
    return redirectTo("/login?error=invalid");
  }
}
