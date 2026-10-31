CREATE TYPE "public"."import_row_status" AS ENUM('staged', 'flagged', 'accepted', 'rejected', 'merged');--> statement-breakpoint
ALTER TYPE "public"."badge_criteria" ADD VALUE 'category_correct';--> statement-breakpoint
ALTER TYPE "public"."badge_criteria" ADD VALUE 'memory_perfect';--> statement-breakpoint
ALTER TYPE "public"."badge_criteria" ADD VALUE 'challenge_won';--> statement-breakpoint
ALTER TYPE "public"."badge_criteria" ADD VALUE 'games_completed';--> statement-breakpoint
CREATE TABLE "challenge_participants" (
	"challenge_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid,
	"score" integer,
	"correct" integer,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_participants_challenge_id_user_id_pk" PRIMARY KEY("challenge_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "entry_categories" (
	"entry_id" uuid NOT NULL,
	"category_id" text NOT NULL,
	CONSTRAINT "entry_categories_entry_id_category_id_pk" PRIMARY KEY("entry_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "friend_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"creator_id" uuid NOT NULL,
	"game_type_id" text NOT NULL,
	"rounds" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friend_challenges_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "friend_invites" (
	"code" text PRIMARY KEY NOT NULL,
	"inviter_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"max_uses" integer DEFAULT 20 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"user_low" uuid NOT NULL,
	"user_high" uuid NOT NULL,
	"status" text DEFAULT 'accepted' NOT NULL,
	"via" text DEFAULT 'invite' NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"streak_last_day" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friendships_user_low_user_high_pk" PRIMARY KEY("user_low","user_high")
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id")
);
--> statement-breakpoint
CREATE TABLE "user_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reported_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"context" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocab_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_name" text NOT NULL,
	"source_kind" text NOT NULL,
	"file_hash" text NOT NULL,
	"row_count" integer NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocab_import_batches_file_hash_unique" UNIQUE("file_hash")
);
--> statement-breakpoint
CREATE TABLE "vocab_import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"section" text NOT NULL,
	"raw" jsonb NOT NULL,
	"word" text NOT NULL,
	"meaning" text,
	"relation_label" text,
	"related" text,
	"example" text,
	"category_id" text,
	"relation_type" text,
	"edited" jsonb,
	"status" "import_row_status" DEFAULT 'staged' NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"entry_id" uuid,
	"related_entry_id" uuid,
	"sense_id" uuid,
	"relationship_id" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "word_senses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"meaning" text NOT NULL,
	"example" text,
	"status" "vocab_status" DEFAULT 'review_required' NOT NULL,
	"difficulty" smallint DEFAULT 2 NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "badges" ADD COLUMN "criteria_param" text;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "category_id" text;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN "kind" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN "challenge_id" uuid;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN "category_id" text;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN "deadline_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN "mistakes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "student_daily_activity" ADD COLUMN "daily_challenge_completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "student_daily_activity" ADD COLUMN "word_interactions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD COLUMN "official_full_name" text;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD COLUMN "identity_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD COLUMN "share_scores" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD COLUMN "profile_visibility" text DEFAULT 'friends' NOT NULL;--> statement-breakpoint
ALTER TABLE "vocabulary_entries" ADD COLUMN "difficulty" smallint DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "vocabulary_entries" ADD COLUMN "merged_into" uuid;--> statement-breakpoint
ALTER TABLE "vocabulary_relationships" ADD COLUMN "example" text;--> statement-breakpoint
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_challenge_id_friend_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."friend_challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_categories" ADD CONSTRAINT "entry_categories_entry_id_vocabulary_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."vocabulary_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_categories" ADD CONSTRAINT "entry_categories_category_id_verbal_subskills_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."verbal_subskills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_challenges" ADD CONSTRAINT "friend_challenges_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_invites" ADD CONSTRAINT "friend_invites_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_low_users_id_fk" FOREIGN KEY ("user_low") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_high_users_id_fk" FOREIGN KEY ("user_high") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reported_id_users_id_fk" FOREIGN KEY ("reported_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocab_import_batches" ADD CONSTRAINT "vocab_import_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocab_import_rows" ADD CONSTRAINT "vocab_import_rows_batch_id_vocab_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."vocab_import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocab_import_rows" ADD CONSTRAINT "vocab_import_rows_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_senses" ADD CONSTRAINT "word_senses_entry_id_vocabulary_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."vocabulary_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entry_categories_category_id_index" ON "entry_categories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "friendships_user_high_index" ON "friendships" USING btree ("user_high");--> statement-breakpoint
CREATE UNIQUE INDEX "vocab_import_rows_uq" ON "vocab_import_rows" USING btree ("batch_id","row_number");--> statement-breakpoint
CREATE INDEX "vocab_import_rows_status_index" ON "vocab_import_rows" USING btree ("status");--> statement-breakpoint
CREATE INDEX "vocab_import_rows_category_id_index" ON "vocab_import_rows" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "word_senses_entry_id_index" ON "word_senses" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "word_senses_status_index" ON "word_senses" USING btree ("status");--> statement-breakpoint
-- Existing names already came from Noon sign-in: carry them over as the official name.
UPDATE "student_profiles" SET "official_full_name" = "display_name" WHERE "official_full_name" IS NULL;
--> statement-breakpoint
-- Official names are immutable except through the trusted identity sync, which sets
-- `SET LOCAL lafzi.identity_sync = 'on'` inside its transaction.
CREATE OR REPLACE FUNCTION lafzi_guard_official_name() RETURNS trigger AS $$
BEGIN
  IF (NEW.official_full_name IS DISTINCT FROM OLD.official_full_name OR NEW.display_name IS DISTINCT FROM OLD.display_name)
     AND coalesce(current_setting('lafzi.identity_sync', true), '') <> 'on' THEN
    RAISE EXCEPTION 'official name can only be changed by Noon identity sync' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS student_profiles_name_guard ON "student_profiles";
--> statement-breakpoint
CREATE TRIGGER student_profiles_name_guard BEFORE UPDATE ON "student_profiles"
  FOR EACH ROW EXECUTE FUNCTION lafzi_guard_official_name();
