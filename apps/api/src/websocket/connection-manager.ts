import { loggers } from '../lib/logger.js'

// Import types
import type {
  Client,
  ConnectionStore,
  PresenceStatus,
  UserPresence,
  WorkingOnData,
  TypingIndicatorData,
  TaskLockInfo,
  WebSocketMessage,
} from './types.js'
import type { ActiveWorkData } from '../lib/redis.js'

// Import managers
import { PresenceManager } from './managers/presence-manager.js'
import { WorkingOnManager } from './managers/working-on-manager.js'
import { TypingManager } from './managers/typing-manager.js'
import { TaskLockManager } from './managers/task-lock-manager.js'
import { ConflictDetectionManager } from './managers/conflict-detection-manager.js'

// Re-export types for backwards compatibility
export type {
  Client,
  PresenceStatus,
  UserPresence,
  WorkingOnData,
  TypingIndicatorData,
  TaskLockInfo,
  WebSocketMessage,
}
export type { TaskLock } from './types.js'

const log = loggers.websocket

/**
 * ConnectionManager tracks connected WebSocket clients by projectId
 * and provides methods to broadcast messages to all clients watching a project.
 *
 * Uses composition to delegate specialized functionality to:
 * - PresenceManager: Online status and presence tracking (T5.9)
 * - WorkingOnManager: "Currently working on" status (T6.1)
 * - TypingManager: Comment typing indicators (T6.5)
 * - TaskLockManager: Task locking for conflict prevention (T6.6 + T10.9)
 */
class ConnectionManager {
  private connections: ConnectionStore = new Map<string, Set<Client>>()

  // Delegate managers
  private readonly presenceManager: PresenceManager
  private readonly workingOnManager: WorkingOnManager
  private readonly typingManager: TypingManager
  private readonly taskLockManager: TaskLockManager
  readonly conflictDetection: ConflictDetectionManager

  constructor() {
    // Initialize managers with shared connection store
    this.presenceManager = new PresenceManager(this.connections)
    this.workingOnManager = new WorkingOnManager(this.connections)
    this.typingManager = new TypingManager(this.connections)
    this.taskLockManager = new TaskLockManager()
    this.conflictDetection = new ConflictDetectionManager()
  }

  // ============================================
  // Core Connection Methods
  // ============================================

  /**
   * Add a client to track for a specific project
   */
  addClient(projectId: string, client: Client): void {
    if (!this.connections.has(projectId)) {
      this.connections.set(projectId, new Set())
    }
    this.connections.get(projectId)!.add(client)
    log.debug({ projectId, userId: client.userId, totalClients: this.getProjectClientCount(projectId) }, 'Client connected')
  }

