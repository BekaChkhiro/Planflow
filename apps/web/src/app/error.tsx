'use client'

/**
 * Error Boundary Component
 *
 * Catches errors in page components and displays a user-friendly error message.
 * Errors are automatically reported to Sentry for monitoring.
 */

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log error to console for debugging
    console.error('Application error:', error)

    // Capture the error with Sentry
    Sentry.captureException(error, {
      tags: {
        errorBoundary: 'page',
      },
      extra: {
        digest: error.digest,
      },
    })
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg bg-card p-8 text-center shadow-lg border border-border">
        <div className="mb-4 text-5xl">😕</div>
        <h2 className="mb-2 text-2xl font-bold text-foreground">
          Something went wrong
        </h2>
        <p className="mb-6 text-muted-foreground">
          {error.message || 'An unexpected error occurred'}
        </p>
        {error.digest && (
          <p className="mb-4 font-mono text-xs text-muted-foreground">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex flex-col gap-3">
          <button
            onClick={reset}
            className="w-full rounded-lg bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="w-full rounded-lg border border-border px-4 py-2 text-foreground transition-colors hover:bg-muted"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    </div>
  )
}
