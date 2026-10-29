import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  real,
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
    gamesCompleted: integer("games_completed").notNull().default(0),
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

// ════════════════════════════════════════════════════════════════════════════
// Canonical curriculum — mirrors Noon's verbal curriculum (subject 249). ONE taxonomy shared by
// games, question bank, skill progress, study resources and Noon practice destinations.
// ════════════════════════════════════════════════════════════════════════════

export const curriculumLevel = pgEnum("curriculum_level", ["chapter", "topic", "subtopic", "concept"]);

/** Raw mirror of Noon curriculum nodes (from NoonQuestionBankProvider.getCurriculum). */
export const curriculumNodes = pgTable(
  "curriculum_nodes",
  {
    key: text("key").primaryKey(), // e.g. "subtopic:1173"
    level: curriculumLevel("level").notNull(),
    noonId: integer("noon_id").notNull(),
    parentKey: text("parent_key"),
    name: text("name").notNull(),
    sequence: integer("sequence").notNull().default(0),
    deleted: boolean("deleted").notNull().default(false),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.level, t.noonId), index().on(t.parentKey)],
);

/** Product topics (≈ Noon chapters). Configurable; ids are stable slugs. */
export const verbalTopics = pgTable("verbal_topics", {
  id: text("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  noonChapterId: integer("noon_chapter_id"),
  description: text("description"),
  sort: integer("sort").notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: updatedAt(),
});

/** Product subskills (≈ Noon subtopics). */
export const verbalSubskills = pgTable(
  "verbal_subskills",
  {
    id: text("id").primaryKey(), // e.g. "st_1173"
    topicId: text("topic_id")
      .notNull()
      .references(() => verbalTopics.id, { onDelete: "cascade" }),
    nameAr: text("name_ar").notNull(),
    noonTopicId: integer("noon_topic_id"),
    noonSubtopicId: integer("noon_subtopic_id"),
    sort: integer("sort").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.topicId), uniqueIndex("verbal_subskills_noon_subtopic_uq").on(t.noonSubtopicId)],
);

// ════════════════════════════════════════════════════════════════════════════
// Official Noon question bank (single source of truth for assessment content)
// ════════════════════════════════════════════════════════════════════════════

export const questionStatus = pgEnum("question_status", [
  "imported",
  "validating",
  "ready",
  "published",
  "review_required",
  "rejected",
  "archived",
]);

