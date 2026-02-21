import { pgEnum, pgTable, text, timestamp, uuid, integer } from 'drizzle-orm/pg-core'
import { projects } from './projects'
import { users } from './users'

export const taskStatusEnum = pgEnum('task_status', ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'])
export const taskComplexityEnum = pgEnum('task_complexity', ['Low', 'Medium', 'High'])

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  taskId: text('task_id').notNull(), // e.g., "T1.1", "T2.3"
  name: text('name').notNull(),
  description: text('description'),
  status: taskStatusEnum('status').notNull().default('TODO'),
  complexity: taskComplexityEnum('complexity').notNull().default('Medium'),
  estimatedHours: integer('estimated_hours'),
  dependencies: text('dependencies').array(), // Array of task IDs like ["T1.1", "T1.2"]
  // Task assignment fields (T5.4)
  assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
  assignedBy: uuid('assigned_by').references(() => users.id, { onDelete: 'set null' }),
  assignedAt: timestamp('assigned_at', { withTimezone: true }),
  // Task locking fields (T6.6)
  lockedBy: uuid('locked_by').references(() => users.id, { onDelete: 'set null' }),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  lockExpiresAt: timestamp('lock_expires_at', { withTimezone: true }),
  // GitHub issue link fields (T8.3)
  githubIssueNumber: integer('github_issue_number'),
  githubRepository: text('github_repository'), // Format: "owner/repo"
  githubIssueUrl: text('github_issue_url'),
  githubIssueTitle: text('github_issue_title'),
  githubIssueState: text('github_issue_state'), // "open" or "closed"
  githubLinkedBy: uuid('github_linked_by').references(() => users.id, { onDelete: 'set null' }),
  githubLinkedAt: timestamp('github_linked_at', { withTimezone: true }),
  // GitHub Pull Request link fields (T8.4)
  githubPrNumber: integer('github_pr_number'),
  githubPrRepository: text('github_pr_repository'), // Format: "owner/repo"
  githubPrUrl: text('github_pr_url'),
  githubPrTitle: text('github_pr_title'),
  githubPrState: text('github_pr_state'), // "open", "closed", or "merged"
  githubPrBranch: text('github_pr_branch'), // Head branch name
  githubPrBaseBranch: text('github_pr_base_branch'), // Base branch name (e.g., "main")
  githubPrLinkedBy: uuid('github_pr_linked_by').references(() => users.id, { onDelete: 'set null' }),
  githubPrLinkedAt: timestamp('github_pr_linked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert
