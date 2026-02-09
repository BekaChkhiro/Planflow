/**
 * Migration script for Notifications Table (T5.10)
 *
 * Creates the notifications table with the following columns:
 * - id: UUID primary key
 * - user_id: UUID reference to users (CASCADE delete)
 * - type: ENUM for notification types
 * - title: VARCHAR(255) notification title
 * - body: TEXT optional body/description
 * - link: VARCHAR(500) optional link
 * - project_id: UUID reference to projects (CASCADE delete)
 * - organization_id: UUID reference to organizations (CASCADE delete)
 * - actor_id: UUID reference to users (SET NULL on delete)
 * - task_id: TEXT for human-readable task ID
 * - read_at: TIMESTAMPTZ when notification was read
 * - created_at: TIMESTAMPTZ
 *
 * Run with: npx tsx scripts/migrate-notifications.ts
 */

import 'dotenv/config'
import { neon } from '@neondatabase/serverless'

async function migrate() {
  const databaseUrl = process.env['DATABASE_URL']
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required')
  }

  const sql = neon(databaseUrl)

  console.log('Starting migration: Create notifications table...')

  try {
    // Create notification_type enum
    console.log('Creating notification_type enum...')
    await sql`
      DO $$ BEGIN
        CREATE TYPE notification_type AS ENUM (
          'mention',
          'assignment',
          'unassignment',
          'comment',
          'comment_reply',
          'status_change',
          'task_created',
          'task_deleted',
          'invitation',
          'member_joined',
          'member_removed',
          'role_changed'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `
    console.log('  ✓ notification_type enum created')

    // Create notifications table
    console.log('Creating notifications table...')
    await sql`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type notification_type NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT,
        link VARCHAR(500),
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
        actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
        task_id TEXT,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `
    console.log('  ✓ notifications table created')

    // Create indexes for efficient queries
    console.log('Creating indexes...')

    // Index for querying by user (most common query)
    await sql`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id
      ON notifications(user_id)
    `
    console.log('  ✓ idx_notifications_user_id created')

    // Index for querying unread notifications by user
    await sql`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
      ON notifications(user_id, created_at DESC)
      WHERE read_at IS NULL
    `
    console.log('  ✓ idx_notifications_user_unread created')

    // Index for ordering by creation time
    await sql`
      CREATE INDEX IF NOT EXISTS idx_notifications_created_at
      ON notifications(created_at DESC)
    `
    console.log('  ✓ idx_notifications_created_at created')

    // Index for querying by project
    await sql`
      CREATE INDEX IF NOT EXISTS idx_notifications_project_id
      ON notifications(project_id)
      WHERE project_id IS NOT NULL
    `
    console.log('  ✓ idx_notifications_project_id created')

    // Index for querying by organization
    await sql`
      CREATE INDEX IF NOT EXISTS idx_notifications_organization_id
      ON notifications(organization_id)
      WHERE organization_id IS NOT NULL
    `
    console.log('  ✓ idx_notifications_organization_id created')

    // Index for querying by type
    await sql`
      CREATE INDEX IF NOT EXISTS idx_notifications_type
      ON notifications(type)
    `
    console.log('  ✓ idx_notifications_type created')

    // Composite index for user notifications by time (most common query pattern)
    await sql`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_created
      ON notifications(user_id, created_at DESC)
    `
    console.log('  ✓ idx_notifications_user_created created')

    console.log('')
    console.log('Migration completed successfully!')
    console.log('')
    console.log('Table structure:')
    console.log('  - id: UUID (primary key)')
    console.log('  - user_id: UUID (foreign key to users)')
    console.log('  - type: notification_type (enum)')
    console.log('  - title: VARCHAR(255)')
    console.log('  - body: TEXT (optional)')
    console.log('  - link: VARCHAR(500) (optional)')
    console.log('  - project_id: UUID (foreign key to projects)')
    console.log('  - organization_id: UUID (foreign key to organizations)')
    console.log('  - actor_id: UUID (foreign key to users)')
    console.log('  - task_id: TEXT (human-readable task ID)')
    console.log('  - read_at: TIMESTAMPTZ (null = unread)')
    console.log('  - created_at: TIMESTAMPTZ')
    console.log('')
    console.log('Endpoints available:')
    console.log('  - GET /notifications')
    console.log('  - GET /notifications/unread-count')
    console.log('  - GET /notifications/:id')
    console.log('  - PATCH /notifications/:id/read')
    console.log('  - POST /notifications/mark-read')
    console.log('  - POST /notifications/mark-all-read')
    console.log('  - DELETE /notifications/:id')
    console.log('  - DELETE /notifications')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

migrate()
