import type { WebSocket } from 'ws'

export interface Client {
  ws: WebSocket
  userId: string
  projectId: string
  connectedAt: Date
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
}

// Singleton instance
export const connectionManager = new ConnectionManager()