export const noonQuestions = pgTable(
  "noon_questions",
  {
    id: id(),
    noonQuestionId: bigint("noon_question_id", { mode: "number" }).notNull(),
    status: questionStatus("status").notNull().default("imported"),
    currentVersionId: uuid("current_version_id"),
    /** Version students are currently served (only set while published). */
    publishedVersionId: uuid("published_version_id"),
    topicId: text("topic_id").references(() => verbalTopics.id, { onDelete: "set null" }),
    subskillId: text("subskill_id").references(() => verbalSubskills.id, { onDelete: "set null" }),
    difficulty: smallint("difficulty"),
    passageId: uuid("passage_id"),
    isMock: boolean("is_mock").notNull().default(false),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    statusReason: text("status_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("noon_questions_noon_id_uq").on(t.noonQuestionId),
    index().on(t.status, t.topicId, t.subskillId),
  ],
);

/** Immutable snapshots of a question as received from Noon. Never overwritten. */
export const noonQuestionVersions = pgTable(
  "noon_question_versions",
  {
    id: id(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => noonQuestions.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    contentHash: text("content_hash").notNull(),
    /** Normalised NoonQuestion (see features/question-bank/types.ts). */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** Exactly what the provider returned, for audit. */
    raw: jsonb("raw").$type<Record<string, unknown>>(),
    correctnessHash: text("correctness_hash").notNull(),
    syncRunId: uuid("sync_run_id"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("noon_question_versions_hash_uq").on(t.questionId, t.contentHash),
    uniqueIndex("noon_question_versions_num_uq").on(t.questionId, t.version),
  ],
);

export const syncRunStatus = pgEnum("sync_run_status", ["running", "succeeded", "partial", "failed", "not_configured"]);

export const questionSyncRuns = pgTable(
  "question_sync_runs",
  {
    id: id(),
    provider: text("provider").notNull(),
    mode: text("mode").notNull(), // "scheduled" | "manual" | "seed"
    scope: jsonb("scope").$type<Record<string, unknown>>().notNull().default({}),
    status: syncRunStatus("status").notNull().default("running"),
    stats: jsonb("stats").$type<Record<string, number>>().notNull().default({}),
    error: text("error"),
    attempt: integer("attempt").notNull().default(1),
    triggeredBy: uuid("triggered_by").references(() => users.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index().on(t.startedAt)],
);

export const checkSeverity = pgEnum("check_severity", ["error", "warning", "info"]);

export const questionValidationResults = pgTable(
  "question_validation_results",
  {
    id: id(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => noonQuestionVersions.id, { onDelete: "cascade" }),
    check: text("check").notNull(),
    passed: boolean("passed").notNull(),
    severity: checkSeverity("severity").notNull(),
    message: text("message").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.versionId)],
);

export const decisionStatus = pgEnum("decision_status", ["proposed", "approved", "rejected"]);

export const questionSkillMappings = pgTable(
  "question_skill_mappings",
  {
    questionId: uuid("question_id")
      .notNull()
      .references(() => noonQuestions.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // "noon_tag" | "manual" | "ai_suggestion"
    topicId: text("topic_id").references(() => verbalTopics.id, { onDelete: "set null" }),
    subskillId: text("subskill_id").references(() => verbalSubskills.id, { onDelete: "set null" }),
    status: decisionStatus("status").notNull().default("proposed"),
    note: text("note"),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.questionId, t.source] })],
);

export const questionGameCompatibility = pgTable(
  "question_game_compatibility",
  {
    questionId: uuid("question_id")
      .notNull()
      .references(() => noonQuestions.id, { onDelete: "cascade" }),
    gameMode: text("game_mode").notNull(),
    /** native = same task/choices/answer; transform = needs a verified semantic mapping + approval. */
    basis: text("basis").notNull(),
    status: decisionStatus("status").notNull().default("proposed"),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.questionId, t.gameMode] }), index().on(t.gameMode, t.status)],
);

export const questionReviewDecisions = pgTable(
  "question_review_decisions",
  {
    id: id(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => noonQuestions.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").references(() => noonQuestionVersions.id, { onDelete: "set null" }),
    decision: text("decision").notNull(), // approve | reject | archive | request_review
    reason: text("reason"),
    reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.questionId)],
);

export const readingPassages = pgTable(
  "reading_passages",
  {
    id: id(),
    /** Noon additionalMaterials id of type "reference". */
    noonReferenceId: bigint("noon_reference_id", { mode: "number" }).notNull(),
    body: text("body").notNull(),
    contentHash: text("content_hash").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("reading_passages_ref_uq").on(t.noonReferenceId)],
);

export const questionPassageLinks = pgTable(
  "question_passage_links",
  {
    questionId: uuid("question_id")
      .notNull()
      .references(() => noonQuestions.id, { onDelete: "cascade" }),
    passageId: uuid("passage_id")
      .notNull()
      .references(() => readingPassages.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.questionId, t.passageId] })],
);

// ════════════════════════════════════════════════════════════════════════════
// Games
// ════════════════════════════════════════════════════════════════════════════

