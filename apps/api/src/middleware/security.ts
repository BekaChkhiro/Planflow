import { Context, Next } from 'hono'
import { cors } from 'hono/cors'
import crypto from 'crypto'
import { getRateLimitStore, type RateLimitStore } from '../lib/redis'

// ============================================
// CORS Configuration
// ============================================

/**
 * Get allowed origins based on environment
 * In production, only allow specific origins
 * In development, allow localhost variants
 */
function getAllowedOrigins(): string[] {
  const origins: string[] = []

  // Always allow the configured app URL
  const appUrl = process.env['NEXT_PUBLIC_APP_URL'] || process.env['APP_URL']
  if (appUrl) {
    origins.push(appUrl)
  }

  // In development, allow common localhost variants
  if (process.env['NODE_ENV'] !== 'production') {
    origins.push(
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001'
    )
  }

  // Allow additional origins from environment variable (comma-separated)
  const additionalOrigins = process.env['ALLOWED_ORIGINS']
  if (additionalOrigins) {
    origins.push(...additionalOrigins.split(',').map((o) => o.trim()))
  }

  return [...new Set(origins)] // Remove duplicates
}

/**
 * Configured CORS middleware with origin restrictions
 */
export const secureCors = cors({
  origin: (origin) => {
    // Allow requests with no origin (same-origin, mobile apps, etc.)
    if (!origin) return null

    const allowedOrigins = getAllowedOrigins()

    // Check if origin is allowed
    if (allowedOrigins.includes(origin)) {
      return origin
    }

    // In development, be more permissive
    if (process.env['NODE_ENV'] !== 'production') {
      // Allow any localhost origin in development
      if (origin.match(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/)) {
        return origin
      }
    }

    // Allow Railway domains (*.up.railway.app) - strict regex validation
    // Pattern: https://<subdomain>.up.railway.app (subdomain can contain lowercase letters, numbers, hyphens)
    if (/^https:\/\/[a-z0-9][a-z0-9-]*\.up\.railway\.app$/.test(origin)) {
      return origin
    }

    // Allow Vercel preview deployments - strict regex validation
    // Pattern: https://<subdomain>.vercel.app (subdomain can contain lowercase letters, numbers, hyphens)
    if (/^https:\/\/[a-z0-9][a-z0-9-]*\.vercel\.app$/.test(origin)) {
      return origin
    }

    // Origin not allowed - log for debugging
    console.log(`[CORS] Origin not allowed: ${origin}`)
    console.log(`[CORS] Allowed origins: ${JSON.stringify(allowedOrigins)}`)
    return null
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposeHeaders: ['X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  maxAge: 600, // 10 minutes
  credentials: true,
})

// ============================================
// Security Headers
// ============================================

/**
 * Security headers middleware
 * Adds various security headers to all responses
 */
export async function securityHeaders(c: Context, next: Next) {
  await next()

  // Strict Transport Security - force HTTPS for 1 year
  if (process.env['NODE_ENV'] === 'production') {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  }

  // Prevent clickjacking
  c.header('X-Frame-Options', 'DENY')

  // Prevent MIME type sniffing
  c.header('X-Content-Type-Options', 'nosniff')

  // XSS Protection (legacy, but still useful for older browsers)
  c.header('X-XSS-Protection', '1; mode=block')

  // Referrer Policy - don't leak referrer info
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Content Security Policy for API responses
  c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")

  // Permissions Policy - disable unnecessary features
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  // Add request ID for tracing (if not already present)
  if (!c.res.headers.get('X-Request-Id')) {
    c.header('X-Request-Id', crypto.randomUUID())
  }
}

// ============================================
// Rate Limiting (Redis-backed with in-memory fallback)
// ============================================

// Store reference for backwards compatibility
let _rateLimitStore: RateLimitStore | null = null

/**
 * Get the rate limit store instance
 * Lazy initialization to allow Redis to connect first
 */
function getStore(): RateLimitStore {
  if (!_rateLimitStore) {
    _rateLimitStore = getRateLimitStore()
  }
  return _rateLimitStore
}

/**
 * Start the rate limit cleanup interval
 * @deprecated No longer needed - cleanup is handled by store implementation
 */
export function startRateLimitCleanup(): void {
  // No-op for backwards compatibility
  // Cleanup is now handled internally by the store
}

/**
 * Stop the rate limit cleanup interval
 * @deprecated No longer needed - cleanup is handled by store implementation
 */
export function stopRateLimitCleanup(): void {
  // No-op for backwards compatibility
}

/**
 * Clear all rate limit entries
 * Useful for testing or reset scenarios
 */
export async function clearRateLimitStore(): Promise<void> {
  await getStore().clear()
}

interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Max requests per window
  keyGenerator?: (c: Context) => string // Custom key generator
  skipSuccessfulRequests?: boolean // Only count failed requests
  message?: string // Custom error message
}

/**
 * Rate limiting middleware factory
 * Uses Redis when available, falls back to in-memory store
 * Works across multiple server instances when using Redis
 */
export function rateLimit(config: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = (c) => c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
    message = 'Too many requests, please try again later.',
  } = config

  return async (c: Context, next: Next) => {
    const key = keyGenerator(c)
    const store = getStore()

    try {
      const { count, resetAt } = await store.increment(key, windowMs)
      const now = Date.now()

      // Set rate limit headers
      const remaining = Math.max(0, maxRequests - count)
      const resetSeconds = Math.ceil((resetAt - now) / 1000)

      c.header('X-RateLimit-Limit', maxRequests.toString())
      c.header('X-RateLimit-Remaining', remaining.toString())
      c.header('X-RateLimit-Reset', resetSeconds.toString())

      if (count > maxRequests) {
        c.header('Retry-After', resetSeconds.toString())
        return c.json(
          {
            success: false,
            error: message,
            retryAfter: resetSeconds,
          },
          429
        )
      }

      await next()
    } catch (error) {
      // If rate limiting fails, allow the request but log the error
      console.error('[RateLimit] Error checking rate limit:', error)
      await next()
    }
  }
}

