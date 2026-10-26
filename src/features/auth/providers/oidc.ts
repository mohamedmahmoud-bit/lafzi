import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { randomToken } from "@/lib/crypto";
import type {
  AuthenticateInput,
  AuthorizationRequest,
  NoonIdentity,
  NoonIdentityProvider,
  NoonStudentProfile,
  NoonTokens,
} from "./types";

export type OidcConfig = {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scopes: string;
  studentIdClaim: string;
  nameClaim: string;
  adminStudentIds: string[];
};

type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
};

/**
 * Standard OpenID Connect (authorization code + PKCE S256 + nonce). Uses only the public
 * discovery document — no Noon-specific endpoints are assumed. Valid only if Noon exposes OIDC;
 * claim names are configurable because Noon's claim layout is unknown. [NOON-REQUIRED]
 */
export class OidcIdentityProvider implements NoonIdentityProvider {
  readonly id = "oidc" as const;
  private discovery?: Promise<Discovery>;
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly cfg: OidcConfig) {}

  private async discover(): Promise<Discovery> {
    this.discovery ??= fetch(
      new URL(".well-known/openid-configuration", this.cfg.issuer.replace(/\/?$/, "/")),
      { cache: "no-store" },
    ).then(async (r) => {
      if (!r.ok) throw new Error(`OIDC discovery failed (${r.status})`);
      return (await r.json()) as Discovery;
    });
    return this.discovery;
  }

  async getAuthorizationRequest(): Promise<AuthorizationRequest> {
    const d = await this.discover();
    const state = randomToken(24);
    const nonce = randomToken(24);
    const codeVerifier = randomToken(48);
    const challenge = createHash("sha256").update(codeVerifier).digest("base64url");
    const url = new URL(d.authorization_endpoint);
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: this.cfg.clientId,
      redirect_uri: this.cfg.redirectUri,
      scope: this.cfg.scopes,
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();
    return { url: url.toString(), state, nonce, codeVerifier };
  }

  private async tokenRequest(params: Record<string, string>) {
    const d = await this.discover();
    const body = new URLSearchParams({ client_id: this.cfg.clientId, ...params });
    if (this.cfg.clientSecret) body.set("client_secret", this.cfg.clientSecret);
    const res = await fetch(d.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Token endpoint error (${res.status})`);
    return (await res.json()) as {
      access_token: string;
      id_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
  }

  private toTokens(t: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  }): NoonTokens {
    return {
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : undefined,
    };
  }

  async authenticate(input: AuthenticateInput): Promise<NoonIdentity> {
    if (input.kind !== "callback") throw new Error("OIDC expects a callback");
    const d = await this.discover();
    const t = await this.tokenRequest({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: this.cfg.redirectUri,
      code_verifier: input.codeVerifier,
    });
    if (!t.id_token) throw new Error("No id_token returned");
    this.jwks ??= createRemoteJWKSet(new URL(d.jwks_uri));
    const { payload } = await jwtVerify(t.id_token, this.jwks, {
      issuer: d.issuer,
      audience: this.cfg.clientId,
    });
    if (payload.nonce !== input.nonce) throw new Error("Nonce mismatch");
    const profile = this.profileFromClaims(payload);
    return {
      provider: "oidc",
      subject: String(payload.sub),
      profile,
      role: this.cfg.adminStudentIds.includes(profile.noonStudentId) ? "admin" : "student",
      tokens: this.toTokens(t),
    };
  }

  private profileFromClaims(claims: JWTPayload): NoonStudentProfile {
    const id = claims[this.cfg.studentIdClaim];
    if (typeof id !== "string" && typeof id !== "number") {
      throw new Error(`Missing student id claim "${this.cfg.studentIdClaim}"`);
    }
    const name = claims[this.cfg.nameClaim];
    return {
      noonStudentId: String(id),
      displayName: typeof name === "string" && name.trim() ? name : "طالب نون",
    };
  }

  async refreshToken(refreshToken: string): Promise<NoonTokens> {
    return this.toTokens(
      await this.tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }),
    );
  }

  async getStudentProfile(tokens: NoonTokens): Promise<NoonStudentProfile> {
    const d = await this.discover();
    if (!d.userinfo_endpoint) throw new Error("Provider has no userinfo endpoint");
    const res = await fetch(d.userinfo_endpoint, {
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`userinfo error (${res.status})`);
    return this.profileFromClaims((await res.json()) as JWTPayload);
  }
}
