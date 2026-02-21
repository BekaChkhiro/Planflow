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
  ArrowLeft,
  Check,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useNotifications, type Notification } from '@/hooks/use-notifications'

// Get icon based on notification type
function getNotificationIcon(type: string) {
  switch (type) {
    case 'mention':
      return <AtSign className="h-5 w-5 text-blue-500" />
    case 'assignment':
      return <UserPlus className="h-5 w-5 text-green-500" />
    case 'comment':
      return <MessageSquare className="h-5 w-5 text-gray-500" />
    case 'status_change':
      return <RefreshCw className="h-5 w-5 text-blue-500" />
    default:
      return <Bell className="h-5 w-5 text-gray-500" />
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

// Get notification type label
function getTypeLabel(type: string): string {
  switch (type) {
    case 'mention':
      return 'Mention'
    case 'assignment':
      return 'Assignment'
    case 'comment':
      return 'Comment'
    case 'status_change':
      return 'Status Change'
    default:
      return 'Notification'
  }
}

// Single notification card
function NotificationCard({
  notification,
  onMarkRead,
}: {
  notification: Notification
  onMarkRead: (id: string) => void
}) {
  const isUnread = !notification.readAt

  const content = (
    <Card
      className={cn(
        'transition-colors',
        isUnread ? 'bg-blue-50/30 border-blue-100' : 'hover:bg-muted/30'
      )}
    >
      <CardContent className="p-4">
        <div className="flex gap-4">
          <div className="flex-shrink-0 mt-0.5">
            <div
              className={cn(
                'h-10 w-10 rounded-full flex items-center justify-center',
                isUnread ? 'bg-blue-100' : 'bg-muted'
              )}
            >
              {getNotificationIcon(notification.type)}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'text-xs px-2 py-0.5 rounded-full',
                      isUnread
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {getTypeLabel(notification.type)}
                  </span>
                  {isUnread && (
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                  )}
                </div>
                <h3
                  className={cn(
                    'mt-1 text-sm',
                    isUnread ? 'font-semibold text-foreground' : 'text-foreground'
                  )}
                >
                  {notification.title}
                </h3>
                {notification.body && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {notification.body}
                  </p>
                )}
                <p className="mt-2 text-xs text-muted-foreground/70">
                  {formatTime(notification.createdAt)}
                </p>
              </div>
              {isUnread && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-shrink-0 h-8 px-2"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onMarkRead(notification.id)
                  }}
                >
                  <Check className="h-4 w-4 mr-1" />
                  Mark read
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )

  if (notification.link) {
    return (
      <Link href={notification.link} className="block">
        {content}
      </Link>
    )
  }

  return content
}

// Loading skeleton
function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex gap-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// Empty state
function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16">
        <Bell className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground">No notifications</h3>
        <p className="text-sm text-muted-foreground/70 mt-1">
          You&apos;re all caught up! New notifications will appear here.
        </p>
      </CardContent>
    </Card>
  )
}

// Error state
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16">
        <AlertCircle className="h-16 w-16 text-red-400 mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground">
          Failed to load notifications
        </h3>
        <p className="text-sm text-muted-foreground/70 mt-1">
          Something went wrong. Please try again.
        </p>
        <Button variant="outline" onClick={onRetry} className="mt-4">
          <RefreshCw className="h-4 w-4 mr-2" />
          Try again
        </Button>
      </CardContent>
    </Card>
  )
}

export default function NotificationsPage() {
  const {
    notifications,
    unreadCount,
    isLoading,
    isError,
    refetch,
    markAsRead,
    markAllAsRead,
    isMarkingAllRead,
  } = useNotifications({ limit: 50 })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
            <p className="text-sm text-muted-foreground">
              {unreadCount > 0
                ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
                : 'All caught up'}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllAsRead()}
            disabled={isMarkingAllRead}
          >
            {isMarkingAllRead ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4 mr-2" />
            )}
            Mark all as read
          </Button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : notifications.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              onMarkRead={markAsRead}
            />
          ))}
        </div>
      )}
    </div>
  )
}
