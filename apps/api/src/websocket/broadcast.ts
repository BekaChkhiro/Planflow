import { connectionManager, type WebSocketMessage } from './connection-manager.js'

/**
 * Task data structure for broadcasts
 */
export interface TaskData {
  id: string
  taskId: string
  name: string
  description: string | null
  status: string
  complexity: string | null
  estimatedHours: number | null
  dependencies: string[] | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Broadcast that a single task was updated
 */
export function broadcastTaskUpdated(
  projectId: string,
  task: TaskData,
  excludeUserId?: string
): void {
  const message: WebSocketMessage = {
    type: 'task_updated',
    projectId,
    timestamp: new Date().toISOString(),
    data: { task },
  }

  connectionManager.broadcast(projectId, message, excludeUserId)
}

/**
 * Broadcast that multiple tasks were updated (bulk update)
 */
export function broadcastTasksUpdated(
  projectId: string,
  tasks: TaskData[],
  excludeUserId?: string
): void {
  // Send individual updates for each task to match expected frontend behavior
  for (const task of tasks) {
    broadcastTaskUpdated(projectId, task, excludeUserId)
  }
}

/**
 * Broadcast that tasks were synced from a plan update
 */
export function broadcastTasksSynced(
  projectId: string,
  data: {
    tasksCount: number
    completedCount: number
    progress: number
  },
  excludeUserId?: string
): void {
  const message: WebSocketMessage = {
    type: 'tasks_synced',
    projectId,
    timestamp: new Date().toISOString(),
    data,
  }

  connectionManager.broadcast(projectId, message, excludeUserId)
}

/**
 * Broadcast that project metadata was updated
 */
export function broadcastProjectUpdated(
  projectId: string,
  updatedFields: {
    name?: string
    description?: string | null
    updatedAt: string
  },
  excludeUserId?: string
): void {
  const message: WebSocketMessage = {
    type: 'project_updated',
    projectId,
    timestamp: new Date().toISOString(),
    data: { updatedFields },
  }

  connectionManager.broadcast(projectId, message, excludeUserId)
}

/**
 * Helper to check if a project has any connected clients
 */
export function hasConnectedClients(projectId: string): boolean {
  return connectionManager.getProjectClientCount(projectId) > 0
}
