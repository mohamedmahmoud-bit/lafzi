/**
 * Development seed. Wipes all application tables and inserts:
 * vocabulary (63 words), badges, levels, XP rules, a DEVELOPMENT cohort with mock classmates,
 * a demo student with a 4-day streak ending yesterday, an admin, and some analytics history.
 *
 *   npm run db:seed
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { createDb } from "./client";
import * as s from "./schema";
import { MOCK_CLASSMATES, SEED_BADGES, SEED_WORDS } from "./seed-data/words";
import { DEFAULT_LEVELS, levelFor } from "../features/gamification/levels";
import { DEFAULT_XP_RULES } from "../features/gamification/xp-rules";
import { BOX_INTERVAL_DAYS, stateFor } from "../features/vocabulary/srs";
import { addDays, learningDay, startOfLearningDay } from "../lib/time";
import { normalizeArabic, seededRandom } from "../lib/utils";

const DAY_MS = 86_400_000;

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Seeding is disabled in production");
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  const today = learningDay();
  const rand = seededRandom(20261025);

  const tables = [
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

  // ── Config ────────────────────────────────────────────────────────────
  await db.insert(s.levels).values(DEFAULT_LEVELS);
  await db.insert(s.xpRules).values(Object.values(DEFAULT_XP_RULES));
  const badgeRows = await db
    .insert(s.badges)
    .values(SEED_BADGES.map((b) => ({ ...b })))
    .returning();
  const badgeByCode = new Map(badgeRows.map((b) => [b.code, b]));

  // ── Vocabulary ────────────────────────────────────────────────────────
  const words = await db
    .insert(s.vocabularyWords)
    .values(
      SEED_WORDS.map((w) => ({
        word: w.word,
        normalizedWord: normalizeArabic(w.word),
        meaning: w.meaning,
        example: w.example,
        relationNote: w.relationNote ?? null,
        difficulty: w.difficulty,
        category: w.category,
      })),
    )
    .returning();
  const wordByText = new Map(words.map((w) => [w.word, w]));
  await db
    .insert(s.wordSynonyms)
    .values(
      SEED_WORDS.flatMap((w) =>
        w.synonyms.map((value) => ({ wordId: wordByText.get(w.word)!.id, value })),
      ),
    );
  await db
    .insert(s.wordAntonyms)
    .values(
      SEED_WORDS.flatMap((w) =>
        w.antonyms.map((value) => ({ wordId: wordByText.get(w.word)!.id, value })),
      ),
    );

  // Word of the day: today is scheduled manually (shows the admin scheduling path); past days auto.
  const wodPlan = ["أناة", "وئام", "ثابر", "جلي", "شاسع"];
  await db.insert(s.wordOfDay).values(
    wodPlan.map((w, i) => ({
      day: addDays(today, -i),
      wordId: wordByText.get(w)!.id,
      source: i === 0 ? ("manual" as const) : ("auto" as const),
    })),
  );

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

  // 22 words met; a few due today so the deck has reviews. Today's word stays new.
  const now = Date.now();
  const learned = SEED_WORDS.filter((w) => !wodPlan.slice(0, 1).includes(w.word)).slice(0, 22);
  await db.insert(s.studentWordProgress).values(
    learned.map((w, i) => {
      const box = [1, 2, 2, 3, 3, 4, 5, 5][i % 8];
      const correctCount = box + (box === 5 ? 1 : 0);
      const due = i % 4 === 0;
      return {
        userId: demo.id,
        wordId: wordByText.get(w.word)!.id,
        box,
        state: stateFor(box, correctCount),
        exposureCount: correctCount + (i % 3),
        correctCount,
        incorrectCount: i % 3,
        synonymCorrectCount: Math.floor(correctCount / 3),
        masteryScore: Math.min(100, box * 20 - (i % 3) * 10),
        lastSeenAt: new Date(now - (BOX_INTERVAL_DAYS[box] + 1) * DAY_MS),
        nextReviewAt: new Date(due ? now - 3_600_000 : now + BOX_INTERVAL_DAYS[box] * DAY_MS),
      };
    }),
  );
  const masteredCount = learned.filter((_, i) =>
    [5].includes([1, 2, 2, 3, 3, 4, 5, 5][i % 8]),
  ).length;

  await db.insert(s.studentProfiles).values({
    userId: demo.id,
    displayName: "سارة (تجريبي)",
    avatar: "gazelle",
    grade: "ثالث ثانوي",
    cohortId: cohort.id,
    xpTotal: demoXp,
    currentLevel: levelFor(demoXp).current.level,
    currentStreak: 4,
    longestStreak: 6,
    lastQualifiedDate: addDays(today, -1),
    totalWordsLearned: learned.length,
    masteredWords: masteredCount,
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
    `✓ seeded ${words.length} words, ${badgeRows.length} badges, ${MOCK_CLASSMATES.length} classmates`,
  );
  console.log(
    `  demo student: سارة — streak 4 (ending yesterday), ${demoXp} XP. Today's word: ${wodPlan[0]}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
