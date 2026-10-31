/**
 * Development seed. Wipes all application tables and inserts:
 * taxonomy + game types + config, the MOCK question bank (through the real sync/review pipeline),
 * dev-only Study Hub examples, a DEVELOPMENT cohort with mock classmates,
 * a demo student with a 4-day streak ending yesterday, an admin, and some analytics history.
 *
 *   npm run db:seed
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { createDb } from "./client";
import * as s from "./schema";
import { MOCK_CLASSMATES } from "./seed-data/words";
import { seedDevStudyExamples, seedMockQuestionBank } from "./seed-mock-bank";
import { seedPlatformConfig, stageInitialDataset } from "./seed-platform";
import { levelFor } from "../features/gamification/levels";
import { addDays, learningDay, startOfLearningDay } from "../lib/time";
import { seededRandom } from "../lib/utils";

const DAY_MS = 86_400_000;

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Seeding is disabled in production");
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  const today = learningDay();
  const rand = seededRandom(20261025);

  const tables = [
    "noon_questions",
    "reading_passages",
    "question_sync_runs",
    "curriculum_nodes",
    "game_sessions",
    "game_types",
    "competitions",
    "daily_challenges",
    "skill_progress",
    "noon_skill_mappings",
    "noon_practice_destinations",
    "outbound_practice_events",
    "vocabulary_entries",
    "vocabulary_word_of_day",
    "study_resources",
    "vocab_import_batches",
    "friend_challenges",
    "friend_invites",
    "friendships",
    "user_blocks",
    "user_reports",
    "study_collections",
    "verbal_topics",
    "analytics_events",
    "audit_events",
    "rate_limit_buckets",
    "noon_skill_snapshots",
    "leaderboard_entries",
    "leaderboard_periods",
    "student_badges",
    "badges",
    "xp_transactions",
    "levels",
    "xp_rules",
    "student_daily_activity",
    "practice_answers",
    "practice_sessions",
    "student_word_of_day",
    "word_of_day",
    "student_word_progress",
    "word_antonyms",
    "word_synonyms",
    "vocabulary_words",
    "student_profiles",
    "auth_sessions",
    "users",
    "cohorts",
  ];
  await db.execute(sql.raw(`TRUNCATE ${tables.join(", ")} CASCADE`));

  // ── Config (same as production) ───────────────────────────────────
  await seedPlatformConfig(db);
  const badgeRows = await db.select().from(s.badges);
  const badgeByCode = new Map(badgeRows.map((b) => [b.code, b]));

  // ── MOCK question bank through the real pipeline (dev only) ──────────
  const bank = await seedMockQuestionBank(db);
  // Initial vocabulary dataset → staging → (dev reviewer) approve every row that passed all checks.
  const staged = await stageInitialDataset(db);
  const { acceptAllClean } = await import("../features/lexicon/service");
  const accepted = staged ? await acceptAllClean(db, null, staged.batch.id) : 0;
  console.log(`  vocabulary: ${staged?.batch.rowCount ?? 0} rows staged, ${accepted} clean rows approved (dev), flagged rows left for review`);
  await seedDevStudyExamples(db);

  // ── Cohort + users ────────────────────────────────────────────────────
  const [cohort] = await db
    .insert(s.cohorts)
    .values({ name: "دفعة قدرات 1448 — بيانات تجريبية", kind: "dev" })
    .returning();

  const [demo] = await db
    .insert(s.users)
    .values({
      authProvider: "mock",
      providerSubject: "dev-student-001",
      noonStudentId: "DEV-NOON-1001",
    })
    .returning();
  const [admin] = await db
    .insert(s.users)
    .values({
      authProvider: "mock",
      providerSubject: "dev-admin-001",
      noonStudentId: "DEV-NOON-ADMIN",
      role: "admin",
    })
    .returning();
  await db.insert(s.studentProfiles).values({
    userId: admin.id,
    displayName: "مشرف المحتوى (تجريبي)",
    officialFullName: "مشرف المحتوى (تجريبي)",
    avatar: "owl",
    cohortId: null,
  });

  // ── Demo student history: qualified on the 4 days before today (+ one older day) ─────────
  const historyDays = [-10, -4, -3, -2, -1].map((d) => addDays(today, d));
  const ledger: (typeof s.xpTransactions.$inferInsert)[] = [];
  for (const day of historyDays) {
    ledger.push(
      {
        userId: demo.id,
        action: "wod_opened",
        xp: 2,
        day,
        idempotencyKey: `wod_opened:${demo.id}:${day}`,
      },
      {
        userId: demo.id,
        action: "wod_answered",
        xp: 5,
        day,
        idempotencyKey: `wod_answered:${demo.id}:${day}`,
      },
      {
        userId: demo.id,
        action: "wod_correct",
        xp: 5,
        day,
        idempotencyKey: `wod_correct:${demo.id}:${day}`,
      },
      {
        userId: demo.id,
        action: "session_completed",
        xp: 20,
        day,
        idempotencyKey: `session_completed:${demo.id}:${day}`,
      },
      {
        userId: demo.id,
        action: "mission_completed",
        xp: 25,
        day,
        idempotencyKey: `mission_completed:${demo.id}:${day}`,
      },
    );
  }
  // Older top-up so the student sits just below level 3 (300 XP) — today's mission levels them up.
  const before = ledger.reduce((sum, t) => sum + t.xp, 0);
  ledger.push({
    userId: demo.id,
    action: "review_correct",
    xp: 255 - before,
    day: addDays(today, -12),
    idempotencyKey: `seed_topup:${demo.id}`,
  });
  await db.insert(s.xpTransactions).values(ledger);
  const demoXp = 255;

  await db.insert(s.studentDailyActivity).values(
    historyDays.map((day) => ({
      userId: demo.id,
      day,
      qualified: true,
      wordOfDayCompleted: true,
      sessionsCompleted: 1,
      missionCompletedAt: new Date(startOfLearningDay(day).getTime() + 19 * 3_600_000),
      xpEarned: 57,
    })),
  );
  for (const day of historyDays) {
    await db.insert(s.practiceSessions).values({
      userId: demo.id,
      day,
      kind: "daily",
      status: "completed",
      items: [],
      correctCount: 7,
      totalCount: 9,
      startedAt: new Date(startOfLearningDay(day).getTime() + 19 * 3_600_000),
      completedAt: new Date(startOfLearningDay(day).getTime() + 19.1 * 3_600_000),
    });
  }

  // Extra review sessions on past days: 9 completed in total, so today's session earns «نَفَس طويل».
  for (const day of historyDays.slice(1)) {
    await db.insert(s.practiceSessions).values({
      userId: demo.id,
      day,
      kind: "review",
      status: "completed",
      items: [],
      correctCount: 6,
      totalCount: 8,
      startedAt: new Date(startOfLearningDay(day).getTime() + 20 * 3_600_000),
      completedAt: new Date(startOfLearningDay(day).getTime() + 20.1 * 3_600_000),
    });
  }

  const now = Date.now();

  await db.insert(s.studentProfiles).values({
    userId: demo.id,
    displayName: "سارة (تجريبي)",
    officialFullName: "سارة (تجريبي)",
    avatar: "gazelle",
    grade: "ثالث ثانوي",
    cohortId: cohort.id,
    xpTotal: demoXp,
    currentLevel: levelFor(demoXp).current.level,
    currentStreak: 4,
    longestStreak: 6,
    lastQualifiedDate: addDays(today, -1),
    totalWordsLearned: 0,
    masteredWords: 0,
    lastActivityAt: new Date(now - DAY_MS),
  });
  await db.insert(s.studentBadges).values([
    {
      userId: demo.id,
      badgeId: badgeByCode.get("first_step")!.id,
      earnedAt: new Date(now - 10 * DAY_MS),
      seenAt: new Date(),
    },
    {
      userId: demo.id,
      badgeId: badgeByCode.get("streak_3")!.id,
      earnedAt: new Date(now - 2 * DAY_MS),
    },
  ]);

  // ── Mock classmates (DEVELOPMENT DATA) ────────────────────────────────
  const lastWeekStart = addDays(today, -7);
  for (const [i, c] of MOCK_CLASSMATES.entries()) {
    const [u] = await db
      .insert(s.users)
      .values({
        authProvider: "mock",
        providerSubject: `dev-classmate-${i}`,
        noonStudentId: `DEV-NOON-20${i}`,
      })
      .returning();
    const lastWeekXp = Math.round(60 + rand() * 200);
    const total = c.weekXp + lastWeekXp;
    await db.insert(s.studentProfiles).values({
      userId: u.id,
      displayName: c.name,
      officialFullName: c.name,
      shareScores: true,
      avatar: c.avatar,
      grade: "ثالث ثانوي",
      cohortId: cohort.id,
      xpTotal: total,
      currentLevel: levelFor(total).current.level,
      currentStreak: c.weekXp > 0 ? 1 + (i % 5) : 0,
      longestStreak: 3 + (i % 7),
      lastQualifiedDate: c.weekXp > 0 ? today : addDays(today, -3),
    });
    const tx: (typeof s.xpTransactions.$inferInsert)[] = [
      {
        userId: u.id,
        action: "session_completed",
        xp: lastWeekXp,
        day: lastWeekStart,
        idempotencyKey: `seed:lw:${u.id}`,
      },
    ];
    if (c.weekXp > 0) {
      tx.push({
        userId: u.id,
        action: "session_completed",
        xp: c.weekXp,
        day: today,
        idempotencyKey: `seed:tw:${u.id}`,
      });
    }
    await db.insert(s.xpTransactions).values(tx);

    // Activity + analytics history for the admin metrics (last 14 days).
    for (let d = -14; d <= 0; d++) {
      if (rand() > 0.55 + (i < 4 ? 0.3 : 0)) continue;
      const day = addDays(today, d);
      const mission = rand() < 0.7;
      await db.insert(s.studentDailyActivity).values({
        userId: u.id,
        day,
        qualified: true,
        wordOfDayCompleted: true,
        sessionsCompleted: mission ? 1 : 0,
        missionCompletedAt: mission ? startOfLearningDay(day) : null,
      });
      const at = new Date(startOfLearningDay(day).getTime() + 18 * 3_600_000);
      const ev = (name: string, properties: Record<string, unknown> = {}) => ({
        userId: u.id,
        name,
        properties: { ...properties, seed: true },
        day,
        occurredAt: at,
      });
      const events = [ev("dashboard_viewed"), ev("word_of_day_completed")];
      if (mission) {
        events.push(ev("daily_mission_completed"), ev("noon_heatmap_cta_viewed"));
        if (rand() < 0.45) {
          const click = { src: "session_reward", skill: "sentence_completion" };
          events.push(ev("noon_practice_clicked", click), ev("noon_heatmap_cta_clicked", click));
        }
      }
      await db.insert(s.analyticsEvents).values(events);
    }
  }

  await pool.end();
  console.log(
    `✓ seeded MOCK bank: sync ${bank.run.status} ${JSON.stringify(bank.run.stats)}, ${bank.published} published, ${bank.approvedRelations} relations approved`,
  );
  console.log(`  ${badgeRows.length} badges, ${MOCK_CLASSMATES.length} classmates; demo student: سارة — streak 4, ${demoXp} XP`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
