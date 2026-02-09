/**
 * Migration script for Activity Log Table (T5.6)
 *
 * Creates the activity_log table with the following columns:
 * - id: UUID primary key
 * - action: ENUM for activity action types
 * - entity_type: ENUM for entity types
 * - entity_id: UUID of the affected entity
 * - task_id: Human-readable task ID (e.g., "T1.1")
 * - actor_id: UUID reference to users (CASCADE delete)
 * - organization_id: UUID reference to organizations (CASCADE delete)
 * - project_id: UUID reference to projects (CASCADE delete)
 * - task_uuid: UUID reference to tasks (SET NULL on delete)
 * - metadata: JSONB for additional data
 * - description: text field for human-readable description
 * - created_at: timestamp
 *
 * Run with: npx tsx scripts/migrate-activity-log.ts
 */

import 'dotenv/config'
import { neon } from '@neondatabase/serverless'

async function migrate() {
  const databaseUrl = process.env['DATABASE_URL']
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required')
  }

  const sql = neon(databaseUrl)

  console.log('Starting migration: Create activity_log table...')

  try {
    // Create activity_action enum
    console.log('Creating activity_action enum...')
    await sql`
      DO $$ BEGIN
        CREATE TYPE activity_action AS ENUM (
          'task_created',
          'task_updated',
          'task_deleted',
          'task_status_changed',
          'task_assigned',
          'task_unassigned',
          'comment_created',
          'comment_updated',
          'comment_deleted',
          'project_created',
          'project_updated',
          'project_deleted',
          'plan_updated',
          'member_invited',
          'member_joined',
          'member_removed',
          'member_role_changed',
          'other'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `
    console.log('  ✓ activity_action enum created')

    // Create activity_entity enum
    console.log('Creating activity_entity enum...')
    await sql`
      DO $$ BEGIN
        CREATE TYPE activity_entity AS ENUM (
          'task',
          'comment',
          'project',
          'organization',
          'member',
          'invitation'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `
    console.log('  ✓ activity_entity enum created')

    // Create activity_log table
    console.log('Creating activity_log table...')
    await sql`
      CREATE TABLE IF NOT EXISTS activity_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        action activity_action NOT NULL,
        entity_type activity_entity NOT NULL,
        entity_id UUID,
        task_id TEXT,
        actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        task_uuid UUID REFERENCES tasks(id) ON DELETE SET NULL,
        metadata JSONB,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `
    console.log('  ✓ activity_log table created')

    // Create indexes for efficient queries
    console.log('Creating indexes...')

    // Index for querying by organization
    await sql`
      CREATE INDEX IF NOT EXISTS idx_activity_log_organization_id
      ON activity_log(organization_id)
      WHERE organization_id IS NOT NULL
    `
    console.log('  ✓ idx_activity_log_organization_id created')

    // Index for querying by project
    await sql`
      CREATE INDEX IF NOT EXISTS idx_activity_log_project_id
      ON activity_log(project_id)
      WHERE project_id IS NOT NULL
    `
    console.log('  ✓ idx_activity_log_project_id created')

    // Index for querying by task (UUID)
    await sql`
      CREATE INDEX IF NOT EXISTS idx_activity_log_task_uuid
      ON activity_log(task_uuid)
      WHERE task_uuid IS NOT NULL
    `
    console.log('  ✓ idx_activity_log_task_uuid created')

    // Index for querying by actor
    await sql`
      CREATE INDEX IF NOT EXISTS idx_activity_log_actor_id
      ON activity_log(actor_id)
    `
    console.log('  ✓ idx_activity_log_actor_id created')

    // Index for querying by action type
    await sql`
      CREATE INDEX IF NOT EXISTS idx_activity_log_action
      ON activity_log(action)
    `
    console.log('  ✓ idx_activity_log_action created')

    // Index for ordering by creation time (most common query pattern)
    await sql`
      CREATE INDEX IF NOT EXISTS idx_activity_log_created_at
      ON activity_log(created_at DESC)
    `
    console.log('  ✓ idx_activity_log_created_at created')

    // Composite index for organization activity queries (common pattern)
    await sql`
      CREATE INDEX IF NOT EXISTS idx_activity_log_org_created
      ON activity_log(organization_id, created_at DESC)
      WHERE organization_id IS NOT NULL
    `
    console.log('  ✓ idx_activity_log_org_created created')

    // Composite index for project activity queries (common pattern)
    await sql`
      CREATE INDEX IF NOT EXISTS idx_activity_log_project_created
      ON activity_log(project_id, created_at DESC)
      WHERE project_id IS NOT NULL
    `
    console.log('  ✓ idx_activity_log_project_created created')

    console.log('')
    console.log('Migration completed successfully!')
    console.log('')
    console.log('Table structure:')
    console.log('  - id: UUID (primary key)')
    console.log('  - action: activity_action (enum)')
    console.log('  - entity_type: activity_entity (enum)')
    console.log('  - entity_id: UUID (entity affected)')
    console.log('  - task_id: TEXT (human-readable task ID)')
    console.log('  - actor_id: UUID (foreign key to users)')
    console.log('  - organization_id: UUID (foreign key to organizations)')
    console.log('  - project_id: UUID (foreign key to projects)')
    console.log('  - task_uuid: UUID (foreign key to tasks)')
    console.log('  - metadata: JSONB (additional data)')
    console.log('  - description: TEXT (human-readable description)')
    console.log('  - created_at: TIMESTAMPTZ')
    console.log('')
    console.log('Endpoints available:')
    console.log('  - GET /organizations/:id/activity')
    console.log('  - GET /projects/:id/activity')
    console.log('  - GET /projects/:id/tasks/:taskId/activity')
    console.log('  - GET /users/me/activity')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

migrate()
