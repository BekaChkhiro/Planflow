/**
 * Sentry Server-side Configuration
 *
 * This file configures the initialization of Sentry on the server.
 * The config you add here will be used whenever the server handles a request.
 *
 * https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */

import * as Sentry from '@sentry/nextjs'

const SENTRY_DSN = process.env['NEXT_PUBLIC_SENTRY_DSN']

Sentry.init({
  dsn: SENTRY_DSN,

  // Environment & Release
  environment: process.env['NODE_ENV'] || 'development',

  // Only enable in production
  enabled: process.env['NODE_ENV'] === 'production' && !!SENTRY_DSN,

  // Performance Monitoring
  // Capture 10% of transactions in production
  tracesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.1 : 1.0,

  // Filter sensitive data
  beforeSend(event) {
    // Remove sensitive request headers
    if (event.request?.headers) {
      delete event.request.headers['cookie']
      delete event.request.headers['authorization']
    }

    return event
  },

  // Ignore common server errors
  ignoreErrors: [
    // Next.js specific
    'NEXT_NOT_FOUND',
    'NEXT_REDIRECT',
    // Network issues
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    // Rate limiting
    'Too many requests',
  ],
})

// Log initialization status
if (SENTRY_DSN) {
  console.log('[Sentry] Server initialized')
}
