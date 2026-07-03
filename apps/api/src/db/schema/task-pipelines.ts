import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { projects } from './projects'

/**
 * A server-side sequential task pipeline for a project. Persisted so the
 * orchestrator survives API restarts and resumes on boot. One per project.
 */
export const taskPipelines = pgTable('task_pipelines', {
  projectId: uuid('project_id')
    .primaryKey()
    .references(() => projects.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('running'), // running | paused | completed | error
  fireUrl: text('fire_url').notNull(),
  tokenEncrypted: text('token_encrypted').notNull(),
  currentTaskId: text('current_task_id'),
  lastFiredTaskId: text('last_fired_task_id'),
  lastFiredAt: timestamp('last_fired_at', { withTimezone: true }),
  message: text('message'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
