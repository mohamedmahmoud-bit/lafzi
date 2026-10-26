/** What we keep from Noon about a student. Deliberately minimal (no phone, email, etc.). */
export type NoonStudentProfile = {
  noonStudentId: string;
  displayName: string;
  grade?: string | null;
  avatarUrl?: string | null;
};

export type NoonTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
};

export type NoonIdentity = {
  provider: "mock" | "oidc" | "citadel";
  /** Stable subject at the provider. */
  subject: string;
  profile: NoonStudentProfile;
  role: "student" | "admin";
  tokens?: NoonTokens;
};

export type AuthorizationRequest = {
  url: string;
  state: string;
  nonce: string;
  codeVerifier: string;
};

export type AuthenticateInput =
  | { kind: "mock"; persona: string }
  | { kind: "callback"; code: string; codeVerifier: string; nonce: string };

/**
 * Pluggable identity provider. Implementations: `mock` (development only) and `oidc`
 * (standard OpenID Connect). Add an adapter here if Noon exposes a different mechanism
 * (e.g. internal token exchange or in-app SSO handoff). [NOON-REQUIRED]
 */
export interface NoonIdentityProvider {
  readonly id: "mock" | "oidc" | "citadel";
  /** Redirect-based providers return where to send the browser; mock returns null. */
  getAuthorizationRequest(): Promise<AuthorizationRequest | null>;
  authenticate(input: AuthenticateInput): Promise<NoonIdentity>;
  refreshToken(refreshToken: string): Promise<NoonTokens>;
  getStudentProfile(tokens: NoonTokens): Promise<NoonStudentProfile>;
}
