CREATE TABLE "journey_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer NOT NULL,
	"stage" text NOT NULL,
	"category_id" text,
	"kind" text DEFAULT 'learn' NOT NULL,
	"entry_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_level_progress" (
	"user_id" uuid NOT NULL,
	"level_id" uuid NOT NULL,
	"stars" smallint DEFAULT 0 NOT NULL,
	"best_correct" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"passed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_level_progress_user_id_level_id_pk" PRIMARY KEY("user_id","level_id")
);
--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN "level_id" uuid;--> statement-breakpoint
ALTER TABLE "student_level_progress" ADD CONSTRAINT "student_level_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_level_progress" ADD CONSTRAINT "student_level_progress_level_id_journey_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."journey_levels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "journey_levels_number_uq" ON "journey_levels" USING btree ("number");