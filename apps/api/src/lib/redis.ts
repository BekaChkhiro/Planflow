import Redis from 'ioredis'
import { loggers } from './logger.js'

const log = loggers.redis
const rateLimitLog = loggers.rateLimit
const taskLockLog = loggers.taskLock
const activeWorkLog = loggers.activeWork
const recentChangesLog = loggers.recentChanges

// ============================================
// Redis Client Configuration
// ============================================

let redisClient: Redis | null = null
let connectionAttempted = false

/**
 * Redis connection configuration
 * Supports both REDIS_URL (single connection string) and individual params
 */
interface RedisConfig {
  url?: string
  host?: string
  port?: number
  password?: string
  db?: number
  tls?: boolean
  keyPrefix?: string
  connectTimeout?: number
  maxRetriesPerRequest?: number
}

/**
 * Get Redis configuration from environment variables
 */
function getRedisConfig(): RedisConfig | null {
  // Check for Redis URL first (commonly used by cloud providers)
  const redisUrl = process.env['REDIS_URL'] || process.env['UPSTASH_REDIS_URL']
  if (redisUrl) {
    return {
      url: redisUrl,
      keyPrefix: process.env['REDIS_KEY_PREFIX'] || 'planflow:',
      connectTimeout: 5000,
      maxRetriesPerRequest: 3,
    }
  }

  // Check for individual connection params
  const host = process.env['REDIS_HOST']
  const port = process.env['REDIS_PORT']

  if (host) {
    return {
      host,
      port: port ? parseInt(port, 10) : 6379,
      password: process.env['REDIS_PASSWORD'],
      db: process.env['REDIS_DB'] ? parseInt(process.env['REDIS_DB'], 10) : 0,
      tls: process.env['REDIS_TLS'] === 'true',
      keyPrefix: process.env['REDIS_KEY_PREFIX'] || 'planflow:',
      connectTimeout: 5000,
      maxRetriesPerRequest: 3,
    }
  }

  return null
}

/**
 * Initialize Redis client
 * Returns null if Redis is not configured or connection fails
 */
export async function initRedis(): Promise<Redis | null> {
  if (redisClient) {
    return redisClient
  }

  if (connectionAttempted) {
    return null
  }

  connectionAttempted = true

  const config = getRedisConfig()
  if (!config) {
    log.info('No Redis configuration found, using in-memory fallback')
    return null
  }

  try {
    let client: Redis

    if (config.url) {
      client = new Redis(config.url, {
        keyPrefix: config.keyPrefix,
        connectTimeout: config.connectTimeout,
        maxRetriesPerRequest: config.maxRetriesPerRequest,
        retryStrategy: (times) => {
          if (times > 3) {
            log.warn('Max retries reached, giving up')
            return null // Stop retrying
          }
          return Math.min(times * 200, 1000) // Retry with backoff
        },
        lazyConnect: true,
      })
    } else {
      client = new Redis({
        host: config.host,
        port: config.port,
        password: config.password,
        db: config.db,
        tls: config.tls ? {} : undefined,
        keyPrefix: config.keyPrefix,
        connectTimeout: config.connectTimeout,
        maxRetriesPerRequest: config.maxRetriesPerRequest,
        retryStrategy: (times) => {
          if (times > 3) {
            log.warn('Max retries reached, giving up')
            return null
          }
          return Math.min(times * 200, 1000)
        },
        lazyConnect: true,
      })
    }

    // Set up event handlers
    client.on('error', (err) => {
      log.error({ err: err.message }, 'Connection error')
    })

    client.on('connect', () => {
      log.info('Connected successfully')
    })

    client.on('close', () => {
      log.info('Connection closed')
    })

    // Attempt to connect
    await client.connect()

    // Test the connection
    await client.ping()

    redisClient = client
    log.info('Initialized and ready')
    return client

  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : error }, 'Failed to initialize')
    log.info('Falling back to in-memory rate limiting')
    return null
  }
}

/**
 * Get the Redis client instance
 * Returns null if Redis is not available
 */
export function getRedis(): Redis | null {
  return redisClient
}

/**
 * Check if Redis is available
 */
export function isRedisAvailable(): boolean {
  return redisClient !== null && redisClient.status === 'ready'
}

/**
 * Close Redis connection gracefully
 * Should be called during application shutdown
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    const client = redisClient
    try {
      await client.quit()
      redisClient = null
      connectionAttempted = false
      log.info('Connection closed gracefully')
    } catch (error) {
      log.error({ err: error }, 'Error closing connection')
      // Force disconnect if quit fails
      client.disconnect()
      redisClient = null
      connectionAttempted = false
    }
  }
}

// ============================================
// Rate Limiting Store Interface
// ============================================

export interface RateLimitStore {
  /**
   * Increment the count for a key and return the current count
   * Also sets expiration if key is new
   */
  increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>

  /**
   * Get the current state for a key
   */
  get(key: string): Promise<{ count: number; resetAt: number } | null>

  /**
   * Delete a key
   */
  delete(key: string): Promise<void>

  /**
   * Clear all keys (use with caution)
   */
  clear(): Promise<void>
}

/**
 * Redis-based rate limit store
 * Uses Redis sorted sets for efficient rate limiting
 */
export class RedisRateLimitStore implements RateLimitStore {
  private redis: Redis

