import Redis from 'ioredis'
import { loggers } from './logger.js'

const log = loggers.redis
const rateLimitLog = loggers.rateLimit
const taskLockLog = loggers.taskLock

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
