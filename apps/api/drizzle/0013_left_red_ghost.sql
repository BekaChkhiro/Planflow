CREATE TYPE "public"."knowledge_source" AS ENUM('manual', 'auto_detected', 'imported');--> statement-breakpoint
CREATE TYPE "public"."knowledge_type" AS ENUM('architecture', 'pattern', 'convention', 'decision', 'dependency', 'environment', 'other');--> statement-breakpoint
CREATE TABLE "project_knowledge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"type" "knowledge_type" DEFAULT 'other' NOT NULL,
	"source" "knowledge_source" DEFAULT 'manual' NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"tags" text[],
	"metadata" jsonb,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_knowledge" ADD CONSTRAINT "project_knowledge_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_knowledge" ADD CONSTRAINT "project_knowledge_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_knowledge" ADD CONSTRAINT "project_knowledge_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_knowledge_project_id_idx" ON "project_knowledge" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_knowledge_project_type_idx" ON "project_knowledge" USING btree ("project_id","type");--> statement-breakpoint
CREATE INDEX "project_knowledge_project_source_idx" ON "project_knowledge" USING btree ("project_id","source");