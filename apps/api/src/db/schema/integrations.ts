import { pgTable, text, timestamp, uuid, pgEnum, jsonb, boolean } from 'drizzle-orm/pg-core'
import { users } from './users'
import { organizations } from './organizations'
import { projects } from './projects'

// Integration provider types
export const integrationProviderEnum = pgEnum('integration_provider', [
  'slack',
  'discord',
  'github',
])

// Integration event types that can trigger webhooks
export const integrationEventEnum = pgEnum('integration_event', [
  'task_created',
  'task_updated',
  'task_status_changed',
  'task_assigned',
  'task_unassigned',
  'task_completed',
  'comment_created',
  'comment_reply',
  'mention',
  'member_joined',
  'member_removed',
  'plan_updated',
])

/**
 * Integrations table
 *
 * Stores webhook configurations for external services (Slack, Discord, GitHub).
 * Each integration belongs to an organization and can filter which events to send.
 */
export const integrations = pgTable('integrations', {
  id: uuid('id').primaryKey().defaultRandom(),

  // The organization this integration belongs to
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),

  // Optional: specific project scope (null = org-wide)
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),

  // Integration provider (slack, discord, github)
  provider: integrationProviderEnum('provider').notNull(),

  // User-friendly name for this integration
  name: text('name').notNull(),

  // Whether this integration is active
  active: boolean('active').notNull().default(true),

  // Webhook URL (for Slack/Discord incoming webhooks)
  webhookUrl: text('webhook_url'),

  // Configuration specific to the provider (channel names, event filters, etc.)
  // For Slack: { channel: "#engineering", username: "PlanFlow", icon_emoji: ":clipboard:" }
  // For Discord: { avatar_url: "...", username: "PlanFlow" }
  config: jsonb('config').$type<IntegrationConfig>().default({}),

  // Which events should trigger this integration
  // If empty/null, all events are enabled
  enabledEvents: text('enabled_events').array(),

  // Who created this integration
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

  // Last successful webhook delivery
  lastDeliveryAt: timestamp('last_delivery_at', { withTimezone: true }),
  lastDeliveryStatus: text('last_delivery_status'), // 'success', 'failed'
  lastDeliveryError: text('last_delivery_error'),
})

/**
 * Integration webhooks history table
 *
 * Audit log of all webhook deliveries for debugging and monitoring.
 */
export const integrationWebhooks = pgTable('integration_webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Which integration sent this webhook
  integrationId: uuid('integration_id')
    .notNull()
    .references(() => integrations.id, { onDelete: 'cascade' }),

  // Event that triggered the webhook
  eventType: text('event_type').notNull(),

  // Payload that was sent
  payload: jsonb('payload'),

  // HTTP response status code
  statusCode: text('status_code'),

  // Response body (truncated for large responses)
  responseBody: text('response_body'),

  // Error message if failed
  error: text('error'),

  // Whether delivery was successful
  success: boolean('success').notNull().default(false),

  // Delivery timestamp
  deliveredAt: timestamp('delivered_at', { withTimezone: true }).notNull().defaultNow(),

  // How long the request took (ms)
  durationMs: text('duration_ms'),
})

// Export types
export type Integration = typeof integrations.$inferSelect
export type NewIntegration = typeof integrations.$inferInsert
export type IntegrationWebhook = typeof integrationWebhooks.$inferSelect
export type NewIntegrationWebhook = typeof integrationWebhooks.$inferInsert

// Provider-specific configuration types
export interface SlackConfig {
  channel?: string
  username?: string
  icon_emoji?: string
  icon_url?: string
  // Whether to include task links
  includeLinks?: boolean
  // Whether to mention users (requires user mapping)
  mentionUsers?: boolean
}

export interface DiscordConfig {
  username?: string
  avatar_url?: string
  // Whether to include embeds
  useEmbeds?: boolean
}

export interface GitHubConfig {
  // GitHub integration uses OAuth, not webhooks
  // These are for future use
  owner?: string
  repo?: string
  installationId?: string
}

export type IntegrationConfig = SlackConfig | DiscordConfig | GitHubConfig | Record<string, unknown>

/**
 * GitHub Integrations table
 * Stores GitHub OAuth tokens and user info for connected accounts
 */
export const githubIntegrations = pgTable('github_integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  // GitHub user info
  githubId: text('github_id').notNull(), // GitHub user ID as string for large numbers
  githubUsername: text('github_username').notNull(),
  githubEmail: text('github_email'),
  githubAvatarUrl: text('github_avatar_url'),
  githubName: text('github_name'), // Display name from GitHub

  // OAuth tokens (should be encrypted in production)
  accessToken: text('access_token').notNull(),

  // Scope tracking
  grantedScopes: text('granted_scopes').array(),

  // Connection status
  isConnected: boolean('is_connected').notNull().default(true),
  disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),

  // Sync info
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type GitHubIntegration = typeof githubIntegrations.$inferSelect
export type NewGitHubIntegration = typeof githubIntegrations.$inferInsert

/**
 * GitHub OAuth state tokens for CSRF protection
 * These are temporary and should be cleaned up after use or expiration
 */
export const githubOAuthStates = pgTable('github_oauth_states', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  state: text('state').notNull().unique(),
  redirectUrl: text('redirect_url'), // Optional redirect after OAuth completion
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type GitHubOAuthState = typeof githubOAuthStates.$inferSelect
export type NewGitHubOAuthState = typeof githubOAuthStates.$inferInsert

// Event type for integration notifications
export interface IntegrationEventData {
  type: string
  title: string
  body?: string
  link?: string
  projectId?: string
  projectName?: string
  organizationId: string
  taskId?: string
  taskName?: string
  actorId?: string
  actorName?: string
  actorEmail?: string
  metadata?: Record<string, unknown>
  timestamp: Date
}
