import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { badges, studentBadges, studentDailyActivity, studentProfiles } from "@/db/schema";
import { AVATAR_KEYS } from "@/config/brand-assets";
import { levelFor } from "@/features/gamification/levels";
import { getLevels } from "@/features/gamification/xp.service";
import { displayStreak } from "@/features/streaks/streak";
import { addDays, learningDay } from "@/lib/time";

/**
 * The ONLY fields a student may change. `.strict()` rejects anything else — a request that tries
 * to send a name (or any unknown field) fails validation. The DB trigger is the second line of defence.
 */
export const profileUpdateSchema = z
  .object({
    avatar: z.enum(AVATAR_KEYS).optional(),
    shareScores: z.boolean().optional(),
    profileVisibility: z.enum(["friends", "private"]).optional(),
  })
  .strict();
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export class ProfileError extends Error {
  constructor(public code: "name_immutable" | "invalid") {
    super(code);
  }
}

export async function updateProfile(userId: string, input: unknown) {
  if (input && typeof input === "object" && Object.keys(input).some((k) => /name/i.test(k))) throw new ProfileError("name_immutable");
  const parsed = profileUpdateSchema.safeParse(input);
  if (!parsed.success) throw new ProfileError("invalid");
  if (!Object.keys(parsed.data).length) return;
  await getDb().update(studentProfiles).set(parsed.data).where(eq(studentProfiles.userId, userId));
}

export async function getProfile(userId: string) {
  const db = getDb();
  const [p] = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, userId)).limit(1);
  if (!p) return null;
  const today = learningDay();
  const levels = await db.transaction((tx) => getLevels(tx));
  const earned = await db
    .select({ code: badges.code, name: badges.name, icon: badges.icon, description: badges.description, earnedAt: studentBadges.earnedAt })
    .from(studentBadges)
    .innerJoin(badges, eq(badges.id, studentBadges.badgeId))
    .where(eq(studentBadges.userId, userId))
    .orderBy(desc(studentBadges.earnedAt));
  const activity = await db
    .select({ day: studentDailyActivity.day, qualified: studentDailyActivity.qualified })
    .from(studentDailyActivity)
    .where(and(eq(studentDailyActivity.userId, userId), gte(studentDailyActivity.day, addDays(today, -34))));
  return {
    userId,
    officialName: p.officialFullName ?? p.displayName,
    identitySyncedAt: p.identitySyncedAt,
    avatar: p.avatar,
    shareScores: p.shareScores,
    profileVisibility: p.profileVisibility,
    xp: p.xpTotal,
    level: levelFor(p.xpTotal, levels),
    streak: displayStreak(p, today),
    longestStreak: p.longestStreak,
    wordsMastered: p.masteredWords,
    wordsLearned: p.totalWordsLearned,
    badges: earned,
    qualifiedDays: new Set(activity.filter((a) => a.qualified).map((a) => a.day)),
    today,
  };
}
export type Profile = NonNullable<Awaited<ReturnType<typeof getProfile>>>;
