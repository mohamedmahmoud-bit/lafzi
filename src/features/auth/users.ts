import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { cohorts, studentProfiles, users } from "@/db/schema";
import { sanitizeText } from "@/lib/utils";
import type { NoonIdentity } from "./providers/types";

/** Find-or-create the local user + profile for an authenticated identity. */
export async function upsertUserFromIdentity(identity: NoonIdentity): Promise<string> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const displayName = sanitizeText(identity.profile.displayName, 60) || "طالب";
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(
        and(eq(users.authProvider, identity.provider), eq(users.providerSubject, identity.subject)),
      )
      .limit(1);

    // Trusted identity sync: the only writer allowed to change the official name (DB trigger).
    await tx.execute(sql`set local lafzi.identity_sync = 'on'`);
    if (existing) {
      await tx
        .update(users)
        .set({
          lastLoginAt: new Date(),
          noonStudentId: identity.profile.noonStudentId,
          role: identity.role,
        })
        .where(eq(users.id, existing.id));
      await tx
        .update(studentProfiles)
        .set({ displayName, officialFullName: displayName, identitySyncedAt: new Date(), grade: identity.profile.grade ?? null })
        .where(eq(studentProfiles.userId, existing.id));
      return existing.id;
    }

    const [user] = await tx
      .insert(users)
      .values({
        authProvider: identity.provider,
        providerSubject: identity.subject,
        noonStudentId: identity.profile.noonStudentId,
        role: identity.role,
        lastLoginAt: new Date(),
      })
      .returning({ id: users.id });

    // Until Noon exposes class/program membership, everyone joins the default cohort. [NOON-REQUIRED]
    const [cohort] = await tx
      .select({ id: cohorts.id })
      .from(cohorts)
      .orderBy(asc(cohorts.createdAt))
      .limit(1);
    await tx.insert(studentProfiles).values({
      userId: user.id,
      displayName,
      officialFullName: displayName,
      identitySyncedAt: new Date(),
      grade: identity.profile.grade ?? null,
      cohortId: cohort?.id ?? null,
    });
    return user.id;
  });
}