  constructor(redis: Redis) {
    this.redis = redis
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const now = Date.now()
    const resetAt = now + windowMs
    const fullKey = `ratelimit:${key}`

    // Use a Lua script for atomic increment and expire
    const luaScript = `
      local key = KEYS[1]
      local windowMs = tonumber(ARGV[1])
      local now = tonumber(ARGV[2])

      -- Get current value
      local data = redis.call('GET', key)
      local count = 0
      local resetAt = now + windowMs

      if data then
        local parsed = cjson.decode(data)
        if parsed.resetAt > now then
          -- Window still active
          count = parsed.count
          resetAt = parsed.resetAt
        end
        -- else: window expired, start fresh
      end

      -- Increment count
      count = count + 1

      -- Save updated data
      local newData = cjson.encode({count = count, resetAt = resetAt})
      local ttlMs = resetAt - now
      redis.call('SET', key, newData, 'PX', ttlMs)

      return cjson.encode({count = count, resetAt = resetAt})
    `

    try {
      const result = await this.redis.eval(
        luaScript,
        1,
        fullKey,
        windowMs.toString(),
        now.toString()
      ) as string

      const parsed = JSON.parse(result)
      return { count: parsed.count, resetAt: parsed.resetAt }
    } catch (error) {
      // Fallback: simple increment without atomic guarantees
      log.error({ err: error }, 'Lua script error, using fallback')

      const data = await this.redis.get(fullKey)
      let count = 1
      let actualResetAt = resetAt

      if (data) {
        try {
          const parsed = JSON.parse(data)
          if (parsed.resetAt > now) {
            count = parsed.count + 1
            actualResetAt = parsed.resetAt
          }
        } catch {
          // Invalid data, start fresh
        }
      }

      const ttlMs = actualResetAt - now
      await this.redis.set(
        fullKey,
        JSON.stringify({ count, resetAt: actualResetAt }),
        'PX',
        ttlMs
      )

      return { count, resetAt: actualResetAt }
    }
  }

  async get(key: string): Promise<{ count: number; resetAt: number } | null> {
    const fullKey = `ratelimit:${key}`
    const data = await this.redis.get(fullKey)

    if (!data) {
      return null
    }

    try {
      const parsed = JSON.parse(data)
      if (parsed.resetAt < Date.now()) {
        // Expired
        await this.redis.del(fullKey)
        return null
      }
      return { count: parsed.count, resetAt: parsed.resetAt }
    } catch {
      return null
    }
  }

  async delete(key: string): Promise<void> {
    const fullKey = `ratelimit:${key}`
    await this.redis.del(fullKey)
  }

  async clear(): Promise<void> {
    // Find and delete all rate limit keys
    // Note: This uses SCAN which is safe for production
    let cursor = '0'
    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        'ratelimit:*',
        'COUNT',
        100
      )
      cursor = newCursor

      if (keys.length > 0) {
        await this.redis.del(...keys)
      }
    } while (cursor !== '0')
  }
}

/**
 * In-memory rate limit store (fallback)
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, { count: number; resetAt: number }>()
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.startCleanup()
  }

  private startCleanup(): void {
    if (this.cleanupInterval) {
      return
    }

    this.cleanupInterval = setInterval(() => {
      const now = Date.now()
      for (const [key, entry] of this.store.entries()) {
        if (entry.resetAt < now) {
          this.store.delete(key)
        }
      }
    }, 60000) // Clean every minute

    // Don't prevent Node.js from exiting
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref()
    }
  }

  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const now = Date.now()
    const fullKey = `ratelimit:${key}`

    let entry = this.store.get(fullKey)

    if (!entry || entry.resetAt < now) {
      // Create new entry
      entry = {
        count: 0,
        resetAt: now + windowMs,
      }
    }

    entry.count++
    this.store.set(fullKey, entry)

    return { count: entry.count, resetAt: entry.resetAt }
  }

  async get(key: string): Promise<{ count: number; resetAt: number } | null> {
    const fullKey = `ratelimit:${key}`
    const entry = this.store.get(fullKey)

    if (!entry) {
      return null
    }

    if (entry.resetAt < Date.now()) {
      this.store.delete(fullKey)
      return null
    }

    return entry
  }

  async delete(key: string): Promise<void> {
    const fullKey = `ratelimit:${key}`
    this.store.delete(fullKey)
  }

  async clear(): Promise<void> {
    this.store.clear()
  }
}

// ============================================
// Global Rate Limit Store Instance
// ============================================

let rateLimitStore: RateLimitStore | null = null

/**
 * Get the rate limit store
 * Uses Redis if available, falls back to in-memory
 */
export function getRateLimitStore(): RateLimitStore {
  if (rateLimitStore) {
    return rateLimitStore
  }

  const redis = getRedis()
  if (redis && isRedisAvailable()) {
    rateLimitStore = new RedisRateLimitStore(redis)
    rateLimitLog.info('Using Redis store')
  } else {
    rateLimitStore = new InMemoryRateLimitStore()
    rateLimitLog.info('Using in-memory store')
  }

  return rateLimitStore
}

/**
 * Initialize the rate limit store
 * Should be called after Redis initialization
 */
export function initRateLimitStore(): RateLimitStore {
  const redis = getRedis()
  if (redis && isRedisAvailable()) {
    rateLimitStore = new RedisRateLimitStore(redis)
    rateLimitLog.info('Initialized with Redis store')
  } else {
    rateLimitStore = new InMemoryRateLimitStore()
    rateLimitLog.info('Initialized with in-memory store (Redis not available)')
  }

  return rateLimitStore
}

/**
 * Reset the rate limit store
 * Useful for switching between Redis and in-memory during runtime
 */
export function resetRateLimitStore(): void {
  if (rateLimitStore instanceof InMemoryRateLimitStore) {
    rateLimitStore.stopCleanup()
  }
  rateLimitStore = null
}

// ============================================
// Task Lock Store Interface (T10.9)
// ============================================

export interface TaskLockData {
  taskId: string          // Human-readable ID (e.g., "T1.1")
  taskUuid: string        // Database UUID
  userId: string
  userEmail: string
  userName: string | null
  lockedAt: string        // ISO timestamp
  expiresAt: string       // ISO timestamp
}

export interface TaskLockStore {
  /**
   * Acquire or extend a lock on a task
   * Returns the lock data if successful, or existing lock if denied
   */
  acquireLock(
    projectId: string,
    taskId: string,
    lockData: Omit<TaskLockData, 'lockedAt' | 'expiresAt'>,
    durationMs: number
  ): Promise<{ success: boolean; lock: TaskLockData; isOwnLock?: boolean }>

