'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CenteredSpinner } from './loading-skeletons'

interface LoadingOverlayProps {
  loading?: boolean
  children: React.ReactNode
  className?: string
  message?: string
  blur?: boolean
}

/**
 * Loading overlay that covers content during async operations
 *
 * @example
 * ```tsx
 * <LoadingOverlay loading={isSubmitting} message="Saving changes...">
 *   <Form>...</Form>
 * </LoadingOverlay>
 * ```
 */
export function LoadingOverlay({
  loading = false,
  children,
  className,
  message,
  blur = true,
}: LoadingOverlayProps) {
  return (
    <div className={cn('relative', className)}>
      {children}
      {loading && (
        <div
          className={cn(
            'absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/80',
            blur && 'backdrop-blur-sm'
          )}
        >
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          {message && (
            <p className="text-sm font-medium text-muted-foreground">{message}</p>
          )}
        </div>
      )}
    </div>
  )
}

interface AsyncBoundaryProps {
  loading: boolean
  error?: Error | null
  fallback?: React.ReactNode
  errorFallback?: (error: Error, retry?: () => void) => React.ReactNode
  children: React.ReactNode
  onRetry?: () => void
}

/**
 * Async boundary that handles loading, error, and success states
 *
 * @example
 * ```tsx
 * <AsyncBoundary
 *   loading={isLoading}
 *   error={error}
 *   fallback={<MySkeleton />}
 *   onRetry={refetch}
 * >
 *   <MyContent data={data} />
 * </AsyncBoundary>
 * ```
 */
export function AsyncBoundary({
  loading,
  error,
  fallback,
  errorFallback,
  children,
  onRetry,
}: AsyncBoundaryProps) {
  if (loading) {
    return <>{fallback || <CenteredSpinner />}</>
  }

  if (error) {
    if (errorFallback) {
      return <>{errorFallback(error, onRetry)}</>
    }
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="rounded-full bg-red-100 p-3">
          <svg
            className="h-6 w-6 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <p className="mt-3 text-sm font-medium text-gray-900">Something went wrong</p>
        <p className="mt-1 text-sm text-gray-500">{error.message || 'Please try again later'}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-4 text-sm font-medium text-primary hover:underline"
          >
            Try again
          </button>
        )}
      </div>
    )
  }

  return <>{children}</>
}

interface InlineLoadingProps {
  loading: boolean
  children: React.ReactNode
  className?: string
  size?: 'sm' | 'md'
}

/**
 * Inline loading indicator that replaces content while loading
 *
 * @example
 * ```tsx
 * <InlineLoading loading={isSaving}>
 *   <span>Saved</span>
 * </InlineLoading>
 * ```
 */
export function InlineLoading({
  loading,
  children,
  className,
  size = 'sm',
}: InlineLoadingProps) {
  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
  }

  if (loading) {
    return (
      <span className={cn('inline-flex items-center gap-1.5', className)}>
        <Loader2 className={cn('animate-spin', sizeClasses[size])} />
      </span>
    )
  }

  return <>{children}</>
}

/**
 * Progress indicator for multi-step operations
 */
export function ProgressIndicator({
  current,
  total,
  label,
  className,
}: {
  current: number
  total: number
  label?: string
  className?: string
}) {
  const percentage = Math.round((current / total) * 100)

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-medium">{percentage}%</span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full bg-primary transition-all duration-300 ease-in-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
