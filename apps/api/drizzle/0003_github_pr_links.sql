-- Migration: Add GitHub Pull Request link fields to tasks table (T8.4)
-- This allows linking PlanFlow tasks to GitHub Pull Requests

ALTER TABLE "tasks" ADD COLUMN "github_pr_number" integer;
ALTER TABLE "tasks" ADD COLUMN "github_pr_repository" text;
ALTER TABLE "tasks" ADD COLUMN "github_pr_url" text;
ALTER TABLE "tasks" ADD COLUMN "github_pr_title" text;
ALTER TABLE "tasks" ADD COLUMN "github_pr_state" text;
ALTER TABLE "tasks" ADD COLUMN "github_pr_branch" text;
ALTER TABLE "tasks" ADD COLUMN "github_pr_base_branch" text;
ALTER TABLE "tasks" ADD COLUMN "github_pr_linked_by" uuid;
ALTER TABLE "tasks" ADD COLUMN "github_pr_linked_at" timestamp with time zone;

-- Add foreign key constraint for github_pr_linked_by
DO $$
BEGIN
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_github_pr_linked_by_users_id_fk"
    FOREIGN KEY ("github_pr_linked_by") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create index for faster lookups on PR-linked tasks
CREATE INDEX IF NOT EXISTS "idx_tasks_github_pr_number" ON "tasks" ("github_pr_number") WHERE "github_pr_number" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_tasks_github_pr_repository" ON "tasks" ("github_pr_repository") WHERE "github_pr_repository" IS NOT NULL;