export const gameTypes = pgTable("game_types", {
  id: text("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  topicId: text("topic_id").references(() => verbalTopics.id, { onDelete: "set null" }),
  description: text("description").notNull(),
  status: text("status").notNull().default("coming_soon"), // live | coming_soon
  sort: integer("sort").notNull().default(0),
});

export const gameSessions = pgTable(
  "game_sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameTypeId: text("game_type_id")
      .notNull()
      .references(() => gameTypes.id),
    timed: boolean("timed").notNull().default(false),
    status: text("status").notNull().default("in_progress"), // in_progress | completed | abandoned
    day: day().notNull(),
    /** Server-only round snapshots incl. answer keys and the exact question version. */
    rounds: jsonb("rounds").$type<Record<string, unknown>[]>().notNull().default([]),
    plannedRounds: integer("planned_rounds").notNull(),
    score: integer("score").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    xpAwarded: integer("xp_awarded").notNull().default(0),
    summary: jsonb("summary").$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index().on(t.userId, t.day), index().on(t.gameTypeId, t.day, t.status)],
);

export const gameSessionAnswers = pgTable(
  "game_session_answers",
  {
    id: id(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => gameSessions.id, { onDelete: "cascade" }),
    roundIndex: smallint("round_index").notNull(),
    questionId: uuid("question_id").references(() => noonQuestions.id, { onDelete: "set null" }),
    /** The exact version answered — historical attempts are never re-pointed. */
    questionVersionId: uuid("question_version_id").references(() => noonQuestionVersions.id, { onDelete: "set null" }),
    subskillId: text("subskill_id"),
    response: jsonb("response").$type<Record<string, unknown>>().notNull(),
    isCorrect: boolean("is_correct").notNull(),
    points: integer("points").notNull().default(0),
    hintUsed: boolean("hint_used").notNull().default(false),
    timeMs: integer("time_ms"),
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("game_session_answers_uq").on(t.sessionId, t.roundIndex), index().on(t.subskillId)],
);

/** Local (لفظي) performance per subskill — never presented as Noon's official heat map. */
export const skillProgress = pgTable(
  "skill_progress",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subskillId: text("subskill_id")
      .notNull()
      .references(() => verbalSubskills.id, { onDelete: "cascade" }),
    attempts: integer("attempts").notNull().default(0),
    correct: integer("correct").notNull().default(0),
    recent: jsonb("recent").$type<number[]>().notNull().default([]),
    mastery: real("mastery").notNull().default(0),
    level: smallint("level").notNull().default(1),
    lastPlayedAt: timestamp("last_played_at", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.subskillId] })],
);

export const dailyChallenges = pgTable(
  "daily_challenges",
  {
    id: id(),
    day: day().notNull(),
    gameTypeId: text("game_type_id").references(() => gameTypes.id),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("daily_challenges_day_uq").on(t.day)],
);

export const competitions = pgTable(
  "competitions",
  {
    id: id(),
    kind: text("kind").notNull(), // weekly_overall | weekly_topic
    topicId: text("topic_id").references(() => verbalTopics.id),
    startsOn: day("starts_on").notNull(),
    endsOn: day("ends_on").notNull(),
    title: text("title").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("competitions_uq").on(t.kind, t.topicId, t.startsOn)],
);

export const competitionEntries = pgTable(
  "competition_entries",
  {
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    score: integer("score").notNull().default(0),
    sessions: integer("sessions").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.competitionId, t.userId] })],
);

export const studentCompetitionResults = pgTable(
  "student_competition_results",
  {
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    score: integer("score").notNull(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.competitionId, t.userId] })],
);

// ════════════════════════════════════════════════════════════════════════════
// Noon practice integration (verified destinations only)
// ════════════════════════════════════════════════════════════════════════════

export const noonSkillMappings = pgTable(
  "noon_skill_mappings",
  {
    id: id(),
    topicId: text("topic_id")
      .notNull()
      .references(() => verbalTopics.id, { onDelete: "cascade" }),
    /** null = topic-level mapping. */
    subskillId: text("subskill_id").references(() => verbalSubskills.id, { onDelete: "cascade" }),
    noonChapterId: integer("noon_chapter_id"),
    noonTopicId: integer("noon_topic_id"),
    noonSubtopicId: integer("noon_subtopic_id"),
    noonConceptId: integer("noon_concept_id"),
    noonLabel: text("noon_label"),
    notes: text("notes"),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("noon_skill_mappings_uq").on(t.topicId, t.subskillId)],
);