  /**
   * Release a lock on a task
   */
  releaseLock(projectId: string, taskId: string, userId?: string): Promise<boolean>

  /**
   * Get lock info for a task
   */
  getLock(projectId: string, taskId: string): Promise<TaskLockData | null>

  /**
   * Get all locks for a project
   */
  getProjectLocks(projectId: string): Promise<TaskLockData[]>

  /**
   * Release all locks held by a user in a project
   */
  releaseUserLocks(projectId: string, userId: string): Promise<string[]>

  /**
   * Extend a lock's expiration
   */
  extendLock(projectId: string, taskId: string, userId: string, durationMs: number): Promise<boolean>
}

/**
 * Redis-based task lock store
 * Uses Redis with TTL for automatic lock expiration
 */
export class RedisTaskLockStore implements TaskLockStore {
  private redis: Redis

  constructor(redis: Redis) {
    this.redis = redis
  }

  private getLockKey(projectId: string, taskId: string): string {
    return `lock:${projectId}:${taskId}`
  }

  private getProjectLocksKey(projectId: string): string {
    return `locks:${projectId}`
  }

  private getUserLocksKey(projectId: string, userId: string): string {
    return `userlocks:${projectId}:${userId}`
  }

  async acquireLock(
    projectId: string,
    taskId: string,
    lockData: Omit<TaskLockData, 'lockedAt' | 'expiresAt'>,
    durationMs: number
  ): Promise<{ success: boolean; lock: TaskLockData; isOwnLock?: boolean }> {
    const lockKey = this.getLockKey(projectId, taskId)
    const projectLocksKey = this.getProjectLocksKey(projectId)
    const userLocksKey = this.getUserLocksKey(projectId, lockData.userId)

    const now = new Date()
    const expiresAt = new Date(now.getTime() + durationMs)

    // Check for existing lock
    const existingData = await this.redis.get(lockKey)
    if (existingData) {
      try {
        const existing: TaskLockData = JSON.parse(existingData)

        // If same user, extend the lock
        if (existing.userId === lockData.userId) {
          const newLock: TaskLockData = {
            ...existing,
            lockedAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
          }

          // Update with new TTL
          await this.redis.set(lockKey, JSON.stringify(newLock), 'PX', durationMs)

          taskLockLog.debug({ taskId, userId: lockData.userId }, 'Extended lock')

          return { success: true, lock: newLock, isOwnLock: true }
        }

        // Different user - lock denied
        return { success: false, lock: existing }
      } catch (err) {
        // Invalid data, clean up and proceed
        taskLockLog.error({ err }, 'Invalid lock data, cleaning up')
        await this.redis.del(lockKey)
      }
    }

    // Create new lock
    const newLock: TaskLockData = {
      ...lockData,
      lockedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    }

    // Use transaction for atomic operations
    const multi = this.redis.multi()
    multi.set(lockKey, JSON.stringify(newLock), 'PX', durationMs)
    multi.sadd(projectLocksKey, taskId)
    multi.sadd(userLocksKey, taskId)
    // Set TTL on index keys slightly longer than lock to allow cleanup
    multi.expire(projectLocksKey, Math.ceil(durationMs / 1000) + 60)
    multi.expire(userLocksKey, Math.ceil(durationMs / 1000) + 60)

    await multi.exec()

    taskLockLog.info({ taskId, userId: lockData.userId, expiresAt: expiresAt.toISOString() }, 'Task locked')

    return { success: true, lock: newLock }
  }

  async releaseLock(projectId: string, taskId: string, userId?: string): Promise<boolean> {
    const lockKey = this.getLockKey(projectId, taskId)
    const projectLocksKey = this.getProjectLocksKey(projectId)

    // Check if lock exists and optionally verify ownership
    const existingData = await this.redis.get(lockKey)
    if (!existingData) return false

    if (userId) {
      try {
        const existing: TaskLockData = JSON.parse(existingData)
        if (existing.userId !== userId) return false

        // Also remove from user's locks index
        const userLocksKey = this.getUserLocksKey(projectId, existing.userId)
        await this.redis.srem(userLocksKey, taskId)
      } catch {
        // Invalid data, proceed with delete
      }
    } else {
      // No userId specified, still try to clean up user index
      try {
        const existing: TaskLockData = JSON.parse(existingData)
        const userLocksKey = this.getUserLocksKey(projectId, existing.userId)
        await this.redis.srem(userLocksKey, taskId)
      } catch {
        // Best effort
      }
    }

    // Delete lock and remove from project index
    const multi = this.redis.multi()
    multi.del(lockKey)
    multi.srem(projectLocksKey, taskId)
    await multi.exec()

    taskLockLog.debug({ taskId }, 'Task unlocked')
    return true
  }

  async getLock(projectId: string, taskId: string): Promise<TaskLockData | null> {
    const lockKey = this.getLockKey(projectId, taskId)
    const data = await this.redis.get(lockKey)

    if (!data) return null

    try {
      const lock: TaskLockData = JSON.parse(data)

      // Double-check expiration (Redis TTL should handle this, but be safe)
      if (new Date(lock.expiresAt) <= new Date()) {
        await this.releaseLock(projectId, taskId)
        return null
      }

      return lock
    } catch {
      // Invalid data, clean up
      await this.redis.del(lockKey)
      return null
    }
  }

  async getProjectLocks(projectId: string): Promise<TaskLockData[]> {
    const projectLocksKey = this.getProjectLocksKey(projectId)
    const taskIds = await this.redis.smembers(projectLocksKey)

    if (taskIds.length === 0) return []

    const locks: TaskLockData[] = []
    const expiredTaskIds: string[] = []

    // Fetch all locks in parallel
    const lockKeys = taskIds.map(taskId => this.getLockKey(projectId, taskId))
    const lockDataArray = await this.redis.mget(...lockKeys)

    for (let i = 0; i < taskIds.length; i++) {
      const taskId = taskIds[i]!
      const data = lockDataArray[i]

      if (!data) {
        // Lock expired (Redis TTL deleted it), clean up index
        expiredTaskIds.push(taskId)
        continue
      }

      try {
        const lock: TaskLockData = JSON.parse(data)

        // Verify not expired
        if (new Date(lock.expiresAt) > new Date()) {
          locks.push(lock)
        } else {
          expiredTaskIds.push(taskId)
        }
      } catch {
        expiredTaskIds.push(taskId)
      }
    }

    // Clean up expired entries from index
    if (expiredTaskIds.length > 0) {
      await this.redis.srem(projectLocksKey, ...expiredTaskIds)
    }

    return locks
  }

