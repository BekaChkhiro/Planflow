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
}

export interface UserPresence {
  userId: string
  email: string
  name: string | null
  status: PresenceStatus
  connectedAt: string
  lastActiveAt: string
}

export interface WebSocketMessage {
  type: string
  projectId: string
  timestamp: string
  data?: Record<string, unknown>
}

/**
 * ConnectionManager tracks connected WebSocket clients by projectId
 * and provides methods to broadcast messages to all clients watching a project.
 */
class ConnectionManager {
  private connections = new Map<string, Set<Client>>()

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

      // Keep the entry with earliest connectedAt and most recent lastActiveAt
      if (!existing) {
        userMap.set(client.userId, {
          userId: client.userId,
          email: client.email,
          name: client.name,
          status: client.status,
          connectedAt: client.connectedAt.toISOString(),
          lastActiveAt: client.lastActiveAt.toISOString(),
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
    return {
      userId: client.userId,
      email: client.email,
      name: client.name,
      status: client.status,
      connectedAt: client.connectedAt.toISOString(),
      lastActiveAt: client.lastActiveAt.toISOString(),
    }
  }
}

// Singleton instance
export const connectionManager = new ConnectionManager()
