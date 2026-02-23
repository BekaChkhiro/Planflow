-- Add archived_at column for soft delete functionality
ALTER TABLE "projects" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
-- Add index for filtering archived projects
CREATE INDEX "projects_user_id_archived_at_idx" ON "projects" USING btree ("user_id", "archived_at");
