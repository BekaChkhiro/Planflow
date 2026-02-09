import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { tasks } from './tasks'
import { users } from './users'

export const comments = pgTable('comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  // Thread support: parent_id references another comment for replies
  parentId: uuid('parent_id'),
  // Mentioned user IDs stored as array of UUIDs
  mentions: uuid('mentions').array(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Comment = typeof comments.$inferSelect
export type NewComment = typeof comments.$inferInsert
