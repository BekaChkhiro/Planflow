import { getActiveWorkStore, type ActiveWorkData, type ActiveWorkStore } from '../../lib/redis.js'
import type { ConnectionStore, WorkingOnData } from '../types.js'

/**
 * WorkingOnManager handles "Currently Working On" status (T6.1 + T20.4)
 * - Tracks which task a user is actively working on
 * - Syncs across multiple connections for the same user
 * - Persists to Redis with TTL via ActiveWorkStore (T20.4)
 * - Supports heartbeat to keep active work alive
 */
export class WorkingOnManager {
  constructor(private connections: ConnectionStore) {}

  private getStore(): ActiveWorkStore {
    return getActiveWorkStore()
  }

  /**
   * Set working on task for all user's connections in a project.
   * Also persists to Redis/in-memory store with TTL (T20.4).
   */
  async setWorkingOn(
    projectId: string,
    userId: string,
    taskData: { taskId: string; taskUuid: string; taskName: string },
    userInfo: { email: string; name: string | null }
  ): Promise<Date> {
    const clients = this.connections.get(projectId)
    const now = new Date()

    // Update in-memory client objects (for WebSocket presence)
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

    // Persist to store with TTL (T20.4)
    await this.getStore().setActiveWork(projectId, userId, {
      taskId: taskData.taskId,
      taskUuid: taskData.taskUuid,
      taskName: taskData.taskName,
      userId,
      userEmail: userInfo.email,
      userName: userInfo.name,
    })

    return now
  }

  /**
   * Clear working on for all user's connections in a project.
   * Also removes from Redis/in-memory store (T20.4).
   */
  async clearWorkingOn(projectId: string, userId: string): Promise<void> {
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

    // Remove from store (T20.4)
    await this.getStore().clearActiveWork(projectId, userId)
  }

  /**
   * Heartbeat — extend TTL for a user's active work (T20.4).
   * Returns false if no active work found (already expired).
   */
  async heartbeat(projectId: string, userId: string): Promise<boolean> {
    return this.getStore().heartbeat(projectId, userId)
  }

  /**
   * Get the current working on data for a user.
   * Reads from in-memory client objects (fast, for connected users).
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

  /**
   * Get all active work for a project from the persistent store (T20.4).
   * Includes users who may have disconnected but whose TTL hasn't expired yet.
   */
  async getProjectActiveWork(projectId: string): Promise<ActiveWorkData[]> {
    return this.getStore().getProjectActiveWork(projectId)
  }

  /**
   * Get active work for a specific user from the persistent store (T20.4).
   */
  async getActiveWork(projectId: string, userId: string): Promise<ActiveWorkData | null> {
    return this.getStore().getActiveWork(projectId, userId)
  }
}
