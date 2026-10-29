import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/login", "/api/auth", "/api/health", "/dev/noon-placeholder"];

/**
 * Optimistic gate only: redirects visitors without a session cookie to /login.
 * Real authorization (valid session, role) happens in the Data Access Layer on every request.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)))
    return NextResponse.next();
  const hasSession = req.cookies.has("__Host-lafzi_session") || req.cookies.has("lafzi_session");
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|brand/|favicon.ico|robots.txt).*)"],
};
