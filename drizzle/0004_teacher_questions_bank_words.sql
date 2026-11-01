CREATE TABLE "bank_word_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"normalized" text NOT NULL,
	"lemma" text NOT NULL,
	"frequency" integer DEFAULT 0 NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'candidate' NOT NULL,
	"entry_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"row_count" integer NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_sets_file_hash_unique" UNIQUE("file_hash")
);
--> statement-breakpoint
CREATE TABLE "teacher_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"set_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"stem" text NOT NULL,
	"choices" jsonb NOT NULL,
	"correct_id" text,
	"explanation" text,
	"category_id" text,
	"difficulty" smallint DEFAULT 2 NOT NULL,
	"status" "import_row_status" DEFAULT 'staged' NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "question_sets" ADD CONSTRAINT "question_sets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_questions" ADD CONSTRAINT "teacher_questions_set_id_question_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."question_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_questions" ADD CONSTRAINT "teacher_questions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_word_candidates_norm_uq" ON "bank_word_candidates" USING btree ("normalized");--> statement-breakpoint
CREATE INDEX "bank_word_candidates_status_frequency_index" ON "bank_word_candidates" USING btree ("status","frequency");--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_questions_uq" ON "teacher_questions" USING btree ("set_id","row_number");--> statement-breakpoint
CREATE INDEX "teacher_questions_status_category_id_index" ON "teacher_questions" USING btree ("status","category_id");