  async releaseUserLocks(projectId: string, userId: string): Promise<string[]> {
    const userLocksKey = this.getUserLocksKey(projectId, userId)
    const taskIds = await this.redis.smembers(userLocksKey)

    if (taskIds.length === 0) return []

    const releasedTaskIds: string[] = []

    for (const taskId of taskIds) {
      // Verify the lock belongs to this user before releasing
      const lock = await this.getLock(projectId, taskId)
      if (lock && lock.userId === userId) {
        await this.releaseLock(projectId, taskId, userId)
        releasedTaskIds.push(taskId)
      }
    }

    // Clear user's locks index
    await this.redis.del(userLocksKey)

    if (releasedTaskIds.length > 0) {
      taskLockLog.info({ userId, count: releasedTaskIds.length, taskIds: releasedTaskIds }, 'Released user locks')
    }

    return releasedTaskIds
  }

  async extendLock(projectId: string, taskId: string, userId: string, durationMs: number): Promise<boolean> {
    const lockKey = this.getLockKey(projectId, taskId)
    const data = await this.redis.get(lockKey)

    if (!data) return false

    try {
      const lock: TaskLockData = JSON.parse(data)

      // Verify ownership
      if (lock.userId !== userId) return false

      // Check if still valid
      if (new Date(lock.expiresAt) <= new Date()) {
        await this.releaseLock(projectId, taskId)
        return false
      }

      // Extend
      const newExpiresAt = new Date(Date.now() + durationMs)
      lock.expiresAt = newExpiresAt.toISOString()

      // Update with new TTL
      await this.redis.set(lockKey, JSON.stringify(lock), 'PX', durationMs)

      taskLockLog.debug({ taskId, expiresAt: newExpiresAt.toISOString() }, 'Lock extended')
      return true
    } catch {
      return false
    }
  }
}

/**
 * In-memory task lock store (fallback)
 * Note: Locks are lost on server restart
 */
export class InMemoryTaskLockStore implements TaskLockStore {
  private locks = new Map<string, Map<string, TaskLockData>>()
  private timers = new Map<string, NodeJS.Timeout>()

  private getLockKey(projectId: string, taskId: string): string {
    return `${projectId}:${taskId}`
  }

  async acquireLock(
    projectId: string,
    taskId: string,
    lockData: Omit<TaskLockData, 'lockedAt' | 'expiresAt'>,
    durationMs: number
  ): Promise<{ success: boolean; lock: TaskLockData; isOwnLock?: boolean }> {
    if (!this.locks.has(projectId)) {
      this.locks.set(projectId, new Map())
    }
    const projectLocks = this.locks.get(projectId)!
    const timerKey = this.getLockKey(projectId, taskId)

    const now = new Date()
    const expiresAt = new Date(now.getTime() + durationMs)

    // Check for existing lock
    const existing = projectLocks.get(taskId)
    if (existing && new Date(existing.expiresAt) > now) {
      // If same user, extend the lock
      if (existing.userId === lockData.userId) {
        const newLock: TaskLockData = {
          ...existing,
          lockedAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
        }
        projectLocks.set(taskId, newLock)

        // Reset timer
        this.resetTimer(timerKey, projectId, taskId, durationMs)

        return { success: true, lock: newLock, isOwnLock: true }
      }

      // Different user - lock denied
      return { success: false, lock: existing }
    }

    // Create new lock
    const newLock: TaskLockData = {
      ...lockData,
      lockedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    }
    projectLocks.set(taskId, newLock)

    // Set timer
    this.setTimer(timerKey, projectId, taskId, durationMs)

    taskLockLog.info({ taskId, userId: lockData.userId, expiresAt: expiresAt.toISOString(), store: 'memory' }, 'Task locked')

    return { success: true, lock: newLock }
  }

  async releaseLock(projectId: string, taskId: string, userId?: string): Promise<boolean> {
    const projectLocks = this.locks.get(projectId)
    if (!projectLocks) return false

    const lock = projectLocks.get(taskId)
    if (!lock) return false

    if (userId && lock.userId !== userId) return false

    // Clear timer
    const timerKey = this.getLockKey(projectId, taskId)
    const timer = this.timers.get(timerKey)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(timerKey)
    }

    projectLocks.delete(taskId)

    if (projectLocks.size === 0) {
      this.locks.delete(projectId)
    }