export const noonPracticeDestinations = pgTable(
  "noon_practice_destinations",
  {
    id: id(),
    kind: text("kind").notNull(), // skill_practice | heatmap | general_practice
    mappingId: uuid("mapping_id").references(() => noonSkillMappings.id, { onDelete: "set null" }),
    url: text("url").notNull(),
    platform: text("platform").notNull().default("web"), // web | mobile_web | app | any
    verificationStatus: text("verification_status").notNull().default("unverified"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.kind, t.verificationStatus)],
);

export const noonIntegrationVerifications = pgTable(
  "noon_integration_verifications",
  {
    id: id(),
    destinationId: uuid("destination_id")
      .notNull()
      .references(() => noonPracticeDestinations.id, { onDelete: "cascade" }),
    scenario: text("scenario").notNull(),
    result: text("result").notNull(), // pass | fail | partial
    observedLanding: text("observed_landing").notNull(),
    notes: text("notes"),
    verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.destinationId, t.createdAt)],
);

export const outboundPracticeEvents = pgTable(
  "outbound_practice_events",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    source: text("source").notNull(),
    topicId: text("topic_id"),
    subskillId: text("subskill_id"),
    destinationId: uuid("destination_id").references(() => noonPracticeDestinations.id, { onDelete: "set null" }),
    destinationKind: text("destination_kind"),
    outcome: text("outcome").notNull(), // redirected | fallback
    day: day().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.day, t.outcome)],
);

// ════════════════════════════════════════════════════════════════════════════
// Question-bank-derived vocabulary (no word exists without a Noon source question)
// ════════════════════════════════════════════════════════════════════════════

export const vocabStatus = pgEnum("vocab_status", ["candidate", "review_required", "approved", "rejected", "suspended"]);

export const vocabularyEntries = pgTable(
  "vocabulary_entries",
  {
    id: id(),
    lemma: text("lemma").notNull(),
    normalized: text("normalized").notNull(),
    status: vocabStatus("status").notNull().default("candidate"),
    /** Only shown when meaningStatus = approved and backed by evidence. */
    meaning: text("meaning"),
    meaningStatus: text("meaning_status").notNull().default("none"), // none | proposed | approved
    meaningEvidence: jsonb("meaning_evidence").$type<Record<string, unknown>[]>().notNull().default([]),
    isMock: boolean("is_mock").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("vocabulary_entries_norm_uq").on(t.normalized), index().on(t.status)],
);

export const vocabularyQuestionSources = pgTable(
  "vocabulary_question_sources",
  {
    entryId: uuid("entry_id")
      .notNull()
      .references(() => vocabularyEntries.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => noonQuestions.id, { onDelete: "cascade" }),
    questionVersionId: uuid("question_version_id").references(() => noonQuestionVersions.id, { onDelete: "set null" }),
    role: text("role").notNull(), // stem | correct_choice | choice
    context: text("context").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.questionId, t.role] })],
);

export const vocabularyRelationships = pgTable(
  "vocabulary_relationships",
  {
    id: id(),
    fromEntryId: uuid("from_entry_id")
      .notNull()
      .references(() => vocabularyEntries.id, { onDelete: "cascade" }),
    toEntryId: uuid("to_entry_id")
      .notNull()
      .references(() => vocabularyEntries.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // synonym | antonym
    status: vocabStatus("status").notNull().default("candidate"),
    /** [{ questionId, noonQuestionId, versionId, kind, excerpt }] — required for publishing. */
    evidence: jsonb("evidence").$type<Record<string, unknown>[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("vocabulary_relationships_uq").on(t.fromEntryId, t.toEntryId, t.type), index().on(t.status)],
);

export const vocabularyValidationRecords = pgTable(
  "vocabulary_validation_records",
  {
    id: id(),
    entryId: uuid("entry_id").references(() => vocabularyEntries.id, { onDelete: "cascade" }),
    relationshipId: uuid("relationship_id").references(() => vocabularyRelationships.id, { onDelete: "cascade" }),
    check: text("check").notNull(),
    passed: boolean("passed").notNull(),
    message: text("message").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.entryId), index().on(t.relationshipId)],
);

export const vocabularyReviewDecisions = pgTable(
  "vocabulary_review_decisions",
  {
    id: id(),
    entryId: uuid("entry_id").references(() => vocabularyEntries.id, { onDelete: "cascade" }),
    relationshipId: uuid("relationship_id").references(() => vocabularyRelationships.id, { onDelete: "cascade" }),
    decision: text("decision").notNull(), // approve | reject | suspend
    reason: text("reason"),
    reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.entryId), index().on(t.relationshipId)],
);

