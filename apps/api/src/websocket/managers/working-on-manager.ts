import type { ConnectionStore, WorkingOnData } from '../types.js'

/**
 * WorkingOnManager handles "Currently Working On" status (T6.1)
 * - Tracks which task a user is actively working on
 * - Syncs across multiple connections for the same user
 */
export class WorkingOnManager {
  constructor(private connections: ConnectionStore) {}

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
}
