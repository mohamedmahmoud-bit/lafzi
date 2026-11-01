ALTER TABLE "student_profiles" ALTER COLUMN "share_scores" SET DEFAULT true;--> statement-breakpoint
-- Nobody had changed this setting yet (it was hidden by default): show everyone, students can hide later.
UPDATE "student_profiles" SET "share_scores" = true WHERE "share_scores" = false;
