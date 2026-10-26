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

  it("exchanges the code with an HMAC-signed request and maps the student profile", async () => {
    const { p, fetchImpl } = provider({
      type: "login",
      token: { accessToken: jwt([student]), refreshToken: "r1" },
    });
    const id = await p.authenticate(callback);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://citadel.studyatnoon.com/api/oauth/token");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-replit-app-id"]).toBe("app-123");
    expect(headers["x-citadel-signature"]).toBe(
      createHmac("sha256", "s3cret").update(String(init.body)).digest("hex"),
    );
    expect(JSON.parse(String(init.body))).toMatchObject({
      app_id: "app-123",
      code: "abc",
      grant_type: "authorization_code",
    });

    expect(id).toMatchObject({ provider: "citadel", subject: "636699", role: "student" });
    expect(id.profile).toEqual({
      noonStudentId: "636699",
      displayName: "سارة",
      avatarUrl: "https://cdn/a.png",
      grade: null,
    });
    expect(JSON.stringify(id.profile)).not.toMatch(/email|phone|studyatnoon/);
    expect(id.tokens?.refreshToken).toBe("r1");
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
    await expect(provider({ error: "bad" }, 401).p.authenticate(callback)).rejects.toThrow(/401/);
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
