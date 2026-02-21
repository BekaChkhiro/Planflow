import type { WebSocket } from 'ws'

export type PresenceStatus = 'online' | 'idle' | 'away'

export interface Client {
  ws: WebSocket
  userId: string
  projectId: string
  connectedAt: Date
  // Presence data (T5.9)
  email: string
  name: string | null
  status: PresenceStatus
  lastActiveAt: Date
  // Working on data (T6.1)
  workingOnTaskId: string | null      // e.g., "T1.1"
  workingOnTaskUuid: string | null    // UUID for API calls
  workingOnTaskName: string | null    // Task name for display
  workingOnStartedAt: Date | null     // When they started
  // Typing indicator data (T6.5)
  typingOnTaskId: string | null       // Task UUID user is typing on
  typingOnTaskDisplayId: string | null // e.g., "T1.1"
  typingStartedAt: Date | null        // When they started typing
}

export interface WorkingOnData {
  taskId: string
  taskUuid: string
  taskName: string
  startedAt: string
}

export interface TypingIndicatorData {
  userId: string
  email: string
  name: string | null
  taskId: string           // Task UUID
  taskDisplayId: string    // e.g., "T1.1"
  startedAt: string        // ISO timestamp
}

export interface UserPresence {
  userId: string
  email: string
  name: string | null
  status: PresenceStatus
  connectedAt: string
  lastActiveAt: string
  workingOn: WorkingOnData | null
}

export interface WebSocketMessage {
  type: string
  projectId: string
  timestamp: string
  data?: Record<string, unknown>
}

// ============================================
// Task Lock Types (T6.6)
// ============================================

export interface TaskLock {
  taskId: string          // Human-readable ID (e.g., "T1.1")
  taskUuid: string        // Database UUID
  userId: string
  userEmail: string
  userName: string | null
  lockedAt: Date
  expiresAt: Date
}

export interface TaskLockInfo {
  taskId: string
  taskUuid: string
  lockedBy: {
    userId: string
    email: string
    name: string | null
  }
  lockedAt: string
  expiresAt: string
}

// Default lock duration: 5 minutes
const LOCK_DURATION_MS = 5 * 60 * 1000

/**
 * ConnectionManager tracks connected WebSocket clients by projectId
 * and provides methods to broadcast messages to all clients watching a project.
 */
class ConnectionManager {
  private connections = new Map<string, Set<Client>>()
  // Task locks: projectId -> taskId -> TaskLock (T6.6)
  private taskLocks = new Map<string, Map<string, TaskLock>>()
  // Lock expiration timers: projectId:taskId -> timer (T6.6)
  private lockTimers = new Map<string, NodeJS.Timeout>()

  /**
   * Add a client to track for a specific project
   */
  addClient(projectId: string, client: Client): void {
    if (!this.connections.has(projectId)) {
      this.connections.set(projectId, new Set())
    }
    this.connections.get(projectId)!.add(client)
    console.log(`[WS] Client connected to project ${projectId} (user: ${client.userId}). Total clients: ${this.getProjectClientCount(projectId)}`)
  }

  /**
   * Remove a client from tracking
   */
  removeClient(projectId: string, client: Client): void {
    const clients = this.connections.get(projectId)
    if (clients) {
      clients.delete(client)
      console.log(`[WS] Client disconnected from project ${projectId}. Remaining: ${clients.size}`)

      // Clean up empty sets
      if (clients.size === 0) {
        this.connections.delete(projectId)
      }
    }
  }

