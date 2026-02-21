-- Add digest frequency and tracking columns to notification_preferences
ALTER TABLE "notification_preferences" ADD COLUMN "email_digest_frequency" text DEFAULT 'daily';--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "email_digest_time" text DEFAULT '09:00';--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "email_digest_timezone" text DEFAULT 'UTC';--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "last_digest_sent_at" timestamp with time zone;--> statement-breakpoint

-- Create digest send log table for tracking and debugging
CREATE TABLE "digest_send_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"frequency" text NOT NULL,
	"notification_count" integer NOT NULL,
	"from_date" timestamp with time zone NOT NULL,
	"to_date" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"error_message" text
);--> statement-breakpoint
ALTER TABLE "digest_send_log" ADD CONSTRAINT "digest_send_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
