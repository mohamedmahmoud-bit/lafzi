import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { authSessions } from "@/db/schema";
import { encryptSecret, randomToken, sha256 } from "@/lib/crypto";
import { isProduction } from "@/lib/env";

const SESSION_TTL_DAYS = 30;

/** `__Host-` prefix in production: Secure, path=/, no Domain — prevents subdomain overrides. */
export const sessionCookieName = () => (isProduction() ? "__Host-lafzi_session" : "lafzi_session");

/**
 * Opaque, DB-backed sessions: the cookie holds a random token; the DB stores only its SHA-256.
 * Sessions are revocable server-side (logout, admin action).
 */
export async function createSession(userId: string, refreshToken?: string) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await getDb()
    .insert(authSessions)
    .values({
      userId,
      tokenHash: sha256(token),
      expiresAt,
      encryptedRefreshToken: refreshToken ? encryptSecret(refreshToken) : null,
    });
  (await cookies()).set(sessionCookieName(), token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Returns the user id for a valid, unrevoked, unexpired session. */
export async function readSessionUserId(): Promise<string | null> {
  const token = (await cookies()).get(sessionCookieName())?.value;
  if (!token || token.length > 128) return null;
  const [row] = await getDb()
    .select({ userId: authSessions.userId })
    .from(authSessions)
    .where(
      and(
        eq(authSessions.tokenHash, sha256(token)),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row?.userId ?? null;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (token) {
    await getDb()
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(eq(authSessions.tokenHash, sha256(token)));
  }
  jar.delete(sessionCookieName());
}
