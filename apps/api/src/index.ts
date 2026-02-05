import 'dotenv/config'
import { serve } from '@hono/node-server'
import { swaggerUI } from '@hono/swagger-ui'
import { Hono } from 'hono'
// Note: Using custom secureCors from middleware/security.ts instead of hono/cors
import { logger } from 'hono/logger'
import { and, count, desc, eq, gt, isNull, ne } from 'drizzle-orm'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import {
  LoginRequestSchema,
  RegisterRequestSchema,
  RefreshTokenRequestSchema,
  CreateApiTokenRequestSchema,
  CreateProjectRequestSchema,
  UpdateProjectRequestSchema,
  BulkUpdateTasksRequestSchema,
  UpdateProfileRequestSchema,
  ChangePasswordRequestSchema,
  CreateCheckoutRequestSchema,
  CreateFeedbackRequestSchema,
  CreateOrganizationRequestSchema,
  UpdateOrganizationRequestSchema,
  CreateInvitationRequestSchema,
  type SubscriptionTier,
  type SubscriptionStatus,
  type ProjectLimits,
} from '@planflow/shared'
import {
  createCheckoutUrl,
  createCustomerPortalUrl,
  getVariantIdForTier,
  getTierFromVariantId,
  mapLemonSqueezyStatus,
  verifyWebhookSignature,
} from './lib/lemonsqueezy.js'
import { checkDbConnection, getDbClient, getDbInfo, schema } from './db/index.js'
import {
  auth,
  jwtAuth,
  getAuth,
  secureCors,
  securityHeaders,
  authRateLimit,
  passwordRateLimit,
  apiRateLimit,
  webhookRateLimit,
  defaultBodyLimit,
  smallBodyLimit,
  largeBodyLimit,
} from './middleware/index.js'
import { openApiSpec } from './openapi.js'
import { parsePlanTasks } from './lib/task-parser.js'
import {
  setupWebSocketServer,
  broadcastTaskUpdated,
  broadcastTasksUpdated,
  broadcastTasksSynced,
} from './websocket/index.js'

// Helper to generate secure random tokens
function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex')
}

// Helper to hash refresh tokens (for secure storage)
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// Helper to generate API tokens (shorter than refresh tokens, prefixed for identification)
function generateApiToken(): string {
  return `pf_${crypto.randomBytes(32).toString('hex')}`
}

// Helper to verify JWT and extract user info
interface JwtPayload {
  userId: string
  email: string
}

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

// Helper to extract Bearer token from Authorization header
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  return authHeader.slice(7)
}

// Helper to generate a URL-friendly slug from a name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Project limits by subscription tier (-1 = unlimited)
const PROJECT_LIMITS: Record<SubscriptionTier, number> = {
  free: 3,
  pro: -1,
  team: -1,
  enterprise: -1,
}

// Grace period for canceled subscriptions (days)
const CANCELED_GRACE_PERIOD_DAYS = 7

// Helper to get user's subscription (defaults to free tier if none exists)
async function getUserSubscription(userId: string) {
  const db = getDbClient()

  const [subscription] = await db
    .select({
      id: schema.subscriptions.id,
      tier: schema.subscriptions.tier,
      status: schema.subscriptions.status,
      currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
      canceledAt: schema.subscriptions.canceledAt,
    })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1)

  // Default to free tier if no subscription exists
  if (!subscription) {
    return {
      tier: 'free' as SubscriptionTier,
      status: 'active' as SubscriptionStatus,
      currentPeriodEnd: null,
      canceledAt: null,
    }
  }

  return subscription
}

// Helper to check if user can create a new project
async function canCreateProject(userId: string): Promise<{
  allowed: boolean
  reason?: string
  currentCount: number
  maxProjects: number
  tier: SubscriptionTier
  status: SubscriptionStatus
}> {
  const db = getDbClient()
  const subscription = await getUserSubscription(userId)

  // Count user's current projects
  const [result] = await db
    .select({ count: count() })
    .from(schema.projects)
    .where(eq(schema.projects.userId, userId))

  const currentCount = result ? Number(result.count) : 0

  // Determine effective tier based on subscription status
  let effectiveTier = subscription.tier
  let effectiveStatus = subscription.status

  // Handle past_due status - block new project creation
  if (subscription.status === 'past_due') {
    return {
      allowed: false,
      reason: 'Payment required. Please update your payment method to create new projects.',
      currentCount,
      maxProjects: PROJECT_LIMITS[effectiveTier],
      tier: effectiveTier,
      status: effectiveStatus,
    }
  }

  // Handle canceled subscriptions
  if (subscription.status === 'canceled') {
    const now = new Date()

    // Check if within grace period (still has access to tier features)
    if (subscription.currentPeriodEnd && now < subscription.currentPeriodEnd) {
      // Within billing period - use tier limits
    } else if (subscription.canceledAt) {
      const canceledAt = new Date(subscription.canceledAt)
      const gracePeriodEnd = new Date(canceledAt.getTime() + CANCELED_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)

      if (now > gracePeriodEnd) {
        // Past grace period - treat as free tier
        effectiveTier = 'free'
      }
    }
  }

  const maxProjects = PROJECT_LIMITS[effectiveTier]

  // -1 means unlimited
  if (maxProjects === -1) {
    return {
      allowed: true,
      currentCount,
      maxProjects,
      tier: subscription.tier,
      status: subscription.status,
    }
  }

  // Check if at limit
  if (currentCount >= maxProjects) {
    return {
      allowed: false,
      reason: `Project limit reached (${currentCount}/${maxProjects}). Upgrade to Pro for unlimited projects.`,
      currentCount,
      maxProjects,
      tier: subscription.tier,
      status: subscription.status,
    }
  }

  return {
    allowed: true,
    currentCount,
    maxProjects,
    tier: subscription.tier,
    status: subscription.status,
  }
}

// Helper to get project limits for a user
async function getProjectLimits(userId: string): Promise<ProjectLimits> {
  const result = await canCreateProject(userId)
  return {
    currentCount: result.currentCount,
    maxProjects: result.maxProjects,
    canCreate: result.allowed,
    tier: result.tier,
    status: result.status,
  }
}

const app = new Hono()

// Middleware - Security
app.use('*', logger())
app.use('*', secureCors)
app.use('*', securityHeaders)
app.use('*', defaultBodyLimit)

// Health check
app.get('/', (c) => {
  return c.json({
    name: 'PlanFlow API',
    version: '0.0.2',
    status: 'ok',
  })
})

app.get('/health', (c) => {
  return c.json({ status: 'healthy', timestamp: new Date().toISOString() })
})

// OpenAPI documentation
app.get('/openapi.json', (c) => {
  return c.json(openApiSpec)
})

// Swagger UI
app.get('/docs', swaggerUI({ url: '/openapi.json' }))

// Database health check
app.get('/health/db', async (c) => {
  const connectionStatus = await checkDbConnection()

  if (!connectionStatus.connected) {
    return c.json(
      {
        status: 'unhealthy',
        database: connectionStatus,
        timestamp: new Date().toISOString(),
      },
      503
    )
  }

  const dbInfo = await getDbInfo()

  return c.json({
    status: 'healthy',
    database: {
      ...connectionStatus,
      ...dbInfo,
    },
    timestamp: new Date().toISOString(),
  })
})

// Auth routes (with rate limiting)
app.post('/auth/register', authRateLimit, smallBodyLimit, async (c) => {
  try {
    // Parse and validate request body
    const body = await c.req.json()
    const validation = RegisterRequestSchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
        },
        400
      )
    }

    const { email, password, name } = validation.data
    const db = getDbClient()

    // Check if user already exists
    const existingUser = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase()))
      .limit(1)

    if (existingUser.length > 0) {
      return c.json(
        {
          success: false,
          error: 'A user with this email already exists',
        },
        409
      )
    }

    // Hash password
    const saltRounds = 12
    const passwordHash = await bcrypt.hash(password, saltRounds)

    // Insert user
    const [newUser] = await db
      .insert(schema.users)
      .values({
        email: email.toLowerCase(),
        name,
        passwordHash,
      })
      .returning({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        createdAt: schema.users.createdAt,
        updatedAt: schema.users.updatedAt,
      })

    return c.json(
      {
        success: true,
        data: {
          user: newUser,
        },
      },
      201
    )
  } catch (error) {
    console.error('Registration error:', error)
    return c.json(
      {
        success: false,
        error: 'An unexpected error occurred',
      },
      500
    )
  }
})

