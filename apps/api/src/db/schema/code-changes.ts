import { pgEnum, pgTable, text, timestamp, uuid, jsonb, index, integer } from 'drizzle-orm/pg-core'
import { projects } from './projects'
import { users } from './users'

// What type of code change was made
export const codeChangeTypeEnum = pgEnum('code_change_type', [
  'create',           // New file created
  'modify',           // Existing file modified
  'delete',           // File deleted
  'rename',           // File renamed/moved
  'refactor',         // Refactoring (no behavior change)
  'fix',              // Bug fix
  'feature',          // New feature implementation
  'other',            // Catch-all
])

// What initiated the change
export const codeChangeSourceEnum = pgEnum('code_change_source', [
  'ai_agent',         // AI agent (Claude Code, Cursor, etc.)
  'manual',           // Human developer
  'ci_cd',            // CI/CD pipeline
  'auto_generated',   // Auto-generated (migrations, codegen)
])

export const codeChanges = pgTable('code_changes', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Which project this change belongs to
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),

  // Classification
  type: codeChangeTypeEnum('type').notNull().default('other'),
  source: codeChangeSourceEnum('source').notNull().default('ai_agent'),

  // What changed
  summary: text('summary').notNull(),
  filePaths: text('file_paths').array().notNull(),
  linesAdded: integer('lines_added'),
  linesRemoved: integer('lines_removed'),

  // Context
  taskId: text('task_id'),
  commitHash: text('commit_hash'),
  branchName: text('branch_name'),

  // Structured metadata (diffs, tool info, etc.)
  metadata: jsonb('metadata'),

  // Who made the change
  createdBy: uuid('created_by')
    .references(() => users.id, { onDelete: 'set null' }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  projectIdx: index('code_changes_project_id_idx').on(table.projectId),
  projectCreatedAtIdx: index('code_changes_project_id_created_at_idx').on(table.projectId, table.createdAt),
  projectTaskIdx: index('code_changes_project_id_task_id_idx').on(table.projectId, table.taskId),
  commitIdx: index('code_changes_commit_hash_idx').on(table.commitHash),
}))

export type CodeChange = typeof codeChanges.$inferSelect
export type NewCodeChange = typeof codeChanges.$inferInsert

export type CodeChangeMetadata = {
  agentName?: string             // e.g., "Claude Code", "Cursor", "Windsurf"
  agentModel?: string            // e.g., "claude-sonnet-4-6"
  sessionId?: string             // Agent session identifier
  diff?: string                  // Abbreviated diff content
  relatedFiles?: string[]        // Files indirectly affected
  relatedKnowledgeIds?: string[] // Knowledge entries relevant to this change
  [key: string]: unknown
}
