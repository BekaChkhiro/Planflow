import { Context, Next } from 'hono'
import { createMiddleware } from 'hono/factory'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { getDbClient, schema } from '../db/index.js'

// Types for authenticated user context
export interface AuthUser {
  id: string
  email: string
  name?: string
}

export interface AuthContext {
  user: AuthUser
  authType: 'jwt' | 'api-token'
  tokenId?: string // For API tokens, the token's ID
}

// Extend Hono's context variables
declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthContext
  }
}

// JWT payload structure
interface JwtPayload {
  userId: string
  email: string
}

// Helper to extract Bearer token from Authorization header
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  return authHeader.slice(7)
}

// Helper to verify JWT
function verifyJwt(token: string): JwtPayload | null {
  const jwtSecret = process.env['JWT_SECRET']
  if (!jwtSecret) {
    return null
  }
  try {
    const decoded = jwt.verify(token, jwtSecret) as JwtPayload
    return decoded
  } catch {
    return null
  }
}

// Helper to hash tokens
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// Check if token is an API token (prefixed with pf_)
function isApiToken(token: string): boolean {
  return token.startsWith('pf_')
}

/**
 * JWT-only authentication middleware
 * Use this for routes that should only accept JWT tokens (e.g., web dashboard)
 */
export const jwtAuth = createMiddleware(async (c: Context, next: Next) => {
  const token = extractBearerToken(c.req.header('Authorization'))

  if (!token) {
    return c.json(
      {
        success: false,
        error: 'Authentication required',
      },
      401
    )
  }

  const payload = verifyJwt(token)
  if (!payload) {
    return c.json(
      {
        success: false,
        error: 'Invalid or expired token',
      },
      401
    )
  }

  // Set auth context
  c.set('auth', {
    user: {
      id: payload.userId,
      email: payload.email,
    },
    authType: 'jwt',
  })

  await next()
})

/**
 * API token-only authentication middleware
 * Use this for routes that should only accept API tokens (e.g., MCP server endpoints)
 */
export const apiTokenAuth = createMiddleware(async (c: Context, next: Next) => {
  const token = extractBearerToken(c.req.header('Authorization'))

  if (!token) {
    return c.json(
      {
        success: false,
        error: 'Authentication required',
      },
      401
    )
  }

  if (!isApiToken(token)) {
    return c.json(
      {
        success: false,
        error: 'API token required',
      },
      401
    )
  }

  const db = getDbClient()
  const tokenHash = hashToken(token)

  // Find the token in database
  const [storedToken] = await db
    .select({
      id: schema.apiTokens.id,
      userId: schema.apiTokens.userId,
      expiresAt: schema.apiTokens.expiresAt,
      isRevoked: schema.apiTokens.isRevoked,
    })
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.tokenHash, tokenHash))
    .limit(1)

  if (!storedToken) {
    return c.json(
      {
        success: false,
        error: 'Invalid API token',
      },
      401
    )
  }

  if (storedToken.isRevoked) {
    return c.json(
      {
        success: false,
        error: 'API token has been revoked',
      },
      401
    )
  }

  if (storedToken.expiresAt && new Date() > storedToken.expiresAt) {
    return c.json(
      {
        success: false,
        error: 'API token has expired',
      },
      401
    )
  }

  // Get user info
  const [user] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
    })
    .from(schema.users)
    .where(eq(schema.users.id, storedToken.userId))
    .limit(1)

  if (!user) {
    return c.json(
      {
        success: false,
        error: 'User not found',
      },
      401
    )
  }

  // Update last used timestamp (fire and forget)
  db.update(schema.apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiTokens.id, storedToken.id))
    .then(() => {})
    .catch((err) => console.error('Failed to update API token lastUsedAt:', err))

  // Set auth context
  c.set('auth', {
    user: {
      id: user.id,
      email: user.email,
      name: user.name ?? undefined,
    },
    authType: 'api-token',
    tokenId: storedToken.id,
  })

  await next()
})

/**
 * Combined authentication middleware
 * Accepts both JWT tokens and API tokens
 * Use this for routes that should be accessible from both web and MCP
 */
