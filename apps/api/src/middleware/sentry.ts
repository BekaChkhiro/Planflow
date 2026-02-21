/**
 * Sentry Middleware for Hono
 *
 * Provides request-scoped error tracking and performance monitoring.
 */

import type { Context, Next } from 'hono'
import { Sentry, isSentryConfigured, captureException, addBreadcrumb } from '../lib/sentry.js'

/**
 * Sentry request handler middleware
 * Wraps each request with Sentry context for better error tracking
 */
export async function sentryMiddleware(c: Context, next: Next): Promise<Response | void> {
  if (!isSentryConfigured) {
    return next()
  }

  // Add request breadcrumb
  addBreadcrumb({
    category: 'http',
    message: `${c.req.method} ${c.req.path}`,
    level: 'info',
    data: {
      method: c.req.method,
      url: c.req.url,
      path: c.req.path,
    },
  })

  // Set request context
  Sentry.setContext('request', {
    method: c.req.method,
    url: c.req.url,
    path: c.req.path,
    query: Object.fromEntries(new URL(c.req.url).searchParams),
  })

  // Start a transaction for this request
  const span = Sentry.startInactiveSpan({
    name: `${c.req.method} ${c.req.routePath || c.req.path}`,
    op: 'http.server',
  })

  try {
    await next()
  } catch (error) {
    // Capture the error with request context
    captureException(error, {
      tags: {
        method: c.req.method,
        path: c.req.path,
        status: '500',
      },
      extra: {
        url: c.req.url,
        headers: sanitizeHeaders(c.req.header()),
      },
    })

    // Re-throw to let Hono handle the response
    throw error
  } finally {
    // End the span
    if (span) {
      span.end()
    }
  }
}

/**
 * Sentry error handler for Hono
 * Use with app.onError() to capture unhandled errors
 */
export function sentryErrorHandler(error: Error, c: Context): Response {
  // Capture the error
  const eventId = captureException(error, {
    tags: {
      method: c.req.method,
      path: c.req.path,
      route: c.req.routePath || 'unknown',
    },
    extra: {
      url: c.req.url,
      query: Object.fromEntries(new URL(c.req.url).searchParams),
    },
  })

  console.error(`[Sentry ${eventId || 'local'}] Unhandled error:`, error)

  // Return a generic error response
  return c.json(
    {
      error: 'Internal server error',
      message: process.env['NODE_ENV'] === 'production' ? undefined : error.message,
      eventId: eventId || undefined,
    },
    500
  )
}

/**
 * Remove sensitive headers before sending to Sentry
 */
function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized = { ...headers }
  const sensitiveKeys = ['authorization', 'cookie', 'x-api-token', 'x-api-key']

  for (const key of sensitiveKeys) {
    if (sanitized[key]) {
      sanitized[key] = '[REDACTED]'
    }
  }

  return sanitized
}