// Login endpoint (with rate limiting)
app.post('/auth/login', authRateLimit, smallBodyLimit, async (c) => {
  try {
    // Parse and validate request body
    const body = await c.req.json()
    const validation = LoginRequestSchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
        },
        400
      )
    }

    const { email, password } = validation.data
    const db = getDbClient()

    // Find user by email
    const [user] = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        passwordHash: schema.users.passwordHash,
        createdAt: schema.users.createdAt,
        updatedAt: schema.users.updatedAt,
      })
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase()))
      .limit(1)

    if (!user) {
      return c.json(
        {
          success: false,
          error: 'Invalid email or password',
        },
        401
      )
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash)

    if (!isValidPassword) {
      return c.json(
        {
          success: false,
          error: 'Invalid email or password',
        },
        401
      )
    }

    // Generate JWT access token
    const jwtSecret = process.env['JWT_SECRET']
    if (!jwtSecret) {
      console.error('JWT_SECRET is not configured')
      return c.json(
        {
          success: false,
          error: 'Server configuration error',
        },
        500
      )
    }

    const expiresIn = Number(process.env['JWT_EXPIRATION']) || 900 // 15 minutes default
    const refreshExpiresIn = Number(process.env['REFRESH_TOKEN_EXPIRATION']) || 2592000 // 30 days default

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
      },
      jwtSecret,
      {
        expiresIn,
      }
    )

    // Generate refresh token
    const refreshToken = generateRefreshToken()
    const refreshTokenHash = hashToken(refreshToken)
    const refreshExpiresAt = new Date(Date.now() + refreshExpiresIn * 1000)

    // Store refresh token in database
    await db.insert(schema.refreshTokens).values({
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt: refreshExpiresAt,
    })

    // Return user data (without passwordHash) and tokens
    return c.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        token,
        refreshToken,
        expiresIn,
        refreshExpiresIn,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    return c.json(
      {
        success: false,
        error: 'An unexpected error occurred',
      },
      500
    )
  }
})

// Token refresh endpoint (with rate limiting)
app.post('/auth/refresh', authRateLimit, smallBodyLimit, async (c) => {
  try {
    // Parse and validate request body
    const body = await c.req.json()
    const validation = RefreshTokenRequestSchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
        },
        400
      )
    }

    const { refreshToken } = validation.data
    const db = getDbClient()

    // Hash the provided token to compare with stored hash
    const tokenHash = hashToken(refreshToken)

    // Find the refresh token in database
    const [storedToken] = await db
      .select({
        id: schema.refreshTokens.id,
        userId: schema.refreshTokens.userId,
        expiresAt: schema.refreshTokens.expiresAt,
        isRevoked: schema.refreshTokens.isRevoked,
      })
      .from(schema.refreshTokens)
      .where(eq(schema.refreshTokens.tokenHash, tokenHash))
      .limit(1)

    if (!storedToken) {
      return c.json(
        {
          success: false,
          error: 'Invalid refresh token',
        },
        401
      )
    }

    // Check if token is revoked
    if (storedToken.isRevoked) {
      return c.json(
        {
          success: false,
          error: 'Refresh token has been revoked',
        },
        401
      )
    }

    // Check if token is expired
    if (new Date() > storedToken.expiresAt) {
      return c.json(
        {
          success: false,
          error: 'Refresh token has expired',
        },
        401
      )
    }

    // Get user data
    const [user] = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
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

    // Generate new access token
    const jwtSecret = process.env['JWT_SECRET']
    if (!jwtSecret) {
      console.error('JWT_SECRET is not configured')
      return c.json(
        {
          success: false,
          error: 'Server configuration error',
        },
        500
      )
    }

    const expiresIn = Number(process.env['JWT_EXPIRATION']) || 900

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
      },
      jwtSecret,
      {
        expiresIn,
      }
    )

    return c.json({
      success: true,
      data: {
        token,
        expiresIn,
      },
    })
  } catch (error) {
    console.error('Token refresh error:', error)
    return c.json(
      {
        success: false,
        error: 'An unexpected error occurred',
      },
      500
    )
  }
})

// Logout endpoint - revokes refresh token
app.post('/auth/logout', async (c) => {
  try {
    const body = await c.req.json()
    const validation = RefreshTokenRequestSchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
        },
        400
      )
    }

    const { refreshToken } = validation.data
    const db = getDbClient()

    // Hash the provided token
    const tokenHash = hashToken(refreshToken)

    // Revoke the token
    const result = await db
      .update(schema.refreshTokens)
      .set({ isRevoked: true })
      .where(
        and(
          eq(schema.refreshTokens.tokenHash, tokenHash),
          eq(schema.refreshTokens.isRevoked, false)
        )
      )
      .returning({ id: schema.refreshTokens.id })

    if (result.length === 0) {
      return c.json(
        {
          success: false,
          error: 'Invalid or already revoked refresh token',
        },
        400
      )
    }

    return c.json({
      success: true,
      data: {
        message: 'Successfully logged out',
      },
    })
  } catch (error) {
    console.error('Logout error:', error)
    return c.json(
      {
        success: false,
        error: 'An unexpected error occurred',
      },
      500
    )
  }
})

// Get current authenticated user (supports both JWT and API tokens)
app.get('/auth/me', auth, async (c) => {
  try {
    const authContext = getAuth(c)
    const db = getDbClient()

    // Get full user data
    const [user] = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        createdAt: schema.users.createdAt,
        updatedAt: schema.users.updatedAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, authContext.user.id))
      .limit(1)

    if (!user) {
      return c.json(
        {
          success: false,
          error: 'User not found',
        },
        404
      )
    }

    return c.json({
      success: true,
      data: {
        user,
        authType: authContext.authType,
      },
    })
  } catch (error) {
    console.error('Get current user error:', error)
    return c.json(
      {
        success: false,
        error: 'An unexpected error occurred',
      },
      500
    )
  }
})

// Update user profile
app.patch('/users/profile', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)

    const body = await c.req.json()
    const validation = UpdateProfileRequestSchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
        },
        400
      )
    }

    const { name, email } = validation.data

    // Check if at least one field is provided
    if (name === undefined && email === undefined) {
      return c.json(
        {
          success: false,
          error: 'At least one field (name or email) must be provided',
        },
        400
      )
    }

    const db = getDbClient()

    // If email is being changed, check if it's already taken
    if (email && email.toLowerCase() !== user.email.toLowerCase()) {
      const existingUser = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, email.toLowerCase()))
        .limit(1)

      if (existingUser.length > 0) {
        return c.json(
          {
            success: false,
            error: 'A user with this email already exists',
          },
          409
        )
      }
    }

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }
    if (name !== undefined) updateData['name'] = name
    if (email !== undefined) updateData['email'] = email.toLowerCase()

    const [updatedUser] = await db
      .update(schema.users)
      .set(updateData)
      .where(eq(schema.users.id, user.id))
      .returning({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        createdAt: schema.users.createdAt,
        updatedAt: schema.users.updatedAt,
      })

    if (!updatedUser) {
      return c.json(
        {
          success: false,
          error: 'User not found',
        },
        404
      )
    }

    return c.json({
      success: true,
      data: {
        user: updatedUser,
      },
    })
  } catch (error) {
    console.error('Update profile error:', error)
    return c.json(
      {
        success: false,
        error: 'An unexpected error occurred',
      },
      500
    )
  }
})

// Change password (with rate limiting)
app.patch('/users/password', passwordRateLimit, smallBodyLimit, jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)

    const body = await c.req.json()
    const validation = ChangePasswordRequestSchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
        },
        400
      )
    }

    const { currentPassword, newPassword } = validation.data
    const db = getDbClient()

    // Get user's current password hash
    const [currentUser] = await db
      .select({ passwordHash: schema.users.passwordHash })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))
      .limit(1)

    if (!currentUser) {
      return c.json(
        {
          success: false,
          error: 'User not found',
        },
        404
      )
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, currentUser.passwordHash)

    if (!isValidPassword) {
      return c.json(
        {
          success: false,
          error: 'Current password is incorrect',
        },
        401
      )
    }

    // Hash new password
    const saltRounds = 12
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds)

    // Update password
    await db
      .update(schema.users)
      .set({
        passwordHash: newPasswordHash,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, user.id))

    return c.json({
      success: true,
      data: {
        message: 'Password changed successfully',
      },
    })
  } catch (error) {
    console.error('Change password error:', error)
    return c.json(
      {
        success: false,
        error: 'An unexpected error occurred',
      },
      500
    )
  }
})

