// WebSocket module exports
export { connectionManager, type Client, type WebSocketMessage } from './connection-manager.js'
export { verifyToken, verifyProjectAccess, authenticateWebSocket } from './auth.js'
export {
  broadcastTaskUpdated,
  broadcastTasksUpdated,
  broadcastTasksSynced,
  broadcastProjectUpdated,
  hasConnectedClients,
  type TaskData,
} from './broadcast.js'
export { setupWebSocketServer, getWebSocketStats } from './server.js'
