/**
 * Base Repository
 * Provides common interface and utilities for all repositories
 */

import type { DbClient, DbClientWithTx, TransactionCallback } from '../db/client.js'
import { getDbClient, getDbClientWithTransactions, withTransaction, withTransactionIsolated } from '../db/client.js'

/**
 * Base interface for all repositories
 * Defines common CRUD operation signatures
 */
export interface IBaseRepository<T, CreateInput, UpdateInput> {
  findById(id: string): Promise<T | null>
  findAll(options?: FindAllOptions): Promise<T[]>
  create(data: CreateInput): Promise<T>
  update(id: string, data: UpdateInput): Promise<T | null>
  delete(id: string): Promise<boolean>
}

/**
 * Common options for findAll operations
 */
export interface FindAllOptions {
  limit?: number
  offset?: number
  orderBy?: 'asc' | 'desc'
  orderField?: string
}

/**
 * Pagination result wrapper
 */
export interface PaginatedResult<T> {
  data: T[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

/**
 * Abstract base repository class
 * Provides database client access and transaction support
 */
export abstract class BaseRepository {
  /**
   * Get the HTTP database client (for simple queries)
   */
  protected get db(): DbClient {
    return getDbClient()
  }

  /**
   * Get the database client with transaction support
   */
  protected get dbWithTx(): DbClientWithTx {
    return getDbClientWithTransactions()
  }

  /**
   * Execute operations within a database transaction
   */
  protected async withTransaction<T>(callback: TransactionCallback<T>): Promise<T> {
    return withTransaction(callback)
  }

  /**
   * Execute operations within a transaction with custom isolation level
   */
  protected async withTransactionIsolated<T>(
    callback: TransactionCallback<T>,
    options?: {
      isolationLevel?: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable'
      accessMode?: 'read only' | 'read write'
    }
  ): Promise<T> {
    return withTransactionIsolated(callback, options)
  }
}

/**
 * Type helper for extracting entity type from schema
 */
export type InferSelectModel<T> = T extends { $inferSelect: infer S } ? S : never
export type InferInsertModel<T> = T extends { $inferInsert: infer I } ? I : never
