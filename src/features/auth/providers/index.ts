import "server-only";
import { env } from "@/lib/env";
import { CitadelIdentityProvider } from "./citadel";
import { MockIdentityProvider } from "./mock";
import { OidcIdentityProvider } from "./oidc";
import type { NoonIdentityProvider } from "./types";

let provider: NoonIdentityProvider | undefined;

export function getIdentityProvider(): NoonIdentityProvider {
  if (provider) return provider;
  const e = env();
  if (e.AUTH_PROVIDER === "mock") {
    if (e.NODE_ENV === "production") {
      throw new Error("AUTH_PROVIDER=mock is not allowed in production. Configure real Noon SSO.");
    }
    provider = new MockIdentityProvider();
  } else if (e.AUTH_PROVIDER === "citadel") {
    if (!e.SYNAPSE_APP_ID || !e.SYNAPSE_APP_SECRET || !e.NOON_AUTH_REDIRECT_URI) {
      throw new Error(
        "AUTH_PROVIDER=citadel requires SYNAPSE_APP_ID, SYNAPSE_APP_SECRET and NOON_AUTH_REDIRECT_URI",
      );
    }
    provider = new CitadelIdentityProvider({
      baseUrl: e.SYNAPSE_BASE_URL,
      appId: e.SYNAPSE_APP_ID,
      appSecret: e.SYNAPSE_APP_SECRET,
      redirectUri: e.NOON_AUTH_REDIRECT_URI,
      userType: e.CITADEL_USER_TYPE || undefined,
      adminProfileIds: e.ADMIN_NOON_STUDENT_IDS.split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  } else {
    if (!e.NOON_AUTH_ISSUER || !e.NOON_AUTH_CLIENT_ID || !e.NOON_AUTH_REDIRECT_URI) {
      throw new Error(
        "AUTH_PROVIDER=oidc requires NOON_AUTH_ISSUER, NOON_AUTH_CLIENT_ID, NOON_AUTH_REDIRECT_URI",
      );
    }
    provider = new OidcIdentityProvider({
      issuer: e.NOON_AUTH_ISSUER,
      clientId: e.NOON_AUTH_CLIENT_ID,
      clientSecret: e.NOON_AUTH_CLIENT_SECRET,
      redirectUri: e.NOON_AUTH_REDIRECT_URI,
      scopes: e.NOON_AUTH_SCOPES,
      studentIdClaim: e.NOON_AUTH_STUDENT_ID_CLAIM,
      nameClaim: e.NOON_AUTH_NAME_CLAIM,
      adminStudentIds: e.ADMIN_NOON_STUDENT_IDS.split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  }
  return provider;
}

export function isMockAuth(): boolean {
  return env().AUTH_PROVIDER === "mock" && env().NODE_ENV !== "production";
}
