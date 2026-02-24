import { pgTable, text, timestamp, uuid, pgEnum, index } from 'drizzle-orm/pg-core'
import { users } from './users'

/**
 * OAuth Authentication Schema
 *
 * This is for OAuth-based LOGIN/REGISTRATION (Continue with GitHub/Google).
 * Different from `githubIntegrations` which is for INTEGRATION features
 * (linking repos, issues, PRs) after user is already logged in.
 */

// OAuth provider types for authentication
export const oauthProviderEnum = pgEnum('oauth_provider', ['github', 'google'])

/**
 * OAuth Accounts table
 *
 * Stores OAuth provider account links for authentication.
 * Users can have multiple OAuth providers linked to a single account.
 * Used for "Continue with GitHub" / "Continue with Google" login/register.
 */
export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // The PlanFlow user this OAuth account is linked to
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // OAuth provider (github, google)
    provider: oauthProviderEnum('provider').notNull(),

    // Provider's unique account identifier
    // GitHub: numeric user ID (as string)
    // Google: "sub" claim from ID token
    providerAccountId: text('provider_account_id').notNull(),

    // Provider user info (for display and convenience)
    providerEmail: text('provider_email'),
    providerUsername: text('provider_username'), // GitHub username, null for Google
    providerName: text('provider_name'), // Display name from provider
    providerAvatarUrl: text('provider_avatar_url'),

    // OAuth tokens (for potential API calls to provider)
    // Note: Should be encrypted in production
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'), // Google refresh token (GitHub doesn't use)
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),

    // OAuth scopes granted
    scopes: text('scopes').array(),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Fast lookup by user
    userIdIdx: index('oauth_accounts_user_id_idx').on(table.userId),
    // Unique constraint: one provider account can only link to one user
    providerAccountIdx: index('oauth_accounts_provider_account_idx').on(
      table.provider,
      table.providerAccountId
    ),
  })
)

/**
 * OAuth Auth States table
 *
 * Temporary state tokens for CSRF protection during OAuth authentication flow.
 * These are short-lived and should be cleaned up after use or expiration.
 *
 * Flow:
 * 1. User clicks "Continue with GitHub" → create state token → redirect to provider
 * 2. Provider redirects back with code + state → validate state → exchange code
 * 3. Mark state as used (or delete it)
 */
export const oauthAuthStates = pgTable(
  'oauth_auth_states',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Random state token for CSRF protection
    state: text('state').notNull().unique(),

    // Which provider this state is for
    provider: oauthProviderEnum('provider').notNull(),

    // Where to redirect after successful auth
    redirectUrl: text('redirect_url'),

    // If linking to existing account (from settings page)
    // null = new login/register flow
    linkToUserId: uuid('link_to_user_id').references(() => users.id, { onDelete: 'cascade' }),

    // State expiration (typically 10-15 minutes)
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    // When this state was used (null = not yet used)
    usedAt: timestamp('used_at', { withTimezone: true }),

    // Created timestamp
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Fast lookup by state token
    stateIdx: index('oauth_auth_states_state_idx').on(table.state),
    // Clean up expired states
    expiresAtIdx: index('oauth_auth_states_expires_at_idx').on(table.expiresAt),
  })
)

// Export types
export type OAuthAccount = typeof oauthAccounts.$inferSelect
export type NewOAuthAccount = typeof oauthAccounts.$inferInsert
export type OAuthAuthState = typeof oauthAuthStates.$inferSelect
export type NewOAuthAuthState = typeof oauthAuthStates.$inferInsert

/**
 * OAuth Provider User Info
 *
 * Normalized user info from OAuth providers.
 * Used during callback processing.
 */
export interface OAuthUserInfo {
  provider: 'github' | 'google'
  providerAccountId: string
  email: string | null
  emailVerified: boolean // Whether the provider has verified this email
  username: string | null // GitHub only
  name: string | null
  avatarUrl: string | null
}

/**
 * OAuth Callback Error Codes
 *
 * Used for specific error handling in the frontend.
 */
export enum OAuthErrorCode {
  // Same email exists but with unverified provider email - security risk
  EMAIL_EXISTS_UNVERIFIED = 'EMAIL_EXISTS_UNVERIFIED',
  // Same email exists but linked to different provider - user should login with existing method
  EMAIL_EXISTS_DIFFERENT_PROVIDER = 'EMAIL_EXISTS_DIFFERENT_PROVIDER',
  // Email is required but provider didn't return one
  EMAIL_REQUIRED = 'EMAIL_REQUIRED',
  // OAuth account already linked to different user
  ACCOUNT_ALREADY_LINKED = 'ACCOUNT_ALREADY_LINKED',
  // Provider account belongs to another user
  PROVIDER_ACCOUNT_EXISTS = 'PROVIDER_ACCOUNT_EXISTS',
}

/**
 * OAuth Callback Result
 *
 * Result of processing an OAuth callback.
 */
export interface OAuthCallbackResult {
  // The user (existing or newly created)
  user: {
    id: string
    email: string
    name: string
  }
  // Whether this is a new user registration
  isNewUser: boolean
  // Whether an existing account was linked
  isLinkedAccount: boolean
  // The OAuth account record
  oauthAccount: OAuthAccount
}
