// WebSocket module exports
export {
  connectionManager,
  type Client,
  type WebSocketMessage,
  type UserPresence,
  type WorkingOnData,
  type TypingIndicatorData,
  type PresenceStatus,
  // Task locking types (T6.6)
  type TaskLock,
  type TaskLockInfo,
} from './connection-manager.js'

// Also export types directly for new consumers
export type { ConnectionStore } from './types.js'

// Export managers for direct use if needed
export { PresenceManager, WorkingOnManager, TypingManager, TaskLockManager } from './managers/index.js'
export { verifyToken, verifyProjectAccess, authenticateWebSocket } from './auth.js'
export {
  broadcastTaskUpdated,
  broadcastTasksUpdated,
  broadcastTasksSynced,
  broadcastProjectUpdated,
  broadcastTaskAssigned,
  broadcastTaskUnassigned,
  hasConnectedClients,
  type TaskData,
  type UserInfo,
  // Presence broadcasts (T5.9)
  broadcastPresenceJoined,
  broadcastPresenceLeft,
  broadcastPresenceUpdated,
  sendPresenceList,
  // Working on broadcasts (T6.1)
  broadcastWorkingOnChanged,
  // Activity broadcasts (T6.3)
  broadcastActivityCreated,
  type ActivityData,
  // Comment broadcasts (T6.4)
  broadcastCommentCreated,
  broadcastCommentUpdated,
  broadcastCommentDeleted,
  type CommentData,
  // Typing indicator broadcasts (T6.5)
  broadcastTypingStart,
  broadcastTypingStop,
  getTypingUsersForTask,
  // Task locking broadcasts (T6.6)
  broadcastTaskLocked,
  broadcastTaskUnlocked,
  broadcastTaskLockExtended,
  sendLocksList,
  getTaskLock,
  getProjectLocks,
  acquireTaskLock,
  releaseTaskLock,
  extendTaskLock,
  releaseUserLocks,
  // Notification broadcasts (T6.4)
  sendNotificationToUser,
  sendNotificationToUsers,
  broadcastNotificationRead,
  isUserConnected,
  getConnectedUserIds,
  type NotificationData,
} from './broadcast.js'
export { setupWebSocketServer, getWebSocketStats } from './server.js'