  /**
   * Broadcast a message to all clients watching a project
   * @param projectId - The project ID to broadcast to
   * @param message - The message to send
   * @param excludeUserId - Optional user ID to exclude from broadcast (e.g., the sender)
   */
  broadcast(projectId: string, message: WebSocketMessage, excludeUserId?: string): void {
    const clients = this.connections.get(projectId)
    if (!clients || clients.size === 0) {
      return
    }

    const messageStr = JSON.stringify(message)
    let sentCount = 0

    for (const client of clients) {
      // Skip excluded user
      if (excludeUserId && client.userId === excludeUserId) {
        continue
      }

      // Only send to open connections
      if (client.ws.readyState === client.ws.OPEN) {
        try {
          client.ws.send(messageStr)
          sentCount++
        } catch (err) {
          console.error(`[WS] Error sending to client:`, err)
        }
      }
    }

    if (sentCount > 0) {
      console.log(`[WS] Broadcast "${message.type}" to ${sentCount} client(s) for project ${projectId}`)
    }
  }

  /**
   * Get the number of connected clients for a project
   */
  getProjectClientCount(projectId: string): number {
    return this.connections.get(projectId)?.size || 0
  }

  /**
   * Get total number of connected clients across all projects
   */
  getTotalClientCount(): number {
    let total = 0
    for (const clients of this.connections.values()) {
      total += clients.size
    }
    return total
  }

  /**
   * Get all project IDs with active connections
   */
  getActiveProjectIds(): string[] {
    return Array.from(this.connections.keys())
  }

  // ============================================
  // Presence Methods (T5.9)
  // ============================================

  /**
   * Get deduplicated list of online users for a project
   * Multiple connections from the same user are merged into a single presence
   */
  getProjectPresence(projectId: string): UserPresence[] {
    const clients = this.connections.get(projectId)
    if (!clients || clients.size === 0) {
      return []
    }

    // Deduplicate by userId, keeping the most recent connection info
    const userMap = new Map<string, UserPresence>()

    for (const client of clients) {
      const existing = userMap.get(client.userId)

      // Build workingOn data if present
      const workingOn: WorkingOnData | null = client.workingOnTaskId && client.workingOnTaskUuid && client.workingOnTaskName && client.workingOnStartedAt
        ? {
            taskId: client.workingOnTaskId,
            taskUuid: client.workingOnTaskUuid,
            taskName: client.workingOnTaskName,
            startedAt: client.workingOnStartedAt.toISOString(),
          }
        : null

      // Keep the entry with earliest connectedAt and most recent lastActiveAt
      if (!existing) {
        userMap.set(client.userId, {
          userId: client.userId,
          email: client.email,
          name: client.name,
          status: client.status,
          connectedAt: client.connectedAt.toISOString(),
          lastActiveAt: client.lastActiveAt.toISOString(),
          workingOn,
        })
      } else {
        // Update if this connection has more recent activity
        const existingLastActive = new Date(existing.lastActiveAt)
        if (client.lastActiveAt > existingLastActive) {
          userMap.set(client.userId, {
            ...existing,
            status: client.status,
            lastActiveAt: client.lastActiveAt.toISOString(),
          })
        }
        // Keep earlier connectedAt
        const existingConnected = new Date(existing.connectedAt)
        if (client.connectedAt < existingConnected) {
          userMap.set(client.userId, {
            ...userMap.get(client.userId)!,
            connectedAt: client.connectedAt.toISOString(),
          })
        }
        // Update workingOn if current client has it (last-write-wins across connections)
        if (workingOn) {
          userMap.set(client.userId, {
            ...userMap.get(client.userId)!,
            workingOn,
          })
        }
      }
    }

    return Array.from(userMap.values())
  }

  /**
   * Get count of unique online users for a project
   */
  getUniqueUserCount(projectId: string): number {
    const clients = this.connections.get(projectId)
    if (!clients || clients.size === 0) {
      return 0
    }

    const uniqueUsers = new Set<string>()
    for (const client of clients) {
      uniqueUsers.add(client.userId)
    }
    return uniqueUsers.size
  }

  /**
   * Update presence status for a user's connections
   */
  updateClientStatus(projectId: string, userId: string, status: PresenceStatus): void {
    const clients = this.connections.get(projectId)
    if (!clients) return

    const now = new Date()
    for (const client of clients) {
      if (client.userId === userId) {
        client.status = status
        client.lastActiveAt = now
      }
    }
  }

