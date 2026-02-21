import { connectionManager, type WebSocketMessage, type UserPresence, type WorkingOnData, type TypingIndicatorData, type Client, type TaskLockInfo } from './connection-manager.js'

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
 * User info for broadcasts (T6.4)
 */
export interface UserInfo {
  id: string
  email: string
  name: string | null
}

/**
 * Broadcast that a single task was updated
 * Enhanced in T6.4 to include updatedBy info
 */
export function broadcastTaskUpdated(
  projectId: string,
  task: TaskData,
  updatedBy?: UserInfo,
  excludeUserId?: string
): void {
  const message: WebSocketMessage = {
    type: 'task_updated',
    projectId,
    timestamp: new Date().toISOString(),
    data: {
      task,
      updatedBy: updatedBy || null,
    },
  }

  connectionManager.broadcast(projectId, message, excludeUserId)
}

/**
 * Broadcast that multiple tasks were updated (bulk update)
 */
export function broadcastTasksUpdated(
  projectId: string,
  tasks: TaskData[],
  updatedBy?: UserInfo,
  excludeUserId?: string
): void {
  // Send individual updates for each task to match expected frontend behavior
  for (const task of tasks) {
    broadcastTaskUpdated(projectId, task, updatedBy, excludeUserId)
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

// ============================================
// Working On Broadcast Functions (T6.1)
// ============================================

/**
 * Broadcast that a user's working on status changed
 */
export function broadcastWorkingOnChanged(
  projectId: string,
  userId: string,
  workingOn: WorkingOnData | null,
  excludeUserId?: string
): void {
  const message: WebSocketMessage = {
    type: 'working_on_changed',
    projectId,
    timestamp: new Date().toISOString(),
    data: {
      userId,
      workingOn,
    },
  }

  connectionManager.broadcast(projectId, message, excludeUserId)
}

// ============================================
// Activity Feed Broadcast Functions (T6.3)
// ============================================

/**
 * Activity data structure for broadcasts
 */
export interface ActivityData {
  id: string
  action: string
  entityType: string
  entityId: string | null
  taskId: string | null
  taskUuid: string | null
  metadata: Record<string, unknown> | null
  description: string | null
  createdAt: string
  actor: {
    id: string
    email: string
    name: string | null
  }
}

/**
 * Broadcast that a new activity was created
 * This enables real-time activity feed updates
 */
export function broadcastActivityCreated(
  projectId: string,
  activity: ActivityData,
  excludeUserId?: string
): void {
  const message: WebSocketMessage = {
    type: 'activity_created',
    projectId,
    timestamp: new Date().toISOString(),
    data: {
      activity,
    },
  }

  connectionManager.broadcast(projectId, message, excludeUserId)
}

// ============================================
// Comment Broadcast Functions (T6.4)
// ============================================

/**
 * Comment data structure for broadcasts
 */
export interface CommentData {
  id: string
  taskId: string         // Task UUID
  taskDisplayId: string  // Human-readable ID (e.g., "T1.1")
  content: string
  parentId: string | null
  mentions: string[] | null
  createdAt: string
  author: UserInfo
}

/**
 * Broadcast that a comment was created on a task
 */
export function broadcastCommentCreated(
  projectId: string,
  comment: CommentData,
  excludeUserId?: string
): void {
  const message: WebSocketMessage = {
    type: 'comment_created',
    projectId,
    timestamp: new Date().toISOString(),
    data: { comment },
  }

  connectionManager.broadcast(projectId, message, excludeUserId)
}

/**
 * Broadcast that a comment was updated
 */
export function broadcastCommentUpdated(
  projectId: string,
  comment: CommentData,
  excludeUserId?: string
): void {
  const message: WebSocketMessage = {
    type: 'comment_updated',
    projectId,
    timestamp: new Date().toISOString(),
    data: { comment },
  }

  connectionManager.broadcast(projectId, message, excludeUserId)
}

/**
 * Broadcast that a comment was deleted
 */
export function broadcastCommentDeleted(
  projectId: string,
  data: {
    commentId: string
    taskId: string
    taskDisplayId: string
    deletedBy: UserInfo
  },
  excludeUserId?: string
): void {
  const message: WebSocketMessage = {
    type: 'comment_deleted',
    projectId,
    timestamp: new Date().toISOString(),
    data,
  }

  connectionManager.broadcast(projectId, message, excludeUserId)
}

// ============================================
// Typing Indicator Broadcast Functions (T6.5)
// ============================================

/**
 * Broadcast that a user started typing a comment on a task
 */
export function broadcastTypingStart(
  projectId: string,
  typingData: TypingIndicatorData,
  excludeUserId?: string
): void {
  const message: WebSocketMessage = {
    type: 'comment_typing_start',
    projectId,
    timestamp: new Date().toISOString(),
    data: { typing: typingData },
  }

  connectionManager.broadcast(projectId, message, excludeUserId)
}

/**
 * Broadcast that a user stopped typing a comment
 */
export function broadcastTypingStop(
  projectId: string,
  data: {
    userId: string
    taskId: string
    taskDisplayId: string
  },
  excludeUserId?: string
): void {
  const message: WebSocketMessage = {
    type: 'comment_typing_stop',
    projectId,
    timestamp: new Date().toISOString(),
    data,
  }

  connectionManager.broadcast(projectId, message, excludeUserId)
}

/**
 * Get all users currently typing on a task
 */
export function getTypingUsersForTask(projectId: string, taskId: string): TypingIndicatorData[] {
  return connectionManager.getTypingUsers(projectId, taskId)
}

// ============================================
// Notification Broadcast Functions (T6.4)
// ============================================

/**
 * Notification data structure for broadcasts
 */
export interface NotificationData {
  id: string
  type: string        // 'mention', 'assignment', 'comment', 'status_change'
  title: string
  body: string | null
  link: string | null
  createdAt: string
}

/**
 * Send a real-time notification to a specific user
 * This supplements the database notification - it pushes immediately to connected clients
 */
export function sendNotificationToUser(
  projectId: string,
  userId: string,
  notification: NotificationData
): boolean {
  const message: WebSocketMessage = {
    type: 'notification_new',
    projectId,
    timestamp: new Date().toISOString(),
    data: { notification },
  }

  const sent = connectionManager.sendToUser(projectId, userId, message)
  return sent > 0
}

/**
 * Send notifications to multiple users
 * Returns the count of users who received the notification
 */
export function sendNotificationToUsers(
  projectId: string,
  userIds: string[],
  notification: NotificationData
): number {
  const message: WebSocketMessage = {
    type: 'notification_new',
    projectId,
    timestamp: new Date().toISOString(),
    data: { notification },
  }

  return connectionManager.sendToUsers(projectId, userIds, message)
}

/**
 * Broadcast that notifications were marked as read (for multi-device sync)
 */
export function broadcastNotificationRead(
  projectId: string,
  userId: string,
  notificationIds: string[]
): void {
  const message: WebSocketMessage = {
    type: 'notification_read',
    projectId,
    timestamp: new Date().toISOString(),
    data: { notificationIds },
  }

  // Only send to the user who marked them read (for multi-device sync)
  connectionManager.sendToUser(projectId, userId, message)
}

/**
 * Check if a user is currently connected to a project
 * Useful for deciding whether to send push notifications
 */
export function isUserConnected(projectId: string, userId: string): boolean {
  return connectionManager.isUserConnected(projectId, userId)
}

/**
 * Get all currently connected user IDs for a project
 */
export function getConnectedUserIds(projectId: string): string[] {
  return connectionManager.getConnectedUserIds(projectId)
}

// ============================================
// Task Locking Broadcast Functions (T6.6)
// ============================================

/**
 * Broadcast that a task was locked
 */
export function broadcastTaskLocked(
  projectId: string,
  lock: TaskLockInfo,
  excludeUserId?: string
): void {
  const message: WebSocketMessage = {
    type: 'task_locked',
    projectId,
    timestamp: new Date().toISOString(),
    data: { lock },
  }

  connectionManager.broadcast(projectId, message, excludeUserId)
}

/**
 * Broadcast that a task was unlocked
 */
export function broadcastTaskUnlocked(
  projectId: string,
  data: {
    taskId: string
    taskUuid: string
    unlockedBy: UserInfo | null  // null if expired automatically
  },
  excludeUserId?: string
): void {
  const message: WebSocketMessage = {
    type: 'task_unlocked',
    projectId,
    timestamp: new Date().toISOString(),
    data,
  }

  connectionManager.broadcast(projectId, message, excludeUserId)
}

/**
 * Broadcast that a lock was extended
 */
export function broadcastTaskLockExtended(
  projectId: string,
  lock: TaskLockInfo,
  excludeUserId?: string
): void {
  const message: WebSocketMessage = {
    type: 'task_lock_extended',
    projectId,
    timestamp: new Date().toISOString(),
    data: { lock },
  }

  connectionManager.broadcast(projectId, message, excludeUserId)
}

/**
 * Send the current locks list to a single client
 * Called when a new connection is established
 */
export function sendLocksList(projectId: string, targetClient: Client): void {
  const locks = connectionManager.getProjectLocks(projectId)

  const message: WebSocketMessage = {
    type: 'locks_list',
    projectId,
    timestamp: new Date().toISOString(),
    data: { locks },
  }

  if (targetClient.ws.readyState === targetClient.ws.OPEN) {
    try {
      targetClient.ws.send(JSON.stringify(message))
    } catch (err) {
      console.error('[WS] Error sending locks list:', err)
    }
  }
}

/**
 * Check if a task is locked and get lock info
 */
export function getTaskLock(projectId: string, taskId: string): TaskLockInfo | null {
  return connectionManager.getLock(projectId, taskId)
}

/**
 * Get all locks for a project
 */
export function getProjectLocks(projectId: string): TaskLockInfo[] {
  return connectionManager.getProjectLocks(projectId)
}

/**
 * Acquire a task lock
 */
export function acquireTaskLock(
  projectId: string,
  taskId: string,
  taskUuid: string,
  userId: string,
  userEmail: string,
  userName: string | null,
  durationMs?: number
): { success: boolean; lock: TaskLockInfo; isOwnLock?: boolean } {
  return connectionManager.acquireLock(projectId, taskId, taskUuid, userId, userEmail, userName, durationMs)
}

/**
 * Release a task lock
 */
export function releaseTaskLock(projectId: string, taskId: string, userId?: string): boolean {
  return connectionManager.releaseLock(projectId, taskId, userId)
}

/**
 * Extend a task lock
 */
export function extendTaskLock(projectId: string, taskId: string, userId: string, durationMs?: number): boolean {
  return connectionManager.extendLock(projectId, taskId, userId, durationMs)
}

/**
 * Release all locks held by a user
 */
export function releaseUserLocks(projectId: string, userId: string): string[] {
  return connectionManager.releaseUserLocks(projectId, userId)
}
