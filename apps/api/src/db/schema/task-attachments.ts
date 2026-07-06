import { pgTable, text, timestamp, uuid, integer, index } from 'drizzle-orm/pg-core'
import { projects } from './projects'
import { users } from './users'

/**
 * A file or image attached to a task for full context (design mockups,
 * references, specs). Bytes live in Cloudflare R2; this row is the metadata.
 */
export const taskAttachments = pgTable(
  'task_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    taskId: text('task_id').notNull(), // human task id, e.g. "T1.3"
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull().default(0),
    storageKey: text('storage_key').notNull(), // R2 object key
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    taskIdx: index('task_attachments_project_task_idx').on(table.projectId, table.taskId),
  })
)
