'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth-store'
import { env } from '@/env'
import { projectTasksQueryKey, projectQueryKey } from './use-projects'

// WebSocket message types from server
interface WebSocketMessage {
  type:
    | 'connected'
    | 'task_updated'
    | 'tasks_synced'
    | 'project_updated'
    | 'pong'
    | 'activity_created'
    | 'presence_joined'
    | 'presence_left'
    | 'presence_updated'
    | 'presence_list'
    | 'working_on_changed'
    | 'comment_created'
    | 'comment_updated'
    | 'comment_deleted'
    | 'notification_new'
    | 'comment_typing_start'
    | 'comment_typing_stop'
    // Task locking message types (T6.6)
    | 'task_locked'
    | 'task_unlocked'
    | 'task_lock_extended'
    | 'locks_list'
    | 'task_lock_result'
    | 'task_unlock_result'
    | 'task_lock_extend_result'
  projectId: string
  timestamp: string
  data?: Record<string, unknown>
}

// Typing indicator data (T6.5)
export interface TypingIndicatorData {
  userId: string
  email: string
  name: string | null
  taskId: string
  taskDisplayId: string
  startedAt: string
}

// Task lock info (T6.6)
export interface TaskLockInfo {
  taskId: string
  taskUuid: string
  lockedBy: {
    userId: string
    email: string
    name: string | null
  }
  lockedAt: string
  expiresAt: string
}

// Task lock result from server (T6.6)
export interface TaskLockResult {
  success: boolean
  lock: TaskLockInfo
  isOwnLock?: boolean
  taskName?: string | null
}

// Connection states
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

// Activity data from server
interface ActivityData {
  id: string
  action: string
  entityType: string
  entityId: string | null
  taskId: string | null
  taskUuid: string | null
  organizationId?: string | null
  projectId?: string | null
  metadata: Record<string, unknown> | null
  description: string | null
  createdAt: string
  actor: {
    id: string
    email: string
    name: string | null
  }
}

// Notification data from server (T6.7)
export interface NotificationData {
  id: string
  type: 'mention' | 'assignment' | 'comment' | 'status_change' | string
  title: string
  body: string | null
  link: string | null
  createdAt: string
}

// Presence data types (T7.8)
export type PresenceStatus = 'online' | 'idle' | 'away'

export interface WorkingOnData {
  taskId: string
  taskUuid: string
  taskName: string
  startedAt: string
}

export interface UserPresence {
  userId: string
  email: string
  name: string | null
  status: PresenceStatus
  connectedAt: string
  lastActiveAt: string
  workingOn: WorkingOnData | null
}

// Hook options
interface UseProjectWebSocketOptions {
  projectId: string
  enabled?: boolean
  onConnected?: () => void
  onDisconnected?: () => void
  onTaskUpdated?: (task: Record<string, unknown>) => void
  onTasksSynced?: (data: { tasksCount: number; completedCount: number; progress: number }) => void
  onActivityCreated?: (activity: ActivityData) => void
  onNotificationNew?: (notification: NotificationData) => void
  // Typing indicator callbacks (T6.5)
  onTypingStart?: (data: TypingIndicatorData) => void
  onTypingStop?: (data: { userId: string; taskId: string; taskDisplayId: string }) => void
  // Task locking callbacks (T6.6)
  onTaskLocked?: (lock: TaskLockInfo) => void
  onTaskUnlocked?: (data: { taskId: string; taskUuid: string; unlockedBy: { id: string; email: string; name: string | null } | null }) => void
  onTaskLockExtended?: (lock: TaskLockInfo) => void
  onLocksList?: (locks: TaskLockInfo[]) => void
  onLockResult?: (result: TaskLockResult) => void
  onUnlockResult?: (result: { success: boolean; taskId: string }) => void
  // Presence callbacks (T7.8)
  onPresenceList?: (data: { users: UserPresence[]; onlineCount: number }) => void
  onPresenceJoined?: (data: { user: UserPresence; onlineCount: number }) => void
  onPresenceLeft?: (data: { userId: string; onlineCount: number }) => void
  onPresenceUpdated?: (data: { userId: string; status: PresenceStatus; lastActiveAt: string }) => void
  onWorkingOnChanged?: (data: { userId: string; workingOn: WorkingOnData | null }) => void
}

