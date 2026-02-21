'use client'

import { useCallback } from 'react'
import { Bell, UserPlus, MessageSquare, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import type { NotificationData } from '@/hooks/use-websocket'

/**
 * Get toast configuration based on notification type
 */
function getNotificationConfig(type: NotificationData['type']) {
  switch (type) {
    case 'mention':
      return {
        variant: 'info' as const,
        icon: Bell,
        iconColor: 'text-blue-500',
        duration: 6000,
      }
    case 'assignment':
      return {
        variant: 'success' as const,
        icon: UserPlus,
        iconColor: 'text-green-500',
        duration: 6000,
      }
    case 'comment':
      return {
        variant: 'default' as const,
        icon: MessageSquare,
        iconColor: 'text-gray-500',
        duration: 5000,
      }
    case 'status_change':
      return {
        variant: 'info' as const,
        icon: RefreshCw,
        iconColor: 'text-blue-500',
        duration: 5000,
      }
    case 'task_completed':
      return {
        variant: 'success' as const,
        icon: CheckCircle,
        iconColor: 'text-green-500',
        duration: 5000,
      }
    case 'task_blocked':
      return {
        variant: 'warning' as const,
        icon: AlertCircle,
        iconColor: 'text-yellow-500',
        duration: 6000,
      }
    default:
      return {
        variant: 'default' as const,
        icon: Bell,
        iconColor: 'text-gray-500',
        duration: 5000,
      }
  }
}

/**
 * Hook to display notification toasts
 * Returns a callback that can be passed to useProjectWebSocket's onNotificationNew
 */
export function useNotificationToasts() {
  const showNotificationToast = useCallback((notification: NotificationData) => {
    const config = getNotificationConfig(notification.type)
    const Icon = config.icon

    toast({
      title: notification.title,
      description: notification.body || undefined,
      variant: config.variant,
      duration: config.duration,
      icon: <Icon className={`h-5 w-5 ${config.iconColor}`} />,
    })
  }, [])

  return { showNotificationToast }
}

/**
 * Standalone function to show a notification toast
 * Useful when you don't need the hook pattern
 */
export function showNotificationToast(notification: NotificationData) {
  const config = getNotificationConfig(notification.type)
  const Icon = config.icon

  toast({
    title: notification.title,
    description: notification.body || undefined,
    variant: config.variant,
    duration: config.duration,
    icon: <Icon className={`h-5 w-5 ${config.iconColor}`} />,
  })
}

/**
 * Helper to show a quick success toast
 */
export function showSuccessToast(title: string, description?: string) {
  toast({
    title,
    description,
    variant: 'success',
    duration: 4000,
    icon: <CheckCircle className="h-5 w-5 text-green-500" />,
  })
}

/**
 * Helper to show a quick info toast
 */
export function showInfoToast(title: string, description?: string) {
  toast({
    title,
    description,
    variant: 'info',
    duration: 4000,
    icon: <Bell className="h-5 w-5 text-blue-500" />,
  })
}

/**
 * Helper to show a quick warning toast
 */
export function showWarningToast(title: string, description?: string) {
  toast({
    title,
    description,
    variant: 'warning',
    duration: 5000,
    icon: <AlertCircle className="h-5 w-5 text-yellow-500" />,
  })
}

/**
 * Helper to show a quick error toast
 */
export function showErrorToast(title: string, description?: string) {
  toast({
    title,
    description,
    variant: 'destructive',
    duration: 6000,
    icon: <AlertCircle className="h-5 w-5 text-red-500" />,
  })
}
