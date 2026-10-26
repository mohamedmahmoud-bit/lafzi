CREATE TYPE "public"."badge_criteria" AS ENUM('first_activity', 'streak_days', 'words_learned', 'words_mastered', 'comeback', 'synonyms_mastered', 'sessions_completed');--> statement-breakpoint
CREATE TYPE "public"."cohort_kind" AS ENUM('dev', 'classroom', 'grade', 'program');--> statement-breakpoint
CREATE TYPE "public"."mastery_state" AS ENUM('new', 'learning', 'familiar', 'mastered');--> statement-breakpoint
CREATE TYPE "public"."practice_session_kind" AS ENUM('daily', 'review');--> statement-breakpoint
CREATE TYPE "public"."practice_session_status" AS ENUM('in_progress', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('student', 'admin');--> statement-breakpoint
CREATE TYPE "public"."wod_source" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"day" date NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"encrypted_refresh_token" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"icon" text NOT NULL,
	"criteria_type" "badge_criteria" NOT NULL,
	"threshold" integer DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "badges_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "cohorts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "cohort_kind" DEFAULT 'dev' NOT NULL,
	"external_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leaderboard_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"xp" integer NOT NULL,
	"rank" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leaderboard_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"week_end" date NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "levels" (
	"level" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"min_xp" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "noon_skill_snapshots" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"item_index" smallint NOT NULL,
	"question_type" text NOT NULL,
	"selected_option_id" text NOT NULL,
	"is_correct" boolean NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"kind" "practice_session_kind" DEFAULT 'daily' NOT NULL,
	"status" "practice_session_status" DEFAULT 'in_progress' NOT NULL,
	"items" jsonb NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"total_count" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_buckets_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "student_badges" (
	"user_id" uuid NOT NULL,
	"badge_id" uuid NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone,
	CONSTRAINT "student_badges_user_id_badge_id_pk" PRIMARY KEY("user_id","badge_id")
);
--> statement-breakpoint
CREATE TABLE "student_daily_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"qualified" boolean DEFAULT false NOT NULL,
	"word_of_day_completed" boolean DEFAULT false NOT NULL,
	"sessions_completed" integer DEFAULT 0 NOT NULL,
	"mission_completed_at" timestamp with time zone,
	"xp_earned" integer DEFAULT 0 NOT NULL,
	"freeze_used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"avatar" text DEFAULT 'owl' NOT NULL,
	"grade" text,
	"country" text DEFAULT 'SA',
	"cohort_id" uuid,
	"xp_total" integer DEFAULT 0 NOT NULL,
	"current_level" integer DEFAULT 1 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_qualified_date" date,
	"streak_freezes" integer DEFAULT 0 NOT NULL,
	"total_words_learned" integer DEFAULT 0 NOT NULL,
	"mastered_words" integer DEFAULT 0 NOT NULL,
	"last_activity_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_word_of_day" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"word_id" uuid NOT NULL,
	"guess_question" jsonb NOT NULL,
	"guess_option_id" text,
	"question" jsonb NOT NULL,
	"viewed_at" timestamp with time zone,
	"attempted_at" timestamp with time zone,
	"selected_option_id" text,
	"is_correct" boolean,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_word_progress" (
	"user_id" uuid NOT NULL,
	"word_id" uuid NOT NULL,
	"state" "mastery_state" DEFAULT 'new' NOT NULL,
	"box" smallint DEFAULT 0 NOT NULL,
	"exposure_count" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"incorrect_count" integer DEFAULT 0 NOT NULL,
	"synonym_correct_count" integer DEFAULT 0 NOT NULL,
	"mastery_score" smallint DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp with time zone,
	"next_review_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_word_progress_user_id_word_id_pk" PRIMARY KEY("user_id","word_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "user_role" DEFAULT 'student' NOT NULL,
	"auth_provider" text NOT NULL,
	"provider_subject" text NOT NULL,
	"noon_student_id" text,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocabulary_words" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word" text NOT NULL,
	"normalized_word" text NOT NULL,
	"meaning" text NOT NULL,
	"example" text NOT NULL,
	"relation_note" text,
	"difficulty" smallint DEFAULT 2 NOT NULL,
	"category" text DEFAULT 'عام' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "word_antonyms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word_id" uuid NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "word_of_day" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" date NOT NULL,
	"word_id" uuid NOT NULL,
	"source" "wod_source" DEFAULT 'auto' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "word_synonyms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word_id" uuid NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xp_rules" (
	"action" text PRIMARY KEY NOT NULL,
	"xp" integer NOT NULL,
	"daily_cap" integer,
	"description" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xp_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"xp" integer NOT NULL,
	"source_id" text,
	"idempotency_key" text NOT NULL,
	"day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_period_id_leaderboard_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."leaderboard_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_periods" ADD CONSTRAINT "leaderboard_periods_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noon_skill_snapshots" ADD CONSTRAINT "noon_skill_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_answers" ADD CONSTRAINT "practice_answers_session_id_practice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."practice_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_badges" ADD CONSTRAINT "student_badges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_badges" ADD CONSTRAINT "student_badges_badge_id_badges_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_daily_activity" ADD CONSTRAINT "student_daily_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_word_of_day" ADD CONSTRAINT "student_word_of_day_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_word_of_day" ADD CONSTRAINT "student_word_of_day_word_id_vocabulary_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."vocabulary_words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_word_progress" ADD CONSTRAINT "student_word_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_word_progress" ADD CONSTRAINT "student_word_progress_word_id_vocabulary_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."vocabulary_words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_antonyms" ADD CONSTRAINT "word_antonyms_word_id_vocabulary_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."vocabulary_words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_of_day" ADD CONSTRAINT "word_of_day_word_id_vocabulary_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."vocabulary_words"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_of_day" ADD CONSTRAINT "word_of_day_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_synonyms" ADD CONSTRAINT "word_synonyms_word_id_vocabulary_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."vocabulary_words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_transactions" ADD CONSTRAINT "xp_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_events_name_day_index" ON "analytics_events" USING btree ("name","day");--> statement-breakpoint
CREATE INDEX "analytics_events_user_id_day_index" ON "analytics_events" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "audit_events_created_at_index" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_hash_uq" ON "auth_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_id_index" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leaderboard_entries_uq" ON "leaderboard_entries" USING btree ("period_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leaderboard_periods_uq" ON "leaderboard_periods" USING btree ("cohort_id","week_start");--> statement-breakpoint
CREATE UNIQUE INDEX "practice_answers_item_uq" ON "practice_answers" USING btree ("session_id","item_index");--> statement-breakpoint
CREATE INDEX "practice_sessions_user_id_day_index" ON "practice_sessions" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "practice_sessions_status_completed_at_index" ON "practice_sessions" USING btree ("status","completed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_activity_user_day_uq" ON "student_daily_activity" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "student_daily_activity_day_index" ON "student_daily_activity" USING btree ("day");--> statement-breakpoint
CREATE INDEX "student_profiles_cohort_id_index" ON "student_profiles" USING btree ("cohort_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_wod_user_day_uq" ON "student_word_of_day" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "student_word_progress_user_id_next_review_at_index" ON "student_word_progress" USING btree ("user_id","next_review_at");--> statement-breakpoint
CREATE INDEX "student_word_progress_user_id_state_index" ON "student_word_progress" USING btree ("user_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "users_provider_subject_uq" ON "users" USING btree ("auth_provider","provider_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "users_noon_student_id_uq" ON "users" USING btree ("noon_student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vocabulary_words_normalized_uq" ON "vocabulary_words" USING btree ("normalized_word");--> statement-breakpoint
CREATE INDEX "vocabulary_words_active_index" ON "vocabulary_words" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "word_antonyms_uq" ON "word_antonyms" USING btree ("word_id","value");--> statement-breakpoint
CREATE UNIQUE INDEX "word_of_day_day_uq" ON "word_of_day" USING btree ("day");--> statement-breakpoint
CREATE INDEX "word_of_day_word_id_index" ON "word_of_day" USING btree ("word_id");--> statement-breakpoint
CREATE UNIQUE INDEX "word_synonyms_uq" ON "word_synonyms" USING btree ("word_id","value");--> statement-breakpoint
CREATE UNIQUE INDEX "xp_transactions_idempotency_uq" ON "xp_transactions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "xp_transactions_user_id_day_index" ON "xp_transactions" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "xp_transactions_day_index" ON "xp_transactions" USING btree ("day");