    taskLockLog.debug({ taskId, store: 'memory' }, 'Task unlocked')
    return true
  }

  async getLock(projectId: string, taskId: string): Promise<TaskLockData | null> {
    const projectLocks = this.locks.get(projectId)
    if (!projectLocks) return null

    const lock = projectLocks.get(taskId)
    if (!lock) return null

    if (new Date(lock.expiresAt) <= new Date()) {
      await this.releaseLock(projectId, taskId)
      return null
    }

    return lock
  }

  async getProjectLocks(projectId: string): Promise<TaskLockData[]> {
    const projectLocks = this.locks.get(projectId)
    if (!projectLocks) return []

    const now = new Date()
    const result: TaskLockData[] = []

    for (const [taskId, lock] of projectLocks) {
      if (new Date(lock.expiresAt) > now) {
        result.push(lock)
      } else {
        await this.releaseLock(projectId, taskId)
      }
    }

    return result
  }

  async releaseUserLocks(projectId: string, userId: string): Promise<string[]> {
    const projectLocks = this.locks.get(projectId)
    if (!projectLocks) return []

    const releasedTaskIds: string[] = []

    for (const [taskId, lock] of projectLocks) {
      if (lock.userId === userId) {
        await this.releaseLock(projectId, taskId)
        releasedTaskIds.push(taskId)
      }
    }

    return releasedTaskIds
  }

  async extendLock(projectId: string, taskId: string, userId: string, durationMs: number): Promise<boolean> {
    const projectLocks = this.locks.get(projectId)
    if (!projectLocks) return false

    const lock = projectLocks.get(taskId)
    if (!lock || lock.userId !== userId) return false

    if (new Date(lock.expiresAt) <= new Date()) {
      await this.releaseLock(projectId, taskId)
      return false
    }

    const newExpiresAt = new Date(Date.now() + durationMs)
    lock.expiresAt = newExpiresAt.toISOString()

    const timerKey = this.getLockKey(projectId, taskId)
    this.resetTimer(timerKey, projectId, taskId, durationMs)

    taskLockLog.debug({ taskId, expiresAt: newExpiresAt.toISOString(), store: 'memory' }, 'Lock extended')
    return true
  }

  private setTimer(timerKey: string, projectId: string, taskId: string, durationMs: number): void {
    const timer = setTimeout(() => {
      taskLockLog.debug({ taskId, store: 'memory' }, 'Lock expired')
      this.releaseLock(projectId, taskId)
    }, durationMs)

    this.timers.set(timerKey, timer)
  }

  private resetTimer(timerKey: string, projectId: string, taskId: string, durationMs: number): void {
    const existing = this.timers.get(timerKey)
    if (existing) {
      clearTimeout(existing)
    }
    this.setTimer(timerKey, projectId, taskId, durationMs)
  }

  /**
   * Clear all timers (for cleanup)
   */
  clearAllTimers(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.timers.clear()
  }
}

// ============================================
// Global Task Lock Store Instance
// ============================================

let taskLockStore: TaskLockStore | null = null

/**
 * Get the task lock store
 * Uses Redis if available, falls back to in-memory
 */
export function getTaskLockStore(): TaskLockStore {
  if (taskLockStore) {
    return taskLockStore
  }

  const redis = getRedis()
  if (redis && isRedisAvailable()) {
    taskLockStore = new RedisTaskLockStore(redis)
    taskLockLog.info('Using Redis store (locks persist across restarts)')
  } else {
    taskLockStore = new InMemoryTaskLockStore()
    taskLockLog.info('Using in-memory store (locks will be lost on restart)')
  }

  return taskLockStore
}

/**
 * Initialize the task lock store
 * Should be called after Redis initialization
 */
export function initTaskLockStore(): TaskLockStore {
  const redis = getRedis()
  if (redis && isRedisAvailable()) {
    taskLockStore = new RedisTaskLockStore(redis)
    taskLockLog.info('Initialized with Redis store')
  } else {
    taskLockStore = new InMemoryTaskLockStore()
    taskLockLog.info('Initialized with in-memory store (Redis not available)')
  }

  return taskLockStore
}

/**
 * Reset the task lock store
 */
export function resetTaskLockStore(): void {
  if (taskLockStore instanceof InMemoryTaskLockStore) {
    taskLockStore.clearAllTimers()
  }
  taskLockStore = null
}

// ============================================
// Active Work Store Interface (T20.4)
// ============================================

/** Default TTL: 2 minutes — clients must heartbeat before this expires */
export const ACTIVE_WORK_TTL_MS = 2 * 60 * 1000

export interface ActiveWorkData {
  taskId: string          // Human-readable ID (e.g., "T1.1")
  taskUuid: string        // Database UUID
  taskName: string        // Task display name
  userId: string
  userEmail: string
  userName: string | null
  startedAt: string       // ISO timestamp
  lastHeartbeat: string   // ISO timestamp — updated on each heartbeat
  filePaths?: string[]    // Files the user is currently working on (T20.9)
}

/**
 * A detected file conflict: two users working on the same file(s).
 */
export interface FileConflict {
  filePath: string
  users: Array<{
    userId: string
    userEmail: string
    userName: string | null
    taskId: string
    taskName: string
  }>
}

export interface ActiveWorkStore {
  /**
   * Set a user as actively working on a task in a project.
   * Automatically clears any previous active work for this user in the project.
   */
  setActiveWork(
    projectId: string,
    userId: string,
    data: Omit<ActiveWorkData, 'startedAt' | 'lastHeartbeat'>
  ): Promise<ActiveWorkData>

  /**
   * Clear a user's active work in a project.
   */
  clearActiveWork(projectId: string, userId: string): Promise<boolean>

  /**
   * Extend the TTL for a user's active work (heartbeat).
   * Returns false if no active work found (expired or never set).
   */
  heartbeat(projectId: string, userId: string): Promise<boolean>

  /**
   * Get a user's active work in a project.
   */
  getActiveWork(projectId: string, userId: string): Promise<ActiveWorkData | null>

  /**
   * Get all active work entries for a project.
   */
  getProjectActiveWork(projectId: string): Promise<ActiveWorkData[]>

  /**
   * Clear all active work for a user across a project (e.g., on disconnect).
   */
  clearUserActiveWork(projectId: string, userId: string): Promise<boolean>

  /**
   * Update the file paths a user is working on (T20.9).
   * Returns the updated ActiveWorkData, or null if no active work found.
   */
  updateFilePaths(projectId: string, userId: string, filePaths: string[]): Promise<ActiveWorkData | null>
}

/**
 * Redis-based active work store (T20.4)
 * Uses Redis with TTL for automatic expiration when clients stop sending heartbeats.
 */
export class RedisActiveWorkStore implements ActiveWorkStore {
  private redis: Redis

  constructor(redis: Redis) {
    this.redis = redis
  }

  private getUserKey(projectId: string, userId: string): string {
    return `activework:${projectId}:${userId}`
  }

  private getProjectIndexKey(projectId: string): string {
    return `activework:${projectId}`
  }