export const studentVocabularyProgress = pgTable(
  "student_vocabulary_progress",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => vocabularyEntries.id, { onDelete: "cascade" }),
    state: masteryState("state").notNull().default("new"),
    box: smallint("box").notNull().default(0),
    exposureCount: integer("exposure_count").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    incorrectCount: integer("incorrect_count").notNull().default(0),
    masteryScore: smallint("mastery_score").notNull().default(0),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.entryId] }), index().on(t.userId, t.nextReviewAt)],
);

/** Word of the day drawn from the approved, bank-derived repository. */
export const vocabularyWordOfDay = pgTable(
  "vocabulary_word_of_day",
  {
    day: day().primaryKey(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => vocabularyEntries.id, { onDelete: "restrict" }),
    source: wodSource("source").notNull().default("auto"),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.entryId)],
);

export const studentVocabularyWordOfDay = pgTable(
  "student_vocabulary_word_of_day",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: day().notNull(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => vocabularyEntries.id, { onDelete: "cascade" }),
    questionId: uuid("question_id").references(() => noonQuestions.id, { onDelete: "set null" }),
    questionVersionId: uuid("question_version_id").references(() => noonQuestionVersions.id, { onDelete: "set null" }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }),
    selectedChoiceId: text("selected_choice_id"),
    isCorrect: boolean("is_correct"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

// ════════════════════════════════════════════════════════════════════════════
// ذاكر مع نون — Study Hub foundation
// ════════════════════════════════════════════════════════════════════════════

export const studyResources = pgTable(
  "study_resources",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    /** pdf | slides | video | explanation | learning_path — open-ended on purpose. */
    resourceType: text("resource_type").notNull(),
    /** Storage provider key (e.g. "url", "s3") + its locator; resolved by the resource provider. */
    storageProvider: text("storage_provider").notNull().default("url"),
    locator: text("locator"),
    status: text("status").notNull().default("draft"), // draft | published | archived
    isDevExample: boolean("is_dev_example").notNull().default(false),
    currentVersionId: uuid("current_version_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.status, t.resourceType)],
);

export const studyResourceTopics = pgTable(
  "study_resource_topics",
  {
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => studyResources.id, { onDelete: "cascade" }),
    topicId: text("topic_id")
      .notNull()
      .references(() => verbalTopics.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.resourceId, t.topicId] })],
);

export const studyResourceSubskills = pgTable(
  "study_resource_subskills",
  {
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => studyResources.id, { onDelete: "cascade" }),
    subskillId: text("subskill_id")
      .notNull()
      .references(() => verbalSubskills.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.resourceId, t.subskillId] })],
);

export const studyResourceVersions = pgTable(
  "study_resource_versions",
  {
    id: id(),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => studyResources.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    locator: text("locator"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("study_resource_versions_uq").on(t.resourceId, t.version)],
);

export const studyCollections = pgTable("study_collections", {
  id: id(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  /** Ordered resource ids for future learning paths. */
  resourceIds: jsonb("resource_ids").$type<string[]>().notNull().default([]),
  status: text("status").notNull().default("draft"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const studentResourceProgress = pgTable(
  "student_resource_progress",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => studyResources.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("opened"), // opened | completed
    progress: real("progress").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.resourceId] })],
);
