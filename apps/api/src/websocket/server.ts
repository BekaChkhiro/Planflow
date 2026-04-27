import { WebSocketServer, WebSocket } from 'ws'
import type { Server as HttpServer } from 'http'
import type { Http2SecureServer, Http2Server } from 'http2'
import { URL } from 'url'
import { authenticateWebSocket } from './auth.js'
import { loggers } from '../lib/logger.js'

const log = loggers.websocket
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
  broadcastFileConflictWarning,
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
 * Extract token from WebSocket subprotocol header (T10.1 - Security fix)
 * Token is passed as subprotocol in format: "access_token.{JWT}"
 * This prevents token from being logged in server access logs or browser history
 */
function extractTokenFromProtocol(request: { headers: Record<string, string | string[] | undefined> }): string | null {
  const protocolHeader = request.headers['sec-websocket-protocol']
  if (!protocolHeader) return null

  // Handle both string and array formats
  const protocols = Array.isArray(protocolHeader)
    ? protocolHeader
    : protocolHeader.split(',').map(p => p.trim())

  // Find the access_token protocol
  for (const protocol of protocols) {
    if (protocol.startsWith('access_token.')) {
      return protocol.substring('access_token.'.length)
    }
  }

  return null
}

/**
 * Setup WebSocket server on the existing HTTP server
 */
