import 'dotenv/config'
// Initialize Sentry early, before other imports
import { initSentry, flush as flushSentry } from './lib/sentry.js'
import { validateAndExit } from './lib/env-validation.js'
import { loggers, logStartupBanner, logShutdown } from './lib/logger.js'
initSentry()

const serverLog = loggers.server

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import {
  auth,
  secureCors,
  securityHeaders,
  defaultBodyLimit,
  sentryMiddleware,
  sentryErrorHandler,
  stopRateLimitCleanup,
  apiEtagMiddleware,
} from './middleware/index.js'
import {
  startDigestScheduler,
  stopDigestScheduler,
} from './lib/digest.js'
import {
  initRedis,
  closeRedis,
  initRateLimitStore,
  initTaskLockStore,
  isRedisAvailable,
} from './lib/redis.js'
import { configurePush } from './lib/push.js'
import { setupWebSocketServer } from './websocket/index.js'
import { closePool } from './db/index.js'

// Import all routes
import {
  authRoutes,
  usersRoutes,
  apiTokensRoutes,
  healthRoutes,
  subscriptionsRoutes,
  webhooksRoutes,
  feedbackRoutes,
  projectRoutes,
  organizationsRoutes,
  invitationsRoutes,
  projectInvitationsRoutes,
  notificationsRoutes,
  integrationsRoutes,
} from './routes/index.js'

// Initialize push notifications
configurePush()

// =============================================================================
// APP SETUP
// =============================================================================

const app = new Hono()

// Middleware - Logging & Error Tracking
app.use('*', logger())
app.use('*', sentryMiddleware)

// Middleware - Security
app.use('*', secureCors)
app.use('*', securityHeaders)
app.use('*', defaultBodyLimit)

// Middleware - Caching (ETag for GET requests)
app.use('*', apiEtagMiddleware)

// Global error handler for Sentry
app.onError(sentryErrorHandler)

// =============================================================================
// MOUNT ROUTES
// =============================================================================

// Health check and docs routes (no prefix)
app.route('/', healthRoutes)

// Authentication routes
app.route('/auth', authRoutes)

// User profile routes
app.route('/users', usersRoutes)

// API token management routes
app.route('/api-tokens', apiTokensRoutes)

// Project routes
app.route('/projects', projectRoutes)

// Subscription/billing routes
app.route('/subscriptions', subscriptionsRoutes)

// Webhook handlers
app.route('/webhooks', webhooksRoutes)

// Feedback routes
app.route('/feedback', feedbackRoutes)

// Organization routes
app.route('/organizations', organizationsRoutes)

// Invitation routes (top-level, not under /organizations)
app.route('/invitations', invitationsRoutes)

// Project invitation routes (top-level, for accepting project invitations)
app.route('/project-invitations', projectInvitationsRoutes)

// Notification routes
app.route('/notifications', notificationsRoutes)

// Integration routes (Slack, Discord, GitHub)
// Note: This file also contains /organizations/:id/integrations routes
app.route('/', integrationsRoutes)

// Note: Some routes are also mounted under /organizations/:id/integrations
// These are handled within organizationsRoutes for org-scoped integrations

// =============================================================================
// STARTUP VALIDATION
// =============================================================================

// Comprehensive environment variable validation
const envConfig = validateAndExit()

// Initialize Redis for rate limiting and task locks (optional - falls back to in-memory)
;(async () => {
  await initRedis()
  initRateLimitStore()
  initTaskLockStore()
  if (isRedisAvailable()) {
    serverLog.info('Redis connected - rate limiting and task locks will persist across restarts')
  }
})()

// Start server
const port = Number(process.env['PORT']) || 3001

logStartupBanner(port, {
  redisConnected: isRedisAvailable(),
  sentryEnabled: envConfig.info.sentryConfigured,
  emailConfigured: envConfig.info.emailConfigured,
  paymentsConfigured: envConfig.info.paymentsConfigured,
  githubConfigured: envConfig.info.githubConfigured,
})

const server = serve({
  fetch: app.fetch,
  port,
})

// Setup WebSocket server
setupWebSocketServer(server)

// Start email digest scheduler
startDigestScheduler()

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  logShutdown(signal)

  // Stop digest scheduler
  stopDigestScheduler()

  // Stop rate limit cleanup interval
  stopRateLimitCleanup()

  // Flush Sentry events before shutdown
  await flushSentry(2000)

  // Close database pool connections
  await closePool()
  serverLog.info('Database pool closed')

  // Close Redis connection
  await closeRedis()
  serverLog.info('Redis connection closed')

  // Close server
  server.close(() => {
    serverLog.info('HTTP server closed')
    process.exit(0)
  })

  // Force shutdown after timeout
  setTimeout(() => {
    serverLog.error('Could not close connections in time, forcefully shutting down')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

export default app
