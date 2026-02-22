import type {
  Client,
  ConnectionStore,
  PresenceStatus,
  UserPresence,
  WorkingOnData,
} from '../types.js'

/**
 * PresenceManager handles user presence tracking (T5.9)
 * - Online/idle/away status
 * - Deduplicated user presence across multiple connections
 * - First/last connection detection for join/leave events
 */
export class PresenceManager {
  constructor(private connections: ConnectionStore) {}

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
}