  /**
   * Touch client to update lastActiveAt on activity
   */
  touchClient(projectId: string, userId: string): void {
    const clients = this.connections.get(projectId)
    if (!clients) return

    const now = new Date()
    for (const client of clients) {
      if (client.userId === userId) {
        client.lastActiveAt = now
      }
    }
  }

  /**
   * Check if this is the first connection for a user in a project
   * Used to determine if we should broadcast presence_joined
   */
  isFirstConnection(projectId: string, userId: string): boolean {
    const clients = this.connections.get(projectId)
    if (!clients) return true

    let count = 0
    for (const client of clients) {
      if (client.userId === userId) {
        count++
        if (count > 1) return false
      }
    }
    return count === 1
  }

  /**
   * Check if this would be the last connection for a user in a project
   * Call this BEFORE removing the client to determine if we should broadcast presence_left
   */
  isLastConnection(projectId: string, userId: string): boolean {
    const clients = this.connections.get(projectId)
    if (!clients) return true

    let count = 0
    for (const client of clients) {
      if (client.userId === userId) {
        count++
        if (count > 1) return false
      }
    }
    return count === 1
  }

  /**
   * Get a single client's info for presence events
   */
  getClientPresence(client: Client): UserPresence {
    const workingOn: WorkingOnData | null = client.workingOnTaskId && client.workingOnTaskUuid && client.workingOnTaskName && client.workingOnStartedAt
      ? {
          taskId: client.workingOnTaskId,
          taskUuid: client.workingOnTaskUuid,
          taskName: client.workingOnTaskName,
          startedAt: client.workingOnStartedAt.toISOString(),
        }
      : null

    return {
      userId: client.userId,
      email: client.email,
      name: client.name,
      status: client.status,
      connectedAt: client.connectedAt.toISOString(),
      lastActiveAt: client.lastActiveAt.toISOString(),
      workingOn,
    }
  }

  // ============================================
  // Working On Methods (T6.1)
  // ============================================

  /**
   * Set working on task for all user's connections in a project
   */
  setWorkingOn(
    projectId: string,
    userId: string,
    taskData: { taskId: string; taskUuid: string; taskName: string }
  ): Date {
    const clients = this.connections.get(projectId)
    const now = new Date()

    if (clients) {
      for (const client of clients) {
        if (client.userId === userId) {
          client.workingOnTaskId = taskData.taskId
          client.workingOnTaskUuid = taskData.taskUuid
          client.workingOnTaskName = taskData.taskName
          client.workingOnStartedAt = now
          client.lastActiveAt = now
        }
      }
    }

    return now
  }

  /**
   * Clear working on for all user's connections in a project
   */
  clearWorkingOn(projectId: string, userId: string): void {
    const clients = this.connections.get(projectId)

    if (clients) {
      for (const client of clients) {
        if (client.userId === userId) {
          client.workingOnTaskId = null
          client.workingOnTaskUuid = null
          client.workingOnTaskName = null
          client.workingOnStartedAt = null
        }
      }
    }
  }

  /**
   * Get the current working on data for a user
   */
  getWorkingOn(projectId: string, userId: string): WorkingOnData | null {
    const clients = this.connections.get(projectId)

    if (clients) {
      for (const client of clients) {
        if (client.userId === userId && client.workingOnTaskId && client.workingOnTaskUuid && client.workingOnTaskName && client.workingOnStartedAt) {
          return {
            taskId: client.workingOnTaskId,
            taskUuid: client.workingOnTaskUuid,
            taskName: client.workingOnTaskName,
            startedAt: client.workingOnStartedAt.toISOString(),
          }
        }
      }
    }

    return null
  }

  // ============================================
  // Typing Indicator Methods (T6.5)
  // ============================================

