/**
 * Integration tests against a real Postgres (DATABASE_URL_TEST). They prove the anti-gaming
 * guarantees end-to-end: idempotent XP, daily caps under concurrency, replayed answers and
 * double completions. Skipped when DATABASE_URL_TEST is not set.
 */
import { and, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_URL = process.env.DATABASE_URL_TEST;
if (TEST_URL) {
  process.env.DATABASE_URL = TEST_URL;
  process.env.ANALYTICS_SINKS = "db";
  process.env.SESSION_SECRET ??= "test-secret-test-secret";
}

describe.skipIf(!TEST_URL)("reward integrity (Postgres)", async () => {
  const { getDb } = await import("@/db/client");
  const s = await import("@/db/schema");
  const { awardXp, lockProfile } = await import("@/features/gamification/xp.service");
  const { DEFAULT_XP_RULES } = await import("@/features/gamification/xp-rules");
  const { DEFAULT_LEVELS } = await import("@/features/gamification/levels");
  const { SEED_WORDS, SEED_BADGES } = await import("@/db/seed-data/words");
  const { normalizeArabic } = await import("@/lib/utils");
  const { learningDay } = await import("@/lib/time");
  const wod = await import("@/features/daily-word/service");
  const sessions = await import("@/features/vocabulary/session.service");

  let userId: string;
  const day = learningDay();

  const ledgerTotal = async () => {
    const [{ total }] = await getDb()
      .select({ total: sql<number>`coalesce(sum(${s.xpTransactions.xp}),0)::int` })
      .from(s.xpTransactions)
      .where(eq(s.xpTransactions.userId, userId));
    return total;
  };
  const profile = async () =>
    (await getDb().select().from(s.studentProfiles).where(eq(s.studentProfiles.userId, userId)))[0];

  beforeAll(async () => {
    const pool = new Pool({ connectionString: TEST_URL });
    await pool.query(
      "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;",
    );
    await pool.end();
    const db = getDb();
    await migrate(db, { migrationsFolder: "./drizzle" });
    await db.insert(s.levels).values(DEFAULT_LEVELS);
    await db.insert(s.xpRules).values(Object.values(DEFAULT_XP_RULES));
    await db.insert(s.badges).values(SEED_BADGES.map((b) => ({ ...b })));
    for (const w of SEED_WORDS.slice(0, 20)) {
      const [row] = await db
        .insert(s.vocabularyWords)
        .values({
          word: w.word,
          normalizedWord: normalizeArabic(w.word),
          meaning: w.meaning,
          example: w.example,
          difficulty: w.difficulty,
          category: w.category,
        })
        .returning();
      await db
        .insert(s.wordSynonyms)
        .values(w.synonyms.map((value) => ({ wordId: row.id, value })));
      if (w.antonyms.length)
        await db
          .insert(s.wordAntonyms)
          .values(w.antonyms.map((value) => ({ wordId: row.id, value })));
    }
    const [cohort] = await db.insert(s.cohorts).values({ name: "test" }).returning();
    const [u] = await db
      .insert(s.users)
      .values({ authProvider: "mock", providerSubject: "t1" })
      .returning();
    userId = u.id;
    await db
      .insert(s.studentProfiles)
      .values({ userId, displayName: "اختبار", cohortId: cohort.id });
  });

  afterAll(async () => {
    const g = globalThis as unknown as { lafziPool?: Pool };
    await g.lafziPool?.end();
  });

  it("awards XP once per idempotency key", async () => {
    const grant = () =>
      getDb().transaction(async (tx) => {
        await lockProfile(tx, userId);
        return awardXp(tx, {
          userId,
          action: "wod_opened",
          idempotencyKey: `wod_opened:${userId}:${day}`,
          day,
        });
      });
    expect(await grant()).toBe(2);
    expect(await grant()).toBe(0);
    expect(await grant()).toBe(0);
    expect(await ledgerTotal()).toBe(2);
    expect((await profile()).xpTotal).toBe(2);
  });

  it("enforces daily caps even under concurrent requests", async () => {
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        getDb().transaction(async (tx) => {
          await lockProfile(tx, userId);
          return awardXp(tx, {
            userId,
            action: "review_correct",
            idempotencyKey: `review_correct:test:${i}`,
            day,
          });
        }),
      ),
    );
    expect(results.reduce((a, b) => a + b, 0)).toBe(DEFAULT_XP_RULES.review_correct.dailyCap);
    expect((await profile()).xpTotal).toBe(await ledgerTotal());
  });

  it("word of the day: opening/guessing repeatedly and resubmitting never adds XP", async () => {
    const view = await wod.getStudentWod(userId);
    const before = await ledgerTotal();
    await wod.submitWodGuess(userId, view.guess.options[0].id);
    await wod.submitWodGuess(userId, view.guess.options[1].id);
    expect(await ledgerTotal()).toBe(before); // wod_opened already granted in the first test

    const first = await wod.answerWod(userId, "a");
    const afterFirst = await ledgerTotal();
    expect(first.totalXp).toBeGreaterThanOrEqual(5);
    const replay = await wod.answerWod(userId, "b");
    expect(replay.totalXp).toBe(0);
    expect(replay.isCorrect).toBe(first.isCorrect); // original verdict is kept
    expect(await ledgerTotal()).toBe(afterFirst);
    expect((await profile()).currentStreak).toBe(1);
  });

  it("practice session: answers are locked, completion is single-use", async () => {
    const { id } = await sessions.startSession(userId);
    expect((await sessions.startSession(userId)).id).toBe(id); // resumes instead of creating more
    const view = (await sessions.getSessionView(userId, id))!;

    const a1 = await sessions.answerItem(userId, id, 0, "a");
    const a2 = await sessions.answerItem(userId, id, 0, "b");
    expect(a2.isCorrect).toBe(a1.isCorrect);
    await expect(sessions.completeSession(userId, id)).rejects.toMatchObject({
      code: "incomplete",
    });
    await expect(sessions.answerItem(userId, id, 99, "a")).rejects.toMatchObject({
      code: "bad_item",
    });

    for (let i = 1; i < view.total; i++) await sessions.answerItem(userId, id, i, "a");
    const done = await sessions.completeSession(userId, id);
    expect(done.awards.map((x) => x.action)).toEqual(
      expect.arrayContaining(["session_completed", "mission_completed"]),
    );
    expect(done.missionCompleted).toBe(true);
    await expect(sessions.completeSession(userId, id)).rejects.toMatchObject({
      code: "not_in_progress",
    });

    const [act] = await getDb()
      .select()
      .from(s.studentDailyActivity)
      .where(and(eq(s.studentDailyActivity.userId, userId), eq(s.studentDailyActivity.day, day)));
    expect(act.missionCompletedAt).not.toBeNull();
    expect((await profile()).xpTotal).toBe(await ledgerTotal());
  });

  it("another user cannot read or answer someone else's session", async () => {
    const [other] = await getDb()
      .insert(s.users)
      .values({ authProvider: "mock", providerSubject: "t2" })
      .returning();
    await getDb().insert(s.studentProfiles).values({ userId: other.id, displayName: "آخر" });
    const { id } = await sessions.startSession(userId);
    expect(await sessions.getSessionView(other.id, id)).toBeNull();
    await expect(sessions.answerItem(other.id, id, 0, "a")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("an extra review session after the daily one gives capped per-answer XP only", async () => {
    const { id } = await sessions.startSession(userId);
    const view = (await sessions.getSessionView(userId, id))!;
    expect(view.kind).toBe("review");
    for (let i = 0; i < view.total; i++) await sessions.answerItem(userId, id, i, "a");
    const done = await sessions.completeSession(userId, id);
    expect(done.awards.find((x) => x.action === "session_completed")).toBeUndefined();
  });
});
