import { Skeleton } from './skeleton'
import { cn } from '@/lib/utils'

/**
 * Skeleton for activity feed items
 */
export function ActivityItemSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex gap-3 p-3', className)}>
      <Skeleton className="h-8 w-8 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  )
}

/**
 * Skeleton for activity feed list
 */
export function ActivityFeedSkeleton({ count = 5, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('divide-y', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <ActivityItemSkeleton key={i} />
      ))}
    </div>
  )
}

/**
 * Skeleton for comment items
 */
export function CommentItemSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex gap-3', className)}>
      <Skeleton className="h-10 w-10 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  )
}

/**
 * Skeleton for comment list
 */
export function CommentListSkeleton({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('space-y-6', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <CommentItemSkeleton key={i} />
      ))}
    </div>
  )
}

/**
 * Skeleton for session cards (security page)
 */
export function SessionCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-between rounded-lg border p-4', className)}>
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      <Skeleton className="h-8 w-8 rounded" />
    </div>
  )
}

/**
 * Skeleton for session list
 */
export function SessionListSkeleton({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SessionCardSkeleton key={i} />
      ))}
    </div>
  )
}

/**
 * Skeleton for notification items
 */
export function NotificationItemSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex gap-3 p-3', className)}>
      <Skeleton className="h-4 w-4 rounded shrink-0 mt-0.5" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  )
}

/**
 * Skeleton for notification list
 */
export function NotificationListSkeleton({ count = 5, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <NotificationItemSkeleton key={i} />
      ))}
    </div>
  )
}

/**
 * Skeleton for task cards
 */
export function TaskCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border p-4 space-y-3', className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <div className="flex items-center gap-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  )
}

/**
 * Skeleton for task list
 */
export function TaskListSkeleton({ count = 5, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <TaskCardSkeleton key={i} />
      ))}
    </div>
  )
}

/**
 * Skeleton for integration cards
 */
export function IntegrationCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border p-6', className)}>
      <div className="flex items-start gap-4">
        <Skeleton className="h-12 w-12 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-9 w-24" />
      </div>
    </div>
  )
}

/**
 * Skeleton for stats cards
 */
export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border p-6', className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-5 rounded" />
      </div>
      <div className="mt-3">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="mt-1 h-3 w-32" />
      </div>
    </div>
  )
}

/**
 * Generic table row skeleton
 */
export function TableRowSkeleton({ columns = 4, className }: { columns?: number; className?: string }) {
  return (
    <div className={cn('flex items-center gap-4 py-3 border-b', className)}>
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-4', i === 0 ? 'w-1/4' : 'flex-1')}
        />
      ))}
    </div>
  )
}

/**
 * Generic table skeleton
 */
export function TableSkeleton({
  rows = 5,
  columns = 4,
  className
}: {
  rows?: number
  columns?: number
  className?: string
}) {
  return (
    <div className={cn('', className)}>
      {/* Header */}
      <div className="flex items-center gap-4 py-3 border-b">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn('h-4', i === 0 ? 'w-1/4' : 'flex-1')}
          />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <TableRowSkeleton key={i} columns={columns} />
      ))}
    </div>
  )
}

/**
 * Full page loading skeleton
 */
export function PageLoadingSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      {/* Content */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  )
}

/**
 * Inline loading spinner for buttons and small areas
 */
export function InlineSpinner({ className }: { className?: string }) {
  return (
    <div className={cn('h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent', className)} />
  )
}

/**
 * Centered loading spinner
 */
export function CenteredSpinner({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  }

  return (
    <div className={cn('flex items-center justify-center py-8', className)}>
      <div className={cn('animate-spin rounded-full border-2 border-gray-300 border-t-primary', sizeClasses[size])} />
    </div>
  )
}
