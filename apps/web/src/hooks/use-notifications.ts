'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/lib/auth-api'
import { useCallback, useState, useEffect } from 'react'
import type { NotificationData } from './use-websocket'

// Re-export NotificationData for convenience
export type { NotificationData }

export interface Notification {
  id: string
  type: 'mention' | 'assignment' | 'comment' | 'status_change' | string
  title: string
  body: string | null
  link: string | null
  readAt: string | null
  createdAt: string
}

interface NotificationsResponse {
  success: boolean
  data: {
    notifications: Notification[]
    unreadCount: number
    total: number
  }
}

interface MarkReadResponse {
  success: boolean
  data: {
    message: string
    readCount?: number
  }
}

// Query key for notifications
export const notificationsQueryKey = (limit?: number) => ['notifications', { limit }]
export const unreadCountQueryKey = ['notifications', 'unread-count']

/**
 * Hook to fetch and manage notifications
 */
export function useNotifications(options?: { limit?: number; enabled?: boolean }) {
  const { limit = 10, enabled = true } = options || {}
  const queryClient = useQueryClient()

  // Track locally added notifications (from WebSocket) before next fetch
  const [realtimeNotifications, setRealtimeNotifications] = useState<Notification[]>([])

  const query = useQuery({
    queryKey: notificationsQueryKey(limit),
    queryFn: async () => {
      const response = await authApi.get<NotificationsResponse>(
        `/notifications?limit=${limit}`
      )
      return response.data
    },
    enabled,
    staleTime: 30000, // Consider data stale after 30 seconds
    refetchInterval: 60000, // Refetch every minute
  })

  // Clear realtime notifications when query refetches
  useEffect(() => {
    if (query.data) {
      setRealtimeNotifications([])
    }
  }, [query.data])

  // Mutation to mark single notification as read
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      return authApi.patch<MarkReadResponse>(`/notifications/${notificationId}/read`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationsQueryKey(limit) })
      queryClient.invalidateQueries({ queryKey: unreadCountQueryKey })
    },
  })

  // Mutation to mark all notifications as read
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      return authApi.patch<MarkReadResponse>('/notifications/read-all')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationsQueryKey(limit) })
      queryClient.invalidateQueries({ queryKey: unreadCountQueryKey })
    },
  })

  /**
   * Add a real-time notification (from WebSocket)
   * This shows immediately while the next API fetch brings it properly
   */
  const addRealtimeNotification = useCallback((notification: NotificationData) => {
    const fullNotification: Notification = {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      link: notification.link,
      readAt: null,
      createdAt: notification.createdAt,
    }

    setRealtimeNotifications((prev) => {
      // Avoid duplicates
      if (prev.some((n) => n.id === notification.id)) {
        return prev
      }
      return [fullNotification, ...prev]
    })

    // Update unread count optimistically
    queryClient.setQueryData(unreadCountQueryKey, (old: number | undefined) => (old || 0) + 1)

    // Invalidate queries to fetch fresh data
    queryClient.invalidateQueries({ queryKey: notificationsQueryKey(limit) })
  }, [queryClient, limit])

  // Combine realtime and fetched notifications
  const allNotifications = [
    ...realtimeNotifications,
    ...(query.data?.notifications || []).filter(
      (n) => !realtimeNotifications.some((rt) => rt.id === n.id)
    ),
  ]

  // Calculate unread count
  const unreadCount =
    realtimeNotifications.length +
    (query.data?.notifications.filter((n) => !n.readAt).length || 0)

  return {
    notifications: allNotifications,
    unreadCount,
    total: query.data?.total || 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    markAsRead: markAsReadMutation.mutate,
    markAllAsRead: markAllAsReadMutation.mutate,
    isMarkingRead: markAsReadMutation.isPending,
    isMarkingAllRead: markAllAsReadMutation.isPending,
    addRealtimeNotification,
  }
}

/**
 * Hook to get just the unread notification count (lightweight)
 */
export function useUnreadNotificationCount(enabled = true) {
  const query = useQuery({
    queryKey: unreadCountQueryKey,
    queryFn: async () => {
      const response = await authApi.get<NotificationsResponse>(
        '/notifications?limit=1&unread=true'
      )
      return response.data.unreadCount
    },
    enabled,
    staleTime: 30000,
    refetchInterval: 60000,
  })

  return {
    count: query.data || 0,
    isLoading: query.isLoading,
    refetch: query.refetch,
  }
}
