import { pgEnum, pgTable, text, timestamp, uuid, integer } from 'drizzle-orm/pg-core'
import { projects } from './projects'

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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert
