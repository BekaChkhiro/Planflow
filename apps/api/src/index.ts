import 'dotenv/config'
import { serve } from '@hono/node-server'
import { swaggerUI } from '@hono/swagger-ui'
import { Hono } from 'hono'
// Note: Using custom secureCors from middleware/security.ts instead of hono/cors
import { logger } from 'hono/logger'
import { and, count, desc, eq, gt, isNotNull, isNull, ne } from 'drizzle-orm'
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
  UpdateMemberRoleRequestSchema,
  AssignTaskRequestSchema,
  CreateCommentRequestSchema,
  UpdateCommentRequestSchema,
  ActivityLogQuerySchema,
  NotificationsQuerySchema,
  MarkNotificationsReadRequestSchema,
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
import {
  sendNotificationEmail,
  sendTeamInvitationEmail,
  sendWelcomeEmail,
  isEmailServiceConfigured,
  type NotificationType,
} from './lib/email.js'
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
  parseAndResolveMentions,
  extractUserIds,
  searchMentionableUsers,
} from './lib/mentions.js'
import {
  setupWebSocketServer,
  broadcastTaskUpdated,
  broadcastTasksUpdated,
  broadcastTasksSynced,
  broadcastTaskAssigned,
  broadcastTaskUnassigned,
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

    // Broadcast tasks synced via WebSocket (exclude sender)
    if (tasksCount > 0) {
      broadcastTasksSynced(projectId, {
        tasksCount,
        completedCount,
        progress,
      }, user.id)
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
        assigneeId: schema.tasks.assigneeId,
        assignedBy: schema.tasks.assignedBy,
        assignedAt: schema.tasks.assignedAt,
        createdAt: schema.tasks.createdAt,
        updatedAt: schema.tasks.updatedAt,
      })
      .from(schema.tasks)
      .where(eq(schema.tasks.projectId, projectId))
      .orderBy(desc(schema.tasks.updatedAt))

    // Get assignee info for tasks that have assignees
    const assigneeIds = [...new Set(tasks.filter((t) => t.assigneeId).map((t) => t.assigneeId!))]
    let userMap: Record<string, { id: string; email: string; name: string | null }> = {}

    if (assigneeIds.length > 0) {
      for (const userId of assigneeIds) {
        const [u] = await db
          .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
          .from(schema.users)
          .where(eq(schema.users.id, userId))
        if (u) userMap[u.id] = u
      }
    }

    // Map tasks with assignee info
    const tasksWithAssignees = tasks.map((task) => {
      const assigneeUser = task.assigneeId ? userMap[task.assigneeId] : null
      return {
        ...task,
        assignee: assigneeUser
          ? {
              id: assigneeUser.id,
              email: assigneeUser.email,
              name: assigneeUser.name,
            }
          : null,
      }
    })

    return c.json({
      success: true,
      data: {
        projectId: project.id,
        projectName: project.name,
        tasks: tasksWithAssignees,
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

    // Broadcast all task updates via WebSocket (exclude sender)
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
        })),
        user.id
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
        assigneeId: schema.tasks.assigneeId,
        assignedBy: schema.tasks.assignedBy,
        assignedAt: schema.tasks.assignedAt,
        createdAt: schema.tasks.createdAt,
        updatedAt: schema.tasks.updatedAt,
      })

    // Update project's updatedAt timestamp
    await db
      .update(schema.projects)
      .set({ updatedAt: new Date() })
      .where(eq(schema.projects.id, projectId))

    if (!updated) {
      return c.json({ success: false, error: 'Failed to update task' }, 500)
    }

    // Broadcast task update via WebSocket (exclude sender to avoid echo)
    broadcastTaskUpdated(projectId, {
      id: updated.id,
      taskId: updated.taskId,
      name: updated.name,
      description: updated.description,
      status: updated.status,
      complexity: updated.complexity,
      estimatedHours: updated.estimatedHours,
      dependencies: updated.dependencies ?? [],
      assigneeId: updated.assigneeId,
      assignedBy: updated.assignedBy,
      assignedAt: updated.assignedAt,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    }, user.id)

    // Get assignee info if task is assigned
    let assignee = null
    if (updated.assigneeId) {
      const [assigneeUser] = await db
        .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
        .from(schema.users)
        .where(eq(schema.users.id, updated.assigneeId))
      assignee = assigneeUser || null
    }

    return c.json({
      success: true,
      data: {
        projectId: project.id,
        projectName: project.name,
        task: {
          ...updated,
          assignee,
        },
      },
    })
  } catch (error) {
    console.error('Update task error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// ============================================
// Task Assignment Routes (T5.4)
// ============================================

// POST /projects/:id/tasks/:taskId/assign - Assign a task to a user
app.post('/projects/:id/tasks/:taskId/assign', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')

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
    const parsed = AssignTaskRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(
        { success: false, error: parsed.error.errors[0]?.message || 'Invalid request body' },
        400
      )
    }

    const { assigneeId } = parsed.data
    const db = getDbClient()

    // Verify the project exists and belongs to the user
    const [project] = await db
      .select({ id: schema.projects.id, name: schema.projects.name, userId: schema.projects.userId })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Find the task by taskId
    const [existingTask] = await db
      .select({ id: schema.tasks.id, taskId: schema.tasks.taskId })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!existingTask) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found in this project` }, 404)
    }

    // Verify the assignee exists
    const [assignee] = await db
      .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, assigneeId))

    if (!assignee) {
      return c.json({ success: false, error: 'Assignee user not found' }, 404)
    }

    // Update the task with assignment info
    const [updated] = await db
      .update(schema.tasks)
      .set({
        assigneeId: assigneeId,
        assignedBy: user.id,
        assignedAt: new Date(),
        updatedAt: new Date(),
      })
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
        assigneeId: schema.tasks.assigneeId,
        assignedBy: schema.tasks.assignedBy,
        assignedAt: schema.tasks.assignedAt,
        createdAt: schema.tasks.createdAt,
        updatedAt: schema.tasks.updatedAt,
      })

    // Update project's updatedAt timestamp
    await db
      .update(schema.projects)
      .set({ updatedAt: new Date() })
      .where(eq(schema.projects.id, projectId))

    if (!updated) {
      return c.json({ success: false, error: 'Failed to assign task' }, 500)
    }

    // Get assigner info for broadcast
    const [assigner] = await db
      .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))

    // Broadcast task assignment via WebSocket (exclude sender)
    broadcastTaskAssigned(
      projectId,
      {
        task: {
          id: updated.id,
          taskId: updated.taskId,
          name: updated.name,
          description: updated.description,
          status: updated.status,
          complexity: updated.complexity,
          estimatedHours: updated.estimatedHours,
          dependencies: updated.dependencies ?? [],
          assigneeId: updated.assigneeId,
          assignedBy: updated.assignedBy,
          assignedAt: updated.assignedAt,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        },
        assignee: {
          id: assignee.id,
          email: assignee.email,
          name: assignee.name,
        },
        assignedBy: assigner ? {
          id: assigner.id,
          email: assigner.email,
          name: assigner.name,
        } : { id: user.id, email: user.email, name: null },
      },
      user.id
    )

    // Create notification and send email to assignee (if not self-assignment)
    if (assigneeId !== user.id) {
      const appUrl = process.env['APP_URL'] || 'https://planflow.tools'
      createNotification({
        userId: assigneeId,
        type: 'assignment',
        title: `You were assigned to task ${taskIdParam}`,
        body: `${user.name || user.email} assigned you to "${updated.name}" in project "${project.name}".`,
        link: `${appUrl}/projects/${projectId}/tasks/${taskIdParam}`,
        projectId,
        actorId: user.id,
        taskId: taskIdParam,
        // Email options
        sendEmail: true,
        recipientEmail: assignee.email,
        projectName: project.name,
        actorName: user.name || user.email,
      })
    }

    return c.json({
      success: true,
      data: {
        projectId: project.id,
        projectName: project.name,
        task: {
          ...updated,
          assignee: {
            id: assignee.id,
            email: assignee.email,
            name: assignee.name,
          },
        },
      },
    })
  } catch (error) {
    console.error('Assign task error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// DELETE /projects/:id/tasks/:taskId/assign - Unassign a task
app.delete('/projects/:id/tasks/:taskId/assign', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')

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

    const db = getDbClient()

    // Verify the project exists and belongs to the user
    const [project] = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Find the task by taskId
    const [existingTask] = await db
      .select({ id: schema.tasks.id, taskId: schema.tasks.taskId, assigneeId: schema.tasks.assigneeId })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!existingTask) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found in this project` }, 404)
    }

    if (!existingTask.assigneeId) {
      return c.json({ success: false, error: 'Task is not assigned to anyone' }, 400)
    }

    // Remove assignment
    const [updated] = await db
      .update(schema.tasks)
      .set({
        assigneeId: null,
        assignedBy: null,
        assignedAt: null,
        updatedAt: new Date(),
      })
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
        assigneeId: schema.tasks.assigneeId,
        assignedBy: schema.tasks.assignedBy,
        assignedAt: schema.tasks.assignedAt,
        createdAt: schema.tasks.createdAt,
        updatedAt: schema.tasks.updatedAt,
      })

    // Update project's updatedAt timestamp
    await db
      .update(schema.projects)
      .set({ updatedAt: new Date() })
      .where(eq(schema.projects.id, projectId))

    if (!updated) {
      return c.json({ success: false, error: 'Failed to unassign task' }, 500)
    }

    // Get unassigner info for broadcast
    const [unassigner] = await db
      .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))

    // Broadcast task unassignment via WebSocket (exclude sender)
    broadcastTaskUnassigned(
      projectId,
      {
        task: {
          id: updated.id,
          taskId: updated.taskId,
          name: updated.name,
          description: updated.description,
          status: updated.status,
          complexity: updated.complexity,
          estimatedHours: updated.estimatedHours,
          dependencies: updated.dependencies ?? [],
          assigneeId: updated.assigneeId,
          assignedBy: updated.assignedBy,
          assignedAt: updated.assignedAt,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        },
        previousAssigneeId: existingTask.assigneeId,
        unassignedBy: unassigner ? {
          id: unassigner.id,
          email: unassigner.email,
          name: unassigner.name,
        } : { id: user.id, email: user.email, name: null },
      },
      user.id
    )

    return c.json({
      success: true,
      data: {
        projectId: project.id,
        projectName: project.name,
        task: updated,
      },
    })
  } catch (error) {
    console.error('Unassign task error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /users/me/assigned-tasks - Get tasks assigned to the current user
app.get('/users/me/assigned-tasks', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    // Get all tasks assigned to the current user
    const assignedTasks = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        description: schema.tasks.description,
        status: schema.tasks.status,
        complexity: schema.tasks.complexity,
        estimatedHours: schema.tasks.estimatedHours,
        dependencies: schema.tasks.dependencies,
        assigneeId: schema.tasks.assigneeId,
        assignedBy: schema.tasks.assignedBy,
        assignedAt: schema.tasks.assignedAt,
        createdAt: schema.tasks.createdAt,
        updatedAt: schema.tasks.updatedAt,
        projectId: schema.tasks.projectId,
        projectName: schema.projects.name,
      })
      .from(schema.tasks)
      .innerJoin(schema.projects, eq(schema.tasks.projectId, schema.projects.id))
      .where(eq(schema.tasks.assigneeId, user.id))
      .orderBy(desc(schema.tasks.updatedAt))

    // Group tasks by project for convenience
    const tasksByProject = assignedTasks.reduce(
      (acc, task) => {
        const key = task.projectId
        if (!acc[key]) {
          acc[key] = {
            projectId: task.projectId,
            projectName: task.projectName,
            tasks: [],
          }
        }
        acc[key].tasks.push({
          id: task.id,
          taskId: task.taskId,
          name: task.name,
          description: task.description,
          status: task.status,
          complexity: task.complexity,
          estimatedHours: task.estimatedHours,
          dependencies: task.dependencies ?? [],
          assigneeId: task.assigneeId,
          assignedBy: task.assignedBy,
          assignedAt: task.assignedAt,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
        })
        return acc
      },
      {} as Record<string, { projectId: string; projectName: string; tasks: unknown[] }>
    )

    return c.json({
      success: true,
      data: {
        totalTasks: assignedTasks.length,
        tasks: assignedTasks.map((task) => ({
          id: task.id,
          taskId: task.taskId,
          name: task.name,
          description: task.description,
          status: task.status,
          complexity: task.complexity,
          estimatedHours: task.estimatedHours,
          dependencies: task.dependencies ?? [],
          assignedAt: task.assignedAt,
          projectId: task.projectId,
          projectName: task.projectName,
        })),
        byProject: Object.values(tasksByProject),
      },
    })
  } catch (error) {
    console.error('Get assigned tasks error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /projects/:id/tasks/assignments - Get all task assignments for a project
app.get('/projects/:id/tasks/assignments', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
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

    // Get all tasks with their assignees
    const tasks = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        status: schema.tasks.status,
        assigneeId: schema.tasks.assigneeId,
        assignedBy: schema.tasks.assignedBy,
        assignedAt: schema.tasks.assignedAt,
      })
      .from(schema.tasks)
      .where(eq(schema.tasks.projectId, projectId))
      .orderBy(schema.tasks.taskId)

    // Get user info for all assignees
    const assigneeIds = [...new Set(tasks.filter((t) => t.assigneeId).map((t) => t.assigneeId!))]
    const assignerIds = [...new Set(tasks.filter((t) => t.assignedBy).map((t) => t.assignedBy!))]
    const allUserIds = [...new Set([...assigneeIds, ...assignerIds])]

    const userMap: Record<string, { id: string; email: string; name: string | null }> = {}
    if (allUserIds.length > 0) {
      // Query for all users one by one (could be optimized with inArray if needed)
      for (const userId of allUserIds) {
        const [u] = await db
          .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
          .from(schema.users)
          .where(eq(schema.users.id, userId))
        if (u) userMap[u.id] = u
      }
    }

    const assignedTasks = tasks.filter((t) => t.assigneeId)
    const unassignedTasks = tasks.filter((t) => !t.assigneeId)

    return c.json({
      success: true,
      data: {
        projectId: project.id,
        projectName: project.name,
        summary: {
          totalTasks: tasks.length,
          assignedTasks: assignedTasks.length,
          unassignedTasks: unassignedTasks.length,
        },
        assignments: tasks.map((task) => {
          const assigneeUser = task.assigneeId ? userMap[task.assigneeId] : null
          const assignerUser = task.assignedBy ? userMap[task.assignedBy] : null
          return {
            taskId: task.taskId,
            name: task.name,
            status: task.status,
            assignee: assigneeUser
              ? {
                  id: assigneeUser.id,
                  email: assigneeUser.email,
                  name: assigneeUser.name,
                }
              : null,
            assignedBy: assignerUser
              ? {
                  id: assignerUser.id,
                  email: assignerUser.email,
                  name: assignerUser.name,
                }
              : null,
            assignedAt: task.assignedAt,
          }
        }),
      },
    })
  } catch (error) {
    console.error('Get task assignments error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// ============================================
// Comment Routes (T5.5)
// ============================================

// UUID validation regex
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /projects/:id/tasks/:taskId/comments - List all comments for a task
app.get('/projects/:id/tasks/:taskId/comments', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskId = c.req.param('taskId')

    // Validate UUIDs
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }
    if (!uuidRegex.test(taskId)) {
      return c.json({ success: false, error: 'Invalid task ID format' }, 400)
    }

    const db = getDbClient()

    // Check if user has access to the project
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))
      .limit(1)

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Verify task exists in this project
    const [task] = await db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.projectId, projectId)))
      .limit(1)

    if (!task) {
      return c.json({ success: false, error: 'Task not found' }, 404)
    }

    // Get all comments for this task with author info
    const allComments = await db
      .select({
        id: schema.comments.id,
        taskId: schema.comments.taskId,
        authorId: schema.comments.authorId,
        content: schema.comments.content,
        parentId: schema.comments.parentId,
        mentions: schema.comments.mentions,
        createdAt: schema.comments.createdAt,
        updatedAt: schema.comments.updatedAt,
        authorEmail: schema.users.email,
        authorName: schema.users.name,
      })
      .from(schema.comments)
      .innerJoin(schema.users, eq(schema.comments.authorId, schema.users.id))
      .where(eq(schema.comments.taskId, taskId))
      .orderBy(schema.comments.createdAt)

    // Build threaded structure
    type CommentDbRow = (typeof allComments)[0]
    interface CommentNode extends CommentDbRow {
      replies: CommentNode[]
    }

    const commentMap = new Map<string, CommentNode>()
    const rootComments: CommentNode[] = []

    // First pass: create map of all comments with empty replies
    for (const comment of allComments) {
      commentMap.set(comment.id, { ...comment, replies: [] })
    }

    // Second pass: build tree structure
    for (const comment of allComments) {
      const commentWithReplies = commentMap.get(comment.id)!
      if (comment.parentId && commentMap.has(comment.parentId)) {
        commentMap.get(comment.parentId)!.replies.push(commentWithReplies)
      } else {
        rootComments.push(commentWithReplies)
      }
    }

    // Format response - explicitly type the return
    interface FormattedComment {
      id: string
      taskId: string
      content: string
      parentId: string | null
      mentions: string[] | null
      createdAt: Date
      updatedAt: Date
      author: { id: string; email: string; name: string | null }
      replies: FormattedComment[]
    }

    const formatComment = (comment: CommentNode): FormattedComment => ({
      id: comment.id,
      taskId: comment.taskId,
      content: comment.content,
      parentId: comment.parentId,
      mentions: comment.mentions,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      author: {
        id: comment.authorId,
        email: comment.authorEmail,
        name: comment.authorName,
      },
      replies: comment.replies.map(formatComment),
    })

    return c.json({
      success: true,
      data: {
        taskId,
        comments: rootComments.map(formatComment),
        totalCount: allComments.length,
      },
    })
  } catch (error) {
    console.error('Get comments error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// POST /projects/:id/tasks/:taskId/comments - Create a new comment
app.post('/projects/:id/tasks/:taskId/comments', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskId = c.req.param('taskId')

    // Validate UUIDs
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }
    if (!uuidRegex.test(taskId)) {
      return c.json({ success: false, error: 'Invalid task ID format' }, 400)
    }

    // Parse and validate request body
    const body = await c.req.json()
    const validation = CreateCommentRequestSchema.safeParse(body)

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

    const { content, parentId, mentions: explicitMentions } = validation.data

    // Validate parentId if provided
    if (parentId && !uuidRegex.test(parentId)) {
      return c.json({ success: false, error: 'Invalid parent comment ID format' }, 400)
    }

    const db = getDbClient()

    // Check if user has access to the project
    const [project] = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))
      .limit(1)

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Verify task exists in this project (also get assignee for notification)
    const [task] = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        assigneeId: schema.tasks.assigneeId,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.projectId, projectId)))
      .limit(1)

    if (!task) {
      return c.json({ success: false, error: 'Task not found' }, 404)
    }

    // If parentId provided, verify it exists and belongs to same task
    if (parentId) {
      const [parentComment] = await db
        .select({ id: schema.comments.id })
        .from(schema.comments)
        .where(and(eq(schema.comments.id, parentId), eq(schema.comments.taskId, taskId)))
        .limit(1)

      if (!parentComment) {
        return c.json({ success: false, error: 'Parent comment not found' }, 404)
      }
    }

    // Process mentions: use explicit mentions if provided, otherwise auto-parse from content
    let mentions: string[] | null = null

    if (explicitMentions && explicitMentions.length > 0) {
      // Use explicitly provided mention UUIDs
      mentions = explicitMentions
    } else {
      // Auto-parse @mentions from content
      const resolvedMentions = await parseAndResolveMentions(db, content)
      const parsedMentionIds = extractUserIds(resolvedMentions)

      if (parsedMentionIds.length > 0) {
        mentions = parsedMentionIds
      }
    }

    // Create the comment
    const [newComment] = await db
      .insert(schema.comments)
      .values({
        taskId,
        authorId: user.id,
        content,
        parentId: parentId || null,
        mentions: mentions,
      })
      .returning({
        id: schema.comments.id,
        taskId: schema.comments.taskId,
        authorId: schema.comments.authorId,
        content: schema.comments.content,
        parentId: schema.comments.parentId,
        mentions: schema.comments.mentions,
        createdAt: schema.comments.createdAt,
        updatedAt: schema.comments.updatedAt,
      })

    if (!newComment) {
      return c.json({ success: false, error: 'Failed to create comment' }, 500)
    }

    // Get author info
    const [author] = await db
      .select({ email: schema.users.email, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))
      .limit(1)

    const appUrl = process.env['APP_URL'] || 'https://planflow.tools'
    const authorName = author?.name || user.email

    // Send notifications for mentions (non-blocking)
    if (mentions && mentions.length > 0) {
      // For each mentioned user, send notification
      for (const mentionId of mentions) {
        if (mentionId === user.id) continue // Don't notify self

        const [mentionedUser] = await db
          .select({ id: schema.users.id, email: schema.users.email })
          .from(schema.users)
          .where(eq(schema.users.id, mentionId))
          .limit(1)

        if (mentionedUser) {
          createNotification({
            userId: mentionId,
            type: 'mention',
            title: `${authorName} mentioned you in a comment`,
            body: `On task ${task.taskId}: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`,
            link: `${appUrl}/projects/${projectId}/tasks/${task.taskId}`,
            projectId,
            actorId: user.id,
            taskId: task.taskId,
            sendEmail: true,
            recipientEmail: mentionedUser.email,
            projectName: project.name,
            actorName: authorName,
          })
        }
      }
    }

    // Notify task assignee about new comment (if not the commenter and not already mentioned)
    if (task.assigneeId && task.assigneeId !== user.id && (!mentions || !mentions.includes(task.assigneeId))) {
      const [assignee] = await db
        .select({ email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, task.assigneeId))
        .limit(1)

      if (assignee) {
        createNotification({
          userId: task.assigneeId,
          type: 'comment',
          title: `New comment on your task ${task.taskId}`,
          body: `${authorName} commented: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`,
          link: `${appUrl}/projects/${projectId}/tasks/${task.taskId}`,
          projectId,
          actorId: user.id,
          taskId: task.taskId,
          sendEmail: true,
          recipientEmail: assignee.email,
          projectName: project.name,
          actorName: authorName,
        })
      }
    }

    return c.json(
      {
        success: true,
        data: {
          comment: {
            ...newComment,
            author: {
              id: user.id,
              email: author?.email || user.email,
              name: author?.name || null,
            },
          },
        },
      },
      201
    )
  } catch (error) {
    console.error('Create comment error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /projects/:id/tasks/:taskId/comments/:commentId - Get a single comment
app.get('/projects/:id/tasks/:taskId/comments/:commentId', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskId = c.req.param('taskId')
    const commentId = c.req.param('commentId')

    // Validate UUIDs
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }
    if (!uuidRegex.test(taskId)) {
      return c.json({ success: false, error: 'Invalid task ID format' }, 400)
    }
    if (!uuidRegex.test(commentId)) {
      return c.json({ success: false, error: 'Invalid comment ID format' }, 400)
    }

    const db = getDbClient()

    // Check if user has access to the project
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))
      .limit(1)

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Verify task exists in this project
    const [task] = await db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.projectId, projectId)))
      .limit(1)

    if (!task) {
      return c.json({ success: false, error: 'Task not found' }, 404)
    }

    // Get the comment with author info
    const [comment] = await db
      .select({
        id: schema.comments.id,
        taskId: schema.comments.taskId,
        authorId: schema.comments.authorId,
        content: schema.comments.content,
        parentId: schema.comments.parentId,
        mentions: schema.comments.mentions,
        createdAt: schema.comments.createdAt,
        updatedAt: schema.comments.updatedAt,
        authorEmail: schema.users.email,
        authorName: schema.users.name,
      })
      .from(schema.comments)
      .innerJoin(schema.users, eq(schema.comments.authorId, schema.users.id))
      .where(and(eq(schema.comments.id, commentId), eq(schema.comments.taskId, taskId)))
      .limit(1)

    if (!comment) {
      return c.json({ success: false, error: 'Comment not found' }, 404)
    }

    // Get replies to this comment
    const replies = await db
      .select({
        id: schema.comments.id,
        taskId: schema.comments.taskId,
        authorId: schema.comments.authorId,
        content: schema.comments.content,
        parentId: schema.comments.parentId,
        mentions: schema.comments.mentions,
        createdAt: schema.comments.createdAt,
        updatedAt: schema.comments.updatedAt,
        authorEmail: schema.users.email,
        authorName: schema.users.name,
      })
      .from(schema.comments)
      .innerJoin(schema.users, eq(schema.comments.authorId, schema.users.id))
      .where(eq(schema.comments.parentId, commentId))
      .orderBy(schema.comments.createdAt)

    return c.json({
      success: true,
      data: {
        comment: {
          id: comment.id,
          taskId: comment.taskId,
          content: comment.content,
          parentId: comment.parentId,
          mentions: comment.mentions,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
          author: {
            id: comment.authorId,
            email: comment.authorEmail,
            name: comment.authorName,
          },
          replies: replies.map((reply) => ({
            id: reply.id,
            taskId: reply.taskId,
            content: reply.content,
            parentId: reply.parentId,
            mentions: reply.mentions,
            createdAt: reply.createdAt,
            updatedAt: reply.updatedAt,
            author: {
              id: reply.authorId,
              email: reply.authorEmail,
              name: reply.authorName,
            },
          })),
        },
      },
    })
  } catch (error) {
    console.error('Get comment error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// PUT /projects/:id/tasks/:taskId/comments/:commentId - Update a comment
app.put('/projects/:id/tasks/:taskId/comments/:commentId', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskId = c.req.param('taskId')
    const commentId = c.req.param('commentId')

    // Validate UUIDs
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }
    if (!uuidRegex.test(taskId)) {
      return c.json({ success: false, error: 'Invalid task ID format' }, 400)
    }
    if (!uuidRegex.test(commentId)) {
      return c.json({ success: false, error: 'Invalid comment ID format' }, 400)
    }

    // Parse and validate request body
    const body = await c.req.json()
    const validation = UpdateCommentRequestSchema.safeParse(body)

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

    const { content, mentions } = validation.data

    // At least one field must be provided
    if (content === undefined && mentions === undefined) {
      return c.json({ success: false, error: 'At least one field must be provided' }, 400)
    }

    const db = getDbClient()

    // Check if user has access to the project
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))
      .limit(1)

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Verify task exists in this project
    const [task] = await db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.projectId, projectId)))
      .limit(1)

    if (!task) {
      return c.json({ success: false, error: 'Task not found' }, 404)
    }

    // Get the existing comment
    const [existingComment] = await db
      .select({
        id: schema.comments.id,
        authorId: schema.comments.authorId,
      })
      .from(schema.comments)
      .where(and(eq(schema.comments.id, commentId), eq(schema.comments.taskId, taskId)))
      .limit(1)

    if (!existingComment) {
      return c.json({ success: false, error: 'Comment not found' }, 404)
    }

    // Only the author can edit their comment
    if (existingComment.authorId !== user.id) {
      return c.json({ success: false, error: 'You can only edit your own comments' }, 403)
    }

    // Build update object
    const updateData: { content?: string; mentions?: string[] | null; updatedAt: Date } = {
      updatedAt: new Date(),
    }
    if (content !== undefined) updateData.content = content
    if (mentions !== undefined) updateData.mentions = mentions

    // Update the comment
    const [updatedComment] = await db
      .update(schema.comments)
      .set(updateData)
      .where(eq(schema.comments.id, commentId))
      .returning({
        id: schema.comments.id,
        taskId: schema.comments.taskId,
        authorId: schema.comments.authorId,
        content: schema.comments.content,
        parentId: schema.comments.parentId,
        mentions: schema.comments.mentions,
        createdAt: schema.comments.createdAt,
        updatedAt: schema.comments.updatedAt,
      })

    if (!updatedComment) {
      return c.json({ success: false, error: 'Failed to update comment' }, 500)
    }

    // Get author info
    const [author] = await db
      .select({ email: schema.users.email, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))
      .limit(1)

    return c.json({
      success: true,
      data: {
        comment: {
          ...updatedComment,
          author: {
            id: user.id,
            email: author?.email || user.email,
            name: author?.name || null,
          },
        },
      },
    })
  } catch (error) {
    console.error('Update comment error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// DELETE /projects/:id/tasks/:taskId/comments/:commentId - Delete a comment
app.delete('/projects/:id/tasks/:taskId/comments/:commentId', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskId = c.req.param('taskId')
    const commentId = c.req.param('commentId')

    // Validate UUIDs
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }
    if (!uuidRegex.test(taskId)) {
      return c.json({ success: false, error: 'Invalid task ID format' }, 400)
    }
    if (!uuidRegex.test(commentId)) {
      return c.json({ success: false, error: 'Invalid comment ID format' }, 400)
    }

    const db = getDbClient()

    // Check if user has access to the project (as owner)
    const [project] = await db
      .select({ id: schema.projects.id, userId: schema.projects.userId })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))
      .limit(1)

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Verify task exists in this project
    const [task] = await db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.projectId, projectId)))
      .limit(1)

    if (!task) {
      return c.json({ success: false, error: 'Task not found' }, 404)
    }

    // Get the existing comment
    const [existingComment] = await db
      .select({
        id: schema.comments.id,
        authorId: schema.comments.authorId,
      })
      .from(schema.comments)
      .where(and(eq(schema.comments.id, commentId), eq(schema.comments.taskId, taskId)))
      .limit(1)

    if (!existingComment) {
      return c.json({ success: false, error: 'Comment not found' }, 404)
    }

    // User can delete if they are the author OR the project owner
    const isAuthor = existingComment.authorId === user.id
    const isProjectOwner = project.userId === user.id

    if (!isAuthor && !isProjectOwner) {
      return c.json(
        { success: false, error: 'You can only delete your own comments or comments on your projects' },
        403
      )
    }

    // Delete the comment (CASCADE will handle replies)
    await db.delete(schema.comments).where(eq(schema.comments.id, commentId))

    return c.json({
      success: true,
      data: {
        message: 'Comment deleted successfully',
        deletedId: commentId,
      },
    })
  } catch (error) {
    console.error('Delete comment error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// ============================================
// Mentions Routes
// ============================================

// GET /projects/:id/mentions/search - Search for users to mention
app.get('/projects/:id/mentions/search', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const query = c.req.query('q') || ''
    const limitParam = c.req.query('limit')
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10), 1), 20) : 10

    // Validate project ID
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Query must be at least 1 character
    if (query.length < 1) {
      return c.json({ success: false, error: 'Search query must be at least 1 character' }, 400)
    }

    const db = getDbClient()

    // Check if user has access to the project
    const [project] = await db
      .select({ id: schema.projects.id, userId: schema.projects.userId })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))
      .limit(1)

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Search for mentionable users (project owner for now, will expand to org members)
    // For now, search all users but exclude current user
    const users = await searchMentionableUsers(db, query, undefined, user.id, limit)

    return c.json({
      success: true,
      data: {
        users: users.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          mention: u.name ? `@${u.name.replace(/\s+/g, '.')}` : `@${u.email}`,
        })),
      },
    })
  } catch (error) {
    console.error('Search mentions error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /organizations/:id/mentions/search - Search for organization members to mention
app.get('/organizations/:id/mentions/search', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const organizationId = c.req.param('id')
    const query = c.req.query('q') || ''
    const limitParam = c.req.query('limit')
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10), 1), 20) : 10

    // Validate organization ID
    if (!uuidRegex.test(organizationId)) {
      return c.json({ success: false, error: 'Invalid organization ID format' }, 400)
    }

    // Query must be at least 1 character
    if (query.length < 1) {
      return c.json({ success: false, error: 'Search query must be at least 1 character' }, 400)
    }

    const db = getDbClient()

    // Check if user is a member of the organization
    const [membership] = await db
      .select({ id: schema.organizationMembers.id })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, organizationId),
          eq(schema.organizationMembers.userId, user.id)
        )
      )
      .limit(1)

    if (!membership) {
      return c.json({ success: false, error: 'Organization not found or access denied' }, 404)
    }

    // Search for mentionable users within the organization
    const users = await searchMentionableUsers(db, query, organizationId, user.id, limit)

    return c.json({
      success: true,
      data: {
        users: users.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          mention: u.name ? `@${u.name.replace(/\s+/g, '.')}` : `@${u.email}`,
        })),
      },
    })
  } catch (error) {
    console.error('Search organization mentions error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// POST /mentions/parse - Parse @mentions from text and resolve to user IDs
app.post('/mentions/parse', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const body = await c.req.json()

    const { content, organizationId } = body as { content?: string; organizationId?: string }

    if (!content || typeof content !== 'string') {
      return c.json({ success: false, error: 'Content is required' }, 400)
    }

    if (content.length > 10000) {
      return c.json({ success: false, error: 'Content too long (max 10000 characters)' }, 400)
    }

    // Validate organizationId if provided
    if (organizationId && !uuidRegex.test(organizationId)) {
      return c.json({ success: false, error: 'Invalid organization ID format' }, 400)
    }

    const db = getDbClient()

    // If organizationId provided, verify user is a member
    if (organizationId) {
      const [membership] = await db
        .select({ id: schema.organizationMembers.id })
        .from(schema.organizationMembers)
        .where(
          and(
            eq(schema.organizationMembers.organizationId, organizationId),
            eq(schema.organizationMembers.userId, user.id)
          )
        )
        .limit(1)

      if (!membership) {
        return c.json({ success: false, error: 'Organization not found or access denied' }, 404)
      }
    }

    // Parse and resolve mentions
    const resolvedMentions = await parseAndResolveMentions(db, content, undefined, organizationId)

    return c.json({
      success: true,
      data: {
        mentions: resolvedMentions.map((m) => ({
          raw: m.raw,
          isEmail: m.isEmail,
          startIndex: m.startIndex,
          endIndex: m.endIndex,
          resolved: m.userId !== null,
          user: m.userId
            ? {
                id: m.userId,
                email: m.userEmail,
                name: m.userName,
              }
            : null,
        })),
        userIds: extractUserIds(resolvedMentions),
      },
    })
  } catch (error) {
    console.error('Parse mentions error:', error)
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

// PATCH /organizations/:id/members/:memberId - Update member role
app.patch('/organizations/:id/members/:memberId', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')
    const memberId = c.req.param('memberId')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orgId) || !uuidRegex.test(memberId)) {
      return c.json({ success: false, error: 'Invalid ID format' }, 400)
    }

    const body = await c.req.json()
    const validation = UpdateMemberRoleRequestSchema.safeParse(body)

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

    const { role: newRole } = validation.data
    const db = getDbClient()

    // Check if requester is a member and get their role
    const [requesterMembership] = await db
      .select({ role: schema.organizationMembers.role })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, orgId),
          eq(schema.organizationMembers.userId, user.id)
        )
      )
      .limit(1)

    if (!requesterMembership) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    // Only owner can change roles
    if (requesterMembership.role !== 'owner') {
      return c.json({ success: false, error: 'Only the owner can change member roles' }, 403)
    }

    // Get target member's current info
    const [targetMember] = await db
      .select({
        id: schema.organizationMembers.id,
        userId: schema.organizationMembers.userId,
        role: schema.organizationMembers.role,
      })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.id, memberId),
          eq(schema.organizationMembers.organizationId, orgId)
        )
      )
      .limit(1)

    if (!targetMember) {
      return c.json({ success: false, error: 'Member not found' }, 404)
    }

    // Cannot change the owner's role (ownership transfer not supported yet)
    if (targetMember.role === 'owner') {
      return c.json({ success: false, error: 'Cannot change the owner\'s role. Transfer ownership is not yet supported.' }, 403)
    }

    // Update member role
    const [updatedMember] = await db
      .update(schema.organizationMembers)
      .set({
        role: newRole,
        updatedAt: new Date(),
      })
      .where(eq(schema.organizationMembers.id, memberId))
      .returning({
        id: schema.organizationMembers.id,
        organizationId: schema.organizationMembers.organizationId,
        userId: schema.organizationMembers.userId,
        role: schema.organizationMembers.role,
        createdAt: schema.organizationMembers.createdAt,
        updatedAt: schema.organizationMembers.updatedAt,
      })

    // Get user info for the response
    const [userInfo] = await db
      .select({
        name: schema.users.name,
        email: schema.users.email,
      })
      .from(schema.users)
      .where(eq(schema.users.id, targetMember.userId))
      .limit(1)

    return c.json({
      success: true,
      data: {
        member: {
          ...updatedMember,
          userName: userInfo?.name,
          userEmail: userInfo?.email,
        },
      },
    })
  } catch (error) {
    console.error('Update member role error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// DELETE /organizations/:id/members/:memberId - Remove member from organization
app.delete('/organizations/:id/members/:memberId', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')
    const memberId = c.req.param('memberId')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orgId) || !uuidRegex.test(memberId)) {
      return c.json({ success: false, error: 'Invalid ID format' }, 400)
    }

    const db = getDbClient()

    // Check if requester is a member and get their role
    const [requesterMembership] = await db
      .select({
        id: schema.organizationMembers.id,
        role: schema.organizationMembers.role,
      })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, orgId),
          eq(schema.organizationMembers.userId, user.id)
        )
      )
      .limit(1)

    if (!requesterMembership) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    // Get target member's info
    const [targetMember] = await db
      .select({
        id: schema.organizationMembers.id,
        userId: schema.organizationMembers.userId,
        role: schema.organizationMembers.role,
      })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.id, memberId),
          eq(schema.organizationMembers.organizationId, orgId)
        )
      )
      .limit(1)

    if (!targetMember) {
      return c.json({ success: false, error: 'Member not found' }, 404)
    }

    // Check if user is trying to remove themselves
    const isSelfRemoval = targetMember.userId === user.id

    if (isSelfRemoval) {
      // Users can leave an organization, but owner cannot leave
      if (targetMember.role === 'owner') {
        return c.json({
          success: false,
          error: 'Owner cannot leave the organization. Transfer ownership first or delete the organization.',
        }, 403)
      }
    } else {
      // Removing another member - check permissions
      if (requesterMembership.role !== 'owner' && requesterMembership.role !== 'admin') {
        return c.json({ success: false, error: 'Only owners and admins can remove members' }, 403)
      }

      // Admins cannot remove owners or other admins
      if (requesterMembership.role === 'admin') {
        if (targetMember.role === 'owner' || targetMember.role === 'admin') {
          return c.json({ success: false, error: 'Admins cannot remove owners or other admins' }, 403)
        }
      }

      // Cannot remove the owner
      if (targetMember.role === 'owner') {
        return c.json({ success: false, error: 'Cannot remove the organization owner' }, 403)
      }
    }

    // Delete the membership
    const [deleted] = await db
      .delete(schema.organizationMembers)
      .where(eq(schema.organizationMembers.id, memberId))
      .returning({ id: schema.organizationMembers.id })

    if (!deleted) {
      return c.json({ success: false, error: 'Failed to remove member' }, 500)
    }

    return c.json({
      success: true,
      data: {
        message: isSelfRemoval
          ? 'You have left the organization'
          : 'Member removed successfully',
      },
    })
  } catch (error) {
    console.error('Remove member error:', error)
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

    // Get organization name for the email
    const [organization] = await db
      .select({ name: schema.organizations.name })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, orgId))
      .limit(1)

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

    // Send invitation email (non-blocking)
    const appUrl = process.env['APP_URL'] || 'https://planflow.tools'
    const inviteLink = `${appUrl}/invitations/${token}`

    sendTeamInvitationEmail({
      to: email,
      inviterName: user.name || user.email,
      organizationName: organization?.name || 'your team',
      role,
      inviteLink,
      expiresAt,
    }).catch((error) => {
      console.error('Failed to send invitation email:', error)
    })

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