// ============================================
// API Token Routes
// ============================================

// Create API token
app.post('/api-tokens', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)

    // Parse and validate request body
    const body = await c.req.json()
    const validation = CreateApiTokenRequestSchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
        },
        400
      )
    }

    const { name, expiresInDays } = validation.data
    const db = getDbClient()

    // Generate API token
    const apiToken = generateApiToken()
    const apiTokenHash = hashToken(apiToken)

    // Calculate expiration (optional)
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null

    // Store token in database
    const [newToken] = await db
      .insert(schema.apiTokens)
      .values({
        userId: user.id,
        name,
        tokenHash: apiTokenHash,
        expiresAt,
      })
      .returning({
        id: schema.apiTokens.id,
        name: schema.apiTokens.name,
        expiresAt: schema.apiTokens.expiresAt,
        createdAt: schema.apiTokens.createdAt,
      })

    if (!newToken) {
      return c.json(
        {
          success: false,
          error: 'Failed to create API token',
        },
        500
      )
    }

    // Return the token (only time it's shown in plaintext!)
    return c.json(
      {
        success: true,
        data: {
          token: apiToken,
          id: newToken.id,
          name: newToken.name,
          expiresAt: newToken.expiresAt,
          createdAt: newToken.createdAt,
        },
        message: 'API token created. Save this token securely - it will not be shown again.',
      },
      201
    )
  } catch (error) {
    console.error('Create API token error:', error)
    return c.json(
      {
        success: false,
        error: 'An unexpected error occurred',
      },
      500
    )
  }
})

// List API tokens (does not return actual token values)
app.get('/api-tokens', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    // Get all non-revoked tokens for the user
    const tokens = await db
      .select({
        id: schema.apiTokens.id,
        name: schema.apiTokens.name,
        lastUsedAt: schema.apiTokens.lastUsedAt,
        expiresAt: schema.apiTokens.expiresAt,
        isRevoked: schema.apiTokens.isRevoked,
        createdAt: schema.apiTokens.createdAt,
      })
      .from(schema.apiTokens)
      .where(
        and(
          eq(schema.apiTokens.userId, user.id),
          eq(schema.apiTokens.isRevoked, false)
        )
      )
      .orderBy(schema.apiTokens.createdAt)

    return c.json({
      success: true,
      data: {
        tokens,
      },
    })
  } catch (error) {
    console.error('List API tokens error:', error)
    return c.json(
      {
        success: false,
        error: 'An unexpected error occurred',
      },
      500
    )
  }
})

// Revoke API token
app.delete('/api-tokens/:id', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const tokenId = c.req.param('id')
    const db = getDbClient()

    // Revoke the token (only if it belongs to the user)
    const result = await db
      .update(schema.apiTokens)
      .set({ isRevoked: true })
      .where(
        and(
          eq(schema.apiTokens.id, tokenId),
          eq(schema.apiTokens.userId, user.id),
          eq(schema.apiTokens.isRevoked, false)
        )
      )
      .returning({ id: schema.apiTokens.id })

    if (result.length === 0) {
      return c.json(
        {
          success: false,
          error: 'API token not found or already revoked',
        },
        404
      )
    }

    return c.json({
      success: true,
      data: {
        message: 'API token revoked successfully',
      },
    })
  } catch (error) {
    console.error('Revoke API token error:', error)
    return c.json(
      {
        success: false,
        error: 'An unexpected error occurred',
      },
      500
    )
  }
})

// Verify API token (for MCP server to validate tokens)
// Rate limited to prevent token enumeration attacks
app.post('/api-tokens/verify', authRateLimit, smallBodyLimit, async (c) => {
  try {
    const body = await c.req.json()
    const { token: apiToken } = body

    if (!apiToken || typeof apiToken !== 'string') {
      return c.json(
        {
          success: false,
          error: 'API token is required',
        },
        400
      )
    }

    const db = getDbClient()
    const tokenHash = hashToken(apiToken)

    // Find the token
    const [storedToken] = await db
      .select({
        id: schema.apiTokens.id,
        userId: schema.apiTokens.userId,
        name: schema.apiTokens.name,
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

    // Update last used timestamp
    await db
      .update(schema.apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.apiTokens.id, storedToken.id))

    return c.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        tokenName: storedToken.name,
      },
    })
  } catch (error) {
    console.error('Verify API token error:', error)
    return c.json(
      {
        success: false,
        error: 'An unexpected error occurred',
      },
      500
    )
  }
})

// ============================================
// Project Routes
// ============================================

