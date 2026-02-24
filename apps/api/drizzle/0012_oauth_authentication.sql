-- OAuth Authentication Schema Migration
-- Task T18.1: Create oauth_accounts database schema

-- Create OAuth provider enum
CREATE TYPE "public"."oauth_provider" AS ENUM('github', 'google');

-- Create OAuth Accounts table
-- Stores OAuth provider account links for authentication
-- Used for "Continue with GitHub" / "Continue with Google" login/register
CREATE TABLE "oauth_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "oauth_provider" NOT NULL,
	"provider_account_id" text NOT NULL,
	"provider_email" text,
	"provider_username" text,
	"provider_name" text,
	"provider_avatar_url" text,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"scopes" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Create OAuth Auth States table
-- Temporary state tokens for CSRF protection during OAuth authentication flow
CREATE TABLE "oauth_auth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state" text NOT NULL,
	"provider" "oauth_provider" NOT NULL,
	"redirect_url" text,
	"link_to_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_auth_states_state_unique" UNIQUE("state")
);

-- Add foreign key constraints
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "oauth_auth_states" ADD CONSTRAINT "oauth_auth_states_link_to_user_id_users_id_fk"
	FOREIGN KEY ("link_to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

-- Create indexes for performance
CREATE INDEX "oauth_accounts_user_id_idx" ON "oauth_accounts" USING btree ("user_id");
CREATE INDEX "oauth_accounts_provider_account_idx" ON "oauth_accounts" USING btree ("provider","provider_account_id");
CREATE INDEX "oauth_auth_states_state_idx" ON "oauth_auth_states" USING btree ("state");
CREATE INDEX "oauth_auth_states_expires_at_idx" ON "oauth_auth_states" USING btree ("expires_at");

-- Add unique constraint for provider + provider_account_id (one provider account can only link to one user)
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_provider_account_unique"
	UNIQUE ("provider", "provider_account_id");
