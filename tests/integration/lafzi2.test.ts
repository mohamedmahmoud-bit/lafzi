/**
 * Lafzi 2.0 end-to-end guarantees on a real Postgres: dataset staging → review → published lexicon,
 * game-first loop, 5-interaction streak rule, daily challenge, friend challenges & friend streaks,
 * name immutability and leaderboard privacy. Skipped without DATABASE_URL_TEST.
 */
import { readFileSync } from "node:fs";
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

describe.skipIf(!TEST_URL)("Lafzi 2.0 (Postgres)", async () => {
  const { getDb } = await import("@/db/client");
  const s = await import("@/db/schema");
  const { seedPlatformConfig } = await import("@/db/seed-platform");
  const lexicon = await import("@/features/lexicon/service");
  const games = await import("@/features/games/session.service");
  const social = await import("@/features/social/service");
  const wod = await import("@/features/word-bank/wod.service");
  const { updateProfile } = await import("@/features/profile/service");
  const { upsertUserFromIdentity } = await import("@/features/auth/users");
  const { getCohortBoard, getFriendsBoard } = await import("@/features/leaderboard/service");
  const { learningDay } = await import("@/lib/time");
  const md = readFileSync("data/vocabulary/lafzi-initial-427.md", "utf8");
  let a: string, b: string, c: string;
  const day = learningDay();

  const mkUser = async (subject: string, name: string, cohortId: string) => {
    const id = await upsertUserFromIdentity({ provider: "mock", subject, role: "student", profile: { noonStudentId: subject, displayName: name } } as never);
    await getDb().update(s.studentProfiles).set({ cohortId }).where(eq(s.studentProfiles.userId, id));
    return id;
  };
  const activity = async (u: string) => (await getDb().select().from(s.studentDailyActivity).where(and(eq(s.studentDailyActivity.userId, u), eq(s.studentDailyActivity.day, day))))[0];
  const playAll = async (u: string, sessionId: string, pickCorrect = true) => {
    const view = (await games.getGameView(u, sessionId))!;
    const rounds = (await getDb().select().from(s.gameSessions).where(eq(s.gameSessions.id, sessionId)))[0].rounds as { correctId: string; choices: { id: string }[] }[];
    for (const [i, r] of rounds.entries()) {
      const wrong = r.choices.find((ch) => ch.id !== r.correctId)!.id;
      if (view.mechanic === "memory") await games.memoryAttempt(u, sessionId, i, r.correctId);
      else await games.answerRound(u, sessionId, i, pickCorrect ? r.correctId : wrong);
    }
    return games.completeGame(u, sessionId);
  };

  beforeAll(async () => {
    const pool = new Pool({ connectionString: TEST_URL });
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
    await pool.end();
    await migrate(getDb(), { migrationsFolder: "./drizzle" });
    await seedPlatformConfig(getDb());
    const [cohort] = await getDb().insert(s.cohorts).values({ name: "test" }).returning();
    a = await mkUser("noon-a", "ريم أحمد", cohort.id);
    b = await mkUser("noon-b", "فهد سالم", cohort.id);
    c = await mkUser("noon-c", "نورة علي", cohort.id);
  });
  afterAll(async () => {
    await (globalThis as unknown as { lafziPool?: Pool }).lafziPool?.end();
  });

  it("stages all 427 rows (idempotently) and publishes nothing until a reviewer approves", async () => {
    const first = await lexicon.importDataset(getDb(), { text: md, sourceName: "lafzi-initial-427.md", format: "markdown" });
    const again = await lexicon.importDataset(getDb(), { text: md, sourceName: "copy.md", format: "markdown" });
    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    expect((await getDb().select({ n: sql<number>`count(*)::int` }).from(s.vocabImportRows))[0].n).toBe(427);
    expect((await lexicon.lexiconStats(getDb())).words).toBe(0);
    await expect(games.startGame(a, "meaning_hunter")).rejects.toMatchObject({ code: "content_unavailable" });
  });

  it("approving clean rows publishes normalized words, senses, categories and directional relations — flagged rows stay out", async () => {
    const n = await lexicon.acceptAllClean(getDb(), null);
    expect(n).toBeGreaterThan(350);
    const st = await lexicon.lexiconStats(getDb());
    expect(st.words).toBeGreaterThan(300);
    expect(st.relations).toBeGreaterThan(100);
    const [cat] = await getDb().select().from(s.vocabularyEntries).where(eq(s.vocabularyEntries.lemma, "القط"));
    // «القط → هِرّ» (young) was flagged → no such published relation.
    const hirr = await getDb().select().from(s.vocabularyRelationships).where(and(eq(s.vocabularyRelationships.fromEntryId, cat.id), eq(s.vocabularyRelationships.type, "animal_young")));
    expect(hirr).toHaveLength(0);
    // Original rows are never modified.
    const [row] = await getDb().select().from(s.vocabImportRows).where(eq(s.vocabImportRows.word, "مديد")).limit(1);
    expect(row.meaning).toBe("طويل ومتمدد");
    // «أسد» and «الأسد» are one word in several categories.
    const lion = await getDb().select().from(s.vocabularyEntries).where(sql`${s.vocabularyEntries.lemma} in ('الأسد','أسد')`);
    expect(lion).toHaveLength(1);
    const cats = await getDb().select().from(s.entryCategories).where(eq(s.entryCategories.entryId, lion[0].id));
    expect(cats.map((x) => x.categoryId).sort()).toEqual(expect.arrayContaining(["vo_animal_sound", "vo_animal_young", "vo_animal_home", "vo_animal_pair"]));
  });

  it("a reviewer correction is stored beside the original and used on approval", async () => {
    const [row] = await getDb().select().from(s.vocabImportRows).where(and(eq(s.vocabImportRows.word, "دب"), eq(s.vocabImportRows.related, "دببة")));
    await lexicon.editRow(getDb(), row.id, { related: "دُبّة" }, "أنثى الدب: دُبّة");
    await lexicon.acceptRow(getDb(), row.id, null);
    const [after] = await getDb().select().from(s.vocabImportRows).where(eq(s.vocabImportRows.id, row.id));
    expect(after.related).toBe("دببة");
    expect(after.status).toBe("accepted");
    const [rel] = await getDb().select().from(s.vocabularyRelationships).where(eq(s.vocabularyRelationships.id, after.relationshipId!));
    const [to] = await getDb().select().from(s.vocabularyEntries).where(eq(s.vocabularyEntries.id, rel.toEntryId));
    expect(to.lemma).toBe("دُبّة");
  });

  it("opening the app or the word of the day alone does not make a streak day (needs 5 answers)", async () => {
    const v = await wod.getVocabWod(a);
    expect(v.status).toBe("ready");
    if (v.status !== "ready") return;
    expect(v.card).toBeNull();
    await wod.answerVocabWod(a, v.choices[0].id);
    const act = await activity(a);
    expect(act.wordInteractions).toBe(1);
    expect(act.qualified).toBe(false);
    const again = await wod.answerVocabWod(a, v.choices[1].id);
    expect(again.totalXp).toBe(0);
  });

  it("صائد المعاني: server-graded rounds; finishing ≥5 answers qualifies the day once", async () => {
    const { id } = await games.startGame(a, "meaning_hunter");
    const view = (await games.getGameView(a, id))!;
    expect(JSON.stringify(view.rounds)).not.toContain("correctId");
    const done = await playAll(a, id);
    expect(done.rewards.awards.map((x) => x.action)).toContain("game_completed");
    expect((await activity(a)).qualified).toBe(true);
    const [p] = await getDb().select().from(s.studentProfiles).where(eq(s.studentProfiles.userId, a));
    expect(p.currentStreak).toBe(1);
    // Spaced repetition records exist for the words played.
    const prog = await getDb().select().from(s.studentVocabularyProgress).where(eq(s.studentVocabularyProgress.userId, a));
    expect(prog.length).toBeGreaterThan(5);
  });

  it("وصلها صح and ذاكرة لفظي: boards are unambiguous; wrong memory flips don't lock a pair", async () => {
    const m = await games.startGame(a, "match_pairs", { relationType: "animal_home" });
    const rounds = (await getDb().select().from(s.gameSessions).where(eq(s.gameSessions.id, m.id)))[0].rounds as { correctId: string }[];
    expect(new Set(rounds.map((r) => r.correctId)).size).toBe(rounds.length);
    await playAll(a, m.id);
    const mem = await games.startGame(a, "memory");
    const mr = (await getDb().select().from(s.gameSessions).where(eq(s.gameSessions.id, mem.id)))[0].rounds as { correctId: string }[];
    const wrong = await games.memoryAttempt(a, mem.id, 0, mr[1].correctId);
    expect(wrong.matched).toBe(false);
    const right = await games.memoryAttempt(a, mem.id, 0, mr[0].correctId);
    expect(right.matched).toBe(true);
    for (let i = 1; i < mr.length; i++) await games.memoryAttempt(a, mem.id, i, mr[i].correctId);
    const done = await games.completeGame(a, mem.id);
    expect(done.correct).toBe(mr.length);
    const [sess] = await getDb().select().from(s.gameSessions).where(eq(s.gameSessions.id, mem.id));
    expect(sess.mistakes).toBe(1);
  });

  it("سباق الكلمات: answers after the deadline are refused; the race can be finished when time is up", async () => {
    const { id } = await games.startGame(b, "word_race");
    const rounds = (await getDb().select().from(s.gameSessions).where(eq(s.gameSessions.id, id)))[0].rounds as { correctId: string }[];
    await games.answerRound(b, id, 0, rounds[0].correctId);
    await expect(games.completeGame(b, id)).rejects.toMatchObject({ code: "incomplete" });
    await getDb().update(s.gameSessions).set({ deadlineAt: new Date(Date.now() - 10_000) }).where(eq(s.gameSessions.id, id));
    await expect(games.answerRound(b, id, 1, rounds[1].correctId)).rejects.toMatchObject({ code: "time_up" });
    const done = await games.completeGame(b, id);
    expect(done.total).toBe(1);
    expect(done.rewards.totalXp).toBe(0); // fewer than 5 answers → no completion XP
  });

  it("تحدي اليوم: same rounds for every student, daily XP once, completes the mission task", async () => {
    const s1 = await games.startGame(a, "daily_challenge");
    const s2 = await games.startGame(b, "daily_challenge");
    const r = async (id: string) => ((await getDb().select().from(s.gameSessions).where(eq(s.gameSessions.id, id)))[0].rounds as { stem: string; correctId: string }[]).map((x) => `${x.stem}|${x.correctId}`);
    expect(await r(s1.id)).toEqual(await r(s2.id));
    const done = await playAll(a, s1.id);
    expect(done.rewards.awards.map((x) => x.action)).toContain("daily_challenge");
    expect((await activity(a)).dailyChallengeCompleted).toBe(true);
    const again = await games.startGame(a, "daily_challenge");
    const done2 = await playAll(a, again.id);
    expect(done2.rewards.awards.map((x) => x.action)).not.toContain("daily_challenge");
  });

  it("friend challenge: equal round sets, results only when both finish, winner gets the win once", async () => {
    const { code, sessionId } = await social.createChallenge(a, "meaning_hunter");
    expect(code).toMatch(/^[A-Za-z0-9_-]{16}$/);
    await playAll(a, sessionId, true);
    let view = (await social.challengeView(b, code))!;
    expect(view.players.find((p) => p.userId === a)!.score).toBeNull(); // hidden from a non-participant
    const joined = await social.joinChallenge(b, code);
    const ra = (await getDb().select().from(s.gameSessions).where(eq(s.gameSessions.id, sessionId)))[0].rounds;
    const rb = (await getDb().select().from(s.gameSessions).where(eq(s.gameSessions.id, joined.sessionId)))[0].rounds;
    expect(JSON.stringify(rb)).toBe(JSON.stringify(ra));
    expect(await social.areFriends(getDb(), a, b)).toBe(true);
    view = (await social.challengeView(b, code))!;
    expect(view.bothDone).toBe(false);
    await playAll(b, joined.sessionId, false);
    view = (await social.challengeView(b, code))!;
    expect(view.bothDone).toBe(true);
    const wins = await getDb().select().from(s.xpTransactions).where(and(eq(s.xpTransactions.userId, a), eq(s.xpTransactions.action, "challenge_won")));
    expect(wins).toHaveLength(1);
    await expect(social.joinChallenge(c, code)).rejects.toMatchObject({ code: "expired" }); // only two players
  });

  it("blocked students cannot befriend through links; friendship streak advances when both qualify", async () => {
    await social.blockUser(c, a);
    const code = await social.createInvite(a);
    await expect(social.acceptInvite(c, code)).rejects.toMatchObject({ code: "blocked" });
    // b qualifies today (they played ≥5 answers in the challenge) → a+b friendship streak = 1
    const [f] = await getDb().select().from(s.friendships).where(eq(s.friendships.status, "accepted"));
    expect(f.streak).toBe(1);
  });

  it("official names are immutable outside identity sync (API and database)", async () => {
    await expect(updateProfile(a, { displayName: "اسم مستعار" })).rejects.toMatchObject({ code: "name_immutable" });
    await expect(getDb().update(s.studentProfiles).set({ officialFullName: "اسم آخر" }).where(eq(s.studentProfiles.userId, a))).rejects.toMatchObject({ cause: { message: expect.stringMatching(/identity sync/) } });
    await updateProfile(a, { avatar: "falcon" });
    const [p] = await getDb().select().from(s.studentProfiles).where(eq(s.studentProfiles.userId, a));
    expect(p.avatar).toBe("falcon");
    expect(p.officialFullName).toBe("ريم أحمد");
    // Trusted sync may update it (e.g. Noon renamed the student).
    await upsertUserFromIdentity({ provider: "mock", subject: "noon-a", role: "student", profile: { noonStudentId: "noon-a", displayName: "ريم أحمد العتيبي" } } as never);
    const [p2] = await getDb().select().from(s.studentProfiles).where(eq(s.studentProfiles.userId, a));
    expect(p2.officialFullName).toBe("ريم أحمد العتيبي");
    expect(p2.avatar).toBe("falcon"); // customization untouched
  });

  it("leaderboards: friends first; cohort names restricted to friends unless authorised; opt-in only", async () => {
    const fb = await getFriendsBoard(a, [b]);
    expect(fb.map((r) => r.userId).sort()).toEqual([a, b].sort());
    const [prof] = await getDb().select().from(s.studentProfiles).where(eq(s.studentProfiles.userId, c));
    const board = await getCohortBoard({ id: a, cohortId: prof.cohortId }, [b]);
    expect(board.authorized).toBe(false);
    expect(board.rows.every((r) => r.userId === a || r.userId === b)).toBe(true);
    expect(board.rows.some((r) => r.userId === c)).toBe(false);
  });
});
