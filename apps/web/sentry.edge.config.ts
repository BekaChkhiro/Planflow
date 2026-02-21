/**
 * Sentry Edge Runtime Configuration
 *
 * This file configures Sentry for Next.js Edge Runtime (middleware, edge API routes).
 *
 * https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */

import * as Sentry from '@sentry/nextjs'

const SENTRY_DSN = process.env['NEXT_PUBLIC_SENTRY_DSN']

Sentry.init({
  dsn: SENTRY_DSN,

  // Environment
  environment: process.env['NODE_ENV'] || 'development',

  // Only enable in production
  enabled: process.env['NODE_ENV'] === 'production' && !!SENTRY_DSN,

  // Performance Monitoring
  tracesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.1 : 1.0,

  // Filter sensitive data
  beforeSend(event) {
    if (event.request?.headers) {
      delete event.request.headers['cookie']
      delete event.request.headers['authorization']
    }
    return event
  },
})
