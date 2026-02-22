import { Context, Next } from 'hono'
import { createMiddleware } from 'hono/factory'
import {
  extractBearerToken,
  verifyJwt,
  isApiToken,
  verifyApiToken,
} from '../utils/helpers.js'

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
    return c.json({ success: false, error: 'Authentication required' }, 401)
  }

  if (!isApiToken(token)) {
    return c.json({ success: false, error: 'API token required' }, 401)
  }

  // Use shared API token verification
  const result = await verifyApiToken(token)
  if (!result.success) {
    return c.json({ success: false, error: result.message }, 401)
  }

  // Set auth context
  c.set('auth', {
    user: result.user,
    authType: 'api-token',
    tokenId: result.tokenId,
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
    return c.json({ success: false, error: 'Authentication required' }, 401)
  }

  // Check if it's an API token
  if (isApiToken(token)) {
    const result = await verifyApiToken(token)
    if (!result.success) {
      return c.json({ success: false, error: result.message }, 401)
    }

    c.set('auth', {
      user: result.user,
      authType: 'api-token',
      tokenId: result.tokenId,
    })

    await next()
    return
  }

  // Otherwise, try JWT authentication
  const payload = verifyJwt(token)
  if (!payload) {
    return c.json({ success: false, error: 'Invalid or expired token' }, 401)
  }

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
    const result = await verifyApiToken(token)
    if (result.success) {
      c.set('auth', {
        user: result.user,
        authType: 'api-token',
        tokenId: result.tokenId,
      })
    }
    // For optional auth, we don't return errors - just proceed without auth
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
