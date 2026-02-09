import { WebSocketServer, WebSocket } from 'ws'
import type { Server as HttpServer } from 'http'
import type { Http2SecureServer, Http2Server } from 'http2'
import { URL } from 'url'
import { authenticateWebSocket } from './auth.js'
import { connectionManager, type Client, type WebSocketMessage, type PresenceStatus } from './connection-manager.js'
import {
  broadcastPresenceJoined,
  broadcastPresenceLeft,
  broadcastPresenceUpdated,
  sendPresenceList,
} from './broadcast.js'

// Ping interval (25 seconds - below typical 30s timeout)
const PING_INTERVAL_MS = 25000

/**
 * Extended WebSocket with alive tracking for ping/pong
 */
interface ExtendedWebSocket extends WebSocket {
  isAlive?: boolean
  pingInterval?: NodeJS.Timeout
}

// Type for Hono server which can be HTTP or HTTP2
type ServerType = HttpServer | Http2Server | Http2SecureServer

/**
 * Setup WebSocket server on the existing HTTP server
 */
export function setupWebSocketServer(server: ServerType): WebSocketServer {
  // Cast to HttpServer for WebSocketServer compatibility
  // This works because @hono/node-server returns an http.Server in most cases
  const wss = new WebSocketServer({
    server: server as HttpServer,
    path: '/ws',
  })

  console.log('[WS] WebSocket server initialized on /ws')

  wss.on('connection', async (ws: ExtendedWebSocket, request) => {
    // Parse URL params for authentication
    const url = new URL(request.url || '', `http://${request.headers.host}`)
    const token = url.searchParams.get('token')
    const projectId = url.searchParams.get('projectId')

    // Debug logging
    console.log(`[WS] Connection attempt: projectId=${projectId}, hasToken=${!!token}`)

    // Authenticate the connection
    const auth = await authenticateWebSocket(token, projectId)

    if (!auth.success) {
      const error = (auth as { success: false; error: string }).error
      console.warn(`[WS] Connection rejected: ${error}`)
      ws.close(4001, error)
      return
    }

    // Create client object with presence data (T5.9)
    const now = new Date()
    const client: Client = {
      ws,
      userId: auth.userId,
      projectId: auth.projectId,
      connectedAt: now,
      email: auth.email,
      name: auth.name,
      status: 'online',
      lastActiveAt: now,
    }

    // Check if this is the first connection for this user (before adding)
    const isFirstConn = connectionManager.getUniqueUserCount(auth.projectId) === 0 ||
      !connectionManager.getProjectPresence(auth.projectId).some(p => p.userId === auth.userId)

    // Add to connection manager
    connectionManager.addClient(auth.projectId, client)

    // Send presence list to new client (T5.9)
    sendPresenceList(auth.projectId, client)

    // If first connection for this user, broadcast presence_joined to others
    if (isFirstConn) {
      const userPresence = connectionManager.getClientPresence(client)
      broadcastPresenceJoined(auth.projectId, userPresence, auth.userId)
    }

    // Send connected confirmation
    const connectedMessage: WebSocketMessage = {
      type: 'connected',
      projectId: auth.projectId,
      timestamp: new Date().toISOString(),
      data: {
        userId: auth.userId,
        projectName: auth.projectName,
      },
    }
    ws.send(JSON.stringify(connectedMessage))

    // Setup ping/pong for keep-alive
    ws.isAlive = true

    ws.on('pong', () => {
      ws.isAlive = true
    })

    // Handle incoming messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString())

        // Handle ping from client
        if (message.type === 'ping') {
          // Touch client on ping to update lastActiveAt (T5.9)
          connectionManager.touchClient(auth.projectId, auth.userId)
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }))
          return
        }

        // Handle presence_update from client (T5.9)
        if (message.type === 'presence_update') {
          const status = message.status as PresenceStatus
          if (status && ['online', 'idle', 'away'].includes(status)) {
            connectionManager.updateClientStatus(auth.projectId, auth.userId, status)
            broadcastPresenceUpdated(
              auth.projectId,
              auth.userId,
              status,
              new Date().toISOString(),
              auth.userId // Exclude sender
            )
          }
          return
        }

        // Log other messages for debugging
        console.log(`[WS] Received message from ${auth.userId}:`, message.type)
      } catch (err) {
        console.error('[WS] Failed to parse message:', err)
      }
    })

    // Handle client disconnect
    ws.on('close', (code, reason) => {
      console.log(`[WS] Client disconnected: code=${code}, reason=${reason.toString() || 'none'}`)

      // Check if this is the last connection for the user BEFORE removing (T5.9)
      const isLastConn = connectionManager.isLastConnection(auth.projectId, auth.userId)

      connectionManager.removeClient(auth.projectId, client)

      // If last connection for this user, broadcast presence_left to others (T5.9)
      if (isLastConn) {
        broadcastPresenceLeft(auth.projectId, auth.userId)
      }

      // Clear ping interval if exists
      if (ws.pingInterval) {
        clearInterval(ws.pingInterval)
      }
    })

    // Handle errors
    ws.on('error', (err) => {
      console.error('[WS] WebSocket error:', err)
      connectionManager.removeClient(auth.projectId, client)
    })

    // Start ping interval for this connection
    ws.pingInterval = setInterval(() => {
      if (ws.isAlive === false) {
        console.log('[WS] Client unresponsive, terminating connection')
        clearInterval(ws.pingInterval)
        ws.terminate()
        return
      }

      ws.isAlive = false
      ws.ping()
    }, PING_INTERVAL_MS)
  })

  // Log server errors
  wss.on('error', (err) => {
    console.error('[WS] Server error:', err)
  })

  return wss
}

/**
 * Get WebSocket server stats
 */
export function getWebSocketStats(): {
  totalConnections: number
  activeProjects: string[]
} {
  return {
    totalConnections: connectionManager.getTotalClientCount(),
    activeProjects: connectionManager.getActiveProjectIds(),
  }
}