  async setActiveWork(
    projectId: string,
    userId: string,
    data: Omit<ActiveWorkData, 'startedAt' | 'lastHeartbeat'>
  ): Promise<ActiveWorkData> {
    const userKey = this.getUserKey(projectId, userId)
    const indexKey = this.getProjectIndexKey(projectId)
    const now = new Date().toISOString()

    const activeWork: ActiveWorkData = {
      ...data,
      startedAt: now,
      lastHeartbeat: now,
    }

    const ttlSeconds = Math.ceil(ACTIVE_WORK_TTL_MS / 1000)

    const multi = this.redis.multi()
    multi.set(userKey, JSON.stringify(activeWork), 'PX', ACTIVE_WORK_TTL_MS)
    multi.sadd(indexKey, userId)
    // Index TTL slightly longer than entry TTL to allow cleanup
    multi.expire(indexKey, ttlSeconds + 120)
    await multi.exec()

    activeWorkLog.info({ projectId, userId, taskId: data.taskId }, 'Active work set')
    return activeWork
  }

  async clearActiveWork(projectId: string, userId: string): Promise<boolean> {
    const userKey = this.getUserKey(projectId, userId)
    const indexKey = this.getProjectIndexKey(projectId)

    const existed = await this.redis.del(userKey)
    await this.redis.srem(indexKey, userId)

    if (existed > 0) {
      activeWorkLog.debug({ projectId, userId }, 'Active work cleared')
    }
    return existed > 0
  }

  async heartbeat(projectId: string, userId: string): Promise<boolean> {
    const userKey = this.getUserKey(projectId, userId)
    const data = await this.redis.get(userKey)

    if (!data) return false

    try {
      const activeWork: ActiveWorkData = JSON.parse(data)
      activeWork.lastHeartbeat = new Date().toISOString()

      await this.redis.set(userKey, JSON.stringify(activeWork), 'PX', ACTIVE_WORK_TTL_MS)

      // Also refresh the index TTL
      const indexKey = this.getProjectIndexKey(projectId)
      const ttlSeconds = Math.ceil(ACTIVE_WORK_TTL_MS / 1000)
      await this.redis.expire(indexKey, ttlSeconds + 120)

      return true
    } catch {
      await this.redis.del(userKey)
      return false
    }
  }

  async getActiveWork(projectId: string, userId: string): Promise<ActiveWorkData | null> {
    const userKey = this.getUserKey(projectId, userId)
    const data = await this.redis.get(userKey)

    if (!data) return null

    try {
      return JSON.parse(data) as ActiveWorkData
    } catch {
      await this.redis.del(userKey)
      return null
    }
  }

  async getProjectActiveWork(projectId: string): Promise<ActiveWorkData[]> {
    const indexKey = this.getProjectIndexKey(projectId)
    const userIds = await this.redis.smembers(indexKey)

    if (userIds.length === 0) return []

    const userKeys = userIds.map(uid => this.getUserKey(projectId, uid))
    const dataArray = await this.redis.mget(...userKeys)

    const results: ActiveWorkData[] = []
    const expiredUserIds: string[] = []

    for (let i = 0; i < userIds.length; i++) {
      const raw = dataArray[i]
      if (!raw) {
        expiredUserIds.push(userIds[i]!)
        continue
      }
      try {
        results.push(JSON.parse(raw) as ActiveWorkData)
      } catch {
        expiredUserIds.push(userIds[i]!)
      }
    }

    // Clean up expired entries from index
    if (expiredUserIds.length > 0) {
      await this.redis.srem(indexKey, ...expiredUserIds)
    }

    return results
  }

  async clearUserActiveWork(projectId: string, userId: string): Promise<boolean> {
    return this.clearActiveWork(projectId, userId)
  }

  async updateFilePaths(projectId: string, userId: string, filePaths: string[]): Promise<ActiveWorkData | null> {
    const userKey = this.getUserKey(projectId, userId)
    const data = await this.redis.get(userKey)

    if (!data) return null

    try {
      const activeWork: ActiveWorkData = JSON.parse(data)
      activeWork.filePaths = filePaths
      activeWork.lastHeartbeat = new Date().toISOString()

      // Preserve existing TTL by reading it first
      const ttl = await this.redis.pttl(userKey)
      const effectiveTtl = ttl > 0 ? ttl : ACTIVE_WORK_TTL_MS

      await this.redis.set(userKey, JSON.stringify(activeWork), 'PX', effectiveTtl)

      activeWorkLog.debug({ projectId, userId, fileCount: filePaths.length }, 'File paths updated')
      return activeWork
    } catch {
      return null
    }
  }
}

/**
 * In-memory active work store (fallback when Redis is unavailable)
 * Note: Active work state is lost on server restart.
 */
export class InMemoryActiveWorkStore implements ActiveWorkStore {
  // projectId -> userId -> { data, timer }
  private store = new Map<string, Map<string, { data: ActiveWorkData; timer: NodeJS.Timeout }>>()

  async setActiveWork(
    projectId: string,
    userId: string,
    data: Omit<ActiveWorkData, 'startedAt' | 'lastHeartbeat'>
  ): Promise<ActiveWorkData> {
    if (!this.store.has(projectId)) {
      this.store.set(projectId, new Map())
    }
    const projectStore = this.store.get(projectId)!

    // Clear existing timer if any
    const existing = projectStore.get(userId)
    if (existing) {
      clearTimeout(existing.timer)
    }

    const now = new Date().toISOString()
    const activeWork: ActiveWorkData = {
      ...data,
      startedAt: now,
      lastHeartbeat: now,
    }

    const timer = setTimeout(() => {
      this.expire(projectId, userId)
    }, ACTIVE_WORK_TTL_MS)

    projectStore.set(userId, { data: activeWork, timer })

    activeWorkLog.info({ projectId, userId, taskId: data.taskId, store: 'memory' }, 'Active work set')
    return activeWork
  }

