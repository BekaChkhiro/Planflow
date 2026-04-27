import pino from 'pino'

const isProduction = process.env['NODE_ENV'] === 'production'
const logLevel = process.env['LOG_LEVEL'] || (isProduction ? 'info' : 'debug')

/**
 * Structured Logger for PlanFlow API
 *
 * Features:
 * - JSON output in production (machine-readable)
 * - Pretty output in development (human-readable)
 * - Child loggers for namespacing (e.g., logger.child({ module: 'redis' }))
 * - Consistent log levels: trace, debug, info, warn, error, fatal
 *
 * Usage:
 *   import { logger } from './lib/logger'
 *
 *   // Basic logging
 *   logger.info('Server started')
 *   logger.error({ err }, 'Database connection failed')
 *
 *   // With context
 *   logger.info({ userId, action: 'login' }, 'User logged in')
 *
 *   // Child logger for module
 *   const redisLogger = logger.child({ module: 'redis' })
 *   redisLogger.info('Connected successfully')
 */

// Base logger configuration
const baseConfig: pino.LoggerOptions = {
  level: logLevel,
  // Customize serializers for common objects
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    req: (req) => ({
      method: req.method,
      url: req.url,
      path: req.path,
      headers: {
        host: req.headers?.host,
        'user-agent': req.headers?.['user-agent'],
      },
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
  // Add timestamp in ISO format
  timestamp: pino.stdTimeFunctions.isoTime,
  // Base context added to all logs
  base: {
    service: 'planflow-api',
    env: process.env['NODE_ENV'] || 'development',
  },
  // Redact sensitive fields
  redact: {
    paths: [
      'password',
      'token',
      'apiToken',
      'authorization',
      'req.headers.authorization',
      'req.headers.cookie',
      'refreshToken',
      'accessToken',
    ],
    censor: '[REDACTED]',
  },
}

// Production config: JSON output
const productionConfig: pino.LoggerOptions = {
  ...baseConfig,
  // Faster serialization in production
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({
      pid: bindings['pid'],
      host: bindings['hostname'],
    }),
  },
}

// Development config: Pretty output
const developmentConfig: pino.LoggerOptions = {
  ...baseConfig,
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname,service,env',
      messageFormat: '{module}: {msg}',
      singleLine: false,
    },
  },
}

// Create the logger instance
export const logger = pino(isProduction ? productionConfig : developmentConfig)

// Pre-configured child loggers for common modules
export const loggers = {
  redis: logger.child({ module: 'Redis' }),
  websocket: logger.child({ module: 'WebSocket' }),
  auth: logger.child({ module: 'Auth' }),
  db: logger.child({ module: 'Database' }),
  email: logger.child({ module: 'Email' }),
  github: logger.child({ module: 'GitHub' }),
  slack: logger.child({ module: 'Slack' }),
  discord: logger.child({ module: 'Discord' }),
  webhook: logger.child({ module: 'Webhook' }),
  rateLimit: logger.child({ module: 'RateLimit' }),
  taskLock: logger.child({ module: 'TaskLock' }),
  activeWork: logger.child({ module: 'ActiveWork' }),
  recentChanges: logger.child({ module: 'RecentChanges' }),
  cron: logger.child({ module: 'Cron' }),
  sentry: logger.child({ module: 'Sentry' }),
  server: logger.child({ module: 'Server' }),
  env: logger.child({ module: 'Environment' }),
}

// Helper function to create a child logger with request context
export function createRequestLogger(requestId: string, userId?: string) {
  return logger.child({
    requestId,
    ...(userId && { userId }),
  })
}

// Helper to log startup banner
export function logStartupBanner(port: number, options: {
  redisConnected: boolean
  sentryEnabled: boolean
  emailConfigured: boolean
  paymentsConfigured: boolean
  githubConfigured: boolean
}) {
  const { server } = loggers

  server.info('='.repeat(50))
  server.info('PlanFlow API Starting')
  server.info('='.repeat(50))
  server.info({ port }, `Server listening on port ${port}`)
  server.info({
    redis: options.redisConnected ? 'connected' : 'in-memory fallback',
    sentry: options.sentryEnabled ? 'enabled' : 'disabled',
    email: options.emailConfigured ? 'configured' : 'disabled',
    payments: options.paymentsConfigured ? 'configured' : 'disabled',
    github: options.githubConfigured ? 'configured' : 'disabled',
  }, 'Service configuration')
  server.info('='.repeat(50))
}

// Helper to log graceful shutdown
export function logShutdown(signal: string) {
  loggers.server.info({ signal }, 'Shutdown signal received, closing gracefully')
}

// Type exports for TypeScript
export type Logger = pino.Logger
export type LoggerOptions = pino.LoggerOptions
