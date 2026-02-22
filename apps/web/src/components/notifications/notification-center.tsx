'use client'

import * as React from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import {
  Bell,
  CheckCheck,
  MessageSquare,
  UserPlus,
  RefreshCw,
  AtSign,
  AlertCircle,
  Loader2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { NotificationListSkeleton } from '@/components/ui/loading-skeletons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useNotifications, type Notification } from '@/hooks/use-notifications'

// Get icon based on notification type
function getNotificationIcon(type: string) {
  switch (type) {
    case 'mention':
      return <AtSign className="h-4 w-4 text-blue-500" aria-hidden="true" />
    case 'assignment':
      return <UserPlus className="h-4 w-4 text-green-500" aria-hidden="true" />
    case 'comment':
      return <MessageSquare className="h-4 w-4 text-gray-500" aria-hidden="true" />
    case 'status_change':
      return <RefreshCw className="h-4 w-4 text-blue-500" aria-hidden="true" />
    default:
      return <Bell className="h-4 w-4 text-gray-500" aria-hidden="true" />
  }
}

// Get notification type label for screen readers
function getNotificationTypeLabel(type: string): string {
  switch (type) {
    case 'mention':
      return 'Mention'
    case 'assignment':
      return 'Task assignment'
    case 'comment':
      return 'Comment'
    case 'status_change':
      return 'Status change'
    default:
      return 'Notification'
  }
}

// Format relative time
function formatTime(dateString: string): string {
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true })
  } catch {
    return 'Just now'
  }
}

// Single notification item
function NotificationItem({
  notification,
  onMarkRead,
  onClose,
}: {
  notification: Notification
  onMarkRead: (id: string) => void
  onClose: () => void
}) {
  const isUnread = !notification.readAt
  const typeLabel = getNotificationTypeLabel(notification.type)
  const timeAgo = formatTime(notification.createdAt)

  const handleClick = () => {
    if (isUnread) {
      onMarkRead(notification.id)
    }
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }

  // Build accessible label
  const accessibleLabel = `${typeLabel}: ${notification.title}${isUnread ? ', unread' : ''}, ${timeAgo}`

  const content = (
    <div
      role="article"
      tabIndex={0}
      className={cn(
        'flex gap-3 p-3 rounded-md transition-colors cursor-pointer',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset',
        isUnread ? 'bg-blue-50/50 hover:bg-blue-50' : 'hover:bg-muted/50'
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={accessibleLabel}
    >
      <div className="flex-shrink-0 mt-0.5">
        {getNotificationIcon(notification.type)}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'text-sm leading-tight',
            isUnread ? 'font-medium text-foreground' : 'text-muted-foreground'
          )}
        >
          {notification.title}
        </p>
        {notification.body && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {notification.body}
          </p>
        )}
        <p className="text-xs text-muted-foreground/70 mt-1">
          {timeAgo}
        </p>
      </div>
      {isUnread && (
        <div className="flex-shrink-0" aria-hidden="true">
          <div className="h-2 w-2 rounded-full bg-blue-500" title="Unread" />
        </div>
      )}
    </div>
  )

  // If notification has a link, wrap in Link component
  if (notification.link) {
    return (
      <Link
        href={notification.link}
        className="block focus:outline-none"
        aria-label={`${accessibleLabel}. Click to view details.`}
        onClick={handleClick}
      >
        {content}
      </Link>
    )
  }

  return content
}

// Empty state
function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center py-8 px-4 text-center"
      role="status"
      aria-label="No notifications"
    >
      <Bell className="h-10 w-10 text-muted-foreground/40 mb-3" aria-hidden="true" />
      <p className="text-sm font-medium text-muted-foreground">No notifications</p>
      <p className="text-xs text-muted-foreground/70 mt-1">
        You&apos;re all caught up!
      </p>
    </div>
  )
}

// Error state
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="flex flex-col items-center justify-center py-8 px-4 text-center"
      role="alert"
      aria-live="polite"
    >
      <AlertCircle className="h-10 w-10 text-red-400 mb-3" aria-hidden="true" />
      <p className="text-sm font-medium text-muted-foreground">Failed to load notifications</p>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRetry}
        className="mt-2"
        aria-label="Retry loading notifications"
      >
        Try again
      </Button>
    </div>
  )
}

// Loading state - now uses skeleton for better UX
function LoadingState() {
  return <NotificationListSkeleton count={5} />
}

/**
 * Notification Center - Bell icon with dropdown showing notifications
 */
export function NotificationCenter() {
  const [open, setOpen] = React.useState(false)
  const {
    notifications,
    unreadCount,
    isLoading,
    isError,
    refetch,
    markAsRead,
    markAllAsRead,
    isMarkingAllRead,
  } = useNotifications({ limit: 10, enabled: true })

  const handleClose = () => setOpen(false)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 flex items-center justify-center text-[10px] font-semibold"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="w-80 p-0"
        align="end"
        forceMount
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <DropdownMenuLabel className="p-0 font-semibold">
            Notifications
          </DropdownMenuLabel>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto py-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => markAllAsRead()}
              disabled={isMarkingAllRead}
              aria-label={`Mark all ${unreadCount} notifications as read`}
            >
              {isMarkingAllRead ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCheck className="h-3 w-3 mr-1" aria-hidden="true" />
              )}
              <span>Mark all read</span>
            </Button>
          )}
        </div>

        {/* Notification List with live region for updates */}
        <ScrollArea className="max-h-[400px]">
          <div
            aria-live="polite"
            aria-atomic="false"
            aria-relevant="additions removals"
          >
            {isLoading ? (
              <LoadingState />
            ) : isError ? (
              <ErrorState onRetry={refetch} />
            ) : notifications.length === 0 ? (
              <EmptyState />
            ) : (
              <div
                className="py-1"
                role="feed"
                aria-label={`${notifications.length} notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
              >
                {notifications.map((notification, index) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkRead={markAsRead}
                    onClose={handleClose}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        {notifications.length > 0 && (
          <>
            <DropdownMenuSeparator className="m-0" />
            <DropdownMenuItem asChild className="justify-center py-3">
              <Link
                href="/dashboard/notifications"
                className="text-sm text-primary hover:text-primary"
                onClick={handleClose}
              >
                View all notifications
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
