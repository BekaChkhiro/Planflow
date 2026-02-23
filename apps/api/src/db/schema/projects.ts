import { pgTable, text, timestamp, uuid, boolean, index } from 'drizzle-orm/pg-core'
import { users } from './users'

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  plan: text('plan'), // Markdown content of PROJECT_PLAN.md
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true }), // Soft delete timestamp
  // GitHub Repository Integration fields
  githubRepository: text('github_repository'), // "owner/repo" format
  githubOwner: text('github_owner'), // "owner"
  githubRepoName: text('github_repo_name'), // "repo"
  githubDefaultBranch: text('github_default_branch'), // "main" or "master"
  githubRepoUrl: text('github_repo_url'), // "https://github.com/owner/repo"
  githubRepoPrivate: boolean('github_repo_private'), // is private repo
  githubWebhookId: text('github_webhook_id'), // webhook ID for management
  githubWebhookSecret: text('github_webhook_secret'), // unique secret per project
  githubLinkedAt: timestamp('github_linked_at', { withTimezone: true }),
  githubLinkedBy: uuid('github_linked_by').references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  // Index for finding projects by repository
  githubRepositoryIdx: index('projects_github_repository_idx').on(table.githubRepository),
}))

export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
