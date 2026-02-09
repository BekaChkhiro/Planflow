import * as jwt from 'jsonwebtoken'
import { and, eq } from 'drizzle-orm'
import { getDbClient, schema } from '../db/index.js'

interface JwtPayload {
  userId: string
  email: string
}

interface AuthResult {
  success: true
  userId: string
  email: string
}

interface AuthError {
  success: false
  error: string
}

/**
 * Verify JWT token for WebSocket connections
 */
export function verifyToken(token: string): AuthResult | AuthError {
  const jwtSecret = process.env['JWT_SECRET']

  if (!jwtSecret) {
    console.error('[WS Auth] JWT_SECRET not configured')
    return { success: false, error: 'Server configuration error' }
  }

  // Debug: log token prefix to help diagnose issues
  const tokenPreview = token ? `${token.substring(0, 20)}...` : '(empty)'
  console.log(`[WS Auth] Verifying token: ${tokenPreview}`)

  try {
    const decoded = jwt.verify(token, jwtSecret) as JwtPayload
    return {
      success: true,
      userId: decoded.userId,
      email: decoded.email,
    }
  } catch (err) {
    // Check error name instead of instanceof (ESM bundling issue with jsonwebtoken)
    const errorName = err instanceof Error ? err.name : ''
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error(`[WS Auth] Token verification error: ${errorName} - ${errorMessage}`)
    if (errorName === 'TokenExpiredError') {
      return { success: false, error: 'Token expired' }
    }
    if (errorName === 'JsonWebTokenError') {
      return { success: false, error: 'Invalid token' }
    }
    return { success: false, error: 'Token verification failed' }
  }
}

/**
 * Verify that a user has access to a specific project
 */
export async function verifyProjectAccess(
  userId: string,
  projectId: string
): Promise<{ hasAccess: true; projectName: string } | { hasAccess: false; error: string }> {
  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(projectId)) {
    return { hasAccess: false, error: 'Invalid project ID format' }
  }

  try {
    const db = getDbClient()

    const [project] = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, projectId),
          eq(schema.projects.userId, userId)
        )
      )
      .limit(1)

    if (!project) {
      return { hasAccess: false, error: 'Project not found or access denied' }
    }

    return { hasAccess: true, projectName: project.name }
  } catch (err) {
    console.error('[WS Auth] Database error:', err)
    return { hasAccess: false, error: 'Database error' }
  }
}

/**
 * Full authentication and authorization for WebSocket connection
 */
export async function authenticateWebSocket(
  token: string | null,
  projectId: string | null
): Promise<
  | { success: true; userId: string; email: string; name: string | null; projectId: string; projectName: string }
  | { success: false; error: string }
> {
  if (!token) {
    return { success: false, error: 'Missing authentication token' }
  }

  if (!projectId) {
    return { success: false, error: 'Missing project ID' }
  }

  // Verify JWT token
  const authResult = verifyToken(token)
  if (!authResult.success) {
    return { success: false, error: (authResult as AuthError).error }
  }

  // Verify project access
  const accessResult = await verifyProjectAccess(authResult.userId, projectId)
  if (!accessResult.hasAccess) {
    return { success: false, error: (accessResult as { hasAccess: false; error: string }).error }
  }

  // Fetch user name for presence (T5.9)
  let userName: string | null = null
  try {
    const db = getDbClient()
    const [user] = await db
      .select({ name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, authResult.userId))
      .limit(1)
    userName = user?.name ?? null
  } catch (err) {
    console.error('[WS Auth] Error fetching user name:', err)
    // Non-fatal: continue with null name
  }

  return {
    success: true,
    userId: authResult.userId,
    email: authResult.email,
    name: userName,
    projectId,
    projectName: accessResult.projectName,
  }
}
