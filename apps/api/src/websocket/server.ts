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
  broadcastWorkingOnChanged,
  broadcastTypingStart,
  broadcastTypingStop,
  sendPresenceList,
  // Task locking (T6.6)
  broadcastTaskLocked,
  broadcastTaskUnlocked,
  broadcastTaskLockExtended,
  sendLocksList,
  acquireTaskLock,
  releaseTaskLock,
  extendTaskLock,
  releaseUserLocks,
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

    // Authenticate the connection
    const auth = await authenticateWebSocket(token, projectId)

    if (!auth.success) {
      const error = (auth as { success: false; error: string }).error
      console.warn(`[WS] Connection rejected: ${error}`)
      ws.close(4001, error)
      return
    }

    // Create client object with presence data (T5.9), workingOn (T6.1), and typing (T6.5)
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
      // Working on data (T6.1) - initialized to null
      workingOnTaskId: null,
      workingOnTaskUuid: null,
      workingOnTaskName: null,
      workingOnStartedAt: null,
      // Typing indicator data (T6.5) - initialized to null
      typingOnTaskId: null,
      typingOnTaskDisplayId: null,
      typingStartedAt: null,
    }

    // Check if this is the first connection for this user (before adding)
    const isFirstConn = connectionManager.getUniqueUserCount(auth.projectId) === 0 ||
      !connectionManager.getProjectPresence(auth.projectId).some(p => p.userId === auth.userId)

    // Add to connection manager
    connectionManager.addClient(auth.projectId, client)

    // Send presence list to new client (T5.9)
    sendPresenceList(auth.projectId, client)

    // Send locks list to new client (T6.6)
    sendLocksList(auth.projectId, client)

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

        // Handle working_on_start from client (T6.1)
        if (message.type === 'working_on_start') {
          const { taskId, taskUuid, taskName } = message
          if (taskId && taskUuid && taskName) {
            const startedAt = connectionManager.setWorkingOn(auth.projectId, auth.userId, {
              taskId,
              taskUuid,
              taskName,
            })
            broadcastWorkingOnChanged(
              auth.projectId,
              auth.userId,
              {
                taskId,
                taskUuid,
                taskName,
                startedAt: startedAt.toISOString(),
              }
            )
            console.log(`[WS] User ${auth.userId} started working on ${taskId}`)
          }
          return
        }

        // Handle working_on_stop from client (T6.1)
        if (message.type === 'working_on_stop') {
          connectionManager.clearWorkingOn(auth.projectId, auth.userId)
          broadcastWorkingOnChanged(
            auth.projectId,
            auth.userId,
            null
          )
          console.log(`[WS] User ${auth.userId} stopped working`)
          return
        }

        // Handle comment_typing_start from client (T6.5)
        if (message.type === 'comment_typing_start') {
          const { taskId, taskDisplayId } = message
          if (taskId && taskDisplayId) {
            const startedAt = connectionManager.setTyping(auth.projectId, auth.userId, taskId, taskDisplayId)
            const typingData = {
              userId: auth.userId,
              email: auth.email,
              name: auth.name,
              taskId,
              taskDisplayId,
              startedAt: startedAt.toISOString(),
            }
            broadcastTypingStart(auth.projectId, typingData, auth.userId)
            console.log(`[WS] User ${auth.userId} started typing on ${taskDisplayId}`)
          }
          return
        }

        // Handle comment_typing_stop from client (T6.5)
        if (message.type === 'comment_typing_stop') {
          const typingInfo = connectionManager.getTypingInfo(auth.projectId, auth.userId)
          if (typingInfo) {
            connectionManager.clearTyping(auth.projectId, auth.userId)
            broadcastTypingStop(
              auth.projectId,
              {
                userId: auth.userId,
                taskId: typingInfo.taskId,
                taskDisplayId: typingInfo.taskDisplayId,
              },
              auth.userId
            )
            console.log(`[WS] User ${auth.userId} stopped typing`)
          }
          return
        }

        // Handle task_lock from client (T6.6)
        if (message.type === 'task_lock') {
          const { taskId, taskUuid, taskName } = message
          if (taskId && taskUuid) {
            const result = acquireTaskLock(
              auth.projectId,
              taskId,
              taskUuid,
              auth.userId,
              auth.email,
              auth.name
            )

            // Send result back to requesting client
            const responseMessage: WebSocketMessage = {
              type: 'task_lock_result',
              projectId: auth.projectId,
              timestamp: new Date().toISOString(),
              data: {
                success: result.success,
                lock: result.lock,
                isOwnLock: result.isOwnLock || false,
                taskName: taskName || null,
              },
            }
            ws.send(JSON.stringify(responseMessage))

            // If lock acquired (new or extended), broadcast to others
            if (result.success) {
              if (result.isOwnLock) {
                broadcastTaskLockExtended(auth.projectId, result.lock, auth.userId)
              } else {
                broadcastTaskLocked(auth.projectId, result.lock, auth.userId)
              }
              console.log(`[WS] User ${auth.userId} locked task ${taskId}`)
            }
          }
          return
        }

        // Handle task_unlock from client (T6.6)
        if (message.type === 'task_unlock') {
          const { taskId, taskUuid } = message
          if (taskId) {
            const released = releaseTaskLock(auth.projectId, taskId, auth.userId)

            if (released) {
              broadcastTaskUnlocked(
                auth.projectId,
                {
                  taskId,
                  taskUuid: taskUuid || '',
                  unlockedBy: {
                    id: auth.userId,
                    email: auth.email,
                    name: auth.name,
                  },
                }
              )
              console.log(`[WS] User ${auth.userId} unlocked task ${taskId}`)
            }

            // Send result back to requesting client
            const responseMessage: WebSocketMessage = {
              type: 'task_unlock_result',
              projectId: auth.projectId,
              timestamp: new Date().toISOString(),
              data: {
                success: released,
                taskId,
              },
            }
            ws.send(JSON.stringify(responseMessage))
          }
          return
        }

        // Handle task_lock_extend from client (T6.6)
        if (message.type === 'task_lock_extend') {
          const { taskId } = message
          if (taskId) {
            const extended = extendTaskLock(auth.projectId, taskId, auth.userId)

            if (extended) {
              const lock = connectionManager.getLock(auth.projectId, taskId)
              if (lock) {
                broadcastTaskLockExtended(auth.projectId, lock)
              }
            }

            // Send result back to requesting client
            const responseMessage: WebSocketMessage = {
              type: 'task_lock_extend_result',
              projectId: auth.projectId,
              timestamp: new Date().toISOString(),
              data: {
                success: extended,
                taskId,
              },
            }
            ws.send(JSON.stringify(responseMessage))
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

      // Get workingOn status before removing (T6.1)
      const hadWorkingOn = connectionManager.getWorkingOn(auth.projectId, auth.userId) !== null

      // Get typing status before removing (T6.5)
      const typingInfo = connectionManager.getTypingInfo(auth.projectId, auth.userId)

      connectionManager.removeClient(auth.projectId, client)

      // If last connection for this user
      if (isLastConn) {
        // Broadcast presence_left to others (T5.9)
        broadcastPresenceLeft(auth.projectId, auth.userId)

        // If they were working on something, broadcast that they stopped (T6.1)
        if (hadWorkingOn) {
          broadcastWorkingOnChanged(auth.projectId, auth.userId, null)
        }

        // If they were typing, broadcast that they stopped (T6.5)
        if (typingInfo) {
          broadcastTypingStop(auth.projectId, {
            userId: auth.userId,
            taskId: typingInfo.taskId,
            taskDisplayId: typingInfo.taskDisplayId,
          })
        }

        // Release any locks held by this user (T6.6)
        const releasedLocks = releaseUserLocks(auth.projectId, auth.userId)
        for (const taskId of releasedLocks) {
          broadcastTaskUnlocked(auth.projectId, {
            taskId,
            taskUuid: '', // UUID not available here, but taskId is sufficient
            unlockedBy: null, // null indicates auto-release due to disconnect
          })
          console.log(`[WS] Auto-released lock on ${taskId} due to user disconnect`)
        }
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
