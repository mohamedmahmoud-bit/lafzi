import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "./env";

/** CSRF defence for non-Server-Action POST handlers: require a same-origin Origin header. */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set([req.nextUrl.origin, new URL(env().APP_URL).origin]);
  return allowed.has(origin);
}

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Redirect relative to the public app URL (correct behind ALB / CloudFront). */
export function redirectTo(path: string, status = 303) {
  return NextResponse.redirect(new URL(path, env().APP_URL), status);
}
