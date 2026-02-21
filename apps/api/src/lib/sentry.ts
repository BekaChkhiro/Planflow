/**
 * Sentry Error Tracking for PlanFlow API
 *
 * Initialize Sentry early in the application lifecycle to capture all errors.
 * This module provides:
 * - Sentry SDK initialization with proper configuration
 * - Error capture utilities
 * - Request context enrichment
 */

import * as Sentry from '@sentry/node'

// Environment variables
const SENTRY_DSN = process.env['SENTRY_DSN']
const NODE_ENV = process.env['NODE_ENV'] || 'development'
const API_VERSION = '0.0.2'

// Check if Sentry is configured
export const isSentryConfigured = !!SENTRY_DSN

/**
 * Initialize Sentry SDK
 * Should be called as early as possible in the application
 */
export function initSentry(): void {
  if (!SENTRY_DSN) {
    console.log('🔕 Sentry DSN not configured, error tracking disabled')
    return
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: NODE_ENV,
    release: `planflow-api@${API_VERSION}`,

    // Performance monitoring
    tracesSampleRate: NODE_ENV === 'production' ? 0.1 : 1.0,

    // Only send errors in production (or when explicitly enabled)
    enabled: NODE_ENV === 'production' || process.env['SENTRY_ENABLED'] === 'true',

    // Integrations
    integrations: [
      // HTTP integration for tracking outgoing requests
      Sentry.httpIntegration(),
      // Node-specific integrations
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.onUnhandledRejectionIntegration(),
    ],

    // Filter sensitive data
    beforeSend(event) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers['authorization']
        delete event.request.headers['cookie']
        delete event.request.headers['x-api-token']
      }

      // Remove sensitive data from breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
          if (breadcrumb.data?.['password']) {
            breadcrumb.data['password'] = '[REDACTED]'
          }
          if (breadcrumb.data?.['token']) {
            breadcrumb.data['token'] = '[REDACTED]'
          }
          return breadcrumb
        })
      }

      return event
    },

    // Ignore common non-error exceptions
    ignoreErrors: [
      // Network errors
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      // Client disconnects
      'client disconnected',
      // Rate limiting (expected behavior)
      'Too many requests',
    ],
  })

  console.log(`🛡️  Sentry initialized (env: ${NODE_ENV})`)
}

/**
 * Capture an exception with optional context
 */
export function captureException(
  error: Error | unknown,
  context?: {
    user?: { id: string; email?: string }
    tags?: Record<string, string>
    extra?: Record<string, unknown>
  }
): string | undefined {
  if (!isSentryConfigured) {
    console.error('Uncaptured exception:', error)
    return undefined
  }

  return Sentry.withScope((scope) => {
    if (context?.user) {
      scope.setUser({ id: context.user.id, email: context.user.email })
    }
    if (context?.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value)
      })
    }
    if (context?.extra) {
      Object.entries(context.extra).forEach(([key, value]) => {
        scope.setExtra(key, value)
      })
    }
    return Sentry.captureException(error)
  })
}

/**
 * Capture a message with optional level
 */
export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info'
): string | undefined {
  if (!isSentryConfigured) {
    console.log(`[${level.toUpperCase()}] ${message}`)
    return undefined
  }

  return Sentry.captureMessage(message, level)
}

/**
 * Set user context for error tracking
 */
export function setUser(user: { id: string; email?: string } | null): void {
  if (!isSentryConfigured) return
  Sentry.setUser(user)
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(breadcrumb: {
  category: string
  message: string
  level?: 'debug' | 'info' | 'warning' | 'error'
  data?: Record<string, unknown>
}): void {
  if (!isSentryConfigured) return
  Sentry.addBreadcrumb({
    ...breadcrumb,
    level: breadcrumb.level || 'info',
  })
}

/**
 * Start a transaction for performance monitoring
 */
export function startTransaction(name: string, op: string) {
  if (!isSentryConfigured) return undefined
  return Sentry.startInactiveSpan({ name, op })
}

/**
 * Flush pending events (useful before shutdown)
 */
export async function flush(timeout = 2000): Promise<boolean> {
  if (!isSentryConfigured) return true
  return Sentry.flush(timeout)
}

// Export Sentry for direct access if needed
export { Sentry }
