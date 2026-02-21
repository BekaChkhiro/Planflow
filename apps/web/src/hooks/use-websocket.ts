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

  /**
   * Clean up timers and connection
   */
  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
      pingIntervalRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    isConnectingRef.current = false
  }, [])

  /**
   * Connect to WebSocket server
   */
  const connect = useCallback(async () => {
    // Prevent duplicate connections
    if (isConnectingRef.current || wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    // Check if we should reconnect
    if (!shouldReconnectRef.current) {
      return
    }

    isConnectingRef.current = true
    setStatus('connecting')

    // Get fresh token (will refresh if expired)
    let token = authStore.getToken()
    if (!token || authStore.isTokenExpired()) {
      const refreshed = await authStore.refreshAccessToken()
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

    // Build WebSocket URL
    const wsBaseUrl = getWebSocketUrl(env.NEXT_PUBLIC_API_URL)
    const wsUrl = `${wsBaseUrl}/ws?token=${encodeURIComponent(token)}&projectId=${encodeURIComponent(projectId)}`

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setStatus('connected')
        isConnectingRef.current = false
        reconnectDelayRef.current = INITIAL_RECONNECT_DELAY // Reset reconnect delay

        // Start ping interval
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          }
        }, PING_INTERVAL)

        onConnected?.()
      }

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          setLastMessage(message)

          switch (message.type) {
            case 'connected':
              // Connection confirmed
              break

            case 'task_updated':
              // Invalidate tasks query to refetch
              queryClient.invalidateQueries({
                queryKey: projectTasksQueryKey(projectId),
              })
              onTaskUpdated?.(message.data?.['task'] as Record<string, unknown>)
              break

            case 'tasks_synced':
              // Invalidate both tasks and project queries
              queryClient.invalidateQueries({
                queryKey: projectTasksQueryKey(projectId),
              })
              queryClient.invalidateQueries({
                queryKey: projectQueryKey(projectId),
              })
              onTasksSynced?.(message.data as { tasksCount: number; completedCount: number; progress: number })
              break

            case 'project_updated':
              // Invalidate project query
              queryClient.invalidateQueries({
                queryKey: projectQueryKey(projectId),
              })
              break

            case 'pong':
              // Server responded to ping, connection is alive
              break

            case 'activity_created':
              // New activity was created - notify listeners
              onActivityCreated?.(message.data?.['activity'] as ActivityData)
              break

            case 'notification_new':
              // New notification received - notify listeners (T6.7)
              onNotificationNew?.(message.data?.['notification'] as NotificationData)
              break

            case 'comment_typing_start':
              // Someone started typing a comment (T6.5)
              onTypingStart?.(message.data?.['typing'] as TypingIndicatorData)
              break

            case 'comment_typing_stop':
              // Someone stopped typing a comment (T6.5)
              onTypingStop?.(message.data as { userId: string; taskId: string; taskDisplayId: string })
              break

            // Task locking messages (T6.6)
            case 'task_locked':
              onTaskLocked?.(message.data?.['lock'] as TaskLockInfo)
              break

            case 'task_unlocked':
              onTaskUnlocked?.(message.data as unknown as { taskId: string; taskUuid: string; unlockedBy: { id: string; email: string; name: string | null } | null })
              break

            case 'task_lock_extended':
              onTaskLockExtended?.(message.data?.['lock'] as TaskLockInfo)
              break

            case 'locks_list':
              onLocksList?.(message.data?.['locks'] as TaskLockInfo[])
              break

            case 'task_lock_result':
              onLockResult?.(message.data as unknown as TaskLockResult)
              break

            case 'task_unlock_result':
              onUnlockResult?.(message.data as unknown as { success: boolean; taskId: string })
              break

            case 'task_lock_extend_result':
              // Just acknowledge - no callback needed
              break

            // Presence messages (T7.8)
            case 'presence_list':
              onPresenceList?.(message.data as { users: UserPresence[]; onlineCount: number })
              break

            case 'presence_joined':
              onPresenceJoined?.(message.data as { user: UserPresence; onlineCount: number })
              break

            case 'presence_left':
              onPresenceLeft?.(message.data as { userId: string; onlineCount: number })
              break

            case 'presence_updated':
              onPresenceUpdated?.(message.data as { userId: string; status: PresenceStatus; lastActiveAt: string })
              break

            case 'working_on_changed':
              onWorkingOnChanged?.(message.data as { userId: string; workingOn: WorkingOnData | null })
              break
          }
        } catch {
          // Ignore parse errors
        }
      }

      ws.onclose = (event) => {
        cleanup()
        setStatus('disconnected')
        onDisconnected?.()

        // Reconnect with exponential backoff if we should
        if (shouldReconnectRef.current && event.code !== 4001) {
          // 4001 is auth error
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, MAX_RECONNECT_DELAY)
            connect()
          }, reconnectDelayRef.current)
        }
      }

      ws.onerror = () => {
        setStatus('error')
        isConnectingRef.current = false
      }
    } catch {
      setStatus('error')
      isConnectingRef.current = false
    }
  }, [projectId, authStore, queryClient, cleanup, onConnected, onDisconnected, onTaskUpdated, onTasksSynced, onActivityCreated, onNotificationNew, onTypingStart, onTypingStop, onTaskLocked, onTaskUnlocked, onTaskLockExtended, onLocksList, onLockResult, onUnlockResult, onPresenceList, onPresenceJoined, onPresenceLeft, onPresenceUpdated, onWorkingOnChanged])

  /**
   * Disconnect from WebSocket server
   */
  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false
    cleanup()
    setStatus('disconnected')
  }, [cleanup])

  /**
   * Manual reconnect (resets reconnect delay)
   */
  const reconnect = useCallback(() => {
    cleanup()
    reconnectDelayRef.current = INITIAL_RECONNECT_DELAY
    shouldReconnectRef.current = true
    connect()
  }, [cleanup, connect])

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    if (!enabled || !projectId) {
      return
    }

    shouldReconnectRef.current = true
    connect()

    return () => {
      shouldReconnectRef.current = false
      cleanup()
    }
  }, [enabled, projectId, connect, cleanup])

  // Reconnect if auth state changes
  useEffect(() => {
    if (!enabled || !projectId) {
      return
    }

    // If we're disconnected and user is authenticated, try to reconnect
    if (status === 'disconnected' && authStore.isAuthenticated) {
      shouldReconnectRef.current = true
      connect()
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
