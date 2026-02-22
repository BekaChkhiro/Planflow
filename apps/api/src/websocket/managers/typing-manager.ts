import type { ConnectionStore, TypingIndicatorData } from '../types.js'

/**
 * TypingManager handles typing indicators for comments (T6.5)
 * - Tracks when users are typing on a task
 * - Deduplicates across multiple connections
 */
export class TypingManager {
  constructor(private connections: ConnectionStore) {}

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
}
