/**
 * Loading Components
 *
 * A comprehensive set of loading indicators, skeletons, and async state handlers
 * for consistent loading UX across the application.
 *
 * @example
 * ```tsx
 * // Skeleton loaders
 * import { ActivityFeedSkeleton, CommentListSkeleton } from '@/components/ui/loading'
 *
 * // Loading button
 * import { LoadingButton } from '@/components/ui/loading'
 *
 * // Loading overlays
 * import { LoadingOverlay, AsyncBoundary } from '@/components/ui/loading'
 * ```
 */

// Skeleton components
export {
  ActivityItemSkeleton,
  ActivityFeedSkeleton,
  CommentItemSkeleton,
  CommentListSkeleton,
  SessionCardSkeleton,
  SessionListSkeleton,
  NotificationItemSkeleton,
  NotificationListSkeleton,
  TaskCardSkeleton,
  TaskListSkeleton,
  IntegrationCardSkeleton,
  StatCardSkeleton,
  TableRowSkeleton,
  TableSkeleton,
  PageLoadingSkeleton,
  InlineSpinner,
  CenteredSpinner,
} from '../loading-skeletons'

// Loading button
export { LoadingButton, type LoadingButtonProps } from '../loading-button'

// Loading overlays and async boundaries
export {
  LoadingOverlay,
  AsyncBoundary,
  InlineLoading,
  ProgressIndicator,
} from '../loading-overlay'

// Re-export the base Skeleton for custom usage
export { Skeleton } from '../skeleton'
