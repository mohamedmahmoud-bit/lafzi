import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () =>
  uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
/** A learning day in Asia/Riyadh, stored as 'YYYY-MM-DD'. */
const day = (name = "day") => date(name, { mode: "string" });

export const userRole = pgEnum("user_role", ["student", "admin"]);
export const masteryState = pgEnum("mastery_state", ["new", "learning", "familiar", "mastered"]);
export const wodSource = pgEnum("wod_source", ["auto", "manual"]);
export const sessionStatus = pgEnum("practice_session_status", [
  "in_progress",
  "completed",
  "abandoned",
]);
export const sessionKind = pgEnum("practice_session_kind", ["daily", "review"]);
export const cohortKind = pgEnum("cohort_kind", ["dev", "classroom", "grade", "program"]);

// ─── Identity ──────────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: id(),
    role: userRole("role").notNull().default("student"),
    authProvider: text("auth_provider").notNull(),
    providerSubject: text("provider_subject").notNull(),
    noonStudentId: text("noon_student_id"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_provider_subject_uq").on(t.authProvider, t.providerSubject),
    uniqueIndex("users_noon_student_id_uq").on(t.noonStudentId),
  ],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    /** AES-GCM encrypted Noon refresh token (only for real SSO providers). */
    encryptedRefreshToken: text("encrypted_refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("auth_sessions_token_hash_uq").on(t.tokenHash), index().on(t.userId)],
);

export const cohorts = pgTable("cohorts", {
  id: id(),
  name: text("name").notNull(),
  kind: cohortKind("kind").notNull().default("dev"),
  externalRef: text("external_ref"),
  createdAt: createdAt(),
});

export const studentProfiles = pgTable(
  "student_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    avatar: text("avatar").notNull().default("owl"),
    grade: text("grade"),
    country: text("country").default("SA"),
    cohortId: uuid("cohort_id").references(() => cohorts.id, { onDelete: "set null" }),
    /** Cache of SUM(xp_transactions.xp); the ledger is the source of truth. */
    xpTotal: integer("xp_total").notNull().default(0),
    currentLevel: integer("current_level").notNull().default(1),
    currentStreak: integer("current_streak").notNull().default(0),
    longestStreak: integer("longest_streak").notNull().default(0),
    lastQualifiedDate: day("last_qualified_date"),
    streakFreezes: integer("streak_freezes").notNull().default(0),
    totalWordsLearned: integer("total_words_learned").notNull().default(0),
    masteredWords: integer("mastered_words").notNull().default(0),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.cohortId)],
);

// ─── Vocabulary ────────────────────────────────────────────────────────────

export const vocabularyWords = pgTable(
  "vocabulary_words",
  {
    id: id(),
    word: text("word").notNull(),
    normalizedWord: text("normalized_word").notNull(),
    meaning: text("meaning").notNull(),
    example: text("example").notNull(),
    /** ارتباطات لفظية — free text note, optional. */
    relationNote: text("relation_note"),
    difficulty: smallint("difficulty").notNull().default(2),
    category: text("category").notNull().default("عام"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("vocabulary_words_normalized_uq").on(t.normalizedWord), index().on(t.active)],
);

export const wordSynonyms = pgTable(
  "word_synonyms",
  {
    id: id(),
    wordId: uuid("word_id")
      .notNull()
      .references(() => vocabularyWords.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
  },
  (t) => [uniqueIndex("word_synonyms_uq").on(t.wordId, t.value)],
);

export const wordAntonyms = pgTable(
  "word_antonyms",
  {
    id: id(),
    wordId: uuid("word_id")
      .notNull()
      .references(() => vocabularyWords.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
  },
  (t) => [uniqueIndex("word_antonyms_uq").on(t.wordId, t.value)],
);

export const studentWordProgress = pgTable(
  "student_word_progress",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    wordId: uuid("word_id")
      .notNull()
      .references(() => vocabularyWords.id, { onDelete: "cascade" }),
    state: masteryState("state").notNull().default("new"),
    box: smallint("box").notNull().default(0),
    exposureCount: integer("exposure_count").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    incorrectCount: integer("incorrect_count").notNull().default(0),
    synonymCorrectCount: integer("synonym_correct_count").notNull().default(0),
    masteryScore: smallint("mastery_score").notNull().default(0),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.wordId] }),
    index().on(t.userId, t.nextReviewAt),
    index().on(t.userId, t.state),
  ],
);

// ─── Word of the day ───────────────────────────────────────────────────────

