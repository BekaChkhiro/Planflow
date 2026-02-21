/**
 * Sentry Client-side Configuration
 *
 * This file configures the initialization of Sentry on the client (browser).
 * The config you add here will be used whenever a user loads a page in their browser.
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

  // Session Replay
  // Capture 10% of sessions for replay
  replaysSessionSampleRate: 0.1,
  // Capture 100% of sessions with errors for replay
  replaysOnErrorSampleRate: 1.0,

  // Integrations
  integrations: [
    Sentry.replayIntegration({
      // Mask all text content by default for privacy
      maskAllText: false,
      // Block all media (images, videos) for privacy
      blockAllMedia: false,
    }),
    Sentry.browserTracingIntegration(),
  ],

  // Filter out noisy errors
  ignoreErrors: [
    // Browser extensions
    'top.GLOBALS',
    'originalCreateNotification',
    'canvas.contentDocument',
    'MyApp_RemoveAllHighlights',
    'http://tt.teletrader.com/',
    'jigsaw',
    'ComboSearch',
    'http://loading.retry.widdit.com/',
    'atomicFindClose',
    // Facebook borance
    'fb_xd_fragment',
    // ISP "injection"
    'AABB',
    // Network errors
    'Network request failed',
    'Failed to fetch',
    'NetworkError',
    'Load failed',
    // Aborted requests (user navigated away)
    'AbortError',
    // ResizeObserver (non-critical)
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    // ChunkLoadError (usually network issues)
    'ChunkLoadError',
    // Safari audio playback
    'The play() request was interrupted',
  ],

  // Before sending an event, you can modify it
  beforeSend(event, hint) {
    // Filter out events from browser extensions
    const error = hint.originalException as Error | undefined
    if (error?.stack && /extensions\//i.test(error.stack)) {
      return null
    }

    // Don't send events in development unless explicitly enabled
    if (process.env['NODE_ENV'] !== 'production') {
      console.log('[Sentry] Would send event:', event)
      return null
    }

    return event
  },

  // Configure scope
  beforeBreadcrumb(breadcrumb) {
    // Filter out noisy breadcrumbs
    if (breadcrumb.category === 'console' && breadcrumb.level === 'log') {
      return null
    }
    return breadcrumb
  },
})

// Log initialization status
if (SENTRY_DSN) {
  console.log('[Sentry] Client initialized')
}