  /**
   * Set typing state for a user on a specific task
   */
  setTyping(
    projectId: string,
    userId: string,
    taskId: string,
    taskDisplayId: string
  ): Date {
    const clients = this.connections.get(projectId)
    const now = new Date()

    if (clients) {
      for (const client of clients) {
        if (client.userId === userId) {
          client.typingOnTaskId = taskId
          client.typingOnTaskDisplayId = taskDisplayId
          client.typingStartedAt = now
          client.lastActiveAt = now
        }
      }
    }

    return now
  }

  /**
   * Clear typing state for a user
   */
  clearTyping(projectId: string, userId: string): void {
    const clients = this.connections.get(projectId)

    if (clients) {
      for (const client of clients) {
        if (client.userId === userId) {
          client.typingOnTaskId = null
          client.typingOnTaskDisplayId = null
          client.typingStartedAt = null
        }
      }
    }
  }

  /**
   * Get all users currently typing on a specific task
   */
  getTypingUsers(projectId: string, taskId: string): TypingIndicatorData[] {
    const clients = this.connections.get(projectId)
    if (!clients) return []

    const typingUsers = new Map<string, TypingIndicatorData>()

    for (const client of clients) {
      if (client.typingOnTaskId === taskId && client.typingStartedAt) {
        // Deduplicate by userId
        if (!typingUsers.has(client.userId)) {
          typingUsers.set(client.userId, {
            userId: client.userId,
            email: client.email,
            name: client.name,
            taskId: client.typingOnTaskId,
            taskDisplayId: client.typingOnTaskDisplayId || '',
            startedAt: client.typingStartedAt.toISOString(),
          })
        }
      }
    }

    return Array.from(typingUsers.values())
  }

  /**
   * Get typing info for a specific user
   */
  getTypingInfo(projectId: string, userId: string): TypingIndicatorData | null {
    const clients = this.connections.get(projectId)
    if (!clients) return null

    for (const client of clients) {
      if (client.userId === userId && client.typingOnTaskId && client.typingStartedAt) {
        return {
          userId: client.userId,
          email: client.email,
          name: client.name,
          taskId: client.typingOnTaskId,
          taskDisplayId: client.typingOnTaskDisplayId || '',
          startedAt: client.typingStartedAt.toISOString(),
        }
      }
    }

    return null
  }

  // ============================================
  // Targeted Messaging Methods (T6.4)
  // ============================================

  /**
   * Send a message to a specific user across all their connections in a project
   * Used for targeted notifications
   */
  sendToUser(projectId: string, userId: string, message: WebSocketMessage): number {
    const clients = this.connections.get(projectId)
    if (!clients || clients.size === 0) {
      return 0
    }

    const messageStr = JSON.stringify(message)
    let sentCount = 0

    for (const client of clients) {
      if (client.userId === userId && client.ws.readyState === client.ws.OPEN) {
        try {
          client.ws.send(messageStr)
          sentCount++
        } catch (err) {
          console.error(`[WS] Error sending to user ${userId}:`, err)
        }
      }
    }

    if (sentCount > 0) {
      console.log(`[WS] Sent "${message.type}" to user ${userId} (${sentCount} connection(s))`)
    }

    return sentCount
  }

  /**
   * Send a message to multiple users in a project
   * Used for batch notifications (e.g., mentions)
   */
  sendToUsers(projectId: string, userIds: string[], message: WebSocketMessage): number {
    let totalSent = 0
    for (const userId of userIds) {
      totalSent += this.sendToUser(projectId, userId, message)
    }
    return totalSent
  }

  /**
   * Check if a user has any active connections in a project
   */
  isUserConnected(projectId: string, userId: string): boolean {
    const clients = this.connections.get(projectId)
    if (!clients) return false

    for (const client of clients) {
      if (client.userId === userId && client.ws.readyState === client.ws.OPEN) {
        return true
      }
    }
    return false
  }

  /**
   * Get all user IDs currently connected to a project
   */
  getConnectedUserIds(projectId: string): string[] {
    const clients = this.connections.get(projectId)
    if (!clients) return []

    const userIds = new Set<string>()
    for (const client of clients) {
      if (client.ws.readyState === client.ws.OPEN) {
        userIds.add(client.userId)
      }
    }
    return Array.from(userIds)
  }