  /**
   * Remove a client from tracking
   */
  removeClient(projectId: string, client: Client): void {
    const clients = this.connections.get(projectId)
    if (clients) {
      clients.delete(client)
      log.debug({ projectId, remaining: clients.size }, 'Client disconnected')

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
          log.error({ err }, 'Error sending to client')
        }
      }
    }

    if (sentCount > 0) {
      log.debug({ type: message.type, sentCount, projectId }, 'Broadcast message')
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
          log.error({ err, userId }, 'Error sending to user')
        }
      }
    }

    if (sentCount > 0) {
      log.debug({ type: message.type, userId, sentCount }, 'Sent to user')
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
  // Presence Methods (T5.9) - Delegated
  // ============================================

  getProjectPresence(projectId: string): UserPresence[] {
    return this.presenceManager.getProjectPresence(projectId)
  }

  getUniqueUserCount(projectId: string): number {
    return this.presenceManager.getUniqueUserCount(projectId)
  }

  updateClientStatus(projectId: string, userId: string, status: PresenceStatus): void {
    this.presenceManager.updateClientStatus(projectId, userId, status)
  }

  touchClient(projectId: string, userId: string): void {
    this.presenceManager.touchClient(projectId, userId)
  }

  isFirstConnection(projectId: string, userId: string): boolean {
    return this.presenceManager.isFirstConnection(projectId, userId)
  }

  isLastConnection(projectId: string, userId: string): boolean {
    return this.presenceManager.isLastConnection(projectId, userId)
  }

  getClientPresence(client: Client): UserPresence {
    return this.presenceManager.getClientPresence(client)
  }

  // ============================================
  // Working On Methods (T6.1 + T20.4) - Delegated
  // ============================================

  async setWorkingOn(
    projectId: string,
    userId: string,
    taskData: { taskId: string; taskUuid: string; taskName: string },
    userInfo: { email: string; name: string | null }
  ): Promise<Date> {
    return this.workingOnManager.setWorkingOn(projectId, userId, taskData, userInfo)
  }

  async clearWorkingOn(projectId: string, userId: string): Promise<void> {
    await this.workingOnManager.clearWorkingOn(projectId, userId)
  }

  getWorkingOn(projectId: string, userId: string): WorkingOnData | null {
    return this.workingOnManager.getWorkingOn(projectId, userId)
  }

  /** Heartbeat — extend TTL for a user's active work (T20.4) */
  async heartbeatActiveWork(projectId: string, userId: string): Promise<boolean> {
    return this.workingOnManager.heartbeat(projectId, userId)
  }

  /** Get all active work for a project from the persistent store (T20.4) */
  async getProjectActiveWork(projectId: string): Promise<ActiveWorkData[]> {
    return this.workingOnManager.getProjectActiveWork(projectId)
  }

  /** Get active work for a specific user from the persistent store (T20.4) */
  async getActiveWork(projectId: string, userId: string): Promise<ActiveWorkData | null> {
    return this.workingOnManager.getActiveWork(projectId, userId)
  }

  // ============================================
  // Typing Indicator Methods (T6.5) - Delegated
  // ============================================

  setTyping(projectId: string, userId: string, taskId: string, taskDisplayId: string): Date {
    return this.typingManager.setTyping(projectId, userId, taskId, taskDisplayId)
  }

  clearTyping(projectId: string, userId: string): void {
    this.typingManager.clearTyping(projectId, userId)
  }

  getTypingUsers(projectId: string, taskId: string): TypingIndicatorData[] {
    return this.typingManager.getTypingUsers(projectId, taskId)
  }

  getTypingInfo(projectId: string, userId: string): TypingIndicatorData | null {
    return this.typingManager.getTypingInfo(projectId, userId)
  }

  // ============================================
  // Task Locking Methods (T6.6 + T10.9) - Delegated
  // ============================================

  async acquireLock(
    projectId: string,
    taskId: string,
    taskUuid: string,
    userId: string,
    userEmail: string,
    userName: string | null,
    durationMs?: number
  ): Promise<{ success: boolean; lock: TaskLockInfo; isOwnLock?: boolean }> {
    return this.taskLockManager.acquireLock(projectId, taskId, taskUuid, userId, userEmail, userName, durationMs)
  }

  async releaseLock(projectId: string, taskId: string, userId?: string): Promise<boolean> {
    return this.taskLockManager.releaseLock(projectId, taskId, userId)
  }

  async getLock(projectId: string, taskId: string): Promise<TaskLockInfo | null> {
    return this.taskLockManager.getLock(projectId, taskId)
  }

  async isTaskLocked(projectId: string, taskId: string): Promise<{ locked: boolean; lock: TaskLockInfo | null }> {
    return this.taskLockManager.isTaskLocked(projectId, taskId)
  }

  async getProjectLocks(projectId: string): Promise<TaskLockInfo[]> {
    return this.taskLockManager.getProjectLocks(projectId)
  }

  async releaseUserLocks(projectId: string, userId: string): Promise<string[]> {
    return this.taskLockManager.releaseUserLocks(projectId, userId)
  }

  async extendLock(projectId: string, taskId: string, userId: string, durationMs?: number): Promise<boolean> {
    return this.taskLockManager.extendLock(projectId, taskId, userId, durationMs)
  }
}

// Singleton instance
export const connectionManager = new ConnectionManager()
