ALTER TABLE "game_sessions" ADD COLUMN "level_mode" text DEFAULT 'play' NOT NULL;--> statement-breakpoint
ALTER TABLE "student_level_progress" ADD COLUMN "missed" jsonb DEFAULT '[]'::jsonb NOT NULL;