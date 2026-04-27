CREATE TYPE "public"."code_change_source" AS ENUM('ai_agent', 'manual', 'ci_cd', 'auto_generated');--> statement-breakpoint
CREATE TYPE "public"."code_change_type" AS ENUM('create', 'modify', 'delete', 'rename', 'refactor', 'fix', 'feature', 'other');--> statement-breakpoint
CREATE TABLE "code_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"type" "code_change_type" DEFAULT 'other' NOT NULL,
	"source" "code_change_source" DEFAULT 'ai_agent' NOT NULL,
	"summary" text NOT NULL,
	"file_paths" text[] NOT NULL,
	"lines_added" integer,
	"lines_removed" integer,
	"task_id" text,
	"commit_hash" text,
	"branch_name" text,
	"metadata" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "code_changes" ADD CONSTRAINT "code_changes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_changes" ADD CONSTRAINT "code_changes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "code_changes_project_id_idx" ON "code_changes" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "code_changes_project_id_created_at_idx" ON "code_changes" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "code_changes_project_id_task_id_idx" ON "code_changes" USING btree ("project_id","task_id");--> statement-breakpoint
CREATE INDEX "code_changes_commit_hash_idx" ON "code_changes" USING btree ("commit_hash");