// ============================================================================
// Activity Log Endpoints (T5.6)
// ============================================================================

// Helper function to log activity (fire-and-forget)
async function logActivity(params: {
  action: typeof schema.activityLog.$inferInsert['action']
  entityType: typeof schema.activityLog.$inferInsert['entityType']
  actorId: string
  entityId?: string
  taskId?: string
  organizationId?: string
  projectId?: string
  taskUuid?: string
  metadata?: Record<string, unknown>
  description?: string
}) {
  try {
    const db = getDbClient()
    await db.insert(schema.activityLog).values({
      action: params.action,
      entityType: params.entityType,
      actorId: params.actorId,
      entityId: params.entityId,
      taskId: params.taskId,
      organizationId: params.organizationId,
      projectId: params.projectId,
      taskUuid: params.taskUuid,
      metadata: params.metadata,
      description: params.description,
    })
  } catch (error) {
    // Log error but don't throw - activity logging should not block operations
    console.error('Activity logging error:', error)
  }
}

// GET /organizations/:id/activity - Get activity log for an organization
app.get('/organizations/:id/activity', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orgId)) {
      return c.json({ success: false, error: 'Invalid organization ID format' }, 400)
    }

    const db = getDbClient()

    // Check user is a member of the organization
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

    // Parse query parameters
    const queryParams = {
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
      action: c.req.query('action'),
      entityType: c.req.query('entityType'),
      actorId: c.req.query('actorId'),
    }

    const validation = ActivityLogQuerySchema.safeParse(queryParams)
    if (!validation.success) {
      return c.json({
        success: false,
        error: 'Invalid query parameters',
        details: validation.error.flatten().fieldErrors,
      }, 400)
    }

    const { limit, offset, action, entityType, actorId } = validation.data

    // Build query conditions
    const conditions = [eq(schema.activityLog.organizationId, orgId)]

    if (action) {
      conditions.push(eq(schema.activityLog.action, action))
    }
    if (entityType) {
      conditions.push(eq(schema.activityLog.entityType, entityType))
    }
    if (actorId) {
      conditions.push(eq(schema.activityLog.actorId, actorId))
    }

    // Get activities with actor info
    const activities = await db
      .select({
        id: schema.activityLog.id,
        action: schema.activityLog.action,
        entityType: schema.activityLog.entityType,
        entityId: schema.activityLog.entityId,
        taskId: schema.activityLog.taskId,
        actorId: schema.activityLog.actorId,
        organizationId: schema.activityLog.organizationId,
        projectId: schema.activityLog.projectId,
        taskUuid: schema.activityLog.taskUuid,
        metadata: schema.activityLog.metadata,
        description: schema.activityLog.description,
        createdAt: schema.activityLog.createdAt,
        actorEmail: schema.users.email,
        actorName: schema.users.name,
      })
      .from(schema.activityLog)
      .innerJoin(schema.users, eq(schema.activityLog.actorId, schema.users.id))
      .where(and(...conditions))
      .orderBy(desc(schema.activityLog.createdAt))
      .limit(limit)
      .offset(offset)

    // Get total count for pagination
    const [countResult] = await db
      .select({ count: count() })
      .from(schema.activityLog)
      .where(and(...conditions))

    // Format response
    const formattedActivities = activities.map((a) => ({
      id: a.id,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      taskId: a.taskId,
      organizationId: a.organizationId,
      projectId: a.projectId,
      taskUuid: a.taskUuid,
      metadata: a.metadata,
      description: a.description,
      createdAt: a.createdAt,
      actor: {
        id: a.actorId,
        email: a.actorEmail,
        name: a.actorName,
      },
    }))

    return c.json({
      success: true,
      data: {
        activities: formattedActivities,
        pagination: {
          total: countResult?.count ?? 0,
          limit,
          offset,
          hasMore: offset + activities.length < (countResult?.count ?? 0),
        },
      },
    })
  } catch (error) {
    console.error('Get organization activity error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /projects/:id/activity - Get activity log for a project
app.get('/projects/:id/activity', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    const db = getDbClient()

    // Check user owns the project
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, projectId),
          eq(schema.projects.userId, user.id)
        )
      )
      .limit(1)

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Parse query parameters
    const queryParams = {
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
      action: c.req.query('action'),
      entityType: c.req.query('entityType'),
      taskId: c.req.query('taskId'),
    }

    const validation = ActivityLogQuerySchema.safeParse(queryParams)
    if (!validation.success) {
      return c.json({
        success: false,
        error: 'Invalid query parameters',
        details: validation.error.flatten().fieldErrors,
      }, 400)
    }

    const { limit, offset, action, entityType, taskId } = validation.data

    // Build query conditions
    const conditions = [eq(schema.activityLog.projectId, projectId)]

    if (action) {
      conditions.push(eq(schema.activityLog.action, action))
    }
    if (entityType) {
      conditions.push(eq(schema.activityLog.entityType, entityType))
    }
    if (taskId) {
      conditions.push(eq(schema.activityLog.taskId, taskId))
    }

    // Get activities with actor info
    const activities = await db
      .select({
        id: schema.activityLog.id,
        action: schema.activityLog.action,
        entityType: schema.activityLog.entityType,
        entityId: schema.activityLog.entityId,
        taskId: schema.activityLog.taskId,
        actorId: schema.activityLog.actorId,
        organizationId: schema.activityLog.organizationId,
        projectId: schema.activityLog.projectId,
        taskUuid: schema.activityLog.taskUuid,
        metadata: schema.activityLog.metadata,
        description: schema.activityLog.description,
        createdAt: schema.activityLog.createdAt,
        actorEmail: schema.users.email,
        actorName: schema.users.name,
      })
      .from(schema.activityLog)
      .innerJoin(schema.users, eq(schema.activityLog.actorId, schema.users.id))
      .where(and(...conditions))
      .orderBy(desc(schema.activityLog.createdAt))
      .limit(limit)
      .offset(offset)

    // Get total count for pagination
    const [countResult] = await db
      .select({ count: count() })
      .from(schema.activityLog)
      .where(and(...conditions))

    // Format response
    const formattedActivities = activities.map((a) => ({
      id: a.id,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      taskId: a.taskId,
      organizationId: a.organizationId,
      projectId: a.projectId,
      taskUuid: a.taskUuid,
      metadata: a.metadata,
      description: a.description,
      createdAt: a.createdAt,
      actor: {
        id: a.actorId,
        email: a.actorEmail,
        name: a.actorName,
      },
    }))

    return c.json({
      success: true,
      data: {
        activities: formattedActivities,
        pagination: {
          total: countResult?.count ?? 0,
          limit,
          offset,
          hasMore: offset + activities.length < (countResult?.count ?? 0),
        },
      },
    })
  } catch (error) {
    console.error('Get project activity error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /projects/:id/presence - Get online users for a project (T5.9)
app.get('/projects/:id/presence', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    const db = getDbClient()

    // Check user has access to the project
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, projectId),
          eq(schema.projects.userId, user.id)
        )
      )
      .limit(1)

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Get presence from connection manager
    const { connectionManager } = await import('./websocket/index.js')
    const users = connectionManager.getProjectPresence(projectId)
    const onlineCount = users.length

    return c.json({
      success: true,
      data: {
        users,
        onlineCount,
      },
    })
  } catch (error) {
    console.error('Get project presence error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /projects/:id/tasks/:taskId/activity - Get activity log for a specific task
app.get('/projects/:id/tasks/:taskId/activity', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')

    // Validate project UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    const db = getDbClient()

    // Check user owns the project
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, projectId),
          eq(schema.projects.userId, user.id)
        )
      )
      .limit(1)

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Check if taskId is a UUID or a human-readable task ID (e.g., "T1.1")
    const isUuid = uuidRegex.test(taskIdParam)

    // Verify task exists
    let taskUuid: string | undefined
    if (isUuid) {
      const [task] = await db
        .select({ id: schema.tasks.id, taskId: schema.tasks.taskId })
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.id, taskIdParam),
            eq(schema.tasks.projectId, projectId)
          )
        )
        .limit(1)

      if (!task) {
        return c.json({ success: false, error: 'Task not found' }, 404)
      }
      taskUuid = task.id
    } else {
      // Human-readable task ID
      const [task] = await db
        .select({ id: schema.tasks.id, taskId: schema.tasks.taskId })
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.taskId, taskIdParam),
            eq(schema.tasks.projectId, projectId)
          )
        )
        .limit(1)

      if (!task) {
        return c.json({ success: false, error: 'Task not found' }, 404)
      }
      taskUuid = task.id
    }

    // Parse query parameters
    const queryParams = {
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
      action: c.req.query('action'),
    }

    const validation = ActivityLogQuerySchema.safeParse(queryParams)
    if (!validation.success) {
      return c.json({
        success: false,
        error: 'Invalid query parameters',
        details: validation.error.flatten().fieldErrors,
      }, 400)
    }

    const { limit, offset, action } = validation.data

    // Build query conditions - match by either taskUuid or taskId (human-readable)
    const conditions = [
      eq(schema.activityLog.projectId, projectId),
    ]

    // Match by taskUuid if available, or by human-readable taskId
    if (taskUuid) {
      conditions.push(eq(schema.activityLog.taskUuid, taskUuid))
    }

    if (action) {
      conditions.push(eq(schema.activityLog.action, action))
    }

    // Get activities with actor info
    const activities = await db
      .select({
        id: schema.activityLog.id,
        action: schema.activityLog.action,
        entityType: schema.activityLog.entityType,
        entityId: schema.activityLog.entityId,
        taskId: schema.activityLog.taskId,
        actorId: schema.activityLog.actorId,
        organizationId: schema.activityLog.organizationId,
        projectId: schema.activityLog.projectId,
        taskUuid: schema.activityLog.taskUuid,
        metadata: schema.activityLog.metadata,
        description: schema.activityLog.description,
        createdAt: schema.activityLog.createdAt,
        actorEmail: schema.users.email,
        actorName: schema.users.name,
      })
      .from(schema.activityLog)
      .innerJoin(schema.users, eq(schema.activityLog.actorId, schema.users.id))
      .where(and(...conditions))
      .orderBy(desc(schema.activityLog.createdAt))
      .limit(limit)
      .offset(offset)

    // Get total count for pagination
    const [countResult] = await db
      .select({ count: count() })
      .from(schema.activityLog)
      .where(and(...conditions))

    // Format response
    const formattedActivities = activities.map((a) => ({
      id: a.id,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      taskId: a.taskId,
      organizationId: a.organizationId,
      projectId: a.projectId,
      taskUuid: a.taskUuid,
      metadata: a.metadata,
      description: a.description,
      createdAt: a.createdAt,
      actor: {
        id: a.actorId,
        email: a.actorEmail,
        name: a.actorName,
      },
    }))

    return c.json({
      success: true,
      data: {
        activities: formattedActivities,
        pagination: {
          total: countResult?.count ?? 0,
          limit,
          offset,
          hasMore: offset + activities.length < (countResult?.count ?? 0),
        },
      },
    })
  } catch (error) {
    console.error('Get task activity error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /users/me/activity - Get current user's activity (actions they performed)
app.get('/users/me/activity', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    // Parse query parameters
    const queryParams = {
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
      action: c.req.query('action'),
      entityType: c.req.query('entityType'),
    }

    const validation = ActivityLogQuerySchema.safeParse(queryParams)
    if (!validation.success) {
      return c.json({
        success: false,
        error: 'Invalid query parameters',
        details: validation.error.flatten().fieldErrors,
      }, 400)
    }

    const { limit, offset, action, entityType } = validation.data

    // Build query conditions
    const conditions = [eq(schema.activityLog.actorId, user.id)]

    if (action) {
      conditions.push(eq(schema.activityLog.action, action))
    }
    if (entityType) {
      conditions.push(eq(schema.activityLog.entityType, entityType))
    }

    // Get activities
    const activities = await db
      .select({
        id: schema.activityLog.id,
        action: schema.activityLog.action,
        entityType: schema.activityLog.entityType,
        entityId: schema.activityLog.entityId,
        taskId: schema.activityLog.taskId,
        actorId: schema.activityLog.actorId,
        organizationId: schema.activityLog.organizationId,
        projectId: schema.activityLog.projectId,
        taskUuid: schema.activityLog.taskUuid,
        metadata: schema.activityLog.metadata,
        description: schema.activityLog.description,
        createdAt: schema.activityLog.createdAt,
      })
      .from(schema.activityLog)
      .where(and(...conditions))
      .orderBy(desc(schema.activityLog.createdAt))
      .limit(limit)
      .offset(offset)

    // Get total count for pagination
    const [countResult] = await db
      .select({ count: count() })
      .from(schema.activityLog)
      .where(and(...conditions))

    // Format response (actor is always the current user)
    const formattedActivities = activities.map((a) => ({
      id: a.id,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      taskId: a.taskId,
      organizationId: a.organizationId,
      projectId: a.projectId,
      taskUuid: a.taskUuid,
      metadata: a.metadata,
      description: a.description,
      createdAt: a.createdAt,
      actor: {
        id: user.id,
        email: user.email,
        name: user.name ?? null,
      },
    }))

    return c.json({
      success: true,
      data: {
        activities: formattedActivities,
        pagination: {
          total: countResult?.count ?? 0,
          limit,
          offset,
          hasMore: offset + activities.length < (countResult?.count ?? 0),
        },
      },
    })
  } catch (error) {
    console.error('Get user activity error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// ============================================
// Notifications API (T5.10)
// ============================================

// GET /notifications - Get current user's notifications
app.get('/notifications', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    // Parse query parameters
    const queryParams = {
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
      unreadOnly: c.req.query('unreadOnly'),
      type: c.req.query('type'),
      projectId: c.req.query('projectId'),
    }

    const validation = NotificationsQuerySchema.safeParse(queryParams)
    if (!validation.success) {
      return c.json({
        success: false,
        error: 'Invalid query parameters',
        details: validation.error.flatten().fieldErrors,
      }, 400)
    }

    const { limit, offset, unreadOnly, type, projectId } = validation.data

    // Build query conditions
    const conditions = [eq(schema.notifications.userId, user.id)]

    if (unreadOnly) {
      conditions.push(isNull(schema.notifications.readAt))
    }

    if (type) {
      conditions.push(eq(schema.notifications.type, type))
    }

    if (projectId) {
      conditions.push(eq(schema.notifications.projectId, projectId))
    }

    // Get notifications with actor info
    const notificationsResult = await db
      .select({
        id: schema.notifications.id,
        userId: schema.notifications.userId,
        type: schema.notifications.type,
        title: schema.notifications.title,
        body: schema.notifications.body,
        link: schema.notifications.link,
        projectId: schema.notifications.projectId,
        organizationId: schema.notifications.organizationId,
        actorId: schema.notifications.actorId,
        taskId: schema.notifications.taskId,
        readAt: schema.notifications.readAt,
        createdAt: schema.notifications.createdAt,
        actorEmail: schema.users.email,
        actorName: schema.users.name,
      })
      .from(schema.notifications)
      .leftJoin(schema.users, eq(schema.notifications.actorId, schema.users.id))
      .where(and(...conditions))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(limit)
      .offset(offset)

    // Get total count for pagination
    const [countResult] = await db
      .select({ count: count() })
      .from(schema.notifications)
      .where(and(...conditions))

    // Get unread count
    const [unreadCountResult] = await db
      .select({ count: count() })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.userId, user.id),
          isNull(schema.notifications.readAt)
        )
      )

    // Format response
    const formattedNotifications = notificationsResult.map((n) => ({
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      projectId: n.projectId,
      organizationId: n.organizationId,
      actorId: n.actorId,
      taskId: n.taskId,
      readAt: n.readAt,
      createdAt: n.createdAt,
      actor: n.actorId
        ? {
            id: n.actorId,
            email: n.actorEmail,
            name: n.actorName,
          }
        : null,
    }))

    return c.json({
      success: true,
      data: {
        notifications: formattedNotifications,
        unreadCount: Number(unreadCountResult?.count ?? 0),
        pagination: {
          total: Number(countResult?.count ?? 0),
          limit,
          offset,
          hasMore: offset + notificationsResult.length < Number(countResult?.count ?? 0),
        },
      },
    })
  } catch (error) {
    console.error('Get notifications error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /notifications/unread-count - Get unread notification count
app.get('/notifications/unread-count', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    const [result] = await db
      .select({ count: count() })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.userId, user.id),
          isNull(schema.notifications.readAt)
        )
      )

    return c.json({
      success: true,
      data: {
        unreadCount: Number(result?.count ?? 0),
      },
    })
  } catch (error) {
    console.error('Get unread count error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /notifications/:id - Get a specific notification
app.get('/notifications/:id', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const notificationId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(notificationId)) {
      return c.json({ success: false, error: 'Invalid notification ID format' }, 400)
    }

    const db = getDbClient()

    const [notification] = await db
      .select({
        id: schema.notifications.id,
        userId: schema.notifications.userId,
        type: schema.notifications.type,
        title: schema.notifications.title,
        body: schema.notifications.body,
        link: schema.notifications.link,
        projectId: schema.notifications.projectId,
        organizationId: schema.notifications.organizationId,
        actorId: schema.notifications.actorId,
        taskId: schema.notifications.taskId,
        readAt: schema.notifications.readAt,
        createdAt: schema.notifications.createdAt,
        actorEmail: schema.users.email,
        actorName: schema.users.name,
      })
      .from(schema.notifications)
      .leftJoin(schema.users, eq(schema.notifications.actorId, schema.users.id))
      .where(
        and(
          eq(schema.notifications.id, notificationId),
          eq(schema.notifications.userId, user.id)
        )
      )
      .limit(1)

    if (!notification) {
      return c.json({ success: false, error: 'Notification not found' }, 404)
    }

    return c.json({
      success: true,
      data: {
        notification: {
          id: notification.id,
          userId: notification.userId,
          type: notification.type,
          title: notification.title,
          body: notification.body,
          link: notification.link,
          projectId: notification.projectId,
          organizationId: notification.organizationId,
          actorId: notification.actorId,
          taskId: notification.taskId,
          readAt: notification.readAt,
          createdAt: notification.createdAt,
          actor: notification.actorId
            ? {
                id: notification.actorId,
                email: notification.actorEmail,
                name: notification.actorName,
              }
            : null,
        },
      },
    })
  } catch (error) {
    console.error('Get notification error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// PATCH /notifications/:id/read - Mark a single notification as read
app.patch('/notifications/:id/read', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const notificationId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(notificationId)) {
      return c.json({ success: false, error: 'Invalid notification ID format' }, 400)
    }

    const db = getDbClient()

    // Check notification exists and belongs to user
    const [existing] = await db
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.id, notificationId),
          eq(schema.notifications.userId, user.id)
        )
      )
      .limit(1)

    if (!existing) {
      return c.json({ success: false, error: 'Notification not found' }, 404)
    }

    // Mark as read
    const [updated] = await db
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(eq(schema.notifications.id, notificationId))
      .returning()

    return c.json({
      success: true,
      data: {
        notification: updated,
      },
    })
  } catch (error) {
    console.error('Mark notification read error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// POST /notifications/mark-read - Mark multiple notifications as read
app.post('/notifications/mark-read', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const body = await c.req.json()

    const validation = MarkNotificationsReadRequestSchema.safeParse(body)
    if (!validation.success) {
      return c.json({
        success: false,
        error: 'Invalid request body',
        details: validation.error.flatten().fieldErrors,
      }, 400)
    }

    const { notificationIds } = validation.data
    const db = getDbClient()

    // Update all matching notifications that belong to the user
    const updatedNotifications = await db
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(schema.notifications.userId, user.id),
          isNull(schema.notifications.readAt),
          // Filter by provided IDs - use manual IN construction
          // since drizzle-orm inArray requires import
        )
      )
      .returning({ id: schema.notifications.id })

    // Actually we need to handle the IN clause properly
    // Let's do it in a loop for now or import inArray
    let markedCount = 0
    for (const id of notificationIds) {
      const [updated] = await db
        .update(schema.notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(schema.notifications.id, id),
            eq(schema.notifications.userId, user.id),
            isNull(schema.notifications.readAt)
          )
        )
        .returning({ id: schema.notifications.id })

      if (updated) {
        markedCount++
      }
    }

    return c.json({
      success: true,
      data: {
        markedCount,
      },
    })
  } catch (error) {
    console.error('Mark notifications read error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// POST /notifications/mark-all-read - Mark all notifications as read
app.post('/notifications/mark-all-read', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    // Update all unread notifications for this user
    const result = await db
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(schema.notifications.userId, user.id),
          isNull(schema.notifications.readAt)
        )
      )
      .returning({ id: schema.notifications.id })

    return c.json({
      success: true,
      data: {
        markedCount: result.length,
      },
    })
  } catch (error) {
    console.error('Mark all notifications read error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// DELETE /notifications/:id - Delete a notification
app.delete('/notifications/:id', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const notificationId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(notificationId)) {
      return c.json({ success: false, error: 'Invalid notification ID format' }, 400)
    }

    const db = getDbClient()

    // Check notification exists and belongs to user
    const [existing] = await db
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.id, notificationId),
          eq(schema.notifications.userId, user.id)
        )
      )
      .limit(1)

    if (!existing) {
      return c.json({ success: false, error: 'Notification not found' }, 404)
    }

    // Delete the notification
    await db
      .delete(schema.notifications)
      .where(eq(schema.notifications.id, notificationId))

    return c.json({
      success: true,
      data: {
        deleted: true,
      },
    })
  } catch (error) {
    console.error('Delete notification error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// DELETE /notifications - Delete all notifications for current user (optional: only read ones)
app.delete('/notifications', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const readOnly = c.req.query('readOnly') === 'true'
    const db = getDbClient()

    const conditions = [eq(schema.notifications.userId, user.id)]

    if (readOnly) {
      conditions.push(isNotNull(schema.notifications.readAt))
    }

    const result = await db
      .delete(schema.notifications)
      .where(and(...conditions))
      .returning({ id: schema.notifications.id })

    return c.json({
      success: true,
      data: {
        deletedCount: result.length,
      },
    })
  } catch (error) {
    console.error('Delete all notifications error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// Helper function to create notifications (for internal use by other endpoints)
export async function createNotification(data: {
  userId: string
  type: typeof schema.notifications.$inferInsert['type']
  title: string
  body?: string
  link?: string
  projectId?: string
  organizationId?: string
  actorId?: string
  taskId?: string
  // Email-specific options (optional)
  sendEmail?: boolean
  recipientEmail?: string
  projectName?: string
  organizationName?: string
  actorName?: string
}) {
  try {
    const db = getDbClient()

    const [notification] = await db
      .insert(schema.notifications)
      .values({
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body ?? null,
        link: data.link ?? null,
        projectId: data.projectId ?? null,
        organizationId: data.organizationId ?? null,
        actorId: data.actorId ?? null,
        taskId: data.taskId ?? null,
      })
      .returning()

    // Send email notification if requested and email service is configured
    if (data.sendEmail && data.recipientEmail && isEmailServiceConfigured()) {
      // Send email asynchronously - don't block on email delivery
      sendNotificationEmail({
        to: data.recipientEmail,
        type: data.type as NotificationType,
        title: data.title,
        body: data.body,
        link: data.link,
        projectName: data.projectName,
        organizationName: data.organizationName,
        actorName: data.actorName,
        taskId: data.taskId,
      }).catch((error) => {
        console.error('Failed to send notification email:', error)
      })
    }

    return notification
  } catch (error) {
    // Log error but don't throw - notification creation should not block operations
    console.error('Create notification error:', error)
    return null
  }
}

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