export function setupWebSocketServer(server: ServerType): WebSocketServer {
  // Cast to HttpServer for WebSocketServer compatibility
  // This works because @hono/node-server returns an http.Server in most cases
  const wss = new WebSocketServer({
    server: server as HttpServer,
    path: '/ws',
    // Handle subprotocol selection for token auth (T10.1)
    handleProtocols: (protocols, _request) => {
      // Accept the access_token protocol if present
      for (const protocol of protocols) {
        if (protocol.startsWith('access_token.')) {
          return protocol
        }
      }
      // Also accept 'planflow-v1' as a valid protocol
      if (protocols.has('planflow-v1')) {
        return 'planflow-v1'
      }
      return false
    },
  })

  log.info('WebSocket server initialized on /ws (secure token via subprotocol)')

  wss.on('connection', async (ws: ExtendedWebSocket, request) => {
    // Parse URL params for projectId only (T10.1 - token moved to subprotocol)
    const url = new URL(request.url || '', `http://${request.headers.host}`)
    const projectId = url.searchParams.get('projectId')

    // Extract token from subprotocol header (T10.1 - Security fix)
    // Token is no longer in URL, preventing exposure in logs/history
    const token = extractTokenFromProtocol(request)

    // Authenticate the connection
    const auth = await authenticateWebSocket(token, projectId)

    if (!auth.success) {
      const error = (auth as { success: false; error: string }).error
      const hasToken = !!token
      const hasProjectId = !!projectId
      log.warn({ error, hasToken, hasProjectId, url: request.url }, 'Connection rejected')
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

    // Send locks list to new client (T6.6) - async, but we don't need to wait
    sendLocksList(auth.projectId, client).catch(err => {
      log.error({ err, projectId: auth.projectId }, 'Error sending locks list')
    })

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
    ws.on('message', async (data) => {
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

        // Handle working_on_start from client (T6.1 + T20.4 Redis persistence)
        if (message.type === 'working_on_start') {
          const { taskId, taskUuid, taskName, filePaths } = message
          if (taskId && taskUuid && taskName) {
            const startedAt = await connectionManager.setWorkingOn(
              auth.projectId,
              auth.userId,
              { taskId, taskUuid, taskName },
              { email: auth.email, name: auth.name }
            )
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
            log.debug({ userId: auth.userId, taskId }, 'User started working on task')

            // If filePaths provided, update and check for conflicts (T20.9)
            if (Array.isArray(filePaths) && filePaths.length > 0) {
              const { conflicts } = await connectionManager.conflictDetection
                .updateFilesAndDetectConflicts(auth.projectId, auth.userId, filePaths)
              if (conflicts.length > 0) {
                broadcastFileConflictWarning(auth.projectId, conflicts, auth.userId)
              }
            }
          }
          return
        }

        // Handle working_on_stop from client (T6.1 + T20.4 Redis persistence)
        if (message.type === 'working_on_stop') {
          await connectionManager.clearWorkingOn(auth.projectId, auth.userId)
          broadcastWorkingOnChanged(
            auth.projectId,
            auth.userId,
            null
          )
          log.debug({ userId: auth.userId }, 'User stopped working')
          return
        }

        // Handle working_on_heartbeat from client (T20.4)
        if (message.type === 'working_on_heartbeat') {
          const alive = await connectionManager.heartbeatActiveWork(auth.projectId, auth.userId)
          if (!alive) {
            // Active work expired — clear client state and notify
            connectionManager.getWorkingOn(auth.projectId, auth.userId) &&
              await connectionManager.clearWorkingOn(auth.projectId, auth.userId)
            broadcastWorkingOnChanged(auth.projectId, auth.userId, null)
            ws.send(JSON.stringify({
              type: 'working_on_expired',
              projectId: auth.projectId,
              timestamp: new Date().toISOString(),
            }))
          }
          return
        }

        // Handle working_on_files from client (T20.9 - Conflict Detection)
        if (message.type === 'working_on_files') {
          const { filePaths } = message
          if (Array.isArray(filePaths)) {
            const { conflicts } = await connectionManager.conflictDetection
              .updateFilesAndDetectConflicts(auth.projectId, auth.userId, filePaths)

            if (conflicts.length > 0) {
              broadcastFileConflictWarning(auth.projectId, conflicts, auth.userId)
              log.info(
                { userId: auth.userId, conflictCount: conflicts.length },
                'File conflicts detected and warnings sent'
              )
            }

            // Acknowledge to sender
            ws.send(JSON.stringify({
              type: 'working_on_files_ack',
              projectId: auth.projectId,
              timestamp: new Date().toISOString(),
              data: {
                fileCount: filePaths.length,
                conflictCount: conflicts.length,
                conflicts: conflicts.map(c => ({
                  filePath: c.filePath,
                  otherUsers: c.users.filter(u => u.userId !== auth.userId).map(u => ({
                    userEmail: u.userEmail,
                    userName: u.userName,
                    taskId: u.taskId,
                    taskName: u.taskName,
                  })),
                })),
              },
            }))
          }
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
            log.debug({ userId: auth.userId, taskDisplayId }, 'User started typing')
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
            log.debug({ userId: auth.userId }, 'User stopped typing')
          }
          return
        }

        // Handle task_lock from client (T6.6 + T10.9 Redis persistence)
        if (message.type === 'task_lock') {
          const { taskId, taskUuid, taskName } = message
          if (taskId && taskUuid) {
            const result = await acquireTaskLock(
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
              log.debug({ userId: auth.userId, taskId }, 'User locked task')
            }
          }
          return
        }

        // Handle task_unlock from client (T6.6 + T10.9 Redis persistence)
        if (message.type === 'task_unlock') {
          const { taskId, taskUuid } = message
          if (taskId) {
            const released = await releaseTaskLock(auth.projectId, taskId, auth.userId)

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
              log.debug({ userId: auth.userId, taskId }, 'User unlocked task')
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

        // Handle task_lock_extend from client (T6.6 + T10.9 Redis persistence)
        if (message.type === 'task_lock_extend') {
          const { taskId } = message
          if (taskId) {
            const extended = await extendTaskLock(auth.projectId, taskId, auth.userId)

            if (extended) {
              const lock = await connectionManager.getLock(auth.projectId, taskId)
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
        log.debug({ userId: auth.userId, type: message.type }, 'Received message')
      } catch (err) {
        log.error({ err }, 'Failed to parse message')
      }
    })

    // Handle client disconnect
    ws.on('close', (code, reason) => {
      log.debug({ code, reason: reason.toString() || 'none', userId: auth.userId }, 'Client disconnected')

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

        // If they were working on something, clear from store and broadcast (T6.1 + T20.4)
        if (hadWorkingOn) {
          connectionManager.clearWorkingOn(auth.projectId, auth.userId).catch(err => {
            log.error({ err, userId: auth.userId }, 'Error clearing active work on disconnect')
          })
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

        // Release any locks held by this user (T6.6 + T10.9 Redis persistence)
        releaseUserLocks(auth.projectId, auth.userId).then(releasedLocks => {
          for (const taskId of releasedLocks) {
            broadcastTaskUnlocked(auth.projectId, {
              taskId,
              taskUuid: '', // UUID not available here, but taskId is sufficient
              unlockedBy: null, // null indicates auto-release due to disconnect
            })
            log.debug({ taskId, userId: auth.userId }, 'Auto-released lock due to user disconnect')
          }
        }).catch(err => {
          log.error({ err, userId: auth.userId }, 'Error releasing user locks')
        })
      }

      // Clear ping interval if exists
      if (ws.pingInterval) {
        clearInterval(ws.pingInterval)
      }
    })

    // Handle errors
    ws.on('error', (err) => {
      log.error({ err, userId: auth.userId }, 'WebSocket error')
      connectionManager.removeClient(auth.projectId, client)
    })

    // Start ping interval for this connection
    ws.pingInterval = setInterval(() => {
      if (ws.isAlive === false) {
        log.debug({ userId: auth.userId }, 'Client unresponsive, terminating connection')
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
    log.error({ err }, 'Server error')
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
