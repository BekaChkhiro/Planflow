-- Migration: Add GitHub issue link fields to tasks table (T8.3)

ALTER TABLE "tasks" ADD COLUMN "github_issue_number" integer;
ALTER TABLE "tasks" ADD COLUMN "github_repository" text;
ALTER TABLE "tasks" ADD COLUMN "github_issue_url" text;
ALTER TABLE "tasks" ADD COLUMN "github_issue_title" text;
ALTER TABLE "tasks" ADD COLUMN "github_issue_state" text;
ALTER TABLE "tasks" ADD COLUMN "github_linked_by" uuid;
ALTER TABLE "tasks" ADD COLUMN "github_linked_at" timestamp with time zone;

-- Add foreign key constraint for github_linked_by
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_github_linked_by_users_id_fk" FOREIGN KEY ("github_linked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- Create index for faster lookups by repository
CREATE INDEX "tasks_github_repository_idx" ON "tasks" ("github_repository");