// Pre-configured rate limiters for common use cases

/**
 * Strict rate limiter for authentication endpoints
 * 5 requests per minute per IP
 */
export const authRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 5,
  message: 'Too many authentication attempts. Please wait before trying again.',
})

/**
 * Rate limiter for password-related endpoints
 * 3 requests per minute per IP
 */
export const passwordRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 3,
  message: 'Too many password attempts. Please wait before trying again.',
})

/**
 * General API rate limiter
 * 100 requests per minute per IP
 */
export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
  message: 'Rate limit exceeded. Please slow down your requests.',
})

/**
 * Webhook rate limiter (more permissive for payment webhooks)
 * 50 requests per minute per IP
 */
export const webhookRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 50,
  message: 'Webhook rate limit exceeded.',
})

// ============================================
// Request Size Limiting
// ============================================

interface BodyLimitConfig {
  maxSize: number // Max body size in bytes
  message?: string
}

/**
 * Body size limiting middleware
 * Prevents oversized payloads that could cause DOS
 */
export function bodyLimit(config: BodyLimitConfig) {
  const { maxSize, message = 'Request body too large' } = config

  return async (c: Context, next: Next) => {
    const contentLength = c.req.header('content-length')

    if (contentLength) {
      const size = parseInt(contentLength, 10)
      if (size > maxSize) {
        return c.json(
          {
            success: false,
            error: message,
            maxSize: `${Math.round(maxSize / 1024)}KB`,
          },
          413
        )
      }
    }

    await next()
  }
}

// Pre-configured body limits

/**
 * Default body limit (1MB) - suitable for most API requests
 */
export const defaultBodyLimit = bodyLimit({
  maxSize: 1024 * 1024, // 1MB
})

/**
 * Large body limit (5MB) - for plan uploads
 */
export const largeBodyLimit = bodyLimit({
  maxSize: 5 * 1024 * 1024, // 5MB
})

/**
 * Small body limit (64KB) - for auth requests
 */
export const smallBodyLimit = bodyLimit({
  maxSize: 64 * 1024, // 64KB
})

// ============================================
// Input Sanitization Helpers
// ============================================

/**
 * Sanitize string input to prevent injection attacks
 * Note: This is a defense-in-depth measure; primary protection
 * comes from Zod validation and Drizzle parameterized queries
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/\x00/g, '') // Remove null bytes
    .trim()
}

/**
 * Validate and sanitize redirect URLs
 * Prevents open redirect vulnerabilities
 */
export function validateRedirectUrl(url: string, allowedHosts: string[]): string | null {
  try {
    const parsed = new URL(url)

    // Check if host is in allowed list
    if (!allowedHosts.includes(parsed.host)) {
      return null
    }

    // Only allow http(s) protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null
    }

    return url
  } catch {
    return null
  }
}

// ============================================
// Timing Attack Prevention
// ============================================

/**
 * Constant-time string comparison
 * Prevents timing attacks when comparing sensitive strings
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still perform comparison to maintain constant time
    // but return false
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(a))
    return false
  }

  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}
