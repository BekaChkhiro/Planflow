import { pgTable, text, timestamp, uuid, boolean, unique, integer } from 'drizzle-orm/pg-core'
import { users } from './users'

// Push notification subscriptions for browser notifications
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),

  // User who owns this subscription
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  // Push API endpoint URL (unique per subscription)
  endpoint: text('endpoint').notNull(),

  // Authentication keys from PushSubscription
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),

  // User agent for device identification
  userAgent: text('user_agent'),

  // Whether this subscription is currently active
  isActive: boolean('is_active').notNull().default(true),

  // When the subscription expires (optional, from push service)
  expiresAt: timestamp('expires_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // Ensure unique endpoint per user
  uniqueEndpoint: unique().on(table.endpoint),
}))

// Notification preferences - what types of push notifications user wants
export const notificationPreferences = pgTable('notification_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),

  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  // Enable/disable push notifications globally
  pushEnabled: boolean('push_enabled').notNull().default(true),

  // Per-type preferences for push notifications
  pushMentions: boolean('push_mentions').notNull().default(true),
  pushAssignments: boolean('push_assignments').notNull().default(true),
  pushComments: boolean('push_comments').notNull().default(true),
  pushStatusChanges: boolean('push_status_changes').notNull().default(false),
  pushTaskCreated: boolean('push_task_created').notNull().default(false),
  pushInvitations: boolean('push_invitations').notNull().default(true),

  // Email notification preferences
  emailEnabled: boolean('email_enabled').notNull().default(true),
  emailMentions: boolean('email_mentions').notNull().default(true),
  emailAssignments: boolean('email_assignments').notNull().default(true),
  emailDigest: boolean('email_digest').notNull().default(false),

  // Digest email settings
  emailDigestFrequency: text('email_digest_frequency').notNull().default('daily'), // 'daily' | 'weekly' | 'none'
  emailDigestTime: text('email_digest_time').notNull().default('09:00'), // HH:MM format
  emailDigestTimezone: text('email_digest_timezone').notNull().default('UTC'),
  lastDigestSentAt: timestamp('last_digest_sent_at', { withTimezone: true }),

  // In-app toast preferences
  toastEnabled: boolean('toast_enabled').notNull().default(true),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // One preference set per user
  uniqueUser: unique().on(table.userId),
}))

// Digest send log for tracking and debugging
export const digestSendLog = pgTable('digest_send_log', {
  id: uuid('id').primaryKey().defaultRandom(),

  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  frequency: text('frequency').notNull(), // 'daily' | 'weekly'
  notificationCount: integer('notification_count').notNull(),
  fromDate: timestamp('from_date', { withTimezone: true }).notNull(),
  toDate: timestamp('to_date', { withTimezone: true }).notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  status: text('status').notNull().default('sent'), // 'sent' | 'failed'
  errorMessage: text('error_message'),
})

export type PushSubscription = typeof pushSubscriptions.$inferSelect
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert
export type NotificationPreference = typeof notificationPreferences.$inferSelect
export type NewNotificationPreference = typeof notificationPreferences.$inferInsert
export type DigestSendLog = typeof digestSendLog.$inferSelect
export type NewDigestSendLog = typeof digestSendLog.$inferInsert
