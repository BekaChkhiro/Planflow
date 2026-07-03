CREATE TABLE "routine_configs" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"fire_url" text NOT NULL,
	"token_encrypted" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "routine_configs" ADD CONSTRAINT "routine_configs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;