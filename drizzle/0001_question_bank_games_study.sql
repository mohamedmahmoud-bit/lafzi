CREATE TYPE "public"."check_severity" AS ENUM('error', 'warning', 'info');--> statement-breakpoint
CREATE TYPE "public"."curriculum_level" AS ENUM('chapter', 'topic', 'subtopic', 'concept');--> statement-breakpoint
CREATE TYPE "public"."decision_status" AS ENUM('proposed', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."question_status" AS ENUM('imported', 'validating', 'ready', 'published', 'review_required', 'rejected', 'archived');--> statement-breakpoint
CREATE TYPE "public"."sync_run_status" AS ENUM('running', 'succeeded', 'partial', 'failed', 'not_configured');--> statement-breakpoint
CREATE TYPE "public"."vocab_status" AS ENUM('candidate', 'review_required', 'approved', 'rejected', 'suspended');--> statement-breakpoint
CREATE TABLE "competition_entries" (
	"competition_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"sessions" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_entries_competition_id_user_id_pk" PRIMARY KEY("competition_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "competitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"topic_id" text,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_nodes" (
	"key" text PRIMARY KEY NOT NULL,
	"level" "curriculum_level" NOT NULL,
	"noon_id" integer NOT NULL,
	"parent_key" text,
	"name" text NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" date NOT NULL,
	"game_type_id" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_session_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"round_index" smallint NOT NULL,
	"question_id" uuid,
	"question_version_id" uuid,
	"subskill_id" text,
	"response" jsonb NOT NULL,
	"is_correct" boolean NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"hint_used" boolean DEFAULT false NOT NULL,
	"time_ms" integer,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"game_type_id" text NOT NULL,
	"timed" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"day" date NOT NULL,
	"rounds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"planned_rounds" integer NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"xp_awarded" integer DEFAULT 0 NOT NULL,
	"summary" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "game_types" (
	"id" text PRIMARY KEY NOT NULL,
	"name_ar" text NOT NULL,
	"topic_id" text,
	"description" text NOT NULL,
	"status" text DEFAULT 'coming_soon' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "noon_integration_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"destination_id" uuid NOT NULL,
	"scenario" text NOT NULL,
	"result" text NOT NULL,
	"observed_landing" text NOT NULL,
	"notes" text,
	"verified_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "noon_practice_destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"mapping_id" uuid,
	"url" text NOT NULL,
	"platform" text DEFAULT 'web' NOT NULL,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "noon_question_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"raw" jsonb,
	"correctness_hash" text NOT NULL,
	"sync_run_id" uuid,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "noon_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"noon_question_id" bigint NOT NULL,
	"status" "question_status" DEFAULT 'imported' NOT NULL,
	"current_version_id" uuid,
	"published_version_id" uuid,
	"topic_id" text,
	"subskill_id" text,
	"difficulty" smallint,
	"passage_id" uuid,
	"is_mock" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"status_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "noon_skill_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" text NOT NULL,
	"subskill_id" text,
	"noon_chapter_id" integer,
	"noon_topic_id" integer,
	"noon_subtopic_id" integer,
	"noon_concept_id" integer,
	"noon_label" text,
	"notes" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_practice_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"source" text NOT NULL,
	"topic_id" text,
	"subskill_id" text,
	"destination_id" uuid,
	"destination_kind" text,
	"outcome" text NOT NULL,
	"day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_game_compatibility" (
	"question_id" uuid NOT NULL,
	"game_mode" text NOT NULL,
	"basis" text NOT NULL,
	"status" "decision_status" DEFAULT 'proposed' NOT NULL,
	"decided_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_game_compatibility_question_id_game_mode_pk" PRIMARY KEY("question_id","game_mode")
);
--> statement-breakpoint
CREATE TABLE "question_passage_links" (
	"question_id" uuid NOT NULL,
	"passage_id" uuid NOT NULL,
	CONSTRAINT "question_passage_links_question_id_passage_id_pk" PRIMARY KEY("question_id","passage_id")
);
--> statement-breakpoint
CREATE TABLE "question_review_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"version_id" uuid,
	"decision" text NOT NULL,
	"reason" text,
	"reviewer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_skill_mappings" (
	"question_id" uuid NOT NULL,
	"source" text NOT NULL,
	"topic_id" text,
	"subskill_id" text,
	"status" "decision_status" DEFAULT 'proposed' NOT NULL,
	"note" text,
	"decided_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_skill_mappings_question_id_source_pk" PRIMARY KEY("question_id","source")
);
--> statement-breakpoint
CREATE TABLE "question_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"mode" text NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "sync_run_status" DEFAULT 'running' NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"attempt" integer DEFAULT 1 NOT NULL,
	"triggered_by" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "question_validation_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"check" text NOT NULL,
	"passed" boolean NOT NULL,
	"severity" "check_severity" NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reading_passages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"noon_reference_id" bigint NOT NULL,
	"body" text NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_progress" (
	"user_id" uuid NOT NULL,
	"subskill_id" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"correct" integer DEFAULT 0 NOT NULL,
	"recent" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mastery" real DEFAULT 0 NOT NULL,
	"level" smallint DEFAULT 1 NOT NULL,
	"last_played_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_progress_user_id_subskill_id_pk" PRIMARY KEY("user_id","subskill_id")
);
--> statement-breakpoint
CREATE TABLE "student_competition_results" (
	"competition_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"score" integer NOT NULL,
	"finalized_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_competition_results_competition_id_user_id_pk" PRIMARY KEY("competition_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "student_resource_progress" (
	"user_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"status" text DEFAULT 'opened' NOT NULL,
	"progress" real DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_resource_progress_user_id_resource_id_pk" PRIMARY KEY("user_id","resource_id")
);
--> statement-breakpoint
CREATE TABLE "student_vocabulary_progress" (
	"user_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"state" "mastery_state" DEFAULT 'new' NOT NULL,
	"box" smallint DEFAULT 0 NOT NULL,
	"exposure_count" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"incorrect_count" integer DEFAULT 0 NOT NULL,
	"mastery_score" smallint DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp with time zone,
	"next_review_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_vocabulary_progress_user_id_entry_id_pk" PRIMARY KEY("user_id","entry_id")
);
--> statement-breakpoint
CREATE TABLE "student_vocabulary_word_of_day" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"entry_id" uuid NOT NULL,
	"question_id" uuid,
	"question_version_id" uuid,
	"viewed_at" timestamp with time zone,
	"attempted_at" timestamp with time zone,
	"selected_choice_id" text,
	"is_correct" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_vocabulary_word_of_day_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "study_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"resource_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_resource_subskills" (
	"resource_id" uuid NOT NULL,
	"subskill_id" text NOT NULL,
	CONSTRAINT "study_resource_subskills_resource_id_subskill_id_pk" PRIMARY KEY("resource_id","subskill_id")
);
--> statement-breakpoint
CREATE TABLE "study_resource_topics" (
	"resource_id" uuid NOT NULL,
	"topic_id" text NOT NULL,
	CONSTRAINT "study_resource_topics_resource_id_topic_id_pk" PRIMARY KEY("resource_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "study_resource_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"locator" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"resource_type" text NOT NULL,
	"storage_provider" text DEFAULT 'url' NOT NULL,
	"locator" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_dev_example" boolean DEFAULT false NOT NULL,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verbal_subskills" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"name_ar" text NOT NULL,
	"noon_topic_id" integer,
	"noon_subtopic_id" integer,
	"sort" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verbal_topics" (
	"id" text PRIMARY KEY NOT NULL,
	"name_ar" text NOT NULL,
	"noon_chapter_id" integer,
	"description" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocabulary_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lemma" text NOT NULL,
	"normalized" text NOT NULL,
	"status" "vocab_status" DEFAULT 'candidate' NOT NULL,
	"meaning" text,
	"meaning_status" text DEFAULT 'none' NOT NULL,
	"meaning_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_mock" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocabulary_question_sources" (
	"entry_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"question_version_id" uuid,
	"role" text NOT NULL,
	"context" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocabulary_question_sources_entry_id_question_id_role_pk" PRIMARY KEY("entry_id","question_id","role")
);
--> statement-breakpoint
CREATE TABLE "vocabulary_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_entry_id" uuid NOT NULL,
	"to_entry_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" "vocab_status" DEFAULT 'candidate' NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocabulary_review_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid,
	"relationship_id" uuid,
	"decision" text NOT NULL,
	"reason" text,
	"reviewer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocabulary_validation_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid,
	"relationship_id" uuid,
	"check" text NOT NULL,
	"passed" boolean NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocabulary_word_of_day" (
	"day" date PRIMARY KEY NOT NULL,
	"entry_id" uuid NOT NULL,
	"source" "wod_source" DEFAULT 'auto' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "student_daily_activity" ADD COLUMN "games_completed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "competition_entries" ADD CONSTRAINT "competition_entries_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_entries" ADD CONSTRAINT "competition_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_topic_id_verbal_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."verbal_topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_challenges" ADD CONSTRAINT "daily_challenges_game_type_id_game_types_id_fk" FOREIGN KEY ("game_type_id") REFERENCES "public"."game_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_session_answers" ADD CONSTRAINT "game_session_answers_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_session_answers" ADD CONSTRAINT "game_session_answers_question_id_noon_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."noon_questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_session_answers" ADD CONSTRAINT "game_session_answers_question_version_id_noon_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."noon_question_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_game_type_id_game_types_id_fk" FOREIGN KEY ("game_type_id") REFERENCES "public"."game_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_types" ADD CONSTRAINT "game_types_topic_id_verbal_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."verbal_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noon_integration_verifications" ADD CONSTRAINT "noon_integration_verifications_destination_id_noon_practice_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."noon_practice_destinations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noon_integration_verifications" ADD CONSTRAINT "noon_integration_verifications_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noon_practice_destinations" ADD CONSTRAINT "noon_practice_destinations_mapping_id_noon_skill_mappings_id_fk" FOREIGN KEY ("mapping_id") REFERENCES "public"."noon_skill_mappings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noon_practice_destinations" ADD CONSTRAINT "noon_practice_destinations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noon_question_versions" ADD CONSTRAINT "noon_question_versions_question_id_noon_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."noon_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noon_questions" ADD CONSTRAINT "noon_questions_topic_id_verbal_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."verbal_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noon_questions" ADD CONSTRAINT "noon_questions_subskill_id_verbal_subskills_id_fk" FOREIGN KEY ("subskill_id") REFERENCES "public"."verbal_subskills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noon_skill_mappings" ADD CONSTRAINT "noon_skill_mappings_topic_id_verbal_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."verbal_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noon_skill_mappings" ADD CONSTRAINT "noon_skill_mappings_subskill_id_verbal_subskills_id_fk" FOREIGN KEY ("subskill_id") REFERENCES "public"."verbal_subskills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noon_skill_mappings" ADD CONSTRAINT "noon_skill_mappings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_practice_events" ADD CONSTRAINT "outbound_practice_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_practice_events" ADD CONSTRAINT "outbound_practice_events_destination_id_noon_practice_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."noon_practice_destinations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_game_compatibility" ADD CONSTRAINT "question_game_compatibility_question_id_noon_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."noon_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_game_compatibility" ADD CONSTRAINT "question_game_compatibility_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_passage_links" ADD CONSTRAINT "question_passage_links_question_id_noon_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."noon_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_passage_links" ADD CONSTRAINT "question_passage_links_passage_id_reading_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."reading_passages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_review_decisions" ADD CONSTRAINT "question_review_decisions_question_id_noon_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."noon_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_review_decisions" ADD CONSTRAINT "question_review_decisions_version_id_noon_question_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."noon_question_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_review_decisions" ADD CONSTRAINT "question_review_decisions_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_skill_mappings" ADD CONSTRAINT "question_skill_mappings_question_id_noon_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."noon_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_skill_mappings" ADD CONSTRAINT "question_skill_mappings_topic_id_verbal_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."verbal_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_skill_mappings" ADD CONSTRAINT "question_skill_mappings_subskill_id_verbal_subskills_id_fk" FOREIGN KEY ("subskill_id") REFERENCES "public"."verbal_subskills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_skill_mappings" ADD CONSTRAINT "question_skill_mappings_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_sync_runs" ADD CONSTRAINT "question_sync_runs_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_validation_results" ADD CONSTRAINT "question_validation_results_version_id_noon_question_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."noon_question_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_progress" ADD CONSTRAINT "skill_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_progress" ADD CONSTRAINT "skill_progress_subskill_id_verbal_subskills_id_fk" FOREIGN KEY ("subskill_id") REFERENCES "public"."verbal_subskills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_competition_results" ADD CONSTRAINT "student_competition_results_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_competition_results" ADD CONSTRAINT "student_competition_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_resource_progress" ADD CONSTRAINT "student_resource_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_resource_progress" ADD CONSTRAINT "student_resource_progress_resource_id_study_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."study_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_vocabulary_progress" ADD CONSTRAINT "student_vocabulary_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_vocabulary_progress" ADD CONSTRAINT "student_vocabulary_progress_entry_id_vocabulary_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."vocabulary_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_vocabulary_word_of_day" ADD CONSTRAINT "student_vocabulary_word_of_day_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_vocabulary_word_of_day" ADD CONSTRAINT "student_vocabulary_word_of_day_entry_id_vocabulary_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."vocabulary_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_vocabulary_word_of_day" ADD CONSTRAINT "student_vocabulary_word_of_day_question_id_noon_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."noon_questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_vocabulary_word_of_day" ADD CONSTRAINT "student_vocabulary_word_of_day_question_version_id_noon_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."noon_question_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_resource_subskills" ADD CONSTRAINT "study_resource_subskills_resource_id_study_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."study_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_resource_subskills" ADD CONSTRAINT "study_resource_subskills_subskill_id_verbal_subskills_id_fk" FOREIGN KEY ("subskill_id") REFERENCES "public"."verbal_subskills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_resource_topics" ADD CONSTRAINT "study_resource_topics_resource_id_study_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."study_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_resource_topics" ADD CONSTRAINT "study_resource_topics_topic_id_verbal_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."verbal_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_resource_versions" ADD CONSTRAINT "study_resource_versions_resource_id_study_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."study_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verbal_subskills" ADD CONSTRAINT "verbal_subskills_topic_id_verbal_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."verbal_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_question_sources" ADD CONSTRAINT "vocabulary_question_sources_entry_id_vocabulary_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."vocabulary_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_question_sources" ADD CONSTRAINT "vocabulary_question_sources_question_id_noon_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."noon_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_question_sources" ADD CONSTRAINT "vocabulary_question_sources_question_version_id_noon_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."noon_question_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_relationships" ADD CONSTRAINT "vocabulary_relationships_from_entry_id_vocabulary_entries_id_fk" FOREIGN KEY ("from_entry_id") REFERENCES "public"."vocabulary_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_relationships" ADD CONSTRAINT "vocabulary_relationships_to_entry_id_vocabulary_entries_id_fk" FOREIGN KEY ("to_entry_id") REFERENCES "public"."vocabulary_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_review_decisions" ADD CONSTRAINT "vocabulary_review_decisions_entry_id_vocabulary_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."vocabulary_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_review_decisions" ADD CONSTRAINT "vocabulary_review_decisions_relationship_id_vocabulary_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."vocabulary_relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_review_decisions" ADD CONSTRAINT "vocabulary_review_decisions_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_validation_records" ADD CONSTRAINT "vocabulary_validation_records_entry_id_vocabulary_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."vocabulary_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_validation_records" ADD CONSTRAINT "vocabulary_validation_records_relationship_id_vocabulary_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."vocabulary_relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_word_of_day" ADD CONSTRAINT "vocabulary_word_of_day_entry_id_vocabulary_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."vocabulary_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competitions_uq" ON "competitions" USING btree ("kind","topic_id","starts_on");--> statement-breakpoint
CREATE INDEX "curriculum_nodes_level_noon_id_index" ON "curriculum_nodes" USING btree ("level","noon_id");--> statement-breakpoint
CREATE INDEX "curriculum_nodes_parent_key_index" ON "curriculum_nodes" USING btree ("parent_key");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_challenges_day_uq" ON "daily_challenges" USING btree ("day");--> statement-breakpoint
CREATE UNIQUE INDEX "game_session_answers_uq" ON "game_session_answers" USING btree ("session_id","round_index");--> statement-breakpoint
CREATE INDEX "game_session_answers_subskill_id_index" ON "game_session_answers" USING btree ("subskill_id");--> statement-breakpoint
CREATE INDEX "game_sessions_user_id_day_index" ON "game_sessions" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "game_sessions_game_type_id_day_status_index" ON "game_sessions" USING btree ("game_type_id","day","status");--> statement-breakpoint
CREATE INDEX "noon_integration_verifications_destination_id_created_at_index" ON "noon_integration_verifications" USING btree ("destination_id","created_at");--> statement-breakpoint
CREATE INDEX "noon_practice_destinations_kind_verification_status_index" ON "noon_practice_destinations" USING btree ("kind","verification_status");--> statement-breakpoint
CREATE UNIQUE INDEX "noon_question_versions_hash_uq" ON "noon_question_versions" USING btree ("question_id","content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "noon_question_versions_num_uq" ON "noon_question_versions" USING btree ("question_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "noon_questions_noon_id_uq" ON "noon_questions" USING btree ("noon_question_id");--> statement-breakpoint
CREATE INDEX "noon_questions_status_topic_id_subskill_id_index" ON "noon_questions" USING btree ("status","topic_id","subskill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "noon_skill_mappings_uq" ON "noon_skill_mappings" USING btree ("topic_id","subskill_id");--> statement-breakpoint
CREATE INDEX "outbound_practice_events_day_outcome_index" ON "outbound_practice_events" USING btree ("day","outcome");--> statement-breakpoint
CREATE INDEX "question_game_compatibility_game_mode_status_index" ON "question_game_compatibility" USING btree ("game_mode","status");--> statement-breakpoint
CREATE INDEX "question_review_decisions_question_id_index" ON "question_review_decisions" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "question_sync_runs_started_at_index" ON "question_sync_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "question_validation_results_version_id_index" ON "question_validation_results" USING btree ("version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reading_passages_ref_uq" ON "reading_passages" USING btree ("noon_reference_id");--> statement-breakpoint
CREATE INDEX "student_vocabulary_progress_user_id_next_review_at_index" ON "student_vocabulary_progress" USING btree ("user_id","next_review_at");--> statement-breakpoint
CREATE UNIQUE INDEX "study_resource_versions_uq" ON "study_resource_versions" USING btree ("resource_id","version");--> statement-breakpoint
CREATE INDEX "study_resources_status_resource_type_index" ON "study_resources" USING btree ("status","resource_type");--> statement-breakpoint
CREATE INDEX "verbal_subskills_topic_id_index" ON "verbal_subskills" USING btree ("topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "verbal_subskills_noon_subtopic_uq" ON "verbal_subskills" USING btree ("noon_subtopic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vocabulary_entries_norm_uq" ON "vocabulary_entries" USING btree ("normalized");--> statement-breakpoint
CREATE INDEX "vocabulary_entries_status_index" ON "vocabulary_entries" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "vocabulary_relationships_uq" ON "vocabulary_relationships" USING btree ("from_entry_id","to_entry_id","type");--> statement-breakpoint
CREATE INDEX "vocabulary_relationships_status_index" ON "vocabulary_relationships" USING btree ("status");--> statement-breakpoint
CREATE INDEX "vocabulary_review_decisions_entry_id_index" ON "vocabulary_review_decisions" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "vocabulary_review_decisions_relationship_id_index" ON "vocabulary_review_decisions" USING btree ("relationship_id");--> statement-breakpoint
CREATE INDEX "vocabulary_validation_records_entry_id_index" ON "vocabulary_validation_records" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "vocabulary_validation_records_relationship_id_index" ON "vocabulary_validation_records" USING btree ("relationship_id");--> statement-breakpoint
CREATE INDEX "vocabulary_word_of_day_entry_id_index" ON "vocabulary_word_of_day" USING btree ("entry_id");