// Reconnection config
const INITIAL_RECONNECT_DELAY = 1000 // 1 second
const MAX_RECONNECT_DELAY = 30000 // 30 seconds
const PING_INTERVAL = 25000 // 25 seconds

/**
 * Convert HTTP URL to WebSocket URL
 */
function getWebSocketUrl(apiUrl: string): string {
  return apiUrl.replace(/^http/, 'ws')
}

/**
 * Hook to manage WebSocket connection for real-time project updates
 */
export function useProjectWebSocket({
  projectId,
  enabled = true,
  onConnected,
  onDisconnected,
  onTaskUpdated,
  onTasksSynced,
  onActivityCreated,
  onNotificationNew,
  onTypingStart,
  onTypingStop,
  // Task locking callbacks (T6.6)
  onTaskLocked,
  onTaskUnlocked,
  onTaskLockExtended,
  onLocksList,
  onLockResult,
  onUnlockResult,
  // Presence callbacks (T7.8)
  onPresenceList,
  onPresenceJoined,
  onPresenceLeft,
  onPresenceUpdated,
  onWorkingOnChanged,
}: UseProjectWebSocketOptions) {
  const queryClient = useQueryClient()
  const authStore = useAuthStore()

  // State
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)

  // Refs for WebSocket management
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY)
  const shouldReconnectRef = useRef(true)
  const isConnectingRef = useRef(false)

  // T10.5: Race condition fixes
  const connectionIdRef = useRef(0) // Unique ID for each connection attempt
  const isMountedRef = useRef(true) // Track if component is mounted
  const currentProjectIdRef = useRef(projectId) // Track current projectId to detect changes

  // Store callbacks in refs to avoid recreating connect function (T10.5)
  const callbacksRef = useRef({
    onConnected,
    onDisconnected,
    onTaskUpdated,
    onTasksSynced,
    onActivityCreated,
    onNotificationNew,
    onTypingStart,
    onTypingStop,
    onTaskLocked,
    onTaskUnlocked,
    onTaskLockExtended,
    onLocksList,
    onLockResult,
    onUnlockResult,
    onPresenceList,
    onPresenceJoined,
    onPresenceLeft,
    onPresenceUpdated,
    onWorkingOnChanged,
  })

  // Update callbacks ref when they change (T10.5)
  useEffect(() => {
    callbacksRef.current = {
      onConnected,
      onDisconnected,
      onTaskUpdated,
      onTasksSynced,
      onActivityCreated,
      onNotificationNew,
      onTypingStart,
      onTypingStop,
      onTaskLocked,
      onTaskUnlocked,
      onTaskLockExtended,
      onLocksList,
      onLockResult,
      onUnlockResult,
      onPresenceList,
      onPresenceJoined,
      onPresenceLeft,
      onPresenceUpdated,
      onWorkingOnChanged,
    }
  }, [onConnected, onDisconnected, onTaskUpdated, onTasksSynced, onActivityCreated, onNotificationNew, onTypingStart, onTypingStop, onTaskLocked, onTaskUnlocked, onTaskLockExtended, onLocksList, onLockResult, onUnlockResult, onPresenceList, onPresenceJoined, onPresenceLeft, onPresenceUpdated, onWorkingOnChanged])

  /**
   * Clean up timers and connection (T10.5 - safe cleanup)
   */
  const cleanup = useCallback(() => {
    // Clear reconnect timeout first to prevent new connection attempts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    // Clear ping interval
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
      pingIntervalRef.current = null
    }

    // Close WebSocket connection
    // T10.5: Use terminate-style close to avoid lingering connections
    if (wsRef.current) {
      const ws = wsRef.current
      wsRef.current = null // Clear ref first to prevent handlers from running

      // Remove handlers to prevent callbacks after cleanup
      ws.onopen = null
      ws.onmessage = null
      ws.onclose = null
      ws.onerror = null

      // Close the connection if it's not already closed
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000, 'Client cleanup')
      }
    }

    isConnectingRef.current = false
  }, [])

  /**
   * Connect to WebSocket server (T10.5 - Race condition fixes)
   */
  const connect = useCallback(async () => {
    // Generate unique connection ID to detect stale connections (T10.5)
    const thisConnectionId = ++connectionIdRef.current
    const targetProjectId = projectId // Capture projectId at start of connection

    // Prevent duplicate connections
    if (isConnectingRef.current) {
      return
    }

    // Check if already connected
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    // Check if already in CONNECTING state (T10.5 - prevent concurrent connection attempts)
    if (wsRef.current?.readyState === WebSocket.CONNECTING) {
      return
    }

    // Check if we should reconnect
    if (!shouldReconnectRef.current) {
      return
    }

    // Check if component is still mounted (T10.5)
    if (!isMountedRef.current) {
      return
    }

    isConnectingRef.current = true
    setStatus('connecting')

    // Get fresh token (will refresh if expired)
    let token = authStore.getToken()
    if (!token || authStore.isTokenExpired()) {
      const refreshed = await authStore.refreshAccessToken()

      // T10.5: Check for stale connection after async operation
      if (connectionIdRef.current !== thisConnectionId) {
        isConnectingRef.current = false
        return // A newer connection attempt has started
      }

      // T10.5: Check if still mounted after async operation
      if (!isMountedRef.current) {
        isConnectingRef.current = false
        return
      }

      // T10.5: Check if projectId changed during async operation
      if (targetProjectId !== currentProjectIdRef.current) {
        isConnectingRef.current = false
        return
      }

      if (!refreshed) {
        setStatus('error')
        isConnectingRef.current = false
        return
      }
      token = authStore.getToken()
    }

    if (!token) {
      setStatus('error')
      isConnectingRef.current = false
      return
    }

    // Build WebSocket URL (T10.1 - token moved to subprotocol for security)
    // Token is no longer in URL, preventing exposure in logs/browser history
    const wsBaseUrl = getWebSocketUrl(env.NEXT_PUBLIC_API_URL)
    const wsUrl = `${wsBaseUrl}/ws?projectId=${encodeURIComponent(targetProjectId)}`

    try {
      // Pass token via subprotocol (T10.1 - Security fix)
      // Format: "access_token.{JWT}" - this keeps token out of URL logs
      const ws = new WebSocket(wsUrl, [`access_token.${token}`])
      wsRef.current = ws

      ws.onopen = () => {
        // T10.5: Check for stale connection
        if (connectionIdRef.current !== thisConnectionId || !isMountedRef.current) {
          ws.close()
          return
        }

        setStatus('connected')
        isConnectingRef.current = false
        reconnectDelayRef.current = INITIAL_RECONNECT_DELAY // Reset reconnect delay

        // Start ping interval
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          }
        }, PING_INTERVAL)

        // Use ref for callback to avoid stale closure (T10.5)
        callbacksRef.current.onConnected?.()
      }

      ws.onmessage = (event) => {
        // T10.5: Check for stale connection
        if (connectionIdRef.current !== thisConnectionId || !isMountedRef.current) {
          return
        }

        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          setLastMessage(message)

          // Use callbacksRef to always get latest callbacks (T10.5)
          const callbacks = callbacksRef.current

          switch (message.type) {
            case 'connected':
              // Connection confirmed
              break

            case 'task_updated':
              // Invalidate tasks query to refetch
              queryClient.invalidateQueries({
                queryKey: projectTasksQueryKey(targetProjectId),
              })
              callbacks.onTaskUpdated?.(message.data?.['task'] as Record<string, unknown>)
              break

            case 'tasks_synced':
              // Invalidate both tasks and project queries
              queryClient.invalidateQueries({
                queryKey: projectTasksQueryKey(targetProjectId),
              })
              queryClient.invalidateQueries({
                queryKey: projectQueryKey(targetProjectId),
              })
              callbacks.onTasksSynced?.(message.data as { tasksCount: number; completedCount: number; progress: number })
              break

            case 'project_updated':
              // Invalidate project query
              queryClient.invalidateQueries({
                queryKey: projectQueryKey(targetProjectId),
              })
              break

            case 'pong':
              // Server responded to ping, connection is alive
              break

            case 'activity_created':
              // New activity was created - notify listeners
              callbacks.onActivityCreated?.(message.data?.['activity'] as ActivityData)
              break

            case 'notification_new':
              // New notification received - notify listeners (T6.7)
              callbacks.onNotificationNew?.(message.data?.['notification'] as NotificationData)
              break

            case 'comment_typing_start':
              // Someone started typing a comment (T6.5)
              callbacks.onTypingStart?.(message.data?.['typing'] as TypingIndicatorData)
              break

            case 'comment_typing_stop':
              // Someone stopped typing a comment (T6.5)
              callbacks.onTypingStop?.(message.data as { userId: string; taskId: string; taskDisplayId: string })
              break

            // Task locking messages (T6.6)
            case 'task_locked':
              callbacks.onTaskLocked?.(message.data?.['lock'] as TaskLockInfo)
              break

            case 'task_unlocked':
              callbacks.onTaskUnlocked?.(message.data as unknown as { taskId: string; taskUuid: string; unlockedBy: { id: string; email: string; name: string | null } | null })
              break

            case 'task_lock_extended':
              callbacks.onTaskLockExtended?.(message.data?.['lock'] as TaskLockInfo)
              break

            case 'locks_list':
              callbacks.onLocksList?.(message.data?.['locks'] as TaskLockInfo[])
              break

            case 'task_lock_result':
              callbacks.onLockResult?.(message.data as unknown as TaskLockResult)
              break

            case 'task_unlock_result':
              callbacks.onUnlockResult?.(message.data as unknown as { success: boolean; taskId: string })
              break

            case 'task_lock_extend_result':
              // Just acknowledge - no callback needed
              break

            // Presence messages (T7.8)
            case 'presence_list':
              callbacks.onPresenceList?.(message.data as { users: UserPresence[]; onlineCount: number })
              break

            case 'presence_joined':
              callbacks.onPresenceJoined?.(message.data as { user: UserPresence; onlineCount: number })
              break

            case 'presence_left':
              callbacks.onPresenceLeft?.(message.data as { userId: string; onlineCount: number })
              break

            case 'presence_updated':
              callbacks.onPresenceUpdated?.(message.data as { userId: string; status: PresenceStatus; lastActiveAt: string })
              break

            case 'working_on_changed':
              callbacks.onWorkingOnChanged?.(message.data as { userId: string; workingOn: WorkingOnData | null })
              break
          }
        } catch {
          // Ignore parse errors
        }
      }

      ws.onclose = (event) => {
        // T10.5: Only handle close for current connection
        if (connectionIdRef.current !== thisConnectionId) {
          return
        }

        cleanup()

        // T10.5: Check if still mounted before updating state
        if (!isMountedRef.current) {
          return
        }

        setStatus('disconnected')
        callbacksRef.current.onDisconnected?.()

        // Reconnect with exponential backoff if we should
        if (shouldReconnectRef.current && event.code !== 4001) {
          // 4001 is auth error
          reconnectTimeoutRef.current = setTimeout(() => {
            // T10.5: Double-check conditions before reconnecting
            if (!isMountedRef.current || !shouldReconnectRef.current) {
              return
            }
            reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, MAX_RECONNECT_DELAY)
            connect()
          }, reconnectDelayRef.current)
        }
      }

      ws.onerror = () => {
        // T10.5: Check for stale connection
        if (connectionIdRef.current !== thisConnectionId || !isMountedRef.current) {
          return
        }
        setStatus('error')
        isConnectingRef.current = false
      }
    } catch {
      // T10.5: Check if still mounted before updating state
      if (isMountedRef.current) {
        setStatus('error')
      }
      isConnectingRef.current = false
    }
  }, [projectId, authStore, queryClient, cleanup]) // T10.5: Removed callback dependencies to prevent reconnection loops

  /**
   * Disconnect from WebSocket server (T10.5 - increments connectionId to invalidate pending connections)
   */
  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false
    connectionIdRef.current++ // T10.5: Invalidate any pending connection attempts
    cleanup()
    if (isMountedRef.current) {
      setStatus('disconnected')
    }
  }, [cleanup])

  /**
   * Manual reconnect (resets reconnect delay) (T10.5 - properly handles reconnection)
   */
  const reconnect = useCallback(() => {
    connectionIdRef.current++ // T10.5: Invalidate any pending connection attempts
    cleanup()
    reconnectDelayRef.current = INITIAL_RECONNECT_DELAY
    shouldReconnectRef.current = true
    // T10.5: Small delay to ensure cleanup completes before reconnecting
    setTimeout(() => {
      if (isMountedRef.current && shouldReconnectRef.current) {
        connect()
      }
    }, 50)
  }, [cleanup, connect])

  // T10.5: Track mounted state
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // T10.5: Handle projectId changes - disconnect old, connect new
  useEffect(() => {
    const previousProjectId = currentProjectIdRef.current
    currentProjectIdRef.current = projectId

    // If projectId changed, we need to disconnect from old project
    if (previousProjectId !== projectId && previousProjectId) {
      connectionIdRef.current++ // Invalidate old connection
      cleanup()
    }
  }, [projectId, cleanup])

  // Connect on mount/enable, disconnect on unmount/disable (T10.5 - stable dependencies)
  useEffect(() => {
    if (!enabled || !projectId) {
      // If disabled, disconnect
      if (wsRef.current) {
        connectionIdRef.current++
        cleanup()
        setStatus('disconnected')
      }
      return
    }

    shouldReconnectRef.current = true

    // T10.5: Small delay to batch rapid changes
    const connectTimeout = setTimeout(() => {
      if (isMountedRef.current && enabled && projectId) {
        connect()
      }
    }, 10)

    return () => {
      clearTimeout(connectTimeout)
      shouldReconnectRef.current = false
      connectionIdRef.current++ // T10.5: Invalidate pending connections
      cleanup()
    }
  }, [enabled, projectId, connect, cleanup])

  // Reconnect if auth state changes (T10.5 - debounced to prevent rapid reconnection attempts)
  useEffect(() => {
    if (!enabled || !projectId) {
      return
    }

    // If we're disconnected/error and user is authenticated, try to reconnect
    if ((status === 'disconnected' || status === 'error') && authStore.isAuthenticated) {
      // T10.5: Debounce reconnection to prevent rapid attempts
      const reconnectTimeout = setTimeout(() => {
        if (isMountedRef.current && shouldReconnectRef.current && !isConnectingRef.current) {
          connect()
        }
      }, 100)

      return () => clearTimeout(reconnectTimeout)
    }
  }, [enabled, projectId, status, authStore.isAuthenticated, connect])

  /**
   * Send typing start message (T6.5)
   */
  const sendTypingStart = useCallback((taskId: string, taskDisplayId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'comment_typing_start',
        taskId,
        taskDisplayId,
      }))
    }
  }, [])

  /**
   * Send typing stop message (T6.5)
   */
  const sendTypingStop = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'comment_typing_stop',
      }))
    }
  }, [])

  /**
   * Request a task lock (T6.6)
   */
  const sendTaskLock = useCallback((taskId: string, taskUuid: string, taskName?: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'task_lock',
        taskId,
        taskUuid,
        taskName,
      }))
    }
  }, [])

  /**
   * Release a task lock (T6.6)
   */
  const sendTaskUnlock = useCallback((taskId: string, taskUuid?: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'task_unlock',
        taskId,
        taskUuid,
      }))
    }
  }, [])

  /**
   * Extend a task lock (T6.6)
   */
  const sendTaskLockExtend = useCallback((taskId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'task_lock_extend',
        taskId,
      }))
    }
  }, [])

  return {
    status,
    isConnected: status === 'connected',
    lastMessage,
    reconnect,
    disconnect,
    // Typing indicator methods (T6.5)
    sendTypingStart,
    sendTypingStop,
    // Task locking methods (T6.6)
    sendTaskLock,
    sendTaskUnlock,
    sendTaskLockExtend,
  }
}