export const wordOfDay = pgTable(
  "word_of_day",
  {
    id: id(),
    day: day().notNull(),
    wordId: uuid("word_id")
      .notNull()
      .references(() => vocabularyWords.id, { onDelete: "restrict" }),
    source: wodSource("source").notNull().default("auto"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("word_of_day_day_uq").on(t.day), index().on(t.wordId)],
);

export type QuestionOption = { id: string; text: string };
export type StoredQuestion = {
  type: QuestionType;
  prompt: string;
  /** Optional stem shown under the prompt (word, sentence, analogy pair). */
  stem?: string;
  options: QuestionOption[];
  correctOptionId: string;
  explanation: string;
  wordId: string;
};
export type QuestionType = "meaning" | "synonym" | "reverse" | "antonym" | "context" | "analogy";

export const studentWordOfDay = pgTable(
  "student_word_of_day",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: day().notNull(),
    wordId: uuid("word_id")
      .notNull()
      .references(() => vocabularyWords.id, { onDelete: "cascade" }),
    /** Ungraded "guess the meaning from context" step shown before the word card is revealed. */
    guessQuestion: jsonb("guess_question").$type<StoredQuestion>().notNull(),
    guessOptionId: text("guess_option_id"),
    /** Graded retrieval question shown after the card is hidden again. */
    question: jsonb("question").$type<StoredQuestion>().notNull(),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }),
    selectedOptionId: text("selected_option_id"),
    isCorrect: boolean("is_correct"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("student_wod_user_day_uq").on(t.userId, t.day)],
);

// ─── Practice sessions ─────────────────────────────────────────────────────

export const practiceSessions = pgTable(
  "practice_sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: day().notNull(),
    kind: sessionKind("kind").notNull().default("daily"),
    status: sessionStatus("status").notNull().default("in_progress"),
    /** Server-held items including answer keys. Never sent to the client as-is. */
    items: jsonb("items").$type<StoredQuestion[]>().notNull(),
    correctCount: integer("correct_count").notNull().default(0),
    totalCount: integer("total_count").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index().on(t.userId, t.day), index().on(t.status, t.completedAt)],
);

export const practiceAnswers = pgTable(
  "practice_answers",
  {
    id: id(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => practiceSessions.id, { onDelete: "cascade" }),
    itemIndex: smallint("item_index").notNull(),
    questionType: text("question_type").notNull(),
    selectedOptionId: text("selected_option_id").notNull(),
    isCorrect: boolean("is_correct").notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("practice_answers_item_uq").on(t.sessionId, t.itemIndex)],
);

// ─── Daily activity (streak history + mission progress) ────────────────────

export const studentDailyActivity = pgTable(
  "student_daily_activity",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: day().notNull(),
    qualified: boolean("qualified").notNull().default(false),
    wordOfDayCompleted: boolean("word_of_day_completed").notNull().default(false),
    sessionsCompleted: integer("sessions_completed").notNull().default(0),
    missionCompletedAt: timestamp("mission_completed_at", { withTimezone: true }),
    xpEarned: integer("xp_earned").notNull().default(0),
    freezeUsed: boolean("freeze_used").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("daily_activity_user_day_uq").on(t.userId, t.day), index().on(t.day)],
);

// ─── Gamification ──────────────────────────────────────────────────────────

export const xpRules = pgTable("xp_rules", {
  action: text("action").primaryKey(),
  xp: integer("xp").notNull(),
  /** Max XP from this action per learning day (null = governed by idempotency only). */
  dailyCap: integer("daily_cap"),
  description: text("description").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: updatedAt(),
});

export const levels = pgTable("levels", {
  level: integer("level").primaryKey(),
  name: text("name").notNull(),
  minXp: integer("min_xp").notNull(),
});

export const xpTransactions = pgTable(
  "xp_transactions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    xp: integer("xp").notNull(),
    sourceId: text("source_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    day: day().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("xp_transactions_idempotency_uq").on(t.idempotencyKey),
    index().on(t.userId, t.day),
    index().on(t.day),
  ],
);

export const badgeCriteria = pgEnum("badge_criteria", [
  "first_activity",
  "streak_days",
  "words_learned",
  "words_mastered",
  "comeback",
  "synonyms_mastered",
  "sessions_completed",
]);

export const badges = pgTable("badges", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull(),
  criteriaType: badgeCriteria("criteria_type").notNull(),
  threshold: integer("threshold").notNull().default(1),
  enabled: boolean("enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const studentBadges = pgTable(
  "student_badges",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    badgeId: uuid("badge_id")
      .notNull()
      .references(() => badges.id, { onDelete: "cascade" }),
    earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow(),
    seenAt: timestamp("seen_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.badgeId] })],
);

// ─── Leaderboards ──────────────────────────────────────────────────────────

export const leaderboardPeriods = pgTable(
  "leaderboard_periods",
  {
    id: id(),
    cohortId: uuid("cohort_id")
      .notNull()
      .references(() => cohorts.id, { onDelete: "cascade" }),
    weekStart: day("week_start").notNull(),
    weekEnd: day("week_end").notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("leaderboard_periods_uq").on(t.cohortId, t.weekStart)],
);

export const leaderboardEntries = pgTable(
  "leaderboard_entries",
  {
    id: id(),
    periodId: uuid("period_id")
      .notNull()
      .references(() => leaderboardPeriods.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    xp: integer("xp").notNull(),
    rank: integer("rank").notNull(),
  },
  (t) => [uniqueIndex("leaderboard_entries_uq").on(t.periodId, t.userId)],
);

// ─── Integration cache, analytics, audit, rate limiting ───────────────────

export const noonSkillSnapshots = pgTable("noon_skill_snapshots", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  payload: jsonb("payload").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    properties: jsonb("properties").$type<Record<string, unknown>>().notNull().default({}),
    day: day().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.name, t.day), index().on(t.userId, t.day)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.createdAt)],
);

export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);
