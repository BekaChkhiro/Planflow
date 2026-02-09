/**
 * Migration script for Comments Table (T5.5)
 *
 * Creates the comments table with the following columns:
 * - id: UUID primary key
 * - task_id: UUID reference to tasks (CASCADE delete)
 * - author_id: UUID reference to users (CASCADE delete)
 * - content: text field for comment content
 * - parent_id: UUID for thread support (self-reference)
 * - mentions: UUID array for mentioned users
 * - created_at: timestamp
 * - updated_at: timestamp
 *
 * Run with: npx tsx scripts/migrate-comments-table.ts
 */

import 'dotenv/config'
import { neon } from '@neondatabase/serverless'

async function migrate() {
  const databaseUrl = process.env['DATABASE_URL']
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required')
  }

  const sql = neon(databaseUrl)

  console.log('Starting migration: Create comments table...')

  try {
    // Create comments table
    console.log('Creating comments table...')
    await sql`
      CREATE TABLE IF NOT EXISTS comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
        mentions UUID[],
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `
    console.log('  ✓ comments table created')

    // Create indexes for efficient queries
    console.log('Creating indexes...')

    // Index for querying comments by task
    await sql`
      CREATE INDEX IF NOT EXISTS idx_comments_task_id ON comments(task_id)
    `
    console.log('  ✓ idx_comments_task_id created')

    // Index for querying comments by author
    await sql`
      CREATE INDEX IF NOT EXISTS idx_comments_author_id ON comments(author_id)
    `
    console.log('  ✓ idx_comments_author_id created')

    // Index for ordering by creation time
    await sql`
      CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at DESC)
    `
    console.log('  ✓ idx_comments_created_at created')

    // Index for finding replies (thread support)
    await sql`
      CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id)
    `
    console.log('  ✓ idx_comments_parent_id created')

    // GIN index for efficient mentions array queries
    await sql`
      CREATE INDEX IF NOT EXISTS idx_comments_mentions ON comments USING GIN(mentions)
    `
    console.log('  ✓ idx_comments_mentions created')

    console.log('')
    console.log('Migration completed successfully!')
    console.log('')
    console.log('Table structure:')
    console.log('  - id: UUID (primary key)')
    console.log('  - task_id: UUID (foreign key to tasks)')
    console.log('  - author_id: UUID (foreign key to users)')
    console.log('  - content: TEXT')
    console.log('  - parent_id: UUID (self-reference for threads)')
    console.log('  - mentions: UUID[] (array of mentioned user IDs)')
    console.log('  - created_at: TIMESTAMPTZ')
    console.log('  - updated_at: TIMESTAMPTZ')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

migrate()
