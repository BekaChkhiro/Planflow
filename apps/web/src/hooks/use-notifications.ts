'use client'

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/lib/auth-api'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/error-utils'
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

interface NotificationsPagination {
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

interface NotificationsResponse {
  success: boolean
  data: {
    notifications: Notification[]
    unreadCount: number
    pagination: NotificationsPagination
  }
}

// Page size for infinite scroll
export const NOTIFICATIONS_PAGE_SIZE = 20

interface MarkReadResponse {
  success: boolean
  data: {
    message: string
    readCount?: number
  }
}

// Query keys for notifications
export const notificationsQueryKey = (limit?: number) => ['notifications', { limit }]
export const notificationsInfiniteQueryKey = (pageSize?: number) => ['notifications', 'infinite', { pageSize }]
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
    // T13.1: Optimized caching - WebSocket handles real-time updates
    staleTime: 2 * 60 * 1000, // 2 minutes - data is fresh
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache longer
    refetchInterval: 5 * 60 * 1000, // 5 minutes - fallback polling when WS unavailable
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
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error))
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
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error))
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
    total: query.data?.pagination?.total || 0,
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
    // T13.1: Optimized caching - WebSocket handles real-time count updates
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchInterval: 5 * 60 * 1000, // 5 minutes fallback
  })

  return {
    count: query.data || 0,
    isLoading: query.isLoading,
    refetch: query.refetch,
  }
}

/**
 * Hook for paginated notifications with infinite scroll (T13.4)
 * Uses offset-based pagination with "Load More" pattern
 */
export interface UseNotificationsInfiniteOptions {
  pageSize?: number
  enabled?: boolean
}

export function useNotificationsInfinite(options: UseNotificationsInfiniteOptions = {}) {
  const { pageSize = NOTIFICATIONS_PAGE_SIZE, enabled = true } = options
  const queryClient = useQueryClient()

  const query = useInfiniteQuery({
    queryKey: notificationsInfiniteQueryKey(pageSize),
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams()
      params.set('limit', String(pageSize))
      params.set('offset', String(pageParam))

      const response = await authApi.get<NotificationsResponse>(
        `/notifications?${params.toString()}`
      )
      return response.data
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      // Calculate the next offset based on current pagination
      const { pagination } = lastPage
      if (pagination.hasMore) {
        return pagination.offset + pagination.limit
      }
      return undefined // No more pages
    },
    enabled,
    // T13.1: Optimized caching
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })

  // Mutation to mark single notification as read
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      return authApi.patch<MarkReadResponse>(`/notifications/${notificationId}/read`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationsInfiniteQueryKey(pageSize) })
      queryClient.invalidateQueries({ queryKey: unreadCountQueryKey })
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error))
    },
  })

  // Mutation to mark all notifications as read
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      return authApi.patch<MarkReadResponse>('/notifications/read-all')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationsInfiniteQueryKey(pageSize) })
      queryClient.invalidateQueries({ queryKey: unreadCountQueryKey })
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error))
    },
  })

  // Flatten all pages into a single notifications array
  const notifications = query.data?.pages.flatMap((page) => page.notifications) ?? []

  // Get pagination info from the last page
  const lastPage = query.data?.pages[query.data.pages.length - 1]
  const pagination = lastPage?.pagination

  // Calculate total unread from first page (most accurate)
  const unreadCount = query.data?.pages[0]?.unreadCount ?? 0

  return {
    notifications,
    unreadCount,
    total: pagination?.total ?? 0,
    pagination,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    // Infinite scroll helpers
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    // Mutation actions
    markAsRead: markAsReadMutation.mutate,
    markAllAsRead: markAllAsReadMutation.mutate,
    isMarkingRead: markAsReadMutation.isPending,
    isMarkingAllRead: markAllAsReadMutation.isPending,
  }
}
