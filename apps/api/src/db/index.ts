import { neon, NeonQueryFunction } from '@neondatabase/serverless'

// Database connection singleton (raw Neon client)
let db: NeonQueryFunction<boolean, boolean> | null = null

/**
 * Get raw Neon database connection
 * Uses pooled connection string for better performance in serverless
 * @deprecated Use getDbClient() from './client' for Drizzle ORM queries
 */
export function getDb(): NeonQueryFunction<boolean, boolean> {
  if (db) return db

  const connectionString = process.env['DATABASE_URL_POOLED'] || process.env['DATABASE_URL']

  if (!connectionString) {
    throw new Error('DATABASE_URL or DATABASE_URL_POOLED environment variable is required')
  }

  db = neon(connectionString)
  return db
}

// Re-export Drizzle client and schema
export { getDbClient, schema } from './client'
export type { DbClient } from './client'

/**
 * Check database connectivity
 * Returns true if connection is successful
 */
export async function checkDbConnection(): Promise<{
  connected: boolean
  latency?: number
  error?: string
}> {
  try {
    const start = Date.now()
    const sql = getDb()
    await sql`SELECT 1 as ping`
    const latency = Date.now() - start

    return { connected: true, latency }
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown database error',
    }
  }
}

interface DbInfoRow {
  version: string
  current_database: string
  server_time: string
}

/**
 * Get database info for health checks
 */
export async function getDbInfo(): Promise<{
  version?: string
  currentDatabase?: string
  serverTime?: string
}> {
  try {
    const sql = getDb()
    const results = await sql`
      SELECT
        version() as version,
        current_database() as current_database,
        now()::text as server_time
    `
    const result = (Array.isArray(results) ? results[0] : null) as DbInfoRow | null
    if (!result) return {}

    return {
      version: result.version,
      currentDatabase: result.current_database,
      serverTime: result.server_time,
    }
  } catch {
    return {}
  }
}