export const auth = createMiddleware(async (c: Context, next: Next) => {
  const token = extractBearerToken(c.req.header('Authorization'))

  if (!token) {
    return c.json(
      {
        success: false,
        error: 'Authentication required',
      },
      401
    )
  }

  // Check if it's an API token
  if (isApiToken(token)) {
    const db = getDbClient()
    const tokenHash = hashToken(token)

    // Find the token in database
    const [storedToken] = await db
      .select({
        id: schema.apiTokens.id,
        userId: schema.apiTokens.userId,
        expiresAt: schema.apiTokens.expiresAt,
        isRevoked: schema.apiTokens.isRevoked,
      })
      .from(schema.apiTokens)
      .where(eq(schema.apiTokens.tokenHash, tokenHash))
      .limit(1)

    if (!storedToken) {
      return c.json(
        {
          success: false,
          error: 'Invalid API token',
        },
        401
      )
    }

    if (storedToken.isRevoked) {
      return c.json(
        {
          success: false,
          error: 'API token has been revoked',
        },
        401
      )
    }

    if (storedToken.expiresAt && new Date() > storedToken.expiresAt) {
      return c.json(
        {
          success: false,
          error: 'API token has expired',
        },
        401
      )
    }

    // Get user info
    const [user] = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
      })
      .from(schema.users)
      .where(eq(schema.users.id, storedToken.userId))
      .limit(1)

    if (!user) {
      return c.json(
        {
          success: false,
          error: 'User not found',
        },
        401
      )
    }

    // Update last used timestamp (fire and forget)
    db.update(schema.apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.apiTokens.id, storedToken.id))
      .then(() => {})
      .catch((err) => console.error('Failed to update API token lastUsedAt:', err))

    // Set auth context
    c.set('auth', {
      user: {
        id: user.id,
        email: user.email,
        name: user.name ?? undefined,
      },
      authType: 'api-token',
      tokenId: storedToken.id,
    })

    await next()
    return
  }

  // Otherwise, try JWT authentication
  const payload = verifyJwt(token)
  if (!payload) {
    return c.json(
      {
        success: false,
        error: 'Invalid or expired token',
      },
      401
    )
  }

  // Set auth context
  c.set('auth', {
    user: {
      id: payload.userId,
      email: payload.email,
    },
    authType: 'jwt',
  })

  await next()
})

/**
 * Optional authentication middleware
 * Sets auth context if valid token provided, but doesn't require it
 * Use this for routes that behave differently for authenticated vs anonymous users
 */
export const optionalAuth = createMiddleware(async (c: Context, next: Next) => {
  const token = extractBearerToken(c.req.header('Authorization'))

  if (!token) {
    await next()
    return
  }

  // Check if it's an API token
  if (isApiToken(token)) {
    const db = getDbClient()
    const tokenHash = hashToken(token)

    const [storedToken] = await db
      .select({
        id: schema.apiTokens.id,
        userId: schema.apiTokens.userId,
        expiresAt: schema.apiTokens.expiresAt,
        isRevoked: schema.apiTokens.isRevoked,
      })
      .from(schema.apiTokens)
      .where(eq(schema.apiTokens.tokenHash, tokenHash))
      .limit(1)

    if (storedToken && !storedToken.isRevoked) {
      const notExpired = !storedToken.expiresAt || new Date() <= storedToken.expiresAt

      if (notExpired) {
        const [user] = await db
          .select({
            id: schema.users.id,
            email: schema.users.email,
            name: schema.users.name,
          })
          .from(schema.users)
          .where(eq(schema.users.id, storedToken.userId))
          .limit(1)

        if (user) {
          // Update last used timestamp (fire and forget)
          db.update(schema.apiTokens)
            .set({ lastUsedAt: new Date() })
            .where(eq(schema.apiTokens.id, storedToken.id))
            .then(() => {})
            .catch((err) => console.error('Failed to update API token lastUsedAt:', err))

          c.set('auth', {
            user: {
              id: user.id,
              email: user.email,
              name: user.name ?? undefined,
            },
            authType: 'api-token',
            tokenId: storedToken.id,
          })
        }
      }
    }

    await next()
    return
  }

  // Try JWT authentication
  const payload = verifyJwt(token)
  if (payload) {
    c.set('auth', {
      user: {
        id: payload.userId,
        email: payload.email,
      },
      authType: 'jwt',
    })
  }

  await next()
})

/**
 * Helper to get auth context from a route handler
 * Throws if not authenticated (use after auth middleware)
 */
export function getAuth(c: Context): AuthContext {
  const auth = c.get('auth')
  if (!auth) {
    throw new Error('Auth context not found. Make sure auth middleware is applied.')
  }
  return auth
}

/**
 * Helper to get optional auth context
 * Returns undefined if not authenticated
 */
export function getOptionalAuth(c: Context): AuthContext | undefined {
  return c.get('auth')
}
