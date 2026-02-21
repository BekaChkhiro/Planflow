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
      <div className="w-full max-w-md rounded-lg bg-white p-8 text-center shadow-lg">
        <div className="mb-4 text-5xl">😕</div>
        <h2 className="mb-2 text-2xl font-bold text-gray-900">
          Something went wrong
        </h2>
        <p className="mb-6 text-gray-600">
          {error.message || 'An unexpected error occurred'}
        </p>
        {error.digest && (
          <p className="mb-4 font-mono text-xs text-gray-400">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex flex-col gap-3">
          <button
            onClick={reset}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    </div>
  )
}