  async clearActiveWork(projectId: string, userId: string): Promise<boolean> {
    const projectStore = this.store.get(projectId)
    if (!projectStore) return false

    const entry = projectStore.get(userId)
    if (!entry) return false

    clearTimeout(entry.timer)
    projectStore.delete(userId)

    if (projectStore.size === 0) {
      this.store.delete(projectId)
    }

    activeWorkLog.debug({ projectId, userId, store: 'memory' }, 'Active work cleared')
    return true
  }

  async heartbeat(projectId: string, userId: string): Promise<boolean> {
    const projectStore = this.store.get(projectId)
    if (!projectStore) return false

    const entry = projectStore.get(userId)
    if (!entry) return false

    // Update heartbeat timestamp
    entry.data.lastHeartbeat = new Date().toISOString()

    // Reset timer
    clearTimeout(entry.timer)
    entry.timer = setTimeout(() => {
      this.expire(projectId, userId)
    }, ACTIVE_WORK_TTL_MS)

    return true
  }

  async getActiveWork(projectId: string, userId: string): Promise<ActiveWorkData | null> {
    const projectStore = this.store.get(projectId)
    if (!projectStore) return null

    const entry = projectStore.get(userId)
    return entry ? entry.data : null
  }

  async getProjectActiveWork(projectId: string): Promise<ActiveWorkData[]> {
    const projectStore = this.store.get(projectId)
    if (!projectStore) return []

    return Array.from(projectStore.values()).map(e => e.data)
  }

  async clearUserActiveWork(projectId: string, userId: string): Promise<boolean> {
    return this.clearActiveWork(projectId, userId)
  }

  async updateFilePaths(projectId: string, userId: string, filePaths: string[]): Promise<ActiveWorkData | null> {
    const projectStore = this.store.get(projectId)
    if (!projectStore) return null

    const entry = projectStore.get(userId)
    if (!entry) return null

    entry.data.filePaths = filePaths
    entry.data.lastHeartbeat = new Date().toISOString()

    return entry.data
  }

  private expire(projectId: string, userId: string): void {
    const projectStore = this.store.get(projectId)
    if (!projectStore) return

    projectStore.delete(userId)
    if (projectStore.size === 0) {
      this.store.delete(projectId)
    }

    activeWorkLog.debug({ projectId, userId, store: 'memory' }, 'Active work expired')
  }

  /**
   * Clear all timers (for cleanup on shutdown)
   */
  clearAllTimers(): void {
    for (const projectStore of this.store.values()) {
      for (const entry of projectStore.values()) {
        clearTimeout(entry.timer)
      }
    }
    this.store.clear()
  }
}

// ============================================
// Global Active Work Store Instance (T20.4)
// ============================================

let activeWorkStore: ActiveWorkStore | null = null

/**
 * Get the active work store.
 * Uses Redis if available, falls back to in-memory.
 */
export function getActiveWorkStore(): ActiveWorkStore {
  if (activeWorkStore) {
    return activeWorkStore
  }

  const redis = getRedis()
  if (redis && isRedisAvailable()) {
    activeWorkStore = new RedisActiveWorkStore(redis)
    activeWorkLog.info('Using Redis store (active work persists across restarts)')
  } else {
    activeWorkStore = new InMemoryActiveWorkStore()
    activeWorkLog.info('Using in-memory store (active work lost on restart)')
  }

  return activeWorkStore
}

/**
 * Initialize the active work store.
 * Should be called after Redis initialization.
 */
export function initActiveWorkStore(): ActiveWorkStore {
  const redis = getRedis()
  if (redis && isRedisAvailable()) {
    activeWorkStore = new RedisActiveWorkStore(redis)
    activeWorkLog.info('Initialized with Redis store')
  } else {
    activeWorkStore = new InMemoryActiveWorkStore()
    activeWorkLog.info('Initialized with in-memory store (Redis not available)')
  }

  return activeWorkStore
}

/**
 * Reset the active work store.
 */
export function resetActiveWorkStore(): void {
  if (activeWorkStore instanceof InMemoryActiveWorkStore) {
    activeWorkStore.clearAllTimers()
  }
  activeWorkStore = null
}

// ============================================
// Recent Changes Store (T20.5)
// ============================================

/** Maximum number of change entries per project */
export const RECENT_CHANGES_MAX_ENTRIES = 1000

export interface RecentChangeEntry {
  id: string              // Unique ID (timestamp-based)
  projectId: string
  userId: string
  userEmail: string
  userName: string | null
  entityType: 'task' | 'knowledge' | 'comment' | 'project'
  entityId: string        // The entity's ID (taskId like "T1.1", or UUID)
  action: 'created' | 'updated' | 'deleted' | 'status_changed' | 'assigned' | 'unassigned'
  summary: string         // Human-readable description, e.g. "T1.1 status changed to DONE"
  metadata?: Record<string, unknown>
  timestamp: string       // ISO timestamp
}

export type AddChangeInput = Omit<RecentChangeEntry, 'id' | 'timestamp'>

export interface RecentChangesQueryOptions {
  limit?: number          // Default 50, max 200
  offset?: number         // Default 0
  entityType?: RecentChangeEntry['entityType']
  userId?: string
  since?: string          // ISO timestamp — only return entries after this time
}

export interface RecentChangesStore {
  /** Add a change entry. Returns the created entry with id and timestamp. */
  addChange(projectId: string, input: AddChangeInput): Promise<RecentChangeEntry>

  /** Get recent changes for a project with optional filtering. */
  getRecentChanges(projectId: string, options?: RecentChangesQueryOptions): Promise<RecentChangeEntry[]>

  /** Get the count of changes for a project. */
  getChangeCount(projectId: string): Promise<number>

  /** Clear all changes for a project. */
  clearChanges(projectId: string): Promise<void>
}

/**
 * Redis-based recent changes store (T20.5)
 * Uses a Redis List (LPUSH + LTRIM) capped at RECENT_CHANGES_MAX_ENTRIES.
 * Newest entries are at the head (index 0).
 */
export class RedisRecentChangesStore implements RecentChangesStore {
  private redis: Redis

  constructor(redis: Redis) {
    this.redis = redis
  }

