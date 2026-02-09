import { pgTable, text, timestamp, uuid, pgEnum, jsonb } from 'drizzle-orm/pg-core'
import { users } from './users'
import { organizations } from './organizations'
import { projects } from './projects'
import { tasks } from './tasks'

// Activity action types
export const activityActionEnum = pgEnum('activity_action', [
  // Task actions
  'task_created',
  'task_updated',
  'task_deleted',
  'task_status_changed',
  'task_assigned',
  'task_unassigned',
  // Comment actions
  'comment_created',
  'comment_updated',
  'comment_deleted',
  // Project actions
  'project_created',
  'project_updated',
  'project_deleted',
  'plan_updated',
  // Organization actions
  'member_invited',
  'member_joined',
  'member_removed',
  'member_role_changed',
  // Generic
  'other',
])

// Activity entity types (what entity was affected)
export const activityEntityEnum = pgEnum('activity_entity', [
  'task',
  'comment',
  'project',
  'organization',
  'member',
  'invitation',
])

export const activityLog = pgTable('activity_log', {
  id: uuid('id').primaryKey().defaultRandom(),

  // What action was performed
  action: activityActionEnum('action').notNull(),

  // What type of entity was affected
  entityType: activityEntityEnum('entity_type').notNull(),

  // The ID of the affected entity (task ID, comment ID, etc.)
  entityId: uuid('entity_id'),

  // Human-readable task ID for task-related activities (e.g., "T1.1")
  taskId: text('task_id'),

  // Who performed the action
  actorId: uuid('actor_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  // Context: which organization (optional, for team activities)
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),

  // Context: which project (optional, for project-related activities)
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),

  // Context: which task (optional, for task-related activities)
  taskUuid: uuid('task_uuid').references(() => tasks.id, { onDelete: 'set null' }),

  // Additional metadata as JSON (e.g., old/new values, mentioned users, etc.)
  metadata: jsonb('metadata'),

  // Human-readable description of the activity
  description: text('description'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type ActivityLog = typeof activityLog.$inferSelect
export type NewActivityLog = typeof activityLog.$inferInsert

// Type for metadata field based on action type
export type ActivityMetadata = {
  // For status changes
  oldStatus?: string
  newStatus?: string
  // For assignments
  assigneeId?: string
  assigneeName?: string
  assigneeEmail?: string
  // For role changes
  oldRole?: string
  newRole?: string
  // For updates
  changedFields?: string[]
  // For comments
  commentPreview?: string
  parentCommentId?: string
  // For mentions
  mentionedUserIds?: string[]
  // For invitations
  inviteeEmail?: string
  // Generic key-value pairs
  [key: string]: unknown
}
