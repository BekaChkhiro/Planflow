// WebSocket module exports
export {
  connectionManager,
  type Client,
  type WebSocketMessage,
  type UserPresence,
  type PresenceStatus,
} from './connection-manager.js'
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
  // Presence broadcasts (T5.9)
  broadcastPresenceJoined,
  broadcastPresenceLeft,
  broadcastPresenceUpdated,
  sendPresenceList,
} from './broadcast.js'
export { setupWebSocketServer, getWebSocketStats } from './server.js'
