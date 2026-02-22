import { neon, neonConfig, Pool } from '@neondatabase/serverless'
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http'
import { drizzle as drizzleServerless } from 'drizzle-orm/neon-serverless'
import ws from 'ws'
import * as schema from './schema'

// Configure WebSocket for Node.js environment (required for Pool/transactions)
neonConfig.webSocketConstructor = ws

// HTTP client singleton (for regular queries - faster)
let httpDbInstance: ReturnType<typeof drizzleHttp<typeof schema>> | null = null

// Pool client singleton (for transactions - supports WebSocket)
let poolInstance: Pool | null = null
let poolDbInstance: ReturnType<typeof drizzleServerless<typeof schema>> | null = null

/**
 * Get the database connection string
 */
function getConnectionString(): string {
  const connectionString = process.env['DATABASE_URL_POOLED'] || process.env['DATABASE_URL']

  if (!connectionString) {
    throw new Error('DATABASE_URL or DATABASE_URL_POOLED environment variable is required')
  }

  return connectionString
}

/**
 * Get Drizzle database client (HTTP driver)
 * Uses Neon HTTP driver optimized for serverless environments
 * Best for: Single queries, reads, non-transactional writes
 */
export function getDbClient() {
  if (httpDbInstance) return httpDbInstance

  const sql = neon(getConnectionString())
  httpDbInstance = drizzleHttp(sql, { schema })

  return httpDbInstance
}

/**
 * Get Drizzle database client with transaction support (Pool/WebSocket driver)
 * Uses Neon Pool driver which supports transactions
 * Best for: Multi-operation writes that need atomicity
 */
export function getDbClientWithTransactions() {
  if (poolDbInstance) return poolDbInstance

  poolInstance = new Pool({ connectionString: getConnectionString() })
  poolDbInstance = drizzleServerless(poolInstance, { schema })

  return poolDbInstance
}

/**
 * Get the raw Pool instance for cleanup
 */
export function getPool(): Pool | null {
  return poolInstance
}

/**
 * Transaction callback type
 */
export type TransactionCallback<T> = (
  tx: Parameters<Parameters<ReturnType<typeof drizzleServerless>['transaction']>[0]>[0]
) => Promise<T>

/**
 * Run operations within a database transaction
 * Automatically commits on success, rolls back on error
 *
 * @example
 * ```typescript
 * const result = await withTransaction(async (tx) => {
 *   const [org] = await tx.insert(schema.organizations).values({...}).returning()
 *   await tx.insert(schema.organizationMembers).values({...})
 *   return org
 * })
 * ```
 */
export async function withTransaction<T>(callback: TransactionCallback<T>): Promise<T> {
  const db = getDbClientWithTransactions()
  return db.transaction(callback)
}

/**
 * Run operations within a transaction with custom isolation level
 * @param isolationLevel - 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable'
 */
export async function withTransactionIsolated<T>(
  callback: TransactionCallback<T>,
  options?: {
    isolationLevel?: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable'
    accessMode?: 'read only' | 'read write'
  }
): Promise<T> {
  const db = getDbClientWithTransactions()
  return db.transaction(callback, options)
}

/**
 * Cleanup pool connections (call on server shutdown)
 */
export async function closePool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end()
    poolInstance = null
    poolDbInstance = null
  }
}

// Export schema for convenience
export { schema }

// Type exports
export type DbClient = ReturnType<typeof getDbClient>
export type DbClientWithTx = ReturnType<typeof getDbClientWithTransactions>
