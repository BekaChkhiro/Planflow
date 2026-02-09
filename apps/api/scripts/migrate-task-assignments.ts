/**
 * Migration script for T5.4: Task Assignment Fields
 *
 * This script adds the following columns to the tasks table:
 * - assignee_id: UUID reference to the user assigned to the task
 * - assigned_by: UUID reference to the user who made the assignment
 * - assigned_at: Timestamp when the assignment was made
 *
 * Run with: npx tsx scripts/migrate-task-assignments.ts
 */

import 'dotenv/config'
import { neon } from '@neondatabase/serverless'

async function migrate() {
  const databaseUrl = process.env['DATABASE_URL']
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required')
  }

  const sql = neon(databaseUrl)

  console.log('Starting migration: Add task assignment fields...')

  try {
    // Check if columns already exist
    const checkResult = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'tasks' AND column_name IN ('assignee_id', 'assigned_by', 'assigned_at')
    `

    const existingColumns = checkResult.map((r) => r.column_name)

    if (existingColumns.includes('assignee_id')) {
      console.log('Column assignee_id already exists, skipping...')
    } else {
      console.log('Adding column: assignee_id')
      await sql`
        ALTER TABLE tasks
        ADD COLUMN assignee_id UUID REFERENCES users(id) ON DELETE SET NULL
      `
    }

    if (existingColumns.includes('assigned_by')) {
      console.log('Column assigned_by already exists, skipping...')
    } else {
      console.log('Adding column: assigned_by')
      await sql`
        ALTER TABLE tasks
        ADD COLUMN assigned_by UUID REFERENCES users(id) ON DELETE SET NULL
      `
    }

    if (existingColumns.includes('assigned_at')) {
      console.log('Column assigned_at already exists, skipping...')
    } else {
      console.log('Adding column: assigned_at')
      await sql`
        ALTER TABLE tasks
        ADD COLUMN assigned_at TIMESTAMPTZ
      `
    }

    // Create index for faster queries on assignee_id
    console.log('Creating index on assignee_id (if not exists)...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON tasks(assignee_id)
    `

    console.log('Migration completed successfully!')
    console.log('')
    console.log('New columns added to tasks table:')
    console.log('  - assignee_id: UUID REFERENCES users(id) ON DELETE SET NULL')
    console.log('  - assigned_by: UUID REFERENCES users(id) ON DELETE SET NULL')
    console.log('  - assigned_at: TIMESTAMPTZ')
    console.log('')
    console.log('New index created:')
    console.log('  - idx_tasks_assignee_id')

  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

migrate()
