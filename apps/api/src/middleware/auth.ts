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

// ============================================================================
// Role-Based Access Control (RBAC) Helpers
// ============================================================================

/**
 * Organization member roles in order of decreasing privilege
 */
export type OrgRole = 'owner' | 'admin' | 'editor' | 'viewer'

/**
 * Role hierarchy - higher index = more privilege
 */
const ROLE_HIERARCHY: Record<OrgRole, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
}

/**
 * Check if a role has at least the required privilege level
 */
export function hasMinimumRole(userRole: OrgRole, requiredRole: OrgRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}

/**
 * Check if a user can modify another user's role based on role hierarchy
 * - Owner can modify anyone except other owners
 * - No one can modify an owner's role
 */
export function canModifyRole(actorRole: OrgRole, targetRole: OrgRole): boolean {
  // Only owner can modify roles
  if (actorRole !== 'owner') {
    return false
  }
  // Cannot modify another owner
  if (targetRole === 'owner') {
    return false
  }
  return true
}

/**
 * Check if a user can remove another member based on role hierarchy
 * - Owner can remove anyone except themselves (last owner rule applies separately)
 * - Admin can remove editors and viewers
 * - No one else can remove members
 */
export function canRemoveMember(actorRole: OrgRole, targetRole: OrgRole, isSelf: boolean): boolean {
  // Self-removal: anyone except owner can leave
  if (isSelf) {
    return actorRole !== 'owner'
  }

  // Cannot remove owner
  if (targetRole === 'owner') {
    return false
  }

  // Owner can remove anyone
  if (actorRole === 'owner') {
    return true
  }

  // Admin can remove editors and viewers
  if (actorRole === 'admin') {
    return targetRole === 'editor' || targetRole === 'viewer'
  }

  return false
}

/**
 * Permission types for organization actions
 */
export type OrgPermission =
  | 'org:read'           // View org details
  | 'org:update'         // Update org name, description, slug
  | 'org:delete'         // Delete the organization
  | 'members:read'       // View member list
  | 'members:invite'     // Invite new members
  | 'members:update'     // Change member roles
  | 'members:remove'     // Remove members
  | 'projects:read'      // View projects
  | 'projects:create'    // Create projects
  | 'projects:update'    // Update projects
  | 'projects:delete'    // Delete projects
  | 'tasks:read'         // View tasks
  | 'tasks:update'       // Update task status
  | 'tasks:assign'       // Assign tasks to members
  | 'comments:read'      // View comments
  | 'comments:create'    // Create comments
  | 'comments:delete'    // Delete comments

/**
 * Role-permission mapping
 */
const ROLE_PERMISSIONS: Record<OrgRole, OrgPermission[]> = {
  owner: [
    'org:read', 'org:update', 'org:delete',
    'members:read', 'members:invite', 'members:update', 'members:remove',
    'projects:read', 'projects:create', 'projects:update', 'projects:delete',
    'tasks:read', 'tasks:update', 'tasks:assign',
    'comments:read', 'comments:create', 'comments:delete',
  ],
  admin: [
    'org:read', 'org:update',
    'members:read', 'members:invite', 'members:remove',
    'projects:read', 'projects:create', 'projects:update', 'projects:delete',
    'tasks:read', 'tasks:update', 'tasks:assign',
    'comments:read', 'comments:create', 'comments:delete',
  ],
  editor: [
    'org:read',
    'members:read',
    'projects:read', 'projects:update',
    'tasks:read', 'tasks:update',
    'comments:read', 'comments:create',
  ],
  viewer: [
    'org:read',
    'members:read',
    'projects:read',
    'tasks:read',
    'comments:read',
  ],
}

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: OrgRole, permission: OrgPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: OrgRole): OrgPermission[] {
  return [...ROLE_PERMISSIONS[role]]
}
