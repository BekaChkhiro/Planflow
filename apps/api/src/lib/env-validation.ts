/**
 * Environment Variable Validation (T10.10)
 *
 * Comprehensive validation of environment variables at startup.
 * Ensures all required variables are present and valid before server starts.
 */

import { loggers } from './logger.js'

const log = loggers.env

export interface EnvValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  info: {
    isProduction: boolean
    githubConfigured: boolean
    redisConfigured: boolean
    emailConfigured: boolean
    paymentsConfigured: boolean
    pushConfigured: boolean
    sentryConfigured: boolean
  }
}

/**
 * Validates all environment variables and returns detailed results.
 * Call this at startup before initializing any services.
 */
export function validateEnvironment(): EnvValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const isProduction = process.env['NODE_ENV'] === 'production'

  // ==========================================================================
  // REQUIRED VARIABLES (Server will not start without these)
  // ==========================================================================

  // 1. DATABASE_URL - Required for database connection
  const databaseUrl = process.env['DATABASE_URL']
  if (!databaseUrl) {
    errors.push('DATABASE_URL is not set. Database connection is required.')
  } else if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
    errors.push('DATABASE_URL must be a valid PostgreSQL connection string (postgresql:// or postgres://)')
  }

  // 2. JWT_SECRET - Required for authentication (T10.3)
  const jwtSecret = process.env['JWT_SECRET']
  if (!jwtSecret) {
    errors.push('JWT_SECRET is not set. Authentication will not work.')
  } else {
    // Check minimum length (32 chars minimum for security)
    if (jwtSecret.length < 32) {
      errors.push(`JWT_SECRET is too short (${jwtSecret.length} chars). Minimum 32 characters required for security.`)
    }

    // Check for common insecure default values
    const insecureDefaults = [
      'your-super-secret-jwt-key-change-in-production',
      'CHANGE_ME_TO_A_SECURE_64_CHAR_SECRET',
      'secret',
      'jwt_secret',
      'your-secret-key',
      'change-me',
      'changeme',
    ]
    if (insecureDefaults.some(d => jwtSecret.toLowerCase().includes(d.toLowerCase()))) {
      errors.push('JWT_SECRET contains an insecure default value. Please use a secure random secret.')
    }
  }

  // ==========================================================================
  // PRODUCTION-REQUIRED VARIABLES (Errors in production, warnings in dev)
  // ==========================================================================

  // 3. APP_URL - Required for email links and redirects
  const appUrl = process.env['APP_URL']
  if (!appUrl) {
    if (isProduction) {
      errors.push('APP_URL is not set. Required for email links and OAuth redirects in production.')
    } else {
      warnings.push('APP_URL is not set. Email links will use localhost.')
    }
  } else if (isProduction && appUrl.includes('localhost')) {
    warnings.push('APP_URL contains localhost in production. This may cause issues with email links.')
  }

  // 4. ALLOWED_ORIGINS - Important for security in production
  const allowedOrigins = process.env['ALLOWED_ORIGINS']
  if (isProduction && !allowedOrigins) {
    warnings.push('ALLOWED_ORIGINS is not set. Using default Railway patterns. Set explicit origins for better security.')
  }

  // ==========================================================================
  // RECOMMENDED VARIABLES (Warnings only - features may be degraded)
  // ==========================================================================

  // 5. RESEND_API_KEY - Required for email functionality
  const resendApiKey = process.env['RESEND_API_KEY']
  if (!resendApiKey) {
    warnings.push('RESEND_API_KEY is not set. Email notifications will be disabled.')
  }

  // 6. SENTRY_DSN - Required for error tracking
  const sentryDsn = process.env['SENTRY_DSN']
  if (isProduction && !sentryDsn) {
    warnings.push('SENTRY_DSN is not set. Error tracking will be disabled in production.')
  }

  // 7. LemonSqueezy - Required for payments
  const lsApiKey = process.env['LEMON_SQUEEZY_API_KEY']
  const lsStoreId = process.env['LEMON_SQUEEZY_STORE_ID']
  if (!lsApiKey || !lsStoreId) {
    warnings.push('LemonSqueezy credentials not configured. Payment features will be unavailable.')
  }

  // 8. VAPID keys - Required for push notifications
  const vapidPublic = process.env['VAPID_PUBLIC_KEY']
  const vapidPrivate = process.env['VAPID_PRIVATE_KEY']
  if (!vapidPublic || !vapidPrivate) {
    warnings.push('VAPID keys not configured. Browser push notifications will be disabled.')
  }

  // ==========================================================================
  // OPTIONAL INTEGRATION VARIABLES (Info only)
  // ==========================================================================

  // GitHub integration status (optional)
  const githubConfigured = !!(process.env['GITHUB_CLIENT_ID'] && process.env['GITHUB_CLIENT_SECRET'])

  // Redis status (optional - falls back to in-memory)
  const redisConfigured = !!(process.env['REDIS_URL'] || process.env['UPSTASH_REDIS_REST_URL'])

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    info: {
      isProduction,
      githubConfigured,
      redisConfigured,
      emailConfigured: !!resendApiKey,
      paymentsConfigured: !!(lsApiKey && lsStoreId),
      pushConfigured: !!(vapidPublic && vapidPrivate),
      sentryConfigured: !!sentryDsn,
    }
  }
}

/**
 * Runs validation and exits with error code 1 if validation fails.
 * Prints detailed error messages and helpful tips.
 */
export function validateAndExit(): EnvValidationResult {
  const result = validateEnvironment()

  // Display validation results
  if (!result.valid) {
    log.fatal({ errors: result.errors }, 'Environment validation failed')
    log.error('The following required environment variables are missing or invalid:')
    result.errors.forEach(err => log.error(`  - ${err}`))
    log.info('Tips:')
    log.info('  - Copy .env.example to .env and configure the values')
    log.info('  - For JWT_SECRET: openssl rand -base64 48')
    log.info('  - For DATABASE_URL: Get from your Neon dashboard')
    process.exit(1)
  }

  // Show warnings (non-fatal)
  if (result.warnings.length > 0) {
    log.warn({ count: result.warnings.length }, 'Environment configuration warnings')
    result.warnings.forEach(warn => log.warn(`  - ${warn}`))
  }

  // Show environment summary
  log.info({
    mode: result.info.isProduction ? 'production' : 'development',
    email: result.info.emailConfigured,
    payments: result.info.paymentsConfigured,
    github: result.info.githubConfigured,
    redis: result.info.redisConfigured,
    push: result.info.pushConfigured,
    sentry: result.info.sentryConfigured,
  }, 'Environment configuration loaded')

  return result
}
