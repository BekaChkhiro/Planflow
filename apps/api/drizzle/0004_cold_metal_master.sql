CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"push_mentions" boolean DEFAULT true NOT NULL,
	"push_assignments" boolean DEFAULT true NOT NULL,
	"push_comments" boolean DEFAULT true NOT NULL,
	"push_status_changes" boolean DEFAULT false NOT NULL,
	"push_task_created" boolean DEFAULT false NOT NULL,
	"push_invitations" boolean DEFAULT true NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"email_mentions" boolean DEFAULT true NOT NULL,
	"email_assignments" boolean DEFAULT true NOT NULL,
	"email_digest" boolean DEFAULT false NOT NULL,
	"toast_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "github_issue_number" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "github_repository" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "github_issue_url" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "github_issue_title" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "github_issue_state" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "github_linked_by" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "github_linked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "github_pr_number" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "github_pr_repository" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "github_pr_url" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "github_pr_title" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "github_pr_state" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "github_pr_branch" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "github_pr_base_branch" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "github_pr_linked_by" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "github_pr_linked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_github_linked_by_users_id_fk" FOREIGN KEY ("github_linked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_github_pr_linked_by_users_id_fk" FOREIGN KEY ("github_pr_linked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;