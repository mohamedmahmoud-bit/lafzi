import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db/client";
import {
  challengeParticipants,
  friendChallenges,
  friendInvites,
  friendships,
  gameSessions,
  studentProfiles,
  userBlocks,
  userReports,
} from "@/db/schema";
import { buildLexiconRounds, startFrozenSession } from "@/features/games/session.service";
import { CHALLENGE_GAMES, gameById } from "@/features/games/modes";
import type { Round } from "@/features/games/types";
import { loadLexicon } from "@/features/lexicon/content";
import { isProduction } from "@/lib/env";
import { hashString, seededRandom } from "@/lib/utils";

export class SocialError extends Error {
  constructor(public code: "invalid_link" | "expired" | "self" | "blocked" | "not_friends" | "unknown_game" | "content_unavailable" | "not_found") {
    super(code);
  }
}

const pair = (a: string, b: string) => (a < b ? { userLow: a, userHigh: b } : { userLow: b, userHigh: a });
/** Unguessable, URL-safe link code (no personal data). */
const newCode = () => randomBytes(12).toString("base64url");

export async function isBlocked(db: DbOrTx, a: string, b: string) {
  const [row] = await db.select().from(userBlocks).where(or(and(eq(userBlocks.blockerId, a), eq(userBlocks.blockedId, b)), and(eq(userBlocks.blockerId, b), eq(userBlocks.blockedId, a)))).limit(1);
  return !!row;
}

export async function areFriends(db: DbOrTx, a: string, b: string) {
  const [row] = await db.select().from(friendships).where(and(eq(friendships.userLow, pair(a, b).userLow), eq(friendships.userHigh, pair(a, b).userHigh), eq(friendships.status, "accepted"))).limit(1);
  return !!row && !(await isBlocked(db, a, b));
}

async function befriend(db: DbOrTx, a: string, b: string, via: "invite" | "challenge") {
  if (a === b) throw new SocialError("self");
  if (await isBlocked(db, a, b)) throw new SocialError("blocked");
  await db
    .insert(friendships)
    .values({ ...pair(a, b), status: "accepted", via })
    .onConflictDoUpdate({ target: [friendships.userLow, friendships.userHigh], set: { status: "accepted", updatedAt: new Date() } });
}

/** A personal invite link, valid for 7 days. */
export async function createInvite(userId: string) {
  const code = newCode();
  await getDb().insert(friendInvites).values({ code, inviterId: userId, expiresAt: new Date(Date.now() + 7 * 86_400_000) });
  return code;
}

export async function invitePreview(code: string) {
  const db = getDb();
  const [inv] = await db.select().from(friendInvites).where(eq(friendInvites.code, code)).limit(1);
  if (!inv) throw new SocialError("invalid_link");
  if (inv.expiresAt < new Date() || inv.uses >= inv.maxUses) throw new SocialError("expired");
  const [p] = await db.select({ name: studentProfiles.officialFullName, displayName: studentProfiles.displayName, avatar: studentProfiles.avatar }).from(studentProfiles).where(eq(studentProfiles.userId, inv.inviterId)).limit(1);
  return { inviterId: inv.inviterId, name: p?.name ?? p?.displayName ?? "", avatar: p?.avatar ?? "owl" };
}

/** Accepting an invite makes both students friends (both consented: one shared, one accepted). */
export async function acceptInvite(userId: string, code: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(friendInvites).where(and(eq(friendInvites.code, code), gt(friendInvites.expiresAt, new Date()))).for("update").limit(1);
    if (!inv || inv.uses >= inv.maxUses) throw new SocialError("expired");
    await befriend(tx, inv.inviterId, userId, "invite");
    await tx.update(friendInvites).set({ uses: sql`${friendInvites.uses} + 1` }).where(eq(friendInvites.code, code));
    return inv.inviterId;
  });
}

export async function removeFriend(userId: string, otherId: string) {
  await getDb().update(friendships).set({ status: "removed", streak: 0 }).where(and(eq(friendships.userLow, pair(userId, otherId).userLow), eq(friendships.userHigh, pair(userId, otherId).userHigh)));
}

export async function blockUser(userId: string, otherId: string) {
  if (userId === otherId) throw new SocialError("self");
  await getDb().insert(userBlocks).values({ blockerId: userId, blockedId: otherId }).onConflictDoNothing();
  await removeFriend(userId, otherId);
}

export async function reportUser(userId: string, otherId: string, reason: string, context?: string) {
  await getDb().insert(userReports).values({ reporterId: userId, reportedId: otherId, reason, context: context ?? null });
}

export type FriendRow = { userId: string; name: string; avatar: string; level: number; streak: number; friendStreak: number; weekScore?: number };

export async function listFriends(userId: string): Promise<FriendRow[]> {
  const db = getDb();
  const rows = await db.select().from(friendships).where(and(eq(friendships.status, "accepted"), or(eq(friendships.userLow, userId), eq(friendships.userHigh, userId))));
  const blocks = await db.select().from(userBlocks).where(or(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, userId)));
  const blocked = new Set(blocks.flatMap((b) => [b.blockerId, b.blockedId]));
  const ids = rows.map((r) => (r.userLow === userId ? r.userHigh : r.userLow)).filter((id) => !blocked.has(id));
  if (!ids.length) return [];
  const profiles = await db.select().from(studentProfiles).where(inArray(studentProfiles.userId, ids));
  return profiles.map((p) => {
    const f = rows.find((r) => r.userLow === p.userId || r.userHigh === p.userId)!;
    return { userId: p.userId, name: p.officialFullName ?? p.displayName, avatar: p.avatar, level: p.currentLevel, streak: p.currentStreak, friendStreak: f.streak };
  });
}

