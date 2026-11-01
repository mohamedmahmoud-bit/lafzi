CREATE TYPE "public"."media_kind" AS ENUM('image', 'audio', 'youtube');--> statement-breakpoint
CREATE TYPE "public"."media_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "entry_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"kind" "media_kind" NOT NULL,
	"url" text NOT NULL,
	"youtube_id" text,
	"start_sec" integer,
	"end_sec" integer,
	"credit" text,
	"status" "media_status" DEFAULT 'pending' NOT NULL,
	"added_by" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entry_media" ADD CONSTRAINT "entry_media_entry_id_vocabulary_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."vocabulary_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entry_media_entry_url_uq" ON "entry_media" USING btree ("entry_id","kind","url");--> statement-breakpoint
CREATE INDEX "entry_media_status_index" ON "entry_media" USING btree ("status");--> statement-breakpoint
CREATE INDEX "entry_media_entry_id_status_index" ON "entry_media" USING btree ("entry_id","status");