import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

// Database client singleton
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null

/**
 * Get Drizzle database client
 * Uses Neon HTTP driver optimized for serverless environments
 */
export function getDbClient() {
  if (dbInstance) return dbInstance

  const connectionString = process.env['DATABASE_URL_POOLED'] || process.env['DATABASE_URL']

  if (!connectionString) {
    throw new Error('DATABASE_URL or DATABASE_URL_POOLED environment variable is required')
  }

  const sql = neon(connectionString)
  dbInstance = drizzle(sql, { schema })

  return dbInstance
}

// Export schema for convenience
export { schema }

// Type export for the database client
export type DbClient = ReturnType<typeof getDbClient>
