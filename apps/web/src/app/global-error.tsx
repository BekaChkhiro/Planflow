'use client'

/**
 * Global Error Boundary
 *
 * This component catches errors at the root level (including layout errors).
 * It's the last resort error boundary in Next.js App Router.
 */

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Capture the error with Sentry
    Sentry.captureException(error, {
      tags: {
        errorBoundary: 'global',
      },
      extra: {
        digest: error.digest,
      },
    })
  }, [error])

  return (
    <html>
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
          <div className="w-full max-w-md rounded-lg bg-card p-8 text-center shadow-lg border border-border">
            <div className="mb-4 text-6xl">💥</div>
            <h2 className="mb-2 text-2xl font-bold text-foreground">
              Something went wrong
            </h2>
            <p className="mb-6 text-muted-foreground">
              We've been notified and are working to fix this issue.
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
                href="/"
                className="w-full rounded-lg border border-border px-4 py-2 text-foreground transition-colors hover:bg-muted"
              >
                Go to homepage
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
