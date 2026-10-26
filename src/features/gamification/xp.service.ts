import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import {
  levels,
  studentDailyActivity,
  studentProfiles,
  xpRules,
  xpTransactions,
} from "@/db/schema";
import { DEFAULT_LEVELS, levelFor, type Level } from "./levels";
import type { RewardCollector } from "./rewards";
import { computeAward, DEFAULT_XP_RULES, type XpAction, type XpRule } from "./xp-rules";

export async function getXpRule(tx: Tx, action: XpAction): Promise<XpRule> {
  const [row] = await tx.select().from(xpRules).where(eq(xpRules.action, action)).limit(1);
  return row ? { ...row, action } : DEFAULT_XP_RULES[action];
}

export async function getLevels(tx: Tx): Promise<Level[]> {
  const rows = await tx.select().from(levels).orderBy(asc(levels.minXp));
  return rows.length ? rows : DEFAULT_LEVELS;
}

/**
 * Lock the student's profile row for the rest of the transaction. Every reward transaction calls
 * this first so concurrent requests for the same student serialise (daily caps stay correct).
 */
export async function lockProfile(tx: Tx, userId: string) {
  const [p] = await tx
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, userId))
    .for("update")
    .limit(1);
  if (!p) throw new Error("Profile not found");
  return p;
}

export async function ensureDailyActivity(tx: Tx, userId: string, day: string) {
  await tx.insert(studentDailyActivity).values({ userId, day }).onConflictDoNothing();
}

/**
 * The ONLY way XP is granted. Server-side rule lookup, daily cap, and an idempotency key that is
 * unique in the ledger — replays, refreshes and direct API calls cannot double-award.
 * Caller must hold the profile lock (see lockProfile).
 */
export async function awardXp(
  tx: Tx,
  params: {
    userId: string;
    action: XpAction;
    idempotencyKey: string;
    day: string;
    sourceId?: string;
    multiplier?: number;
  },
  rewards?: RewardCollector,
): Promise<number> {
  const rule = await getXpRule(tx, params.action);
  const [{ earned }] = await tx
    .select({ earned: sql<number>`coalesce(sum(${xpTransactions.xp}), 0)::int` })
    .from(xpTransactions)
    .where(
      and(
        eq(xpTransactions.userId, params.userId),
        eq(xpTransactions.day, params.day),
        eq(xpTransactions.action, params.action),
      ),
    );
  const amount = computeAward(rule, earned, params.multiplier);
  if (amount <= 0) return 0;

  const inserted = await tx
    .insert(xpTransactions)
    .values({
      userId: params.userId,
      action: params.action,
      xp: amount,
      sourceId: params.sourceId,
      idempotencyKey: params.idempotencyKey,
      day: params.day,
    })
    .onConflictDoNothing({ target: xpTransactions.idempotencyKey })
    .returning({ id: xpTransactions.id });
  if (!inserted.length) return 0;

  const [profile] = await tx
    .update(studentProfiles)
    .set({ xpTotal: sql`${studentProfiles.xpTotal} + ${amount}` })
    .where(eq(studentProfiles.userId, params.userId))
    .returning({ xpTotal: studentProfiles.xpTotal, currentLevel: studentProfiles.currentLevel });

  await ensureDailyActivity(tx, params.userId, params.day);
  await tx
    .update(studentDailyActivity)
    .set({ xpEarned: sql`${studentDailyActivity.xpEarned} + ${amount}` })
    .where(
      and(eq(studentDailyActivity.userId, params.userId), eq(studentDailyActivity.day, params.day)),
    );

  const lvl = levelFor(profile.xpTotal, await getLevels(tx));
  if (lvl.current.level !== profile.currentLevel) {
    await tx
      .update(studentProfiles)
      .set({ currentLevel: lvl.current.level })
      .where(eq(studentProfiles.userId, params.userId));
    if (rewards && lvl.current.level > profile.currentLevel) {
      rewards.levelUp = {
        from: profile.currentLevel,
        to: lvl.current.level,
        name: lvl.current.name,
      };
    }
  }
  rewards?.awards.push({ action: params.action, xp: amount });
  return amount;
}
