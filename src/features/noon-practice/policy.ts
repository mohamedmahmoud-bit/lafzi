/**
 * Pure safety + selection rules for Noon practice destinations. No I/O; unit-tested.
 * A destination is served only if it is on the allowlist, carries no credentials/PII,
 * is verified, not expired, and matches the student's platform.
 */

export type DestinationKind = "skill_practice" | "heatmap" | "general_practice";
export type Platform = "web" | "mobile_web" | "app";
export const VERIFICATION_SCENARIOS = [
  "desktop_authenticated",
  "desktop_unauthenticated",
  "mobile_web",
  "mobile_app",
  "student_without_course",
  "expired_session",
] as const;
export type VerificationScenario = (typeof VERIFICATION_SCENARIOS)[number];

export const SCENARIO_LABELS: Record<VerificationScenario, string> = {
  desktop_authenticated: "Desktop · signed-in student",
  desktop_unauthenticated: "Desktop · signed out",
  mobile_web: "Mobile browser",
  mobile_app: "Noon mobile app",
  student_without_course: "Student not enrolled in the course",
  expired_session: "Expired Noon session",
};

/** Hosts that must never receive students, even if someone adds them to the allowlist. */
const BLOCKED_HOSTS = new Set(["school.noonacademy.com"]);
const BLOCKED_LABEL = /(^|\.)(teacher|teachers|admin|presenter|citadel|internal|ops)(\.|-)/i;
const BLOCKED_PATH = /\/(teacher|admin|presenter|internal|ops)(\/|$)/i;
/** Query/fragment keys that could carry credentials or personal data. */
const SENSITIVE_KEY = /(token|access|refresh|session|secret|password|passwd|auth|code|otp|email|phone|mobile|msisdn|student_?id|user_?id|uid|national|name)/i;
const APP_SCHEMES = new Set(["noon2:"]);

export type UrlCheck = { ok: true; platform: Platform | "any" } | { ok: false; reason: string };

export function checkDestinationUrl(raw: string, allowedHosts: string[]): UrlCheck {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: "Not an absolute URL" };
  }
  if (u.username || u.password) return { ok: false, reason: "Credentials in URL" };
  for (const k of u.searchParams.keys()) {
    if (SENSITIVE_KEY.test(k)) return { ok: false, reason: `Sensitive query parameter "${k}"` };
  }
  if (u.hash && SENSITIVE_KEY.test(u.hash)) return { ok: false, reason: "Sensitive data in fragment" };
  if (APP_SCHEMES.has(u.protocol)) {
    return BLOCKED_PATH.test(`/${u.host}${u.pathname}`) ? { ok: false, reason: "Blocked path" } : { ok: true, platform: "app" };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "Only https:// (or the Noon app scheme) is allowed" };
  const host = u.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host) || BLOCKED_LABEL.test(host)) return { ok: false, reason: `Blocked host ${host} (teacher/admin/internal)` };
  if (!allowedHosts.map((h) => h.toLowerCase()).includes(host)) return { ok: false, reason: `Host ${host} is not on the approved Noon allowlist` };
  if (BLOCKED_PATH.test(u.pathname)) return { ok: false, reason: "Teacher/admin paths are never allowed" };
  return { ok: true, platform: "any" };
}

export type VerificationEntry = { scenario: string; result: string; createdAt: Date };

/**
 * Derived status from the verification log. "verified" requires a pass for a signed-in desktop
 * student and no failure recorded after it (any scenario).
 */
export function computeVerificationStatus(log: VerificationEntry[]): "verified" | "failed" | "unverified" {
  const sorted = [...log].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const lastPass = sorted.filter((e) => e.scenario === "desktop_authenticated" && e.result === "pass").at(-1);
  const lastFail = sorted.filter((e) => e.result === "fail").at(-1);
  if (lastFail && (!lastPass || lastFail.createdAt >= lastPass.createdAt)) return "failed";
  return lastPass ? "verified" : "unverified";
}

export type DestinationRow = {
  id: string;
  kind: string;
  url: string;
  platform: string;
  verificationStatus: string;
  verifiedAt: Date | null;
  expiresAt: Date | null;
  mappingId: string | null;
};

export type PracticeDestination = {
  destinationId: string;
  url: string;
  type: DestinationKind;
  verificationStatus: "verified";
  platform: string;
  verifiedAt: Date | null;
  expiresAt: Date | null;
};

/** Pick the best usable destination of one kind. */
export function pickDestination(
  rows: DestinationRow[],
  p: { kind: DestinationKind; mappingIds?: (string | null)[]; platform: Platform; now: Date; allowedHosts: string[] },
): PracticeDestination | null {
  const ok = rows.filter((r) => {
    if (r.kind !== p.kind || r.verificationStatus !== "verified") return false;
    if (r.expiresAt && r.expiresAt <= p.now) return false;
    if (p.mappingIds && !p.mappingIds.includes(r.mappingId)) return false;
    const check = checkDestinationUrl(r.url, p.allowedHosts);
    if (!check.ok) return false;
    if (check.platform === "app" && p.platform !== "app") return false;
    return r.platform === "any" || r.platform === p.platform;
  });
  // Prefer the most specific mapping order given, then the most recently verified.
  ok.sort((a, b) => {
    const ia = p.mappingIds ? p.mappingIds.indexOf(a.mappingId) : 0;
    const ib = p.mappingIds ? p.mappingIds.indexOf(b.mappingId) : 0;
    return ia - ib || (b.verifiedAt?.getTime() ?? 0) - (a.verifiedAt?.getTime() ?? 0);
  });
  const r = ok[0];
  return r
    ? { destinationId: r.id, url: r.url, type: p.kind, verificationStatus: "verified", platform: r.platform, verifiedAt: r.verifiedAt, expiresAt: r.expiresAt }
    : null;
}

export function platformFromUserAgent(ua: string | null): Platform {
  return ua && /Android|iPhone|iPad|Mobile/i.test(ua) ? "mobile_web" : "web";
}