  // ============================================
  // Task Locking Methods (T6.6)
  // ============================================

  /**
   * Attempt to acquire a lock on a task
   * Returns the lock info if successful, or existing lock info if already locked
   */
  acquireLock(
    projectId: string,
    taskId: string,
    taskUuid: string,
    userId: string,
    userEmail: string,
    userName: string | null,
    durationMs: number = LOCK_DURATION_MS
  ): { success: boolean; lock: TaskLockInfo; isOwnLock?: boolean } {
    // Get or create project locks map
    if (!this.taskLocks.has(projectId)) {
      this.taskLocks.set(projectId, new Map())
    }
    const projectLocks = this.taskLocks.get(projectId)!

    // Check if task is already locked
    const existingLock = projectLocks.get(taskId)
    if (existingLock) {
      // Check if lock has expired
      if (existingLock.expiresAt > new Date()) {
        // Lock is still valid
        const lockInfo: TaskLockInfo = {
          taskId: existingLock.taskId,
          taskUuid: existingLock.taskUuid,
          lockedBy: {
            userId: existingLock.userId,
            email: existingLock.userEmail,
            name: existingLock.userName,
          },
          lockedAt: existingLock.lockedAt.toISOString(),
          expiresAt: existingLock.expiresAt.toISOString(),
        }

        // If same user, extend the lock
        if (existingLock.userId === userId) {
          const now = new Date()
          const newExpiresAt = new Date(now.getTime() + durationMs)
          existingLock.expiresAt = newExpiresAt
          existingLock.lockedAt = now

          // Reset timer
          this.resetLockTimer(projectId, taskId, durationMs)

          return {
            success: true,
            lock: {
              ...lockInfo,
              lockedAt: now.toISOString(),
              expiresAt: newExpiresAt.toISOString(),
            },
            isOwnLock: true,
          }
        }

        // Different user - lock denied
        return { success: false, lock: lockInfo }
      } else {
        // Lock expired, clean it up
        this.releaseLock(projectId, taskId)
      }
    }

    // Create new lock
    const now = new Date()
    const expiresAt = new Date(now.getTime() + durationMs)

    const newLock: TaskLock = {
      taskId,
      taskUuid,
      userId,
      userEmail,
      userName,
      lockedAt: now,
      expiresAt,
    }

    projectLocks.set(taskId, newLock)

    // Set expiration timer
    this.setLockTimer(projectId, taskId, durationMs)

    console.log(`[WS] Task ${taskId} locked by user ${userId} until ${expiresAt.toISOString()}`)

    return {
      success: true,
      lock: {
        taskId,
        taskUuid,
        lockedBy: {
          userId,
          email: userEmail,
          name: userName,
        },
        lockedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      },
    }
  }

  /**
   * Release a lock on a task
   * Returns true if lock was released, false if not found or not owned
   */
  releaseLock(projectId: string, taskId: string, userId?: string): boolean {
    const projectLocks = this.taskLocks.get(projectId)
    if (!projectLocks) return false

    const lock = projectLocks.get(taskId)
    if (!lock) return false

    // If userId provided, verify ownership
    if (userId && lock.userId !== userId) {
      return false
    }

    // Clear timer
    const timerKey = `${projectId}:${taskId}`
    const timer = this.lockTimers.get(timerKey)
    if (timer) {
      clearTimeout(timer)
      this.lockTimers.delete(timerKey)
    }

    // Remove lock
    projectLocks.delete(taskId)
    console.log(`[WS] Task ${taskId} unlocked`)

    // Clean up empty map
    if (projectLocks.size === 0) {
      this.taskLocks.delete(projectId)
    }

    return true
  }

