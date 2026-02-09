import { connectionManager, type WebSocketMessage, type UserPresence, type Client } from './connection-manager.js'

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
  // Task assignment fields (T5.4)
  assigneeId?: string | null
  assignedBy?: string | null
  assignedAt?: Date | null
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
 * Broadcast that a task was assigned to a user
 */
export function broadcastTaskAssigned(
  projectId: string,
  data: {
    task: TaskData
    assignee: { id: string; email: string; name: string | null } | null
    assignedBy: { id: string; email: string; name: string | null }
  },
  excludeUserId?: string
): void {
  const message: WebSocketMessage = {
    type: 'task_assigned',
    projectId,
    timestamp: new Date().toISOString(),
    data,
  }

  connectionManager.broadcast(projectId, message, excludeUserId)
}

/**
 * Broadcast that a task was unassigned
 */
export function broadcastTaskUnassigned(
  projectId: string,
  data: {
    task: TaskData
    previousAssigneeId: string | null
    unassignedBy: { id: string; email: string; name: string | null }
  },
  excludeUserId?: string
): void {
  const message: WebSocketMessage = {
    type: 'task_unassigned',
    projectId,
    timestamp: new Date().toISOString(),
    data,
  }

  connectionManager.broadcast(projectId, message, excludeUserId)
}

/**
 * Helper to check if a project has any connected clients
 */
export function hasConnectedClients(projectId: string): boolean {
  return connectionManager.getProjectClientCount(projectId) > 0
}

// ============================================
// Presence Broadcast Functions (T5.9)
// ============================================

/**
 * Broadcast that a user joined the project (came online)
 */
export function broadcastPresenceJoined(
  projectId: string,
  user: UserPresence,
  excludeUserId?: string
): void {
  const message: WebSocketMessage = {
    type: 'presence_joined',
    projectId,
    timestamp: new Date().toISOString(),
    data: {
      user,
      onlineCount: connectionManager.getUniqueUserCount(projectId),
    },
  }

  connectionManager.broadcast(projectId, message, excludeUserId)
}

/**
 * Broadcast that a user left the project (went offline)
 */
export function broadcastPresenceLeft(
  projectId: string,
  userId: string,
  excludeUserId?: string
): void {
  const message: WebSocketMessage = {
    type: 'presence_left',
    projectId,
    timestamp: new Date().toISOString(),
    data: {
      userId,
      onlineCount: connectionManager.getUniqueUserCount(projectId),
    },
  }

  connectionManager.broadcast(projectId, message, excludeUserId)
}

/**
 * Broadcast that a user's presence status changed
 */
export function broadcastPresenceUpdated(
  projectId: string,
  userId: string,
  status: string,
  lastActiveAt: string,
  excludeUserId?: string
): void {
  const message: WebSocketMessage = {
    type: 'presence_updated',
    projectId,
    timestamp: new Date().toISOString(),
    data: {
      userId,
      status,
      lastActiveAt,
    },
  }

  connectionManager.broadcast(projectId, message, excludeUserId)
}

/**
 * Send the full presence list to a single client
 * Called when a new connection is established
 */
export function sendPresenceList(projectId: string, targetClient: Client): void {
  const presenceList = connectionManager.getProjectPresence(projectId)

  const message: WebSocketMessage = {
    type: 'presence_list',
    projectId,
    timestamp: new Date().toISOString(),
    data: {
      users: presenceList,
      onlineCount: presenceList.length,
    },
  }

  if (targetClient.ws.readyState === targetClient.ws.OPEN) {
    try {
      targetClient.ws.send(JSON.stringify(message))
    } catch (err) {
      console.error('[WS] Error sending presence list:', err)
    }
  }
}
