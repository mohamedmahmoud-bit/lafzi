import { createHmac } from "node:crypto";
import { decodeJwt } from "jose";
import { randomToken } from "@/lib/crypto";
import type {
  AuthenticateInput,
  AuthorizationRequest,
  NoonIdentity,
  NoonIdentityProvider,
  NoonStudentProfile,
  NoonTokens,
} from "./types";

/**
 * Noon Citadel sign-in (Noon's internal OAuth service used by Noon-built apps).
 *
 * Confirmed from Noon's #ai-support / #citadel-scrum threads:
 * - Authorize: {base}/portal/oauth/authorize?app_id&redirect_uri&response_type=code&state
 * - Token:     POST {base}/api/oauth/token
 * - App credentials: SYNAPSE_APP_ID, SYNAPSE_APP_SECRET, SYNAPSE_BASE_URL (per-app, from the
 *   Citadel portal → Replit apps; set "Student" as the allowed role)
 * - The redirect URI must match the registered one exactly; one URI per app, so dev and prod use
 *   separate Citadel apps (dev → Citadel dev, prod → Citadel prod).
 * - Identity lives in the noon2-core JWT at `token.accessToken`:
 *   attributes.account.{id,email,…}, attributes.profiles[].{id,name,userType,avatarUri,…}
 * - Server-to-server Citadel calls are HMAC-SHA256 signed with `x-replit-app-id` +
 *   `x-citadel-signature` headers.
 *
 * NOT confirmed (documented in Noon's "Replit — Start a New App" Notion guide): the exact token
 * request body and what the signature covers. Both live only in `tokenRequest()` below.
 */
export type CitadelConfig = {
  baseUrl: string;
  appId: string;
  appSecret: string;
  redirectUri: string;
  adminProfileIds: string[];
  fetchImpl?: typeof fetch;
};

type CoreJwt = {
  exp?: number;
  attributes?: {
    account?: { id?: number | string };
    profiles?: {
      id?: number | string;
      name?: string;
      userType?: string;
      avatarUri?: string;
      isDeactivated?: boolean;
      isDeleted?: boolean;
    }[];
  };
};

export class CitadelAuthError extends Error {}

export class CitadelIdentityProvider implements NoonIdentityProvider {
  readonly id = "citadel" as const;
  constructor(private readonly cfg: CitadelConfig) {}

  private url(path: string) {
    return new URL(path, this.cfg.baseUrl.replace(/\/?$/, "/")).toString();
  }

  async getAuthorizationRequest(): Promise<AuthorizationRequest> {
    const state = randomToken(24);
    const url = new URL(this.url("portal/oauth/authorize"));
    url.search = new URLSearchParams({
      app_id: this.cfg.appId,
      redirect_uri: this.cfg.redirectUri,
      response_type: "code",
      state,
    }).toString();
    // Citadel does not use PKCE/nonce; `state` (checked in the callback) prevents login CSRF.
    return { url: url.toString(), state, nonce: "", codeVerifier: "" };
  }

  /** HMAC-SHA256 over the raw request body with the app secret. [CONFIRM against Noon guide] */
  sign(body: string): string {
    return createHmac("sha256", this.cfg.appSecret).update(body).digest("hex");
  }

  /** The single place that knows the token request format. [CONFIRM against Noon guide] */
  protected async tokenRequest(params: Record<string, string>): Promise<unknown> {
    const body = JSON.stringify({ app_id: this.cfg.appId, ...params });
    const res = await (this.cfg.fetchImpl ?? fetch)(this.url("api/oauth/token"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-replit-app-id": this.cfg.appId,
        "x-citadel-signature": this.sign(body),
      },
      body,
      cache: "no-store",
    });
    if (!res.ok) throw new CitadelAuthError(`Citadel token endpoint returned ${res.status}`);
    return res.json();
  }

  /** Accepts `{token:{accessToken,refreshToken}}` (noon2-core shape) or flat OAuth fields. */
  static extractTokens(json: unknown): NoonTokens {
    const j = (json ?? {}) as Record<string, unknown>;
    const t = (j.token && typeof j.token === "object" ? j.token : j) as Record<string, unknown>;
    const accessToken = (t.accessToken ?? t.access_token) as string | undefined;
    if (!accessToken) throw new CitadelAuthError("Citadel response had no access token");
    const refreshToken = (t.refreshToken ?? t.refresh_token) as string | undefined;
    const exp = decodeJwt(accessToken).exp;
    return { accessToken, refreshToken, expiresAt: exp ? new Date(exp * 1000) : undefined };
  }

  /**
   * Pick the student profile from the token. We keep only the profile id (stable Noon student id),
   * first name and avatar — never email, phone or account details.
   */
  static profileFromToken(accessToken: string): NoonStudentProfile & { userType: string } {
    const claims = decodeJwt(accessToken) as CoreJwt;
    if (claims.exp && claims.exp * 1000 < Date.now()) throw new CitadelAuthError("Token expired");
    const profiles = (claims.attributes?.profiles ?? []).filter(
      (p) => p.id != null && !p.isDeactivated && !p.isDeleted,
    );
    const profile = profiles.find((p) => p.userType === "STUDENT") ?? profiles[0];
    if (!profile) throw new CitadelAuthError("No active Noon profile in token");
    const firstName = (profile.name ?? "").trim().split(/\s+/)[0];
    return {
      noonStudentId: String(profile.id),
      displayName: firstName || "طالب نون",
      avatarUrl: profile.avatarUri ?? null,
      grade: null,
      userType: profile.userType ?? "UNKNOWN",
    };
  }

  async authenticate(input: AuthenticateInput): Promise<NoonIdentity> {
    if (input.kind !== "callback") throw new CitadelAuthError("Citadel expects a callback");
    const tokens = CitadelIdentityProvider.extractTokens(
      await this.tokenRequest({
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: this.cfg.redirectUri,
      }),
    );
    const { userType, ...profile } = CitadelIdentityProvider.profileFromToken(tokens.accessToken);
    const isAdmin = this.cfg.adminProfileIds.includes(profile.noonStudentId);
    if (userType !== "STUDENT" && !isAdmin) {
      throw new CitadelAuthError(`Profile type ${userType} is not allowed`);
    }
    return {
      provider: "citadel",
      subject: profile.noonStudentId,
      profile,
      role: isAdmin ? "admin" : "student",
      tokens,
    };
  }

  async refreshToken(refreshToken: string): Promise<NoonTokens> {
    return CitadelIdentityProvider.extractTokens(
      await this.tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }),
    );
  }

  async getStudentProfile(tokens: NoonTokens): Promise<NoonStudentProfile> {
    const { userType: _userType, ...profile } = CitadelIdentityProvider.profileFromToken(
      tokens.accessToken,
    );
    return profile;
  }
}
