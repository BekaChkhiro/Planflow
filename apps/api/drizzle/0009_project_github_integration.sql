-- Add GitHub Repository Integration fields to projects table

ALTER TABLE "projects" ADD COLUMN "github_repository" text;
ALTER TABLE "projects" ADD COLUMN "github_owner" text;
ALTER TABLE "projects" ADD COLUMN "github_repo_name" text;
ALTER TABLE "projects" ADD COLUMN "github_default_branch" text;
ALTER TABLE "projects" ADD COLUMN "github_repo_url" text;
ALTER TABLE "projects" ADD COLUMN "github_repo_private" boolean;
ALTER TABLE "projects" ADD COLUMN "github_webhook_id" text;
ALTER TABLE "projects" ADD COLUMN "github_webhook_secret" text;
ALTER TABLE "projects" ADD COLUMN "github_linked_at" timestamp with time zone;
ALTER TABLE "projects" ADD COLUMN "github_linked_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;

-- Index for finding projects by repository (supports multi-link: same repo on multiple projects)
CREATE INDEX "projects_github_repository_idx" ON "projects" ("github_repository");