  /**
   * Get lock info for a task
   */
  getLock(projectId: string, taskId: string): TaskLockInfo | null {
    const projectLocks = this.taskLocks.get(projectId)
    if (!projectLocks) return null

    const lock = projectLocks.get(taskId)
    if (!lock) return null

    // Check if expired
    if (lock.expiresAt <= new Date()) {
      this.releaseLock(projectId, taskId)
      return null
    }

    return {
      taskId: lock.taskId,
      taskUuid: lock.taskUuid,
      lockedBy: {
        userId: lock.userId,
        email: lock.userEmail,
        name: lock.userName,
      },
      lockedAt: lock.lockedAt.toISOString(),
      expiresAt: lock.expiresAt.toISOString(),
    }
  }

  /**
   * Check if a task is locked (and by whom)
   */
  isTaskLocked(projectId: string, taskId: string): { locked: boolean; lock: TaskLockInfo | null } {
    const lock = this.getLock(projectId, taskId)
    return { locked: lock !== null, lock }
  }

  /**
   * Get all locks for a project
   */
  getProjectLocks(projectId: string): TaskLockInfo[] {
    const projectLocks = this.taskLocks.get(projectId)
    if (!projectLocks) return []

    const now = new Date()
    const result: TaskLockInfo[] = []

    for (const [taskId, lock] of projectLocks) {
      // Skip expired locks
      if (lock.expiresAt <= now) {
        this.releaseLock(projectId, taskId)
        continue
      }

      result.push({
        taskId: lock.taskId,
        taskUuid: lock.taskUuid,
        lockedBy: {
          userId: lock.userId,
          email: lock.userEmail,
          name: lock.userName,
        },
        lockedAt: lock.lockedAt.toISOString(),
        expiresAt: lock.expiresAt.toISOString(),
      })
    }

    return result
  }

  /**
   * Release all locks held by a user in a project
   * Called when user disconnects
   */
  releaseUserLocks(projectId: string, userId: string): string[] {
    const projectLocks = this.taskLocks.get(projectId)
    if (!projectLocks) return []

    const releasedTaskIds: string[] = []

    for (const [taskId, lock] of projectLocks) {
      if (lock.userId === userId) {
        this.releaseLock(projectId, taskId)
        releasedTaskIds.push(taskId)
      }
    }

    return releasedTaskIds
  }

  /**
   * Extend a lock's expiration
   */
  extendLock(projectId: string, taskId: string, userId: string, durationMs: number = LOCK_DURATION_MS): boolean {
    const projectLocks = this.taskLocks.get(projectId)
    if (!projectLocks) return false

    const lock = projectLocks.get(taskId)
    if (!lock || lock.userId !== userId) return false

    // Check if still valid
    if (lock.expiresAt <= new Date()) {
      this.releaseLock(projectId, taskId)
      return false
    }

    // Extend
    const newExpiresAt = new Date(Date.now() + durationMs)
    lock.expiresAt = newExpiresAt

    // Reset timer
    this.resetLockTimer(projectId, taskId, durationMs)

    console.log(`[WS] Task ${taskId} lock extended until ${newExpiresAt.toISOString()}`)
    return true
  }

  /**
   * Set expiration timer for a lock
   */
  private setLockTimer(projectId: string, taskId: string, durationMs: number): void {
    const timerKey = `${projectId}:${taskId}`

    const timer = setTimeout(() => {
      console.log(`[WS] Task ${taskId} lock expired`)
      this.releaseLock(projectId, taskId)
      // Note: broadcast is handled externally
    }, durationMs)

    this.lockTimers.set(timerKey, timer)
  }

  /**
   * Reset expiration timer for a lock
   */
  private resetLockTimer(projectId: string, taskId: string, durationMs: number): void {
    const timerKey = `${projectId}:${taskId}`

    // Clear existing timer
    const existingTimer = this.lockTimers.get(timerKey)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // Set new timer
    this.setLockTimer(projectId, taskId, durationMs)
  }
}

// Singleton instance
export const connectionManager = new ConnectionManager()
