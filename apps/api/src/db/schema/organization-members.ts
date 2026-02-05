import { pgEnum, pgTable, timestamp, uuid, unique } from 'drizzle-orm/pg-core'
import { users } from './users'
import { organizations } from './organizations'

export const orgMemberRoleEnum = pgEnum('org_member_role', ['owner', 'admin', 'editor', 'viewer'])

export const organizationMembers = pgTable(
  'organization_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: orgMemberRoleEnum('role').notNull().default('viewer'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('org_member_unique').on(table.organizationId, table.userId),
  ]
)

export type OrganizationMember = typeof organizationMembers.$inferSelect
export type NewOrganizationMember = typeof organizationMembers.$inferInsert
