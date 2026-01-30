import { pgEnum, pgTable, text, timestamp, uuid, integer } from 'drizzle-orm/pg-core'
import { users } from './users'

export const feedbackCategoryEnum = pgEnum('feedback_category', [
  'general',
  'bug',
  'feature',
  'usability',
  'performance',
])

export const feedback = pgTable('feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  category: feedbackCategoryEnum('category').notNull().default('general'),
  rating: integer('rating').notNull(), // 1-5 stars
  message: text('message').notNull(),
  userAgent: text('user_agent'), // Browser/client info for debugging
  pageUrl: text('page_url'), // Which page the feedback was submitted from
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Feedback = typeof feedback.$inferSelect
export type NewFeedback = typeof feedback.$inferInsert
