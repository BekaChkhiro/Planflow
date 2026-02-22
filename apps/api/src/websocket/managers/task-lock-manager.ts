import { getTaskLockStore, type TaskLockData, type TaskLockStore } from '../../lib/redis.js'
import type { TaskLockInfo } from '../types.js'

// Default lock duration: 5 minutes
const LOCK_DURATION_MS = 5 * 60 * 1000

/**
 * Helper to convert TaskLockData to TaskLockInfo format
 */
function lockDataToInfo(data: TaskLockData): TaskLockInfo {
  return {
    taskId: data.taskId,
    taskUuid: data.taskUuid,
    lockedBy: {
      userId: data.userId,
      email: data.userEmail,
      name: data.userName,
    },
    lockedAt: data.lockedAt,
    expiresAt: data.expiresAt,
  }
}

/**
 * TaskLockManager handles task locking for conflict prevention (T6.6 + T10.9)
 * - Prevents multiple users from editing the same task
 * - Uses Redis for persistence across server restarts
 * - Supports lock expiration and extension
 */
export class TaskLockManager {
  // Get the lock store (Redis or in-memory fallback)
  private getLockStore(): TaskLockStore {
    return getTaskLockStore()
  }

  /**
   * Attempt to acquire a lock on a task
   * Returns the lock info if successful, or existing lock info if already locked
   * Uses Redis for persistence (T10.9)
   */
  async acquireLock(
    projectId: string,
    taskId: string,
    taskUuid: string,
    userId: string,
    userEmail: string,
    userName: string | null,
    durationMs: number = LOCK_DURATION_MS
  ): Promise<{ success: boolean; lock: TaskLockInfo; isOwnLock?: boolean }> {
    const store = this.getLockStore()

    const result = await store.acquireLock(
      projectId,
      taskId,
      { taskId, taskUuid, userId, userEmail, userName },
      durationMs
    )

    return {
      success: result.success,
      lock: lockDataToInfo(result.lock),
      isOwnLock: result.isOwnLock,
    }
  }

  /**
   * Release a lock on a task
   * Returns true if lock was released, false if not found or not owned
   */
  async releaseLock(projectId: string, taskId: string, userId?: string): Promise<boolean> {
    const store = this.getLockStore()
    return store.releaseLock(projectId, taskId, userId)
  }

  /**
   * Get lock info for a task
   */
  async getLock(projectId: string, taskId: string): Promise<TaskLockInfo | null> {
    const store = this.getLockStore()
    const data = await store.getLock(projectId, taskId)
    return data ? lockDataToInfo(data) : null
  }

  /**
   * Check if a task is locked (and by whom)
   */
  async isTaskLocked(projectId: string, taskId: string): Promise<{ locked: boolean; lock: TaskLockInfo | null }> {
    const lock = await this.getLock(projectId, taskId)
    return { locked: lock !== null, lock }
  }

  /**
   * Get all locks for a project
   */
  async getProjectLocks(projectId: string): Promise<TaskLockInfo[]> {
    const store = this.getLockStore()
    const locks = await store.getProjectLocks(projectId)
    return locks.map(lockDataToInfo)
  }

  /**
   * Release all locks held by a user in a project
   * Called when user disconnects
   */
  async releaseUserLocks(projectId: string, userId: string): Promise<string[]> {
    const store = this.getLockStore()
    return store.releaseUserLocks(projectId, userId)
  }

  /**
   * Extend a lock's expiration
   */
  async extendLock(projectId: string, taskId: string, userId: string, durationMs: number = LOCK_DURATION_MS): Promise<boolean> {
    const store = this.getLockStore()
    return store.extendLock(projectId, taskId, userId, durationMs)
  }
}
