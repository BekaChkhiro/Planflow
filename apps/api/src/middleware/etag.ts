import { Context, Next } from 'hono'
import crypto from 'crypto'

// ============================================
// ETag Caching Middleware
// ============================================

/**
 * Configuration options for ETag middleware
 */
interface ETagConfig {
  /** Use weak ETags (W/"...") instead of strong ETags */
  weak?: boolean
  /** Cache-Control header value (default: 'private, no-cache') */
  cacheControl?: string
  /** Custom hash algorithm (default: 'md5') */
  algorithm?: 'md5' | 'sha1' | 'sha256'
  /** Skip ETag for responses larger than this (bytes). Default: 5MB */
  maxSize?: number
  /** Skip ETag for specific paths (regex patterns) */
  skipPaths?: RegExp[]
}

/**
 * Generate ETag hash from response body
 */
function generateETag(body: string, algorithm: string = 'md5', weak: boolean = false): string {
  const hash = crypto.createHash(algorithm).update(body, 'utf8').digest('hex')
  // Use first 32 chars of hash for shorter ETags
  const shortHash = hash.substring(0, 32)
  return weak ? `W/"${shortHash}"` : `"${shortHash}"`
}

/**
 * Parse If-None-Match header and extract ETags
 * Handles multiple ETags and wildcard (*)
 */
function parseIfNoneMatch(header: string | undefined): string[] {
  if (!header) return []
  if (header === '*') return ['*']

  // Parse comma-separated ETags, handling both strong and weak
  return header
    .split(',')
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0)
}

/**
 * Check if client ETag matches server ETag
 * Weak comparison: W/"abc" matches "abc" and W/"abc"
 */
function etagsMatch(clientETags: string[], serverETag: string): boolean {
  if (clientETags.includes('*')) return true

  // Normalize ETags for comparison (remove W/ prefix for weak comparison)
  const normalizeETag = (etag: string): string => {
    return etag.replace(/^W\//, '').replace(/"/g, '')
  }

  const normalizedServer = normalizeETag(serverETag)

  return clientETags.some(clientETag => {
    const normalizedClient = normalizeETag(clientETag)
    return normalizedClient === normalizedServer
  })
}

/**
 * Default ETag middleware configuration
 */
const defaultConfig: Required<ETagConfig> = {
  weak: true, // Use weak ETags by default (safer for dynamic content)
  cacheControl: 'private, no-cache', // Require revalidation
  algorithm: 'md5',
  maxSize: 5 * 1024 * 1024, // 5MB
  skipPaths: [
    /^\/health/,      // Health checks should not be cached
    /^\/auth\//,      // Auth endpoints
    /^\/webhooks\//,  // Webhooks
  ],
}

/**
 * ETag caching middleware
 *
 * Adds ETag headers to GET responses and handles conditional requests
 * with If-None-Match header, returning 304 Not Modified when appropriate.
 *
 * @example
 * // Apply globally
 * app.use('*', etagMiddleware())
 *
 * // Apply with custom config
 * app.use('/api/*', etagMiddleware({ weak: false, cacheControl: 'private, max-age=60' }))
 *
 * // Apply to specific route
 * projectRoutes.get('/', auth, etagMiddleware(), async (c) => { ... })
 */
export function etagMiddleware(config: ETagConfig = {}) {
  const {
    weak,
    cacheControl,
    algorithm,
    maxSize,
    skipPaths,
  } = { ...defaultConfig, ...config }

  return async (c: Context, next: Next) => {
    // Only apply to GET and HEAD requests
    const method = c.req.method.toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') {
      return next()
    }

    // Check if path should be skipped
    const path = c.req.path
    if (skipPaths.some(pattern => pattern.test(path))) {
      return next()
    }

    // Get If-None-Match header from request
    const ifNoneMatch = c.req.header('if-none-match')
    const clientETags = parseIfNoneMatch(ifNoneMatch)

    // Execute the route handler
    await next()

    // Only process successful JSON responses
    const response = c.res
    const contentType = response.headers.get('content-type')

    if (!response.ok || !contentType?.includes('application/json')) {
      return
    }

    // Check content length (skip if too large)
    const contentLength = response.headers.get('content-length')
    if (contentLength && parseInt(contentLength, 10) > maxSize) {
      return
    }

    // Clone response to read body (can only read once)
    const clonedResponse = response.clone()

    try {
      const body = await clonedResponse.text()

      // Skip if body is too large
      if (body.length > maxSize) {
        return
      }

      // Generate ETag
      const etag = generateETag(body, algorithm, weak)

      // Check if client has matching ETag
      if (clientETags.length > 0 && etagsMatch(clientETags, etag)) {
        // Return 304 Not Modified
        c.res = new Response(null, {
          status: 304,
          statusText: 'Not Modified',
          headers: {
            'ETag': etag,
            'Cache-Control': cacheControl,
            // Preserve some headers from original response
            'X-Request-Id': response.headers.get('X-Request-Id') || '',
          },
        })
        return
      }

      // Add ETag and Cache-Control headers to response
      c.header('ETag', etag)
      c.header('Cache-Control', cacheControl)
      // Add Vary header for proper caching with auth
      c.header('Vary', 'Authorization, Accept-Encoding')

    } catch (error) {
      // If ETag generation fails, just continue without it
      console.error('[ETag] Error generating ETag:', error)
    }
  }
}

/**
 * Pre-configured ETag middleware for API routes
 * Uses weak ETags with private caching
 */
export const apiEtagMiddleware = etagMiddleware({
  weak: true,
  cacheControl: 'private, no-cache',
  algorithm: 'md5',
})

/**
 * ETag middleware for static/stable content
 * Uses strong ETags with longer cache duration
 */
export const staticEtagMiddleware = etagMiddleware({
  weak: false,
  cacheControl: 'private, max-age=300', // 5 minutes
  algorithm: 'sha256',
})

/**
 * ETag middleware for frequently changing content
 * Short cache with must-revalidate
 */
export const dynamicEtagMiddleware = etagMiddleware({
  weak: true,
  cacheControl: 'private, no-cache, must-revalidate',
  algorithm: 'md5',
})

// ============================================
// Resource-Specific ETag Helpers
// ============================================

/**
 * Generate an ETag for a specific resource based on its updatedAt timestamp
 * Useful for database records where we know the last modification time
 */
export function generateResourceETag(
  resourceId: string,
  updatedAt: Date | string,
  weak: boolean = true
): string {
  const timestamp = typeof updatedAt === 'string' ? updatedAt : updatedAt.toISOString()
  const hash = crypto.createHash('md5').update(`${resourceId}-${timestamp}`).digest('hex').substring(0, 16)
  return weak ? `W/"${hash}"` : `"${hash}"`
}

/**
 * Check if request has a matching ETag and should return 304
 * Helper for manual ETag handling in routes
 */
export function shouldReturn304(c: Context, serverETag: string): boolean {
  const ifNoneMatch = c.req.header('if-none-match')
  const clientETags = parseIfNoneMatch(ifNoneMatch)
  return clientETags.length > 0 && etagsMatch(clientETags, serverETag)
}

/**
 * Set ETag and caching headers on response
 * Helper for manual ETag handling in routes
 */
export function setETagHeaders(
  c: Context,
  etag: string,
  cacheControl: string = 'private, no-cache'
): void {
  c.header('ETag', etag)
  c.header('Cache-Control', cacheControl)
  c.header('Vary', 'Authorization, Accept-Encoding')
}
