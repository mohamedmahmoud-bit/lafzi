/**
 * Integration tests against a real Postgres (DATABASE_URL_TEST). They prove the platform's
 * guarantees end-to-end: idempotent XP and caps, question-bank reconciliation (no duplicates,
 * versioning, suspension, removal), publish rules, fail-closed games, server-graded rounds,
 * historical attempts keeping their version, and bank-derived vocabulary. Skipped without a DB.
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

describe.skipIf(!TEST_URL)("platform integrity (Postgres)", async () => {
  const { getDb } = await import("@/db/client");
  const s = await import("@/db/schema");
  const { awardXp, lockProfile } = await import("@/features/gamification/xp.service");
  const { DEFAULT_XP_RULES } = await import("@/features/gamification/xp-rules");
  const { seedPlatformConfig } = await import("@/db/seed-platform");
  const { seedMockQuestionBank, DEV_CHAPTERS } = await import("@/db/seed-mock-bank");
  const { MockQuestionBankProvider, NoQuestionBankProvider } = await import("@/features/question-bank/providers");
  const { buildMockQuestions } = await import("@/features/question-bank/providers/mock-data");
  const { syncQuestionBank } = await import("@/features/question-bank/sync.service");
  const { decideQuestion } = await import("@/features/question-bank/pipeline");
  const games = await import("@/features/games/session.service");
  const wod = await import("@/features/word-bank/wod.service");
  const vocab = await import("@/features/word-bank/service");
  const { learningDay } = await import("@/lib/time");

  let userId: string;
  const day = learningDay();
  const provider = new MockQuestionBankProvider();
  const sync = () => syncQuestionBank(getDb(), { provider, mode: "manual", chapters: DEV_CHAPTERS, isProduction: false });
  const q = async (noonId: number) => (await getDb().select().from(s.noonQuestions).where(eq(s.noonQuestions.noonQuestionId, noonId)))[0];
  const ledgerTotal = async () =>
    (await getDb().select({ t: sql<number>`coalesce(sum(${s.xpTransactions.xp}),0)::int` }).from(s.xpTransactions).where(eq(s.xpTransactions.userId, userId)))[0].t;
  const profile = async () => (await getDb().select().from(s.studentProfiles).where(eq(s.studentProfiles.userId, userId)))[0];

  beforeAll(async () => {
    const pool = new Pool({ connectionString: TEST_URL });
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
    await pool.end();
    const db = getDb();
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seedPlatformConfig(db);
    const [cohort] = await db.insert(s.cohorts).values({ name: "test" }).returning();
    const [u] = await db.insert(s.users).values({ authProvider: "mock", providerSubject: "t1" }).returning();
    userId = u.id;
    await db.insert(s.studentProfiles).values({ userId, displayName: "اختبار", cohortId: cohort.id });
  });

  afterAll(async () => {
    const g = globalThis as unknown as { lafziPool?: Pool };
    await g.lafziPool?.end();
  });

  it("XP: once per idempotency key, and daily caps hold under concurrency", async () => {
    const grant = () =>
      getDb().transaction(async (tx) => {
        await lockProfile(tx, userId);
        return awardXp(tx, { userId, action: "wod_opened", idempotencyKey: `wod_opened:${userId}:${day}`, day });
      });
    expect(await grant()).toBe(2);
    expect(await grant()).toBe(0);
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        getDb().transaction(async (tx) => {
          await lockProfile(tx, userId);
          return awardXp(tx, { userId, action: "review_correct", idempotencyKey: `rc:${i}`, day });
        }),
      ),
    );
    expect(results.reduce((a, b) => a + b, 0)).toBe(DEFAULT_XP_RULES.review_correct.dailyCap);
    expect((await profile()).xpTotal).toBe(await ledgerTotal());
  });

  it("games fail closed when nothing is published or approved", async () => {
    await expect(games.startGame(userId, "relations_hunter", { timed: false })).rejects.toMatchObject({ code: "content_unavailable" });
    await expect(games.startGame(userId, "meaning_hunter")).rejects.toMatchObject({ code: "content_unavailable" });
    expect((await wod.getVocabWod(userId)).status).toBe("unavailable");
  });

  it("an unconfigured source records not_configured and imports nothing", async () => {
    const run = await syncQuestionBank(getDb(), { provider: new NoQuestionBankProvider(), mode: "manual", chapters: DEV_CHAPTERS, isProduction: false });
    expect(run.status).toBe("not_configured");
    expect((await getDb().select().from(s.noonQuestions)).length).toBe(0);
  });

  it("mock provider is refused in production", async () => {
    await expect(syncQuestionBank(getDb(), { provider, mode: "manual", chapters: DEV_CHAPTERS, isProduction: true })).rejects.toThrow(/production/);
  });

  it("re-importing the same bank creates no duplicates or new versions", async () => {
    const first = await sync();
    expect(first.status).toBe("succeeded");
    const n = buildMockQuestions().length;
    expect(first.stats.new).toBe(n);
    const second = await sync();
    expect(second.stats.new).toBe(0);
    expect(second.stats.unchanged).toBe(n);
    expect((await getDb().select().from(s.noonQuestions)).length).toBe(n);
    expect((await getDb().select().from(s.noonQuestionVersions)).length).toBe(n);
  });

  it("publishing is a separate human decision and is refused on validation errors", async () => {
    const first = await q(990001);
    expect(first.status).toBe("ready"); // validated, NOT yet visible to students
    expect(first.publishedVersionId).toBeNull();
    // Break a question at the source: no correct answer → rejected, cannot be published.
    provider.data = provider.data.map((d) => (d.id === 990020 ? { ...d, correctChoiceId: null, correctChoiceIds: [] } : d));
    await sync();
    const broken = await q(990020);
    expect(broken.status).toBe("rejected");
    await expect(decideQuestion(getDb(), { questionId: broken.id, decision: "approve", reviewerId: null, isProduction: false })).rejects.toThrow(/validation/);
  });

  it("full pipeline: publish, play a server-graded game, answers locked, completion single-use", async () => {
    const seeded = await seedMockQuestionBank(getDb(), provider);
    expect(seeded.published).toBeGreaterThan(10);
    await getDb().update(s.gameTypes).set({ status: "live" }).where(eq(s.gameTypes.id, "relations_hunter"));
    const { id } = await games.startGame(userId, "relations_hunter", { timed: false });
    expect((await games.startGame(userId, "relations_hunter", { timed: false })).id).toBe(id);
    const view = (await games.getGameView(userId, id))!;
    // No answer keys or explanations before answering.
    expect(view.rounds.every((r) => r.answered === null)).toBe(true);
    expect(JSON.stringify(view.rounds)).not.toContain("correctId");

    const r0 = view.rounds[0];
    const a1 = await games.answerRound(userId, id, 0, r0.choices[0].id);
    const a2 = await games.answerRound(userId, id, 0, r0.choices[1].id);
    expect(a2.isCorrect).toBe(a1.isCorrect);
    expect(a2.points).toBe(0);
    await expect(games.completeGame(userId, id)).rejects.toMatchObject({ code: "incomplete" });
    await expect(games.answerRound(userId, id, 99, "x")).rejects.toMatchObject({ code: "bad_round" });

    const hint = await games.useHint(userId, id, 1);
    expect(view.rounds[1].choices.map((c) => c.id)).toContain(hint.removed);
    for (let i = 1; i < view.total; i++) await games.answerRound(userId, id, i, view.rounds[i].choices[0].id);
    const done = await games.completeGame(userId, id);
    expect(done.rewards.awards.map((x) => x.action)).toContain("game_completed");
    expect(done.subskills.length).toBeGreaterThan(0);
    await expect(games.completeGame(userId, id)).rejects.toMatchObject({ code: "not_in_progress" });
    expect((await profile()).xpTotal).toBe(await ledgerTotal());
    const [prog] = await getDb().select().from(s.skillProgress).where(eq(s.skillProgress.userId, userId));
    expect(prog.attempts).toBeGreaterThan(0);
  });

  it("another student cannot read or answer someone else's game", async () => {
    const [other] = await getDb().insert(s.users).values({ authProvider: "mock", providerSubject: "t2" }).returning();
    await getDb().insert(s.studentProfiles).values({ userId: other.id, displayName: "آخر" });
    const [sess] = await getDb().select().from(s.gameSessions).where(eq(s.gameSessions.userId, userId)).limit(1);
    expect(await games.getGameView(other.id, sess.id)).toBeNull();
    await expect(games.answerRound(other.id, sess.id, 0, "x")).rejects.toMatchObject({ code: "not_found" });
  });

  it("a correctness change at Noon suspends the question; history keeps the old version", async () => {
    const [ans] = await getDb().select().from(s.gameSessionAnswers).limit(1);
    const question = (await getDb().select().from(s.noonQuestions).where(eq(s.noonQuestions.id, ans.questionId!)))[0];
    const oldVersion = ans.questionVersionId;
    provider.data = provider.data.map((d) => (d.id === question.noonQuestionId ? { ...d, correctChoiceId: d.choices![1].id, correctChoiceIds: [d.choices![1].id] } : d));
    const run = await sync();
    expect(run.stats.modified).toBeGreaterThanOrEqual(1);
    expect(run.stats.suspended).toBeGreaterThanOrEqual(1);
    const after = await q(question.noonQuestionId);
    expect(after.status).toBe("review_required");
    expect(after.publishedVersionId).toBeNull();
    expect(after.currentVersionId).not.toBe(oldVersion);
    const [still] = await getDb().select().from(s.gameSessionAnswers).where(eq(s.gameSessionAnswers.id, ans.id));
    expect(still.questionVersionId).toBe(oldVersion);
  });

  it("an explanation-only edit keeps a published question live on the new version", async () => {
    const pub = (await getDb().select().from(s.noonQuestions).where(and(eq(s.noonQuestions.status, "published"), eq(s.noonQuestions.noonQuestionId, 990014))))[0];
    expect(pub).toBeTruthy();
    provider.data = provider.data.map((d) => (d.id === 990014 ? { ...d, additionalMaterials: [{ id: 1, type: "explanation", content: "<p>شرح محدّث (تجريبي)</p>" }] } : d));
    await sync();
    const after = await q(990014);
    expect(after.status).toBe("published");
    expect(after.publishedVersionId).toBe(after.currentVersionId);
    expect(after.publishedVersionId).not.toBe(pub.publishedVersionId);
  });

  it("Noon-derived vocabulary: approved only with Noon evidence; distractors never become relations", async () => {
    const rels = await vocab.approvedRelations(getDb(), { isProduction: false });
    expect(rels.length).toBeGreaterThan(0);
    for (const r of rels) expect(r.evidence.length).toBeGreaterThan(0);
    expect(rels.flatMap((r) => [r.from.lemma, r.to.lemma])).not.toContain("بخيل");
  });

  it("removing a source question archives it and suspends vocabulary built on it", async () => {
    const before = await vocab.approvedRelations(getDb(), { isProduction: false });
    const victim = before[0].evidence[0].noonQuestionId;
    provider.data = provider.data.filter((d) => d.id !== victim);
    const run = await sync();
    expect(run.stats.removed).toBe(1);
    expect((await q(victim)).status).toBe("archived");
    await vocab.runVocabularyExtraction(getDb());
    const after = await vocab.approvedRelations(getDb(), { isProduction: false });
    expect(after.find((r) => r.evidence.every((e) => e.noonQuestionId === victim))).toBeUndefined();
  });

  it("a partial run never archives anything", async () => {
    const flaky = new MockQuestionBankProvider(provider.data);
    let calls = 0;
    const orig = flaky.listQuestions.bind(flaky);
    flaky.listQuestions = async (p) => {
      if (++calls > 1) throw new Error("network");
      return orig(p);
    };
    const run = await syncQuestionBank(getDb(), { provider: flaky, mode: "manual", chapters: DEV_CHAPTERS, isProduction: false });
    expect(run.status).not.toBe("succeeded");
    expect(run.stats.removed).toBe(0);
  }, 30_000);
});