  private getListKey(projectId: string): string {
    return `changes:${projectId}`
  }

  async addChange(projectId: string, input: AddChangeInput): Promise<RecentChangeEntry> {
    const key = this.getListKey(projectId)
    const now = new Date()

    const entry: RecentChangeEntry = {
      ...input,
      id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: now.toISOString(),
    }

    const multi = this.redis.multi()
    multi.lpush(key, JSON.stringify(entry))
    multi.ltrim(key, 0, RECENT_CHANGES_MAX_ENTRIES - 1)
    // Expire the list after 30 days of inactivity
    multi.expire(key, 30 * 24 * 60 * 60)
    await multi.exec()

    recentChangesLog.debug(
      { projectId, entityType: input.entityType, entityId: input.entityId, action: input.action },
      'Change recorded'
    )
    return entry
  }

  async getRecentChanges(projectId: string, options: RecentChangesQueryOptions = {}): Promise<RecentChangeEntry[]> {
    const key = this.getListKey(projectId)
    const limit = Math.min(options.limit || 50, 200)

    // If we have filters, we need to fetch more and filter in-memory
    const hasFilters = !!(options.entityType || options.userId || options.since)
    const fetchCount = hasFilters ? RECENT_CHANGES_MAX_ENTRIES : limit
    const fetchStart = hasFilters ? 0 : (options.offset || 0)
    const fetchEnd = fetchStart + fetchCount - 1

    const rawEntries = await this.redis.lrange(key, fetchStart, fetchEnd)

    let entries: RecentChangeEntry[] = []
    for (const raw of rawEntries) {
      try {
        entries.push(JSON.parse(raw) as RecentChangeEntry)
      } catch {
        // Skip malformed entries
      }
    }

    // Apply filters
    if (options.entityType) {
      entries = entries.filter(e => e.entityType === options.entityType)
    }
    if (options.userId) {
      entries = entries.filter(e => e.userId === options.userId)
    }
    if (options.since) {
      const sinceTime = new Date(options.since).getTime()
      entries = entries.filter(e => new Date(e.timestamp).getTime() > sinceTime)
    }

    // Apply offset/limit after filtering
    if (hasFilters) {
      const offset = options.offset || 0
      entries = entries.slice(offset, offset + limit)
    }

    return entries
  }

  async getChangeCount(projectId: string): Promise<number> {
    const key = this.getListKey(projectId)
    return this.redis.llen(key)
  }

  async clearChanges(projectId: string): Promise<void> {
    const key = this.getListKey(projectId)
    await this.redis.del(key)
    recentChangesLog.info({ projectId }, 'Changes cleared')
  }
}

/**
 * In-memory recent changes store (fallback when Redis is unavailable)
 * Note: Changes are lost on server restart.
 */
export class InMemoryRecentChangesStore implements RecentChangesStore {
  // projectId -> entries (newest first)
  private store = new Map<string, RecentChangeEntry[]>()

  async addChange(projectId: string, input: AddChangeInput): Promise<RecentChangeEntry> {
    const now = new Date()
    const entry: RecentChangeEntry = {
      ...input,
      id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: now.toISOString(),
    }

    if (!this.store.has(projectId)) {
      this.store.set(projectId, [])
    }

    const list = this.store.get(projectId)!
    list.unshift(entry)

    // Trim to max
    if (list.length > RECENT_CHANGES_MAX_ENTRIES) {
      list.length = RECENT_CHANGES_MAX_ENTRIES
    }

    recentChangesLog.debug(
      { projectId, entityType: input.entityType, entityId: input.entityId, action: input.action, store: 'memory' },
      'Change recorded'
    )
    return entry
  }

  async getRecentChanges(projectId: string, options: RecentChangesQueryOptions = {}): Promise<RecentChangeEntry[]> {
    let entries = this.store.get(projectId) || []
    const limit = Math.min(options.limit || 50, 200)

    if (options.entityType) {
      entries = entries.filter(e => e.entityType === options.entityType)
    }
    if (options.userId) {
      entries = entries.filter(e => e.userId === options.userId)
    }
    if (options.since) {
      const sinceTime = new Date(options.since).getTime()
      entries = entries.filter(e => new Date(e.timestamp).getTime() > sinceTime)
    }

    const offset = options.offset || 0
    return entries.slice(offset, offset + limit)
  }

  async getChangeCount(projectId: string): Promise<number> {
    return (this.store.get(projectId) || []).length
  }

  async clearChanges(projectId: string): Promise<void> {
    this.store.delete(projectId)
    recentChangesLog.info({ projectId, store: 'memory' }, 'Changes cleared')
  }
}

// ============================================
// Global Recent Changes Store Instance (T20.5)
// ============================================

let recentChangesStore: RecentChangesStore | null = null

/**
 * Get the recent changes store.
 * Uses Redis if available, falls back to in-memory.
 */
export function getRecentChangesStore(): RecentChangesStore {
  if (recentChangesStore) {
    return recentChangesStore
  }

  const redis = getRedis()
  if (redis && isRedisAvailable()) {
    recentChangesStore = new RedisRecentChangesStore(redis)
    recentChangesLog.info('Using Redis store (changes persist across restarts)')
  } else {
    recentChangesStore = new InMemoryRecentChangesStore()
    recentChangesLog.info('Using in-memory store (changes lost on restart)')
  }

  return recentChangesStore
}

/**
 * Initialize the recent changes store.
 * Should be called after Redis initialization.
 */
export function initRecentChangesStore(): RecentChangesStore {
  const redis = getRedis()
  if (redis && isRedisAvailable()) {
    recentChangesStore = new RedisRecentChangesStore(redis)
    recentChangesLog.info('Initialized with Redis store')
  } else {
    recentChangesStore = new InMemoryRecentChangesStore()
    recentChangesLog.info('Initialized with in-memory store (Redis not available)')
  }

  return recentChangesStore
}

/**
 * Reset the recent changes store.
 */
export function resetRecentChangesStore(): void {
  recentChangesStore = null
}
