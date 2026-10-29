import { describe, expect, it } from "vitest";
import { checkDestinationUrl, computeVerificationStatus, pickDestination, platformFromUserAgent, type DestinationRow } from "@/features/noon-practice/policy";

const HOSTS = ["student.noonacademy.com", "student.noon.edu.sa", "student.school.studyatnoon.com"];

describe("destination allowlist", () => {
  it("accepts documented student hosts over https", () => {
    expect(checkDestinationUrl("https://student.noonacademy.com/course/123", HOSTS).ok).toBe(true);
    expect(checkDestinationUrl("https://student.school.studyatnoon.com/links/agenda", HOSTS).ok).toBe(true);
  });
  it("blocks teacher/admin/citadel hosts and paths, even if allow-listed by mistake", () => {
    for (const u of ["https://teacher.noonacademy.com/x", "https://admin.noonacademy.com/x", "https://citadel.studyatnoon.com/x", "https://school.noonacademy.com/x", "https://presenter.noonacademy.com/x"]) {
      expect(checkDestinationUrl(u, [...HOSTS, new URL(u).hostname]).ok).toBe(false);
    }
    expect(checkDestinationUrl("https://student.noonacademy.com/admin/panel", HOSTS).ok).toBe(false);
  });
  it("blocks unknown hosts, http, credentials and PII in the URL", () => {
    expect(checkDestinationUrl("https://evil.example.com/", HOSTS).ok).toBe(false);
    expect(checkDestinationUrl("http://student.noonacademy.com/", HOSTS).ok).toBe(false);
    expect(checkDestinationUrl("https://u:p@student.noonacademy.com/", HOSTS).ok).toBe(false);
    for (const k of ["token", "access_token", "email", "phone", "studentId", "user_id", "session"]) {
      expect(checkDestinationUrl(`https://student.noonacademy.com/course/1?${k}=x`, HOSTS).ok).toBe(false);
    }
    expect(checkDestinationUrl("https://student.noonacademy.com/x#access_token=abc", HOSTS).ok).toBe(false);
  });
  it("app scheme is app-only", () => {
    expect(checkDestinationUrl("noon2://assessment/PRAASS_1", HOSTS)).toEqual({ ok: true, platform: "app" });
  });
});

describe("verification status", () => {
  const t = (m: number) => new Date(2026, 9, 1, 0, m);
  it("requires a signed-in desktop pass", () => {
    expect(computeVerificationStatus([])).toBe("unverified");
    expect(computeVerificationStatus([{ scenario: "mobile_web", result: "pass", createdAt: t(1) }])).toBe("unverified");
    expect(computeVerificationStatus([{ scenario: "desktop_authenticated", result: "pass", createdAt: t(1) }])).toBe("verified");
  });
  it("a later failure in any scenario revokes it; a newer pass restores it", () => {
    const log = [
      { scenario: "desktop_authenticated", result: "pass", createdAt: t(1) },
      { scenario: "expired_session", result: "fail", createdAt: t(2) },
    ];
    expect(computeVerificationStatus(log)).toBe("failed");
    expect(computeVerificationStatus([...log, { scenario: "desktop_authenticated", result: "pass", createdAt: t(3) }])).toBe("verified");
  });
});

describe("pickDestination", () => {
  const now = new Date("2026-10-29T00:00:00Z");
  const row = (p: Partial<DestinationRow>): DestinationRow => ({
    id: "d", kind: "skill_practice", url: "https://student.noonacademy.com/course/1", platform: "web",
    verificationStatus: "verified", verifiedAt: now, expiresAt: null, mappingId: "m1", ...p,
  });
  const pick = (rows: DestinationRow[], extra: Partial<Parameters<typeof pickDestination>[1]> = {}) =>
    pickDestination(rows, { kind: "skill_practice", mappingIds: ["m1", "m0"], platform: "web", now, allowedHosts: HOSTS, ...extra });

  it("never returns unverified, expired, off-allowlist or wrong-platform rows", () => {
    expect(pick([row({ verificationStatus: "unverified" })])).toBeNull();
    expect(pick([row({ expiresAt: new Date("2026-01-01") })])).toBeNull();
    expect(pick([row({ url: "https://evil.example.com/" })])).toBeNull();
    expect(pick([row({ platform: "mobile_web" })])).toBeNull();
    expect(pick([row({ platform: "any" })])?.destinationId).toBe("d");
  });
  it("prefers the subskill mapping over the topic-level one", () => {
    const r = pick([row({ id: "topic", mappingId: "m0" }), row({ id: "skill", mappingId: "m1" })]);
    expect(r?.destinationId).toBe("skill");
    expect(r?.verificationStatus).toBe("verified");
  });
  it("detects mobile browsers", () => {
    expect(platformFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe("mobile_web");
    expect(platformFromUserAgent("Mozilla/5.0 (Macintosh)")).toBe("web");
  });
});
