import { pgTable, text, timestamp, uuid, varchar, pgEnum } from 'drizzle-orm/pg-core'
import { users } from './users'
import { projects } from './projects'
import { organizations } from './organizations'

// Notification types
export const notificationTypeEnum = pgEnum('notification_type', [
  'mention',
  'assignment',
  'unassignment',
  'comment',
  'comment_reply',
  'status_change',
  'task_created',
  'task_deleted',
  'invitation',
  'member_joined',
  'member_removed',
  'role_changed',
])

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Who receives the notification
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  // Notification type
  type: notificationTypeEnum('type').notNull(),

  // Human-readable title (e.g., "You were mentioned in a comment")
  title: varchar('title', { length: 255 }).notNull(),

  // Optional body/description with more details
  body: text('body'),

  // Link to navigate to when clicking the notification
  link: varchar('link', { length: 500 }),

  // Context: which project (optional)
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),

  // Context: which organization (optional)
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),

  // Who triggered the notification (optional, e.g., who mentioned you)
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),

  // Related task ID (human-readable, e.g., "T1.1")
  taskId: text('task_id'),

  // When the notification was read (null = unread)
  readAt: timestamp('read_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Notification = typeof notifications.$inferSelect
export type NewNotification = typeof notifications.$inferInsert
