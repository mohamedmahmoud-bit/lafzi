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
 * Exchange + signing follow noonAcademy/synapse-starter INTEGRATE.md ("Citadel auth"):
 * - POST /api/oauth/token   body {"code"} → { token: { accessToken, refreshToken, type, expiresIn }, profile }
 * - POST /api/oauth/refresh body {"refreshToken"} → { accessToken, refreshToken } (single-use: overwrite both)
 * - x-citadel-signature: t=<unix seconds>,v1=hex(HMAC-SHA256(secret, `${t}.${pathAndSearch}.${rawBody}`))
 */
export type CitadelConfig = {
  baseUrl: string;
  appId: string;
  appSecret: string;
  redirectUri: string;
  /** Login audience sent as `userType` on the authorize URL (required when the app allows several). */
  userType?: string;
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

export class CitadelAuthError extends Error {
  /** Short code shown on the login page, e.g. "token_401", "not_student". */
  constructor(message: string, public code = "citadel_error") {
    super(message);
  }
}

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
      ...(this.cfg.userType ? { userType: this.cfg.userType } : {}),
    }).toString();
    // Citadel does not use PKCE/nonce; `state` (checked in the callback) prevents login CSRF.
    return { url: url.toString(), state, nonce: "", codeVerifier: "" };
  }

  /** Citadel request signature v1: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.path.rawBody">`. */
  sign(path: string, rawBody: string, now: number = Date.now()): string {
    const t = Math.floor(now / 1000).toString();
    const v1 = createHmac("sha256", this.cfg.appSecret).update(`${t}.${path}.${rawBody}`).digest("hex");
    return `t=${t},v1=${v1}`;
  }

  /** Signed JSON POST to a Citadel API path (e.g. "/api/oauth/token"). */
  protected async signedPost(path: string, payload: Record<string, string>): Promise<unknown> {
    const rawBody = JSON.stringify(payload);
    const res = await (this.cfg.fetchImpl ?? fetch)(this.url(path.replace(/^\//, "")), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-replit-app-id": this.cfg.appId,
        "x-citadel-signature": this.sign(path, rawBody),
      },
      body: rawBody,
      cache: "no-store",
    });
    const step = path.endsWith("/refresh") ? "refresh" : "token";
    if (!res.ok) {
      // Citadel's error text explains what it expected; it contains no secrets of ours.
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      throw new CitadelAuthError(`Citadel ${path} returned ${res.status}: ${detail}`, `${step}_${res.status}`);
    }
    return res.json().catch(() => {
      throw new CitadelAuthError(`Citadel ${path} returned non-JSON`, `${step}_not_json`);
    });
  }

  /** Accepts `{token:{accessToken,refreshToken}}` (noon2-core shape) or flat OAuth fields. */
  static extractTokens(json: unknown): NoonTokens {
    const j = (json ?? {}) as Record<string, unknown>;
    const t = (j.token && typeof j.token === "object" ? j.token : j) as Record<string, unknown>;
    const accessToken = (t.accessToken ?? t.access_token) as string | undefined;
    if (!accessToken) throw new CitadelAuthError(
        `Citadel response had no access token (keys: ${Object.keys(j).join(",")})`,
        "no_access_token",
      );
    const refreshToken = (t.refreshToken ?? t.refresh_token) as string | undefined;
    const expiresIn = Number(t.expiresIn ?? t.expires_in);
    let expiresAt: Date | undefined;
    if (Number.isFinite(expiresIn) && expiresIn > 0) expiresAt = new Date(Date.now() + expiresIn * 1000);
    else {
      try {
        const exp = decodeJwt(accessToken).exp;
        if (exp) expiresAt = new Date(exp * 1000);
      } catch {
        /* opaque token: no expiry info */
      }
    }
    return { accessToken, refreshToken, expiresAt };
  }

  /**
   * The student's FULL official name exactly as Noon provides it. Preference: an Arabic-script name
   * from any name field (nameAr, localized names…), then the longest name (fullName, or first +
   * middle + last joined), then `name`. We never transliterate, translate or invent a name.
   */
  static officialName(p: Record<string, unknown>): string {
    const arabic = /[\u0600-\u06FF]/;
    const clean = (v: string) => v.trim().replace(/\s+/g, " ");
    const candidates: string[] = [];
    const visit = (o: Record<string, unknown>, depth: number, inName: boolean) => {
      // Split names (firstName / middleName / lastName, also *Ar variants) → one full name per script.
      const parts = (suffix: string) =>
        ["first", "second", "middle", "third", "father", "grandfather", "last", "family"]
          .map((k) => Object.entries(o).find(([key, v]) => typeof v === "string" && new RegExp(`^${k}_?name${suffix}$`, "i").test(key))?.[1] as string | undefined)
          .filter((v): v is string => !!v && !!v.trim());
      for (const suffix of ["", "_?ar", "_?arabic"]) {
        const ps = parts(suffix);
        if (ps.length > 1) candidates.push(clean(ps.join(" ")));
      }
      for (const [k, v] of Object.entries(o)) {
        const nameKey = /name/i.test(k) && !/user_?name|nick/i.test(k);
        if (typeof v === "string" && (nameKey || inName) && v.trim()) candidates.push(clean(v));
        else if (v && typeof v === "object" && !Array.isArray(v) && depth < 2 && (nameKey || /local|transl/i.test(k))) visit(v as Record<string, unknown>, depth + 1, true);
      }
    };
    visit(p, 0, false);
    const words = (c: string) => c.split(" ").length;
    const longest = (cs: string[]) => cs.reduce<string | undefined>((best, c) => (!best || words(c) > words(best) ? c : best), undefined);
    return longest(candidates.filter((c) => arabic.test(c))) ?? longest(candidates.filter((c) => !c.includes("@"))) ?? clean(String(p.name ?? ""));
  }

  /** Field NAMES only (never values) — shows whether Noon offers a full or Arabic name field. */
  static logNameFields(where: string, p: Record<string, unknown>) {
    const nested = Object.entries(p)
      .filter(([, v]) => v && typeof v === "object" && !Array.isArray(v))
      .map(([k, v]) => `${k}{${Object.keys(v as object).join(",")}}`);
    console.info(`[citadel] ${where} fields:`, [...Object.keys(p), ...nested].join(","));
  }

  /** Profile returned next to the token: { id, name, avatarUri, locale, userType, account: { email } }. */
  static profileFromResponse(json: unknown): (NoonStudentProfile & { userType: string }) | null {
    const p = (json as { profile?: Record<string, unknown> } | null)?.profile;
    if (!p || p.id == null) return null;
    CitadelIdentityProvider.logNameFields("profile", p);
    return {
      noonStudentId: String(p.id),
      displayName: CitadelIdentityProvider.officialName(p) || "طالب نون",
      avatarUrl: typeof p.avatarUri === "string" ? p.avatarUri : null,
      grade: null,
      userType: typeof p.userType === "string" ? p.userType : "UNKNOWN",
    };
  }

  /**
   * Pick the student profile from the token. We keep only the profile id (stable Noon student id),
   * the official full name and avatar — never email, phone or account details.
   */
  static profileFromToken(accessToken: string): NoonStudentProfile & { userType: string } {
    const claims = decodeJwt(accessToken) as CoreJwt;
    if (claims.exp && claims.exp * 1000 < Date.now()) throw new CitadelAuthError("Token expired", "token_expired");
    const profiles = (claims.attributes?.profiles ?? []).filter(
      (p) => p.id != null && !p.isDeactivated && !p.isDeleted,
    );
    const profile = profiles.find((p) => p.userType === "STUDENT") ?? profiles[0];
    if (!profile) throw new CitadelAuthError("No active Noon profile in token", "no_profile");
    CitadelIdentityProvider.logNameFields("token profile", profile as unknown as Record<string, unknown>);
    return {
      noonStudentId: String(profile.id),
      displayName: CitadelIdentityProvider.officialName(profile as unknown as Record<string, unknown>) || "طالب نون",
      avatarUrl: profile.avatarUri ?? null,
      grade: null,
      userType: profile.userType ?? "UNKNOWN",
    };
  }

  async authenticate(input: AuthenticateInput): Promise<NoonIdentity> {
    if (input.kind !== "callback") throw new CitadelAuthError("Citadel expects a callback");
    const json = await this.signedPost("/api/oauth/token", { code: input.code });
    const tokens = CitadelIdentityProvider.extractTokens(json);
    const { userType, ...profile } =
      CitadelIdentityProvider.profileFromResponse(json) ?? CitadelIdentityProvider.profileFromToken(tokens.accessToken);
    const isAdmin = this.cfg.adminProfileIds.includes(profile.noonStudentId);
    if (userType !== "STUDENT" && !isAdmin) {
      throw new CitadelAuthError(`Profile type ${userType} is not allowed`, "not_student");
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
    return CitadelIdentityProvider.extractTokens(await this.signedPost("/api/oauth/refresh", { refreshToken }));
  }

  async getStudentProfile(tokens: NoonTokens): Promise<NoonStudentProfile> {
    const { userType: _userType, ...profile } = CitadelIdentityProvider.profileFromToken(
      tokens.accessToken,
    );
    return profile;
  }
}
