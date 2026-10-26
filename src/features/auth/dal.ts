import "server-only";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db/client";
import { studentProfiles, users } from "@/db/schema";
import { readSessionUserId } from "./session";

export type CurrentUser = {
  id: string;
  role: "student" | "admin";
  noonStudentId: string | null;
  displayName: string;
  avatar: string;
  cohortId: string | null;
};

/**
 * Data Access Layer: the ONLY place that turns a cookie into a user. Memoised per request.
 * Returns a narrow object — never raw session/token data.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const userId = await readSessionUserId();
  if (!userId) return null;
  const [row] = await getDb()
    .select({
      id: users.id,
      role: users.role,
      noonStudentId: users.noonStudentId,
      displayName: studentProfiles.displayName,
      avatar: studentProfiles.avatar,
      cohortId: studentProfiles.cohortId,
    })
    .from(users)
    .innerJoin(studentProfiles, eq(studentProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Admin pages 404 for non-admins so the admin area is not discoverable. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") notFound();
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
  }
}

/** For server actions: throw instead of redirecting. */
export async function assertUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function assertAdmin(): Promise<CurrentUser> {
  const user = await assertUser();
  if (user.role !== "admin") throw new UnauthorizedError();
  return user;
}
