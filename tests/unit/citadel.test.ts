import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { CitadelAuthError, CitadelIdentityProvider } from "@/features/auth/providers/citadel";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
/** Unsigned noon2-core-shaped JWT (decoding only; signature not checked by the provider). */
const jwt = (profiles: unknown[], exp = Math.floor(Date.now() / 1000) + 600) =>
  `${b64({ alg: "RS256" })}.${b64({ exp, attributes: { account: { id: 581842, email: "s@studyatnoon.com", phone: "+966…" }, profiles } })}.sig`;

const student = {
  id: 636699,
  name: "سارة محمد العتيبي",
  userType: "STUDENT",
  avatarUri: "https://cdn/a.png",
};

function provider(json: unknown, status = 200, admin: string[] = []) {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify(json), { status }));
  const p = new CitadelIdentityProvider({
    baseUrl: "https://citadel.studyatnoon.com",
    appId: "app-123",
    appSecret: "s3cret",
    redirectUri: "https://lafzi.example/api/auth/callback/noon",
    adminProfileIds: admin,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { p, fetchImpl };
}
const callback = { kind: "callback" as const, code: "abc", codeVerifier: "", nonce: "" };

describe("Citadel sign-in", () => {
  it("builds the Citadel authorize URL with the exact registered redirect URI", async () => {
    const { p } = provider({});
    const req = await p.getAuthorizationRequest();
    const url = new URL(req.url);
    expect(url.origin + url.pathname).toBe(
      "https://citadel.studyatnoon.com/portal/oauth/authorize",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      app_id: "app-123",
      redirect_uri: "https://lafzi.example/api/auth/callback/noon",
      response_type: "code",
      state: req.state,
    });
    expect(req.state.length).toBeGreaterThan(20);
  });

  it("exchanges the code per Citadel's spec: {code} body + t/v1 signature over t.path.body", async () => {
    const { p, fetchImpl } = provider({ type: "login", token: { accessToken: jwt([student]), refreshToken: "r1", type: "Bearer", expiresIn: 600 } });
    const before = Math.floor(Date.now() / 1000);
    const id = await p.authenticate(callback);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://citadel.studyatnoon.com/api/oauth/token");
    expect(init.body).toBe(JSON.stringify({ code: "abc" }));
    const headers = init.headers as Record<string, string>;
    expect(headers["x-replit-app-id"]).toBe("app-123");
    expect(headers["content-type"]).toBe("application/json");
    const m = headers["x-citadel-signature"].match(/^t=(\d+),v1=([0-9a-f]{64})$/)!;
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBeGreaterThanOrEqual(before); // seconds, not ms
    expect(Number(m[1])).toBeLessThan(before + 5);
    expect(m[2]).toBe(createHmac("sha256", "s3cret").update(`${m[1]}./api/oauth/token.${init.body}`).digest("hex"));

    expect(id).toMatchObject({ provider: "citadel", subject: "636699", role: "student" });
    expect(id.profile).toEqual({ noonStudentId: "636699", displayName: "سارة", avatarUrl: "https://cdn/a.png", grade: null });
    expect(JSON.stringify(id.profile)).not.toMatch(/email|phone|studyatnoon/);
    expect(id.tokens?.refreshToken).toBe("r1");
    expect(id.tokens?.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 590_000);
  });

  it("uses the profile Citadel returns next to the token (works with opaque tokens)", async () => {
    const { p } = provider({
      token: { accessToken: "opaque-token", refreshToken: "r", expiresIn: 600 },
      profile: { id: 9001, name: "ليان أحمد", userType: "STUDENT", avatarUri: null, account: { email: "x@y" } },
    });
    const id = await p.authenticate(callback);
    expect(id.profile).toMatchObject({ noonStudentId: "9001", displayName: "ليان" });
  });

  it("refreshes via /api/oauth/refresh with a camelCase refreshToken body", async () => {
    const { p, fetchImpl } = provider({ accessToken: jwt([student]), refreshToken: "r2" });
    const t = await p.refreshToken("r1");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://citadel.studyatnoon.com/api/oauth/refresh");
    expect(init.body).toBe(JSON.stringify({ refreshToken: "r1" }));
    const sig = (init.headers as Record<string, string>)["x-citadel-signature"];
    const [, ts, v1] = sig.match(/^t=(\d+),v1=(\w+)$/)!;
    expect(v1).toBe(createHmac("sha256", "s3cret").update(`${ts}./api/oauth/refresh.${init.body}`).digest("hex"));
    expect(t.refreshToken).toBe("r2");
  });

  it("prefers the STUDENT profile when an account has several", async () => {
    const { p } = provider({
      token: { accessToken: jwt([{ id: 1, name: "Parent", userType: "PARENT" }, student]) },
    });
    expect((await p.authenticate(callback)).subject).toBe("636699");
  });

  it("rejects non-student accounts unless allow-listed as admins", async () => {
    const teacher = { id: 77, name: "Teacher", userType: "TEACHER" };
    await expect(
      provider({ token: { accessToken: jwt([teacher]) } }).p.authenticate(callback),
    ).rejects.toBeInstanceOf(CitadelAuthError);
    const admin = await provider({ token: { accessToken: jwt([teacher]) } }, 200, [
      "77",
    ]).p.authenticate(callback);
    expect(admin.role).toBe("admin");
  });

  it("fails closed on errors, missing tokens, expired tokens and deactivated profiles", async () => {
    await expect(provider({ error: "bad" }, 401).p.authenticate(callback)).rejects.toMatchObject({ code: "token_401" });
    await expect(provider({ token: {} }).p.authenticate(callback)).rejects.toThrow(
      /no access token/,
    );
    await expect(
      provider({ token: { accessToken: jwt([student], 1000) } }).p.authenticate(callback),
    ).rejects.toThrow(/expired/);
    await expect(
      provider({
        token: { accessToken: jwt([{ ...student, isDeactivated: true }]) },
      }).p.authenticate(callback),
    ).rejects.toThrow(/No active/);
  });

  it("also accepts flat OAuth-style token responses", () => {
    expect(
      CitadelIdentityProvider.extractTokens({ access_token: jwt([student]), refresh_token: "r" })
        .refreshToken,
    ).toBe("r");
  });
});
