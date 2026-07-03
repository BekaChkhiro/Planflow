import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { projects } from './projects'

/**
 * A project's Claude Code routine binding (the /fire URL + token), stored
 * server-side so both the desktop app and the website can start pipelines
 * without re-entering the token. The token is encrypted at rest.
 */
export const routineConfigs = pgTable('routine_configs', {
  projectId: uuid('project_id')
    .primaryKey()
    .references(() => projects.id, { onDelete: 'cascade' }),
  fireUrl: text('fire_url').notNull(),
  tokenEncrypted: text('token_encrypted').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