// List all projects for the authenticated user
app.get('/projects', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    const projects = await db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        description: schema.projects.description,
        plan: schema.projects.plan,
        createdAt: schema.projects.createdAt,
        updatedAt: schema.projects.updatedAt,
      })
      .from(schema.projects)
      .where(eq(schema.projects.userId, user.id))
      .orderBy(desc(schema.projects.updatedAt))

    // Get project limits for the user
    const limits = await getProjectLimits(user.id)

    return c.json({
      success: true,
      data: { projects, limits },
    })
  } catch (error) {
    console.error('List projects error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// Create a new project
app.post('/projects', auth, async (c) => {
  try {
    const { user } = getAuth(c)

    const body = await c.req.json()
    const validation = CreateProjectRequestSchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
        },
        400
      )
    }

    // Check project limits before creating
    const limitCheck = await canCreateProject(user.id)

    if (!limitCheck.allowed) {
      return c.json(
        {
          success: false,
          error: limitCheck.reason,
          code: 'PROJECT_LIMIT_REACHED',
          details: {
            currentCount: limitCheck.currentCount,
            maxProjects: limitCheck.maxProjects,
            tier: limitCheck.tier,
            status: limitCheck.status,
          },
        },
        403
      )
    }

    const { name, description, plan } = validation.data
    const db = getDbClient()

    const [newProject] = await db
      .insert(schema.projects)
      .values({
        name,
        description: description ?? null,
        plan: plan ?? null,
        userId: user.id,
      })
      .returning({
        id: schema.projects.id,
        name: schema.projects.name,
        description: schema.projects.description,
        plan: schema.projects.plan,
        createdAt: schema.projects.createdAt,
        updatedAt: schema.projects.updatedAt,
      })

    // Get updated limits after creation
    const limits = await getProjectLimits(user.id)

    return c.json({ success: true, data: { project: newProject, limits } }, 201)
  } catch (error) {
    console.error('Create project error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /projects/:id - Get a single project
app.get('/projects/:id', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    const db = getDbClient()

    // Check if project exists and belongs to user
    const [project] = await db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        description: schema.projects.description,
        plan: schema.projects.plan,
        createdAt: schema.projects.createdAt,
        updatedAt: schema.projects.updatedAt,
      })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))
      .limit(1)

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    return c.json({ success: true, data: { project } })
  } catch (error) {
    console.error('Get project error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// PUT /projects/:id - Update a project
app.put('/projects/:id', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    const body = await c.req.json()
    const validation = UpdateProjectRequestSchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
        },
        400
      )
    }

    const { name, description, plan } = validation.data

    // Check if at least one field is provided
    if (name === undefined && description === undefined && plan === undefined) {
      return c.json(
        {
          success: false,
          error: 'At least one field (name, description, or plan) must be provided',
        },
        400
      )
    }

    const db = getDbClient()

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }
    if (name !== undefined) updateData['name'] = name
    if (description !== undefined) updateData['description'] = description
    if (plan !== undefined) updateData['plan'] = plan

    const [updatedProject] = await db
      .update(schema.projects)
      .set(updateData)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))
      .returning({
        id: schema.projects.id,
        name: schema.projects.name,
        description: schema.projects.description,
        plan: schema.projects.plan,
        createdAt: schema.projects.createdAt,
        updatedAt: schema.projects.updatedAt,
      })

    if (!updatedProject) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    return c.json({ success: true, data: { project: updatedProject } })
  } catch (error) {
    console.error('Update project error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// DELETE /projects/:id - Delete a project
app.delete('/projects/:id', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    const db = getDbClient()

    const [deletedProject] = await db
      .delete(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))
      .returning({ id: schema.projects.id })

    if (!deletedProject) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    return c.json({ success: true, data: { message: 'Project deleted successfully' } })
  } catch (error) {
    console.error('Delete project error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /projects/:id/plan - Get project plan content
app.get('/projects/:id/plan', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    const db = getDbClient()

    const [project] = await db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        plan: schema.projects.plan,
        updatedAt: schema.projects.updatedAt,
      })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    return c.json({
      success: true,
      data: {
        projectId: project.id,
        projectName: project.name,
        plan: project.plan,
        updatedAt: project.updatedAt,
      },
    })
  } catch (error) {
    console.error('Get project plan error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// PUT /projects/:id/plan - Update project plan content
// Uses larger body limit for plan content (up to 5MB)
app.put('/projects/:id/plan', largeBodyLimit, auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    const body = await c.req.json()

    // Validate request body - plan field is required
    if (typeof body.plan !== 'string' && body.plan !== null) {
      return c.json(
        {
          success: false,
          error: 'Validation failed',
          details: { plan: ['Plan must be a string or null'] },
        },
        400
      )
    }

    const db = getDbClient()

    const [updatedProject] = await db
      .update(schema.projects)
      .set({
        plan: body.plan,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))
      .returning({
        id: schema.projects.id,
        name: schema.projects.name,
        plan: schema.projects.plan,
        updatedAt: schema.projects.updatedAt,
      })

    if (!updatedProject) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Parse tasks from plan content and sync to database
    let tasksCount = 0
    let completedCount = 0

    if (body.plan) {
      try {
        const parsedTasks = parsePlanTasks(body.plan)
        tasksCount = parsedTasks.length

        if (parsedTasks.length > 0) {
          // Delete existing tasks for this project
          await db.delete(schema.tasks).where(eq(schema.tasks.projectId, projectId))

          // Insert new tasks
          const tasksToInsert = parsedTasks.map((task) => ({
            projectId,
            taskId: task.taskId,
            name: task.name,
            description: task.description,
            status: task.status,
            complexity: task.complexity,
            estimatedHours: task.estimatedHours,
            dependencies: task.dependencies,
          }))

          await db.insert(schema.tasks).values(tasksToInsert)

          // Count completed tasks
          completedCount = parsedTasks.filter((t) => t.status === 'DONE').length
        }
      } catch (parseError) {
        console.error('Task parsing error (non-fatal):', parseError)
        // Continue even if parsing fails - plan is still saved
      }
    }

    const progress = tasksCount > 0 ? Math.round((completedCount / tasksCount) * 100) : 0

    // Broadcast tasks synced via WebSocket
    if (tasksCount > 0) {
      broadcastTasksSynced(projectId, {
        tasksCount,
        completedCount,
        progress,
      })
    }

    return c.json({
      success: true,
      data: {
        projectId: updatedProject.id,
        projectName: updatedProject.name,
        plan: updatedProject.plan,
        updatedAt: updatedProject.updatedAt,
        tasksCount,
        completedCount,
        progress,
      },
    })
  } catch (error) {
    console.error('Update project plan error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /projects/:id/tasks - List all tasks for a project
app.get('/projects/:id/tasks', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    const db = getDbClient()

    // First verify the project exists and belongs to the user
    const [project] = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Get all tasks for the project, sorted by updatedAt DESC (most recently updated first)
    const tasks = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        description: schema.tasks.description,
        status: schema.tasks.status,
        complexity: schema.tasks.complexity,
        estimatedHours: schema.tasks.estimatedHours,
        dependencies: schema.tasks.dependencies,
        createdAt: schema.tasks.createdAt,
        updatedAt: schema.tasks.updatedAt,
      })
      .from(schema.tasks)
      .where(eq(schema.tasks.projectId, projectId))
      .orderBy(desc(schema.tasks.updatedAt))

    return c.json({
      success: true,
      data: {
        projectId: project.id,
        projectName: project.name,
        tasks,
      },
    })
  } catch (error) {
    console.error('List project tasks error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// PUT /projects/:id/tasks - Bulk update tasks for a project
app.put('/projects/:id/tasks', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    const body = await c.req.json()
    const validation = BulkUpdateTasksRequestSchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
        },
        400
      )
    }

    const { tasks: taskUpdates } = validation.data
    const db = getDbClient()

    // First verify the project exists and belongs to the user
    const [project] = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Verify all task IDs belong to this project
    const taskIds = taskUpdates.map((t) => t.id)
    const existingTasks = await db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId)))

    const existingTaskIds = new Set(existingTasks.map((t) => t.id))
    const invalidTaskIds = taskIds.filter((id) => !existingTaskIds.has(id))

    if (invalidTaskIds.length > 0) {
      return c.json(
        {
          success: false,
          error: 'Some tasks do not exist or do not belong to this project',
          details: { invalidTaskIds },
        },
        400
      )
    }

    // Update each task
    const updatedTasks = []
    for (const taskUpdate of taskUpdates) {
      const { id, ...updateFields } = taskUpdate

      // Build update object with only provided fields
      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      }
      if (updateFields.taskId !== undefined) updateData['taskId'] = updateFields.taskId
      if (updateFields.name !== undefined) updateData['name'] = updateFields.name
      if (updateFields.description !== undefined) updateData['description'] = updateFields.description
      if (updateFields.status !== undefined) updateData['status'] = updateFields.status
      if (updateFields.complexity !== undefined) updateData['complexity'] = updateFields.complexity
      if (updateFields.estimatedHours !== undefined) updateData['estimatedHours'] = updateFields.estimatedHours
      if (updateFields.dependencies !== undefined) updateData['dependencies'] = updateFields.dependencies

      const [updated] = await db
        .update(schema.tasks)
        .set(updateData)
        .where(and(eq(schema.tasks.id, id), eq(schema.tasks.projectId, projectId)))
        .returning({
          id: schema.tasks.id,
          taskId: schema.tasks.taskId,
          name: schema.tasks.name,
          description: schema.tasks.description,
          status: schema.tasks.status,
          complexity: schema.tasks.complexity,
          estimatedHours: schema.tasks.estimatedHours,
          dependencies: schema.tasks.dependencies,
          createdAt: schema.tasks.createdAt,
          updatedAt: schema.tasks.updatedAt,
        })

      if (updated) {
        updatedTasks.push(updated)
      }
    }

    // Update project's updatedAt timestamp
    await db
      .update(schema.projects)
      .set({ updatedAt: new Date() })
      .where(eq(schema.projects.id, projectId))

    // Broadcast all task updates via WebSocket
    if (updatedTasks.length > 0) {
      broadcastTasksUpdated(
        projectId,
        updatedTasks.map((t) => ({
          id: t.id,
          taskId: t.taskId,
          name: t.name,
          description: t.description,
          status: t.status,
          complexity: t.complexity,
          estimatedHours: t.estimatedHours,
          dependencies: t.dependencies ?? [],
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        }))
      )
    }

    return c.json({
      success: true,
      data: {
        projectId: project.id,
        projectName: project.name,
        updatedCount: updatedTasks.length,
        tasks: updatedTasks,
      },
    })
  } catch (error) {
    console.error('Update project tasks error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// PATCH /projects/:id/tasks/:taskId - Update a single task by taskId (e.g., T1.1)
app.patch('/projects/:id/tasks/:taskId', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId') // e.g., "T1.1"

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format (e.g., T1.1, T2.10)
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    const body = await c.req.json()

    // Validate status if provided
    const validStatuses = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED']
    if (body.status && !validStatuses.includes(body.status)) {
      return c.json(
        { success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        400
      )
    }

    const db = getDbClient()

    // Verify the project exists and belongs to the user
    const [project] = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Find the task by taskId (e.g., T1.1)
    const [existingTask] = await db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!existingTask) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found in this project` }, 404)
    }

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }
    if (body.name !== undefined) updateData['name'] = body.name
    if (body.description !== undefined) updateData['description'] = body.description
    if (body.status !== undefined) updateData['status'] = body.status
    if (body.complexity !== undefined) updateData['complexity'] = body.complexity
    if (body.estimatedHours !== undefined) updateData['estimatedHours'] = body.estimatedHours
    if (body.dependencies !== undefined) updateData['dependencies'] = body.dependencies

    // Update the task
    const [updated] = await db
      .update(schema.tasks)
      .set(updateData)
      .where(eq(schema.tasks.id, existingTask.id))
      .returning({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        description: schema.tasks.description,
        status: schema.tasks.status,
        complexity: schema.tasks.complexity,
        estimatedHours: schema.tasks.estimatedHours,
        dependencies: schema.tasks.dependencies,
        createdAt: schema.tasks.createdAt,
        updatedAt: schema.tasks.updatedAt,
      })

    // Update project's updatedAt timestamp
    await db
      .update(schema.projects)
      .set({ updatedAt: new Date() })
      .where(eq(schema.projects.id, projectId))

    // Broadcast task update via WebSocket
    if (updated) {
      broadcastTaskUpdated(projectId, {
        id: updated.id,
        taskId: updated.taskId,
        name: updated.name,
        description: updated.description,
        status: updated.status,
        complexity: updated.complexity,
        estimatedHours: updated.estimatedHours,
        dependencies: updated.dependencies ?? [],
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      })
    }

    return c.json({
      success: true,
      data: {
        projectId: project.id,
        projectName: project.name,
        task: updated,
      },
    })
  } catch (error) {
    console.error('Update task error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// ============================================
// Subscription Routes
// ============================================

// Get current subscription (supports both JWT and API tokens)
app.get('/subscriptions/current', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    // Try to find existing subscription
    let [subscription] = await db
      .select({
        id: schema.subscriptions.id,
        userId: schema.subscriptions.userId,
        tier: schema.subscriptions.tier,
        status: schema.subscriptions.status,
        lemonSqueezyCustomerId: schema.subscriptions.lemonSqueezyCustomerId,
        lemonSqueezySubscriptionId: schema.subscriptions.lemonSqueezySubscriptionId,
        currentPeriodStart: schema.subscriptions.currentPeriodStart,
        currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
        canceledAt: schema.subscriptions.canceledAt,
        createdAt: schema.subscriptions.createdAt,
        updatedAt: schema.subscriptions.updatedAt,
      })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, user.id))
      .limit(1)

    // If no subscription exists, create a free tier one
    if (!subscription) {
      ;[subscription] = await db
        .insert(schema.subscriptions)
        .values({
          userId: user.id,
          tier: 'free',
          status: 'active',
        })
        .returning({
          id: schema.subscriptions.id,
          userId: schema.subscriptions.userId,
          tier: schema.subscriptions.tier,
          status: schema.subscriptions.status,
          lemonSqueezyCustomerId: schema.subscriptions.lemonSqueezyCustomerId,
          lemonSqueezySubscriptionId: schema.subscriptions.lemonSqueezySubscriptionId,
          currentPeriodStart: schema.subscriptions.currentPeriodStart,
          currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
          canceledAt: schema.subscriptions.canceledAt,
          createdAt: schema.subscriptions.createdAt,
          updatedAt: schema.subscriptions.updatedAt,
        })
    }

    return c.json({
      success: true,
      data: { subscription },
    })
  } catch (error) {
    console.error('Get subscription error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// Create checkout session (JWT only)
app.post('/subscriptions/checkout', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)

    const body = await c.req.json()
    const validation = CreateCheckoutRequestSchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
        },
        400
      )
    }

    const { tier } = validation.data
    const db = getDbClient()

    // Get user email
    const [userData] = await db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))
      .limit(1)

    if (!userData) {
      return c.json({ success: false, error: 'User not found' }, 404)
    }

    // Get variant ID for the tier
    const variantId = getVariantIdForTier(tier)

    // Build redirect URLs - use web app URL from referrer or fallback
    const origin = c.req.header('origin') || c.req.header('referer')?.replace(/\/$/, '') || 'http://localhost:3000'
    const successUrl = `${origin}/checkout/success`
    const cancelUrl = `${origin}/checkout/cancel`

    // Create checkout URL
    const checkoutUrl = await createCheckoutUrl({
      variantId,
      userId: user.id,
      userEmail: userData.email,
      successUrl,
      cancelUrl,
    })

    return c.json({
      success: true,
      data: { checkoutUrl },
    })
  } catch (error) {
    console.error('Create checkout error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// Create customer portal session (JWT only)
app.post('/subscriptions/portal', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    // Get user's subscription to find LemonSqueezy customer ID
    const [subscription] = await db
      .select({
        lemonSqueezyCustomerId: schema.subscriptions.lemonSqueezyCustomerId,
      })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, user.id))
      .limit(1)

    if (!subscription?.lemonSqueezyCustomerId) {
      return c.json(
        {
          success: false,
          error: 'No billing account found. You may be on the free tier or your subscription is still being set up.',
        },
        404
      )
    }

    // Create customer portal URL
    const portalUrl = await createCustomerPortalUrl(subscription.lemonSqueezyCustomerId)

    return c.json({
      success: true,
      data: { portalUrl },
    })
  } catch (error) {
    console.error('Create portal error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// ============================================
// Webhook Routes
// ============================================

// LemonSqueezy webhook handler
// Handles subscription lifecycle events from LemonSqueezy
// Events: subscription_created, subscription_updated, subscription_cancelled,
//         subscription_resumed, subscription_paused, subscription_payment_success,
//         subscription_payment_failed, order_created, order_refunded
app.post('/webhooks/lemonsqueezy', webhookRateLimit, async (c) => {
  try {
    // Get raw body for signature verification
    const rawBody = await c.req.text()
    const signature = c.req.header('x-signature')

    if (!signature) {
      console.warn('[Webhook] Missing signature header')
      return c.json({ success: false, error: 'Missing signature' }, 401)
    }

    // Verify webhook signature
    if (!verifyWebhookSignature(rawBody, signature)) {
      console.warn('[Webhook] Invalid signature')
      return c.json({ success: false, error: 'Invalid signature' }, 401)
    }

    const payload = JSON.parse(rawBody)
    const eventName = payload.meta?.event_name
    const eventId = payload.meta?.event_id

    console.log(`[Webhook] Event received: ${eventName} (ID: ${eventId})`)

    const db = getDbClient()

    // Helper to extract user ID from various locations in webhook payload
    const extractUserId = (): string | null => {
      // Try meta.custom_data first (most common)
      if (payload.meta?.custom_data?.user_id) {
        return payload.meta.custom_data.user_id
      }
      // Try subscription item custom data
      const subscriptionData = payload.data?.attributes
      if (subscriptionData?.first_subscription_item?.custom_data?.user_id) {
        return subscriptionData.first_subscription_item.custom_data.user_id
      }
      // Try order custom data for order events
      if (subscriptionData?.first_order_item?.custom_data?.user_id) {
        return subscriptionData.first_order_item.custom_data.user_id
      }
      return null
    }

    // Helper to extract subscription data
    const getSubscriptionData = () => payload.data?.attributes || {}

    // Handle subscription created or updated
    if (eventName === 'subscription_created' || eventName === 'subscription_updated') {
      const subscriptionData = getSubscriptionData()
      const userId = extractUserId()

      if (!userId) {
        console.error(`[Webhook] ${eventName}: Missing user_id in custom_data`)
        return c.json({ success: false, error: 'Missing user_id in custom_data' }, 400)
      }

      // Map variant to tier
      const variantId = subscriptionData?.variant_id?.toString()
      const tier = variantId ? getTierFromVariantId(variantId) : null

      if (!tier) {
        console.error(`[Webhook] ${eventName}: Unknown variant ID: ${variantId}`)
        return c.json({ success: false, error: 'Unknown variant ID' }, 400)
      }

      // Map status
      const status = mapLemonSqueezyStatus(subscriptionData?.status || 'active')

      // Parse dates - created_at is period start, renews_at is period end
      const currentPeriodStart = subscriptionData?.created_at
        ? new Date(subscriptionData.created_at)
        : new Date()
      const currentPeriodEnd = subscriptionData?.renews_at
        ? new Date(subscriptionData.renews_at)
        : subscriptionData?.ends_at
          ? new Date(subscriptionData.ends_at)
          : null

      // Upsert subscription
      await db
        .insert(schema.subscriptions)
        .values({
          userId,
          tier,
          status,
          lemonSqueezyCustomerId: subscriptionData?.customer_id?.toString(),
          lemonSqueezySubscriptionId: payload.data?.id?.toString(),
          currentPeriodStart,
          currentPeriodEnd,
        })
        .onConflictDoUpdate({
          target: schema.subscriptions.userId,
          set: {
            tier,
            status,
            lemonSqueezyCustomerId: subscriptionData?.customer_id?.toString(),
            lemonSqueezySubscriptionId: payload.data?.id?.toString(),
            currentPeriodStart,
            currentPeriodEnd,
            updatedAt: new Date(),
          },
        })

      console.log(`[Webhook] ${eventName}: User ${userId} -> ${tier} (${status})`)
    }

    // Handle subscription cancelled
    if (eventName === 'subscription_cancelled') {
      const subscriptionData = getSubscriptionData()
      const userId = extractUserId()

      if (userId) {
        // Set status to canceled but keep tier until period ends
        // User still has access until currentPeriodEnd
        const endsAt = subscriptionData?.ends_at
          ? new Date(subscriptionData.ends_at)
          : null

        await db
          .update(schema.subscriptions)
          .set({
            status: 'canceled',
            canceledAt: new Date(),
            currentPeriodEnd: endsAt,
            updatedAt: new Date(),
          })
          .where(eq(schema.subscriptions.userId, userId))

        console.log(`[Webhook] subscription_cancelled: User ${userId} (ends: ${endsAt?.toISOString() || 'immediately'})`)
      } else {
        console.warn('[Webhook] subscription_cancelled: No user_id found')
      }
    }

    // Handle subscription resumed (reactivate paused subscription)
    if (eventName === 'subscription_resumed') {
      const subscriptionData = getSubscriptionData()
      const userId = extractUserId()

      if (userId) {
        const status = mapLemonSqueezyStatus(subscriptionData?.status || 'active')

        await db
          .update(schema.subscriptions)
          .set({
            status,
            canceledAt: null,
            updatedAt: new Date(),
          })
          .where(eq(schema.subscriptions.userId, userId))

        console.log(`[Webhook] subscription_resumed: User ${userId} -> ${status}`)
      }
    }

    // Handle subscription paused
    if (eventName === 'subscription_paused') {
      const userId = extractUserId()

      if (userId) {
        await db
          .update(schema.subscriptions)
          .set({
            status: 'past_due', // Treat paused as past_due for feature gating
            updatedAt: new Date(),
          })
          .where(eq(schema.subscriptions.userId, userId))

        console.log(`[Webhook] subscription_paused: User ${userId}`)
      }
    }

    // Handle successful payment (update period dates)
    if (eventName === 'subscription_payment_success') {
      const subscriptionData = getSubscriptionData()
      const userId = extractUserId()

      if (userId) {
        const currentPeriodEnd = subscriptionData?.renews_at
          ? new Date(subscriptionData.renews_at)
          : null

        await db
          .update(schema.subscriptions)
          .set({
            status: 'active',
            currentPeriodStart: new Date(),
            currentPeriodEnd,
            updatedAt: new Date(),
          })
          .where(eq(schema.subscriptions.userId, userId))

        console.log(`[Webhook] subscription_payment_success: User ${userId} (renews: ${currentPeriodEnd?.toISOString()})`)
      }
    }

    // Handle failed payment
    if (eventName === 'subscription_payment_failed') {
      const userId = extractUserId()

      if (userId) {
        await db
          .update(schema.subscriptions)
          .set({
            status: 'past_due',
            updatedAt: new Date(),
          })
          .where(eq(schema.subscriptions.userId, userId))

        console.log(`[Webhook] subscription_payment_failed: User ${userId} -> past_due`)
      }
    }

    // Handle order created (initial purchase or one-time)
    if (eventName === 'order_created') {
      const orderData = getSubscriptionData()
      const userId = extractUserId()

      if (userId) {
        console.log(`[Webhook] order_created: User ${userId}, Order ${payload.data?.id}, Status: ${orderData?.status}`)
        // Note: Subscription will be created via subscription_created event
        // This event is mainly for logging/analytics
      }
    }

    // Handle order refunded
    if (eventName === 'order_refunded') {
      const orderData = getSubscriptionData()
      const userId = extractUserId()

      if (userId) {
        // Check if this is a full refund
        const refundedAmount = orderData?.refunded_amount || 0
        const totalAmount = orderData?.total || 0

        console.log(`[Webhook] order_refunded: User ${userId}, Refund: ${refundedAmount}/${totalAmount}`)

        // If full refund, downgrade to free tier
        if (refundedAmount >= totalAmount) {
          await db
            .update(schema.subscriptions)
            .set({
              tier: 'free',
              status: 'canceled',
              canceledAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(schema.subscriptions.userId, userId))

          console.log(`[Webhook] order_refunded: User ${userId} downgraded to free (full refund)`)
        }
      }
    }

    // Handle subscription expired (past grace period)
    if (eventName === 'subscription_expired') {
      const userId = extractUserId()

      if (userId) {
        // Downgrade to free tier
        await db
          .update(schema.subscriptions)
          .set({
            tier: 'free',
            status: 'canceled',
            canceledAt: new Date(),
            currentPeriodEnd: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.subscriptions.userId, userId))

        console.log(`[Webhook] subscription_expired: User ${userId} downgraded to free`)
      }
    }

    return c.json({ success: true, event: eventName })
  } catch (error) {
    console.error('[Webhook] Processing error:', error)
    return c.json({ success: false, error: 'Webhook processing failed' }, 500)
  }
})

// ============================================
// Feedback Routes
// ============================================

// Submit feedback (authenticated users only)
app.post('/feedback', auth, async (c) => {
  try {
    const { user } = getAuth(c)

    const body = await c.req.json()
    const validation = CreateFeedbackRequestSchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
        },
        400
      )
    }

    const { category, rating, message, pageUrl } = validation.data
    const db = getDbClient()

    // Get user agent from request headers
    const userAgent = c.req.header('user-agent') || null

    const [newFeedback] = await db
      .insert(schema.feedback)
      .values({
        userId: user.id,
        category,
        rating,
        message,
        userAgent,
        pageUrl: pageUrl || null,
      })
      .returning({
        id: schema.feedback.id,
        category: schema.feedback.category,
        rating: schema.feedback.rating,
        message: schema.feedback.message,
        createdAt: schema.feedback.createdAt,
      })

    return c.json(
      {
        success: true,
        data: {
          feedback: newFeedback,
          message: 'Thank you for your feedback!',
        },
      },
      201
    )
  } catch (error) {
    console.error('Submit feedback error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// Get user's own feedback history
app.get('/feedback', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    const feedbackList = await db
      .select({
        id: schema.feedback.id,
        category: schema.feedback.category,
        rating: schema.feedback.rating,
        message: schema.feedback.message,
        createdAt: schema.feedback.createdAt,
      })
      .from(schema.feedback)
      .where(eq(schema.feedback.userId, user.id))
      .orderBy(desc(schema.feedback.createdAt))
      .limit(50)

    return c.json({
      success: true,
      data: { feedback: feedbackList },
    })
  } catch (error) {
    console.error('Get feedback error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// ============================================
// Organization Routes
// ============================================

// POST /organizations - Create a new organization
app.post('/organizations', auth, async (c) => {
  try {
    const { user } = getAuth(c)

    const body = await c.req.json()
    const validation = CreateOrganizationRequestSchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
        },
        400
      )
    }

    const { name, slug: providedSlug, description } = validation.data
    const slug = providedSlug || generateSlug(name)
    const db = getDbClient()

    // Check if slug is already taken
    const [existingOrg] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.slug, slug))
      .limit(1)

    if (existingOrg) {
      return c.json(
        {
          success: false,
          error: 'An organization with this slug already exists',
        },
        409
      )
    }

    // Insert organization
    const [newOrg] = await db
      .insert(schema.organizations)
      .values({
        name,
        slug,
        description: description ?? null,
        createdBy: user.id,
      })
      .returning({
        id: schema.organizations.id,
        name: schema.organizations.name,
        slug: schema.organizations.slug,
        description: schema.organizations.description,
        createdBy: schema.organizations.createdBy,
        createdAt: schema.organizations.createdAt,
        updatedAt: schema.organizations.updatedAt,
      })

    if (!newOrg) {
      return c.json(
        {
          success: false,
          error: 'Failed to create organization',
        },
        500
      )
    }

    // Add creator as owner member
    try {
      await db.insert(schema.organizationMembers).values({
        organizationId: newOrg.id,
        userId: user.id,
        role: 'owner',
      })
    } catch (memberError) {
      // If member insert fails, delete the org to avoid orphaned orgs
      await db
        .delete(schema.organizations)
        .where(eq(schema.organizations.id, newOrg.id))
      console.error('Failed to add owner member, rolled back org creation:', memberError)
      return c.json(
        {
          success: false,
          error: 'Failed to create organization',
        },
        500
      )
    }

    return c.json(
      {
        success: true,
        data: { organization: newOrg },
      },
      201
    )
  } catch (error) {
    console.error('Create organization error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /organizations - List user's organizations
app.get('/organizations', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    const orgs = await db
      .select({
        id: schema.organizations.id,
        name: schema.organizations.name,
        slug: schema.organizations.slug,
        description: schema.organizations.description,
        createdBy: schema.organizations.createdBy,
        createdAt: schema.organizations.createdAt,
        updatedAt: schema.organizations.updatedAt,
        role: schema.organizationMembers.role,
      })
      .from(schema.organizationMembers)
      .innerJoin(
        schema.organizations,
        eq(schema.organizationMembers.organizationId, schema.organizations.id)
      )
      .where(eq(schema.organizationMembers.userId, user.id))
      .orderBy(desc(schema.organizations.updatedAt))

    return c.json({
      success: true,
      data: { organizations: orgs },
    })
  } catch (error) {
    console.error('List organizations error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /organizations/:id - Get organization details
app.get('/organizations/:id', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orgId)) {
      return c.json({ success: false, error: 'Invalid organization ID format' }, 400)
    }

    const db = getDbClient()

    // Get org + user's membership in a single query
    const [result] = await db
      .select({
        id: schema.organizations.id,
        name: schema.organizations.name,
        slug: schema.organizations.slug,
        description: schema.organizations.description,
        createdBy: schema.organizations.createdBy,
        createdAt: schema.organizations.createdAt,
        updatedAt: schema.organizations.updatedAt,
        role: schema.organizationMembers.role,
      })
      .from(schema.organizationMembers)
      .innerJoin(
        schema.organizations,
        eq(schema.organizationMembers.organizationId, schema.organizations.id)
      )
      .where(
        and(
          eq(schema.organizationMembers.userId, user.id),
          eq(schema.organizations.id, orgId)
        )
      )
      .limit(1)

    if (!result) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    return c.json({
      success: true,
      data: { organization: result },
    })
  } catch (error) {
    console.error('Get organization error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// PUT /organizations/:id - Update organization
app.put('/organizations/:id', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orgId)) {
      return c.json({ success: false, error: 'Invalid organization ID format' }, 400)
    }

    const body = await c.req.json()
    const validation = UpdateOrganizationRequestSchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
        },
        400
      )
    }

    const { name, slug, description } = validation.data

    // Check if at least one field is provided
    if (name === undefined && slug === undefined && description === undefined) {
      return c.json(
        {
          success: false,
          error: 'At least one field (name, slug, or description) must be provided',
        },
        400
      )
    }

    const db = getDbClient()

    // Check membership and role (must be owner or admin)
    const [membership] = await db
      .select({ role: schema.organizationMembers.role })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, orgId),
          eq(schema.organizationMembers.userId, user.id)
        )
      )
      .limit(1)

    if (!membership) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    if (membership.role !== 'owner' && membership.role !== 'admin') {
      return c.json({ success: false, error: 'Only owners and admins can update the organization' }, 403)
    }

    // If slug is being changed, check uniqueness
    if (slug) {
      const [existingOrg] = await db
        .select({ id: schema.organizations.id })
        .from(schema.organizations)
        .where(
          and(
            eq(schema.organizations.slug, slug),
            ne(schema.organizations.id, orgId)
          )
        )
        .limit(1)

      if (existingOrg) {
        return c.json(
          {
            success: false,
            error: 'An organization with this slug already exists',
          },
          409
        )
      }
    }

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }
    if (name !== undefined) updateData['name'] = name
    if (slug !== undefined) updateData['slug'] = slug
    if (description !== undefined) updateData['description'] = description

    const [updatedOrg] = await db
      .update(schema.organizations)
      .set(updateData)
      .where(eq(schema.organizations.id, orgId))
      .returning({
        id: schema.organizations.id,
        name: schema.organizations.name,
        slug: schema.organizations.slug,
        description: schema.organizations.description,
        createdBy: schema.organizations.createdBy,
        createdAt: schema.organizations.createdAt,
        updatedAt: schema.organizations.updatedAt,
      })

    if (!updatedOrg) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    return c.json({ success: true, data: { organization: updatedOrg } })
  } catch (error) {
    console.error('Update organization error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// DELETE /organizations/:id - Delete organization
app.delete('/organizations/:id', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orgId)) {
      return c.json({ success: false, error: 'Invalid organization ID format' }, 400)
    }

    const db = getDbClient()

    // Check membership and role (must be owner)
    const [membership] = await db
      .select({ role: schema.organizationMembers.role })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, orgId),
          eq(schema.organizationMembers.userId, user.id)
        )
      )
      .limit(1)

    if (!membership) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    if (membership.role !== 'owner') {
      return c.json({ success: false, error: 'Only the owner can delete the organization' }, 403)
    }

    const [deletedOrg] = await db
      .delete(schema.organizations)
      .where(eq(schema.organizations.id, orgId))
      .returning({ id: schema.organizations.id })

    if (!deletedOrg) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    return c.json({ success: true, data: { message: 'Organization deleted successfully' } })
  } catch (error) {
    console.error('Delete organization error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /organizations/:id/members - List organization members
app.get('/organizations/:id/members', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orgId)) {
      return c.json({ success: false, error: 'Invalid organization ID format' }, 400)
    }

    const db = getDbClient()

    // Check if user is a member of this organization
    const [membership] = await db
      .select({ role: schema.organizationMembers.role })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, orgId),
          eq(schema.organizationMembers.userId, user.id)
        )
      )
      .limit(1)

    if (!membership) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    // Get all members with user info
    const members = await db
      .select({
        id: schema.organizationMembers.id,
        organizationId: schema.organizationMembers.organizationId,
        userId: schema.organizationMembers.userId,
        role: schema.organizationMembers.role,
        createdAt: schema.organizationMembers.createdAt,
        updatedAt: schema.organizationMembers.updatedAt,
        userName: schema.users.name,
        userEmail: schema.users.email,
      })
      .from(schema.organizationMembers)
      .innerJoin(schema.users, eq(schema.organizationMembers.userId, schema.users.id))
      .where(eq(schema.organizationMembers.organizationId, orgId))
      .orderBy(schema.organizationMembers.createdAt)

    return c.json({
      success: true,
      data: { members },
    })
  } catch (error) {
    console.error('List organization members error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// POST /organizations/:id/invitations - Create invitation
app.post('/organizations/:id/invitations', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orgId)) {
      return c.json({ success: false, error: 'Invalid organization ID format' }, 400)
    }

    const body = await c.req.json()
    const validation = CreateInvitationRequestSchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
        },
        400
      )
    }

    const { email, role } = validation.data
    const db = getDbClient()

    // Check membership and role (must be owner or admin)
    const [membership] = await db
      .select({ role: schema.organizationMembers.role })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, orgId),
          eq(schema.organizationMembers.userId, user.id)
        )
      )
      .limit(1)

    if (!membership) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    if (membership.role !== 'owner' && membership.role !== 'admin') {
      return c.json({ success: false, error: 'Only owners and admins can invite members' }, 403)
    }

    // Check if the email is already an org member
    const [existingMember] = await db
      .select({ id: schema.organizationMembers.id })
      .from(schema.organizationMembers)
      .innerJoin(schema.users, eq(schema.organizationMembers.userId, schema.users.id))
      .where(
        and(
          eq(schema.organizationMembers.organizationId, orgId),
          eq(schema.users.email, email)
        )
      )
      .limit(1)

    if (existingMember) {
      return c.json({ success: false, error: 'User is already a member of this organization' }, 409)
    }

    // Check for duplicate pending invitation (same org + email + not accepted)
    const [existingInvitation] = await db
      .select({ id: schema.teamInvitations.id })
      .from(schema.teamInvitations)
      .where(
        and(
          eq(schema.teamInvitations.organizationId, orgId),
          eq(schema.teamInvitations.email, email),
          isNull(schema.teamInvitations.acceptedAt),
          gt(schema.teamInvitations.expiresAt, new Date())
        )
      )
      .limit(1)

    if (existingInvitation) {
      return c.json({ success: false, error: 'A pending invitation already exists for this email' }, 409)
    }

    // Generate secure token and set expiry (7 days)
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const [invitation] = await db
      .insert(schema.teamInvitations)
      .values({
        organizationId: orgId,
        email,
        role,
        invitedBy: user.id,
        token,
        expiresAt,
      })
      .returning({
        id: schema.teamInvitations.id,
        organizationId: schema.teamInvitations.organizationId,
        email: schema.teamInvitations.email,
        role: schema.teamInvitations.role,
        invitedBy: schema.teamInvitations.invitedBy,
        token: schema.teamInvitations.token,
        expiresAt: schema.teamInvitations.expiresAt,
        acceptedAt: schema.teamInvitations.acceptedAt,
        createdAt: schema.teamInvitations.createdAt,
      })

    if (!invitation) {
      return c.json({ success: false, error: 'Failed to create invitation' }, 500)
    }

    return c.json(
      {
        success: true,
        data: { invitation },
      },
      201
    )
  } catch (error) {
    console.error('Create invitation error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /organizations/:id/invitations - List pending invitations
app.get('/organizations/:id/invitations', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orgId)) {
      return c.json({ success: false, error: 'Invalid organization ID format' }, 400)
    }

    const db = getDbClient()

    // Check if user is a member of this organization
    const [membership] = await db
      .select({ role: schema.organizationMembers.role })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, orgId),
          eq(schema.organizationMembers.userId, user.id)
        )
      )
      .limit(1)

    if (!membership) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    // Get pending invitations (not accepted, not expired) with inviter info
    const invitations = await db
      .select({
        id: schema.teamInvitations.id,
        organizationId: schema.teamInvitations.organizationId,
        email: schema.teamInvitations.email,
        role: schema.teamInvitations.role,
        invitedBy: schema.teamInvitations.invitedBy,
        token: schema.teamInvitations.token,
        expiresAt: schema.teamInvitations.expiresAt,
        acceptedAt: schema.teamInvitations.acceptedAt,
        createdAt: schema.teamInvitations.createdAt,
        inviterName: schema.users.name,
      })
      .from(schema.teamInvitations)
      .innerJoin(schema.users, eq(schema.teamInvitations.invitedBy, schema.users.id))
      .where(
        and(
          eq(schema.teamInvitations.organizationId, orgId),
          isNull(schema.teamInvitations.acceptedAt),
          gt(schema.teamInvitations.expiresAt, new Date())
        )
      )
      .orderBy(desc(schema.teamInvitations.createdAt))

    return c.json({
      success: true,
      data: { invitations },
    })
  } catch (error) {
    console.error('List invitations error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// POST /invitations/:token/accept - Accept invitation
app.post('/invitations/:token/accept', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const token = c.req.param('token')
    const db = getDbClient()

    // Find invitation by token
    const [invitation] = await db
      .select({
        id: schema.teamInvitations.id,
        organizationId: schema.teamInvitations.organizationId,
        email: schema.teamInvitations.email,
        role: schema.teamInvitations.role,
        expiresAt: schema.teamInvitations.expiresAt,
        acceptedAt: schema.teamInvitations.acceptedAt,
      })
      .from(schema.teamInvitations)
      .where(eq(schema.teamInvitations.token, token))
      .limit(1)

    if (!invitation) {
      return c.json({ success: false, error: 'Invitation not found' }, 404)
    }

    if (invitation.acceptedAt) {
      return c.json({ success: false, error: 'Invitation has already been accepted' }, 409)
    }

    if (new Date() > invitation.expiresAt) {
      return c.json({ success: false, error: 'Invitation has expired' }, 410)
    }

    // Check invitee email matches authenticated user
    if (invitation.email !== user.email) {
      return c.json({ success: false, error: 'This invitation was sent to a different email address' }, 403)
    }

    // Add user to org_members with invitation's role
    await db.insert(schema.organizationMembers).values({
      organizationId: invitation.organizationId,
      userId: user.id,
      role: invitation.role,
    })

    // Mark invitation as accepted
    await db
      .update(schema.teamInvitations)
      .set({ acceptedAt: new Date() })
      .where(eq(schema.teamInvitations.id, invitation.id))

    // Fetch the organization data to return
    const [org] = await db
      .select({
        id: schema.organizations.id,
        name: schema.organizations.name,
        slug: schema.organizations.slug,
        description: schema.organizations.description,
        createdBy: schema.organizations.createdBy,
        createdAt: schema.organizations.createdAt,
        updatedAt: schema.organizations.updatedAt,
      })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, invitation.organizationId))
      .limit(1)

    return c.json({
      success: true,
      data: { organization: org },
    })
  } catch (error) {
    console.error('Accept invitation error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// DELETE /organizations/:id/invitations/:invitationId - Revoke invitation
app.delete('/organizations/:id/invitations/:invitationId', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')
    const invitationId = c.req.param('invitationId')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orgId) || !uuidRegex.test(invitationId)) {
      return c.json({ success: false, error: 'Invalid ID format' }, 400)
    }

    const db = getDbClient()

    // Check membership and role (must be owner or admin)
    const [membership] = await db
      .select({ role: schema.organizationMembers.role })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, orgId),
          eq(schema.organizationMembers.userId, user.id)
        )
      )
      .limit(1)

    if (!membership) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    if (membership.role !== 'owner' && membership.role !== 'admin') {
      return c.json({ success: false, error: 'Only owners and admins can revoke invitations' }, 403)
    }

    // Delete the invitation (only if not yet accepted)
    const [deleted] = await db
      .delete(schema.teamInvitations)
      .where(
        and(
          eq(schema.teamInvitations.id, invitationId),
          eq(schema.teamInvitations.organizationId, orgId),
          isNull(schema.teamInvitations.acceptedAt)
        )
      )
      .returning({ id: schema.teamInvitations.id })

    if (!deleted) {
      return c.json({ success: false, error: 'Invitation not found or already accepted' }, 404)
    }

    return c.json({ success: true, data: { message: 'Invitation revoked successfully' } })
  } catch (error) {
    console.error('Revoke invitation error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// POST /invitations/:token/decline - Decline invitation
app.post('/invitations/:token/decline', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const token = c.req.param('token')
    const db = getDbClient()

    // Find invitation by token
    const [invitation] = await db
      .select({
        id: schema.teamInvitations.id,
        email: schema.teamInvitations.email,
      })
      .from(schema.teamInvitations)
      .where(eq(schema.teamInvitations.token, token))
      .limit(1)

    if (!invitation) {
      return c.json({ success: false, error: 'Invitation not found' }, 404)
    }

    // Check email matches user
    if (invitation.email !== user.email) {
      return c.json({ success: false, error: 'This invitation was sent to a different email address' }, 403)
    }

    // Delete the invitation
    await db
      .delete(schema.teamInvitations)
      .where(eq(schema.teamInvitations.id, invitation.id))

    return c.json({ success: true, data: { message: 'Invitation declined successfully' } })
  } catch (error) {
    console.error('Decline invitation error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// Start server
const port = Number(process.env['PORT']) || 3001

console.log(`🚀 PlanFlow API running on http://localhost:${port}`)

const server = serve({
  fetch: app.fetch,
  port,
})

// Setup WebSocket server
setupWebSocketServer(server)

export default app
