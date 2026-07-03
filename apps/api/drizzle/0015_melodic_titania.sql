CREATE TABLE "task_pipelines" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"fire_url" text NOT NULL,
	"token_encrypted" text NOT NULL,
	"current_task_id" text,
	"last_fired_task_id" text,
	"last_fired_at" timestamp with time zone,
	"message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_pipelines" ADD CONSTRAINT "task_pipelines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;