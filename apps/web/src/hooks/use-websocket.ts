'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth-store'
import { env } from '@/env'
import { projectTasksQueryKey, projectQueryKey } from './use-projects'

// WebSocket message types from server
interface WebSocketMessage {
  type: 'connected' | 'task_updated' | 'tasks_synced' | 'project_updated' | 'pong'
  projectId: string
  timestamp: string
  data?: Record<string, unknown>
}

// Connection states
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

// Hook options
interface UseProjectWebSocketOptions {
  projectId: string
  enabled?: boolean
  onConnected?: () => void
  onDisconnected?: () => void
  onTaskUpdated?: (task: Record<string, unknown>) => void
  onTasksSynced?: (data: { tasksCount: number; completedCount: number; progress: number }) => void
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
        console.warn('[WS] Failed to refresh token, cannot connect')
        setStatus('error')
        isConnectingRef.current = false
        return
      }
      token = authStore.getToken()
    }

    if (!token) {
      console.warn('[WS] No token available, cannot connect')
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
        console.log('[WS] Connected to project:', projectId)
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
              console.log('[WS] Confirmed connected to project:', message.data?.['projectName'])
              break

            case 'task_updated':
              console.log('[WS] Task updated:', message.data?.['task'])
              // Invalidate tasks query to refetch
              queryClient.invalidateQueries({
                queryKey: projectTasksQueryKey(projectId),
              })
              onTaskUpdated?.(message.data?.['task'] as Record<string, unknown>)
              break

            case 'tasks_synced':
              console.log('[WS] Tasks synced:', message.data)
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
              console.log('[WS] Project updated:', message.data)
              // Invalidate project query
              queryClient.invalidateQueries({
                queryKey: projectQueryKey(projectId),
              })
              break

            case 'pong':
              // Server responded to ping, connection is alive
              break

            default:
              console.log('[WS] Unknown message type:', message.type)
          }
        } catch (err) {
          console.error('[WS] Failed to parse message:', err)
        }
      }

      ws.onclose = (event) => {
        console.log('[WS] Disconnected:', event.code, event.reason)
        cleanup()
        setStatus('disconnected')
        onDisconnected?.()

        // Reconnect with exponential backoff if we should
        if (shouldReconnectRef.current && event.code !== 4001) {
          // 4001 is auth error
          console.log(`[WS] Reconnecting in ${reconnectDelayRef.current}ms...`)
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, MAX_RECONNECT_DELAY)
            connect()
          }, reconnectDelayRef.current)
        }
      }

      ws.onerror = (error) => {
        console.error('[WS] Error:', error)
        setStatus('error')
        isConnectingRef.current = false
      }
    } catch (err) {
      console.error('[WS] Failed to create WebSocket:', err)
      setStatus('error')
      isConnectingRef.current = false
    }
  }, [projectId, authStore, queryClient, cleanup, onConnected, onDisconnected, onTaskUpdated, onTasksSynced])

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

  return {
    status,
    isConnected: status === 'connected',
    lastMessage,
    reconnect,
    disconnect,
  }
}