// ─── Friend challenges ─────────────────────────────────────────────────────

/** Freeze one round set, start the creator's session, and return the shareable code. */
export async function createChallenge(userId: string, gameId: string) {
  if (!CHALLENGE_GAMES.includes(gameId)) throw new SocialError("unknown_game");
  const g = gameById(gameId)!;
  const lx = await loadLexicon(getDb(), { isProduction: isProduction() });
  const rounds: Round[] = buildLexiconRounds(g, lx, seededRandom(hashString(`challenge:${userId}:${Date.now()}`)));
  if (rounds.length < 3) throw new SocialError("content_unavailable");
  const code = newCode();
  const [c] = await getDb()
    .insert(friendChallenges)
    .values({ code, creatorId: userId, gameTypeId: gameId, rounds: rounds as unknown as Record<string, unknown>[], expiresAt: new Date(Date.now() + 7 * 86_400_000) })
    .returning({ id: friendChallenges.id });
  const sessionId = await startFrozenSession(userId, gameId, rounds, c.id);
  await getDb().insert(challengeParticipants).values({ challengeId: c.id, userId, sessionId });
  return { code, sessionId };
}

/** Open a challenge link: become friends (unless blocked) and get your own session on the SAME rounds. */
export async function joinChallenge(userId: string, code: string) {
  const db = getDb();
  const [c] = await db.select().from(friendChallenges).where(eq(friendChallenges.code, code)).limit(1);
  if (!c) throw new SocialError("invalid_link");
  const [mine] = await db.select().from(challengeParticipants).where(and(eq(challengeParticipants.challengeId, c.id), eq(challengeParticipants.userId, userId))).limit(1);
  if (mine?.sessionId) return { sessionId: mine.sessionId, challengeId: c.id };
  if (c.expiresAt < new Date()) throw new SocialError("expired");
  if (c.creatorId === userId) throw new SocialError("self");
  const parts = await db.select().from(challengeParticipants).where(eq(challengeParticipants.challengeId, c.id));
  if (parts.length >= 2) throw new SocialError("expired");
  await befriend(db, c.creatorId, userId, "challenge");
  const sessionId = await startFrozenSession(userId, c.gameTypeId, c.rounds as unknown as Round[], c.id);
  await db.insert(challengeParticipants).values({ challengeId: c.id, userId, sessionId }).onConflictDoNothing();
  return { sessionId, challengeId: c.id };
}

export type ChallengeView = {
  id: string;
  code: string;
  gameId: string;
  gameName: string;
  expiresAt: Date;
  players: { userId: string; name: string; avatar: string; score: number | null; correct: number | null; done: boolean; isMe: boolean }[];
  /** Results are shown only when both have played. */
  bothDone: boolean;
  total: number;
};

export async function challengeView(userId: string, code: string): Promise<ChallengeView | null> {
  const db = getDb();
  const [c] = await db.select().from(friendChallenges).where(eq(friendChallenges.code, code)).limit(1);
  if (!c) return null;
  const parts = await db.select().from(challengeParticipants).where(eq(challengeParticipants.challengeId, c.id));
  const profiles = parts.length ? await db.select().from(studentProfiles).where(inArray(studentProfiles.userId, parts.map((p) => p.userId))) : [];
  const bothDone = parts.length === 2 && parts.every((p) => p.completedAt);
  const isParticipant = parts.some((p) => p.userId === userId);
  return {
    id: c.id,
    code: c.code,
    gameId: c.gameTypeId,
    gameName: gameById(c.gameTypeId)?.nameAr ?? "",
    expiresAt: c.expiresAt,
    total: (c.rounds as unknown[]).length,
    bothDone,
    players: parts.map((p) => {
      const pr = profiles.find((x) => x.userId === p.userId);
      const showScore = bothDone || p.userId === userId;
      return {
        userId: p.userId,
        name: pr?.officialFullName ?? pr?.displayName ?? "",
        avatar: pr?.avatar ?? "owl",
        score: isParticipant && showScore ? p.score : null,
        correct: isParticipant && showScore ? p.correct : null,
        done: !!p.completedAt,
        isMe: p.userId === userId,
      };
    }),
  };
}

export async function myChallenges(userId: string, limit = 10) {
  const db = getDb();
  const mine = await db.select({ challengeId: challengeParticipants.challengeId }).from(challengeParticipants).where(eq(challengeParticipants.userId, userId));
  if (!mine.length) return [];
  const cs = await db.select().from(friendChallenges).where(inArray(friendChallenges.id, mine.map((m) => m.challengeId))).orderBy(desc(friendChallenges.createdAt)).limit(limit);
  return (await Promise.all(cs.map((c) => challengeView(userId, c.code)))).filter((v): v is ChallengeView => !!v);
}

export async function sessionChallengeCode(sessionId: string) {
  const [s] = await getDb().select({ challengeId: gameSessions.challengeId }).from(gameSessions).where(eq(gameSessions.id, sessionId)).limit(1);
  if (!s?.challengeId) return null;
  const [c] = await getDb().select({ code: friendChallenges.code }).from(friendChallenges).where(eq(friendChallenges.id, s.challengeId)).limit(1);
  return c?.code ?? null;
}
