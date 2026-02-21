import 'dotenv/config'
// Initialize Sentry early, before other imports
import { initSentry, flush as flushSentry, captureException } from './lib/sentry.js'
initSentry()

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
  GitHubCallbackRequestSchema,
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
  sentryMiddleware,
  sentryErrorHandler,
} from './middleware/index.js'
import { openApiSpec } from './openapi.js'
import { parsePlanTasks } from './lib/task-parser.js'
import {
  parseAndResolveMentions,
  extractUserIds,
  searchMentionableUsers,
} from './lib/mentions.js'
import {
  startDigestScheduler,
  stopDigestScheduler,
  triggerDigestManually,
} from './lib/digest.js'
import {
  isGitHubConfigured,
  getGitHubConfig,
  generateOAuthState,
  buildAuthorizationUrl,
  exchangeCodeForToken,
  fetchGitHubUser,
  fetchGitHubEmail,
  fetchGitHubRepositories,
  validateAccessToken,
  fetchGitHubIssue,
  listGitHubIssues,
  searchGitHubIssues,
  createGitHubIssue,
  updateGitHubIssue,
  // Pull Request API (T8.4)
  fetchGitHubPullRequest,
  listGitHubPullRequests,
  searchGitHubPullRequests,
  createGitHubPullRequest,
  getPrState,
  type GitHubPullRequest,
  // Branch name generation (T8.6)
  generateBranchName,
  generateBranchNameAuto,
  detectBranchPrefix,
  type BranchPrefix,
  // Webhook verification (T8.5)
  isGitHubWebhookConfigured,
  verifyGitHubWebhookSignature,
  type GitHubPullRequestEvent,
} from './lib/github.js'
import {
  sendSlackNotification,
  sendSlackTestMessage,
  isValidSlackWebhookUrl,
  formatTaskStatusChange,
  formatTaskAssignment,
  formatTaskCompletion,
  formatCommentCreated,
  formatMemberJoined,
  type SlackConfig,
} from './lib/slack.js'
import {
  sendDiscordNotification,
  sendDiscordTestMessage,
  isValidDiscordWebhookUrl,
  type DiscordConfig,
} from './lib/discord.js'
import {
  setupWebSocketServer,
  broadcastTaskUpdated,
  broadcastTasksUpdated,
  broadcastTasksSynced,
  broadcastTaskAssigned,
  broadcastTaskUnassigned,
  // Activity broadcasts (T6.3)
  broadcastActivityCreated,
  // Comment broadcasts (T6.4)
  broadcastCommentCreated,
  broadcastCommentUpdated,
  broadcastCommentDeleted,
  // Notification broadcasts (T6.4)
  sendNotificationToUser,
  type NotificationData,
  type CommentData,
  // Task locking (T6.6)
  getTaskLock,
  getProjectLocks,
  acquireTaskLock,
  releaseTaskLock,
  broadcastTaskLocked,
  broadcastTaskUnlocked,
  type TaskLockInfo,
} from './websocket/index.js'
import {
  configurePush,
  isPushConfigured,
  getVapidPublicKey,
  sendPushNotification,
  createPushPayload,
  subscribeToPush,
  unsubscribeFromPush,
  getNotificationPreferences,
  updateNotificationPreferences,
} from './lib/push.js'

// Initialize push notifications
configurePush()

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

// Middleware - Logging & Error Tracking
app.use('*', logger())
app.use('*', sentryMiddleware)

// Middleware - Security
app.use('*', secureCors)
app.use('*', securityHeaders)
app.use('*', defaultBodyLimit)

// Global error handler for Sentry
app.onError(sentryErrorHandler)

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
    // Don't exclude sender - HTTP API clients (like CLI) aren't on WebSocket,
    // so the same user on web should receive the update
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

    // Get user info for broadcast (T6.4)
    const [updaterUser] = await db
      .select({ email: schema.users.email, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))
      .limit(1)

    // Broadcast all task updates via WebSocket (T6.4 - enhanced with updatedBy)
    // Don't exclude sender - HTTP API clients aren't on WebSocket
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
        {
          id: user.id,
          email: updaterUser?.email || user.email,
          name: updaterUser?.name || null,
        }
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

    // Check if task is locked by another user (T6.6)
    const lock = getTaskLock(projectId, taskIdParam)
    if (lock && lock.lockedBy.userId !== user.id) {
      return c.json({
        success: false,
        error: `Task ${taskIdParam} is currently being edited by ${lock.lockedBy.name || lock.lockedBy.email}`,
        code: 'TASK_LOCKED',
        lock: {
          taskId: lock.taskId,
          lockedBy: lock.lockedBy,
          lockedAt: lock.lockedAt,
          expiresAt: lock.expiresAt,
        },
      }, 423) // 423 Locked
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

    // Get user info for broadcast (T6.4)
    const [updaterUser] = await db
      .select({ email: schema.users.email, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))
      .limit(1)

    // Broadcast task update via WebSocket (T6.4 - enhanced with updatedBy)
    // Don't exclude sender - HTTP API clients aren't on WebSocket
    broadcastTaskUpdated(
      projectId,
      {
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
      {
        id: user.id,
        email: updaterUser?.email || user.email,
        name: updaterUser?.name || null,
      }
    )

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

    // Broadcast task assignment via WebSocket
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
      }
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

    // Broadcast task unassignment via WebSocket
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
      }
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
// Task Locking Routes (T6.6)
// ============================================

// POST /projects/:id/tasks/:taskId/lock - Acquire a lock on a task
app.post('/projects/:id/tasks/:taskId/lock', auth, async (c) => {
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
    const [task] = await db
      .select({ id: schema.tasks.id, name: schema.tasks.name })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!task) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found in this project` }, 404)
    }

    // Get user info
    const [userInfo] = await db
      .select({ email: schema.users.email, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))

    // Attempt to acquire lock
    const result = acquireTaskLock(
      projectId,
      taskIdParam,
      task.id,
      user.id,
      userInfo?.email || user.email,
      userInfo?.name || null
    )

    if (result.success) {
      // Broadcast lock to other clients
      broadcastTaskLocked(projectId, result.lock, user.id)
    }

    return c.json({
      success: result.success,
      data: {
        lock: result.lock,
        isOwnLock: result.isOwnLock || false,
      },
    }, result.success ? 200 : 409)
  } catch (error) {
    console.error('Lock task error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// POST /projects/:id/tasks/:taskId/unlock - Release a lock on a task
app.post('/projects/:id/tasks/:taskId/unlock', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    const db = getDbClient()

    // Verify the project exists and belongs to the user
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Find the task by taskId
    const [task] = await db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!task) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found in this project` }, 404)
    }

    // Get user info
    const [userInfo] = await db
      .select({ email: schema.users.email, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))

    // Release lock (only if owned by user)
    const released = releaseTaskLock(projectId, taskIdParam, user.id)

    if (released) {
      // Broadcast unlock to other clients
      broadcastTaskUnlocked(projectId, {
        taskId: taskIdParam,
        taskUuid: task.id,
        unlockedBy: {
          id: user.id,
          email: userInfo?.email || user.email,
          name: userInfo?.name || null,
        },
      })
    }

    return c.json({
      success: released,
      data: {
        taskId: taskIdParam,
        released,
      },
    }, released ? 200 : 404)
  } catch (error) {
    console.error('Unlock task error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /projects/:id/locks - Get all active locks for a project
app.get('/projects/:id/locks', auth, async (c) => {
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

    // Get all active locks
    const locks = getProjectLocks(projectId)

    return c.json({
      success: true,
      data: {
        projectId,
        projectName: project.name,
        locks,
        count: locks.length,
      },
    })
  } catch (error) {
    console.error('Get locks error:', error)
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
    const taskIdParam = c.req.param('taskId')

    // Validate project UUID
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
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

    // Check if taskId is a UUID or a human-readable task ID (e.g., "T1.1")
    const isUuid = uuidRegex.test(taskIdParam)
    let taskUuid: string

    if (isUuid) {
      // Verify task exists in this project
      const [task] = await db
        .select({ id: schema.tasks.id })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.id, taskIdParam), eq(schema.tasks.projectId, projectId)))
        .limit(1)

      if (!task) {
        return c.json({ success: false, error: 'Task not found' }, 404)
      }
      taskUuid = task.id
    } else {
      // Human-readable task ID (e.g., "T1.1")
      const [task] = await db
        .select({ id: schema.tasks.id })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.taskId, taskIdParam), eq(schema.tasks.projectId, projectId)))
        .limit(1)

      if (!task) {
        return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
      }
      taskUuid = task.id
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
      .where(eq(schema.comments.taskId, taskUuid))
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
        taskId: taskUuid,
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
    const taskIdParam = c.req.param('taskId')

    // Validate project UUID
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
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

    // Check if taskId is a UUID or a human-readable task ID (e.g., "T1.1")
    const isUuid = uuidRegex.test(taskIdParam)
    let task: { id: string; taskId: string; name: string; assigneeId: string | null } | undefined

    if (isUuid) {
      // Verify task exists in this project (also get assignee for notification)
      const [foundTask] = await db
        .select({
          id: schema.tasks.id,
          taskId: schema.tasks.taskId,
          name: schema.tasks.name,
          assigneeId: schema.tasks.assigneeId,
        })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.id, taskIdParam), eq(schema.tasks.projectId, projectId)))
        .limit(1)

      task = foundTask
    } else {
      // Human-readable task ID (e.g., "T1.1")
      const [foundTask] = await db
        .select({
          id: schema.tasks.id,
          taskId: schema.tasks.taskId,
          name: schema.tasks.name,
          assigneeId: schema.tasks.assigneeId,
        })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.taskId, taskIdParam), eq(schema.tasks.projectId, projectId)))
        .limit(1)

      task = foundTask
    }

    if (!task) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    const taskUuid = task.id

    // If parentId provided, verify it exists and belongs to same task
    if (parentId) {
      const [parentComment] = await db
        .select({ id: schema.comments.id })
        .from(schema.comments)
        .where(and(eq(schema.comments.id, parentId), eq(schema.comments.taskId, taskUuid)))
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
        taskId: taskUuid,
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

    // Broadcast comment creation to all connected clients (T6.4)
    const commentData: CommentData = {
      id: newComment.id,
      taskId: newComment.taskId,
      taskDisplayId: task.taskId,
      content: newComment.content,
      parentId: newComment.parentId,
      mentions: newComment.mentions,
      createdAt: newComment.createdAt.toISOString(),
      author: {
        id: user.id,
        email: author?.email || user.email,
        name: author?.name || null,
      },
    }
    broadcastCommentCreated(projectId, commentData, user.id)

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
    const taskIdParam = c.req.param('taskId')
    const commentId = c.req.param('commentId')

    // Validate project and comment UUIDs
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
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

    // Check if taskId is a UUID or a human-readable task ID (e.g., "T1.1")
    const isUuid = uuidRegex.test(taskIdParam)
    let taskUuid: string

    if (isUuid) {
      const [task] = await db
        .select({ id: schema.tasks.id })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.id, taskIdParam), eq(schema.tasks.projectId, projectId)))
        .limit(1)

      if (!task) {
        return c.json({ success: false, error: 'Task not found' }, 404)
      }
      taskUuid = task.id
    } else {
      const [task] = await db
        .select({ id: schema.tasks.id })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.taskId, taskIdParam), eq(schema.tasks.projectId, projectId)))
        .limit(1)

      if (!task) {
        return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
      }
      taskUuid = task.id
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
      .where(and(eq(schema.comments.id, commentId), eq(schema.comments.taskId, taskUuid)))
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
    const taskIdParam = c.req.param('taskId')
    const commentId = c.req.param('commentId')

    // Validate project and comment UUIDs
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
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

    // Check if taskId is a UUID or a human-readable task ID (e.g., "T1.1")
    const isUuid = uuidRegex.test(taskIdParam)
    let taskUuid: string

    if (isUuid) {
      const [task] = await db
        .select({ id: schema.tasks.id })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.id, taskIdParam), eq(schema.tasks.projectId, projectId)))
        .limit(1)

      if (!task) {
        return c.json({ success: false, error: 'Task not found' }, 404)
      }
      taskUuid = task.id
    } else {
      const [task] = await db
        .select({ id: schema.tasks.id })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.taskId, taskIdParam), eq(schema.tasks.projectId, projectId)))
        .limit(1)

      if (!task) {
        return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
      }
      taskUuid = task.id
    }

    // Get the existing comment
    const [existingComment] = await db
      .select({
        id: schema.comments.id,
        authorId: schema.comments.authorId,
      })
      .from(schema.comments)
      .where(and(eq(schema.comments.id, commentId), eq(schema.comments.taskId, taskUuid)))
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

    // Get task display ID for broadcast (T6.4)
    const [taskForBroadcast] = await db
      .select({ taskId: schema.tasks.taskId })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, taskUuid))
      .limit(1)

    // Broadcast comment updated (T6.4)
    const authorInfo = {
      id: user.id,
      email: author?.email || user.email,
      name: author?.name || null,
    }
    broadcastCommentUpdated(projectId, {
      id: updatedComment.id,
      taskId: taskUuid,
      taskDisplayId: taskForBroadcast?.taskId || taskIdParam,
      content: updatedComment.content,
      parentId: updatedComment.parentId,
      mentions: updatedComment.mentions,
      createdAt: updatedComment.createdAt.toISOString(),
      author: authorInfo,
    })

    return c.json({
      success: true,
      data: {
        comment: {
          ...updatedComment,
          author: authorInfo,
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
    const taskIdParam = c.req.param('taskId')
    const commentId = c.req.param('commentId')

    // Validate project and comment UUIDs
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
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

    // Check if taskId is a UUID or a human-readable task ID (e.g., "T1.1")
    const isUuid = uuidRegex.test(taskIdParam)
    let taskUuid: string

    if (isUuid) {
      const [task] = await db
        .select({ id: schema.tasks.id })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.id, taskIdParam), eq(schema.tasks.projectId, projectId)))
        .limit(1)

      if (!task) {
        return c.json({ success: false, error: 'Task not found' }, 404)
      }
      taskUuid = task.id
    } else {
      const [task] = await db
        .select({ id: schema.tasks.id })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.taskId, taskIdParam), eq(schema.tasks.projectId, projectId)))
        .limit(1)

      if (!task) {
        return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
      }
      taskUuid = task.id
    }

    // Get the existing comment
    const [existingComment] = await db
      .select({
        id: schema.comments.id,
        authorId: schema.comments.authorId,
      })
      .from(schema.comments)
      .where(and(eq(schema.comments.id, commentId), eq(schema.comments.taskId, taskUuid)))
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

    // Get task display ID for broadcast (T6.4)
    const [taskForBroadcast] = await db
      .select({ taskId: schema.tasks.taskId })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, taskUuid))
      .limit(1)

    // Get user info for broadcast
    const [deleter] = await db
      .select({ email: schema.users.email, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))
      .limit(1)

    // Delete the comment (CASCADE will handle replies)
    await db.delete(schema.comments).where(eq(schema.comments.id, commentId))

    // Broadcast comment deleted (T6.4)
    broadcastCommentDeleted(projectId, {
      commentId,
      taskId: taskUuid,
      taskDisplayId: taskForBroadcast?.taskId || taskIdParam,
      deletedBy: {
        id: user.id,
        email: deleter?.email || user.email,
        name: deleter?.name || null,
      },
    })

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
// GitHub Webhook Handler (T8.5)
// Auto-update task status when linked PR is merged
// ============================================
app.post('/webhooks/github', webhookRateLimit, async (c) => {
  try {
    // Check if GitHub webhook is configured
    if (!isGitHubWebhookConfigured()) {
      console.warn('[GitHub Webhook] GITHUB_WEBHOOK_SECRET not configured')
      return c.json({ success: false, error: 'GitHub webhook not configured' }, 500)
    }

    // Get raw body for signature verification
    const rawBody = await c.req.text()
    const signature = c.req.header('x-hub-signature-256')
    const eventType = c.req.header('x-github-event')
    const deliveryId = c.req.header('x-github-delivery')

    console.log(`[GitHub Webhook] Event: ${eventType}, Delivery: ${deliveryId}`)

    // Verify webhook signature
    if (!signature) {
      console.warn('[GitHub Webhook] Missing signature header')
      return c.json({ success: false, error: 'Missing signature' }, 401)
    }

    if (!verifyGitHubWebhookSignature(rawBody, signature)) {
      console.warn('[GitHub Webhook] Invalid signature')
      return c.json({ success: false, error: 'Invalid signature' }, 401)
    }

    // Only handle pull_request events
    if (eventType !== 'pull_request') {
      console.log(`[GitHub Webhook] Ignoring event type: ${eventType}`)
      return c.json({ success: true, message: 'Event ignored' })
    }

    const payload = JSON.parse(rawBody) as GitHubPullRequestEvent

    // Only process when PR is closed AND merged
    if (payload.action !== 'closed' || !payload.pull_request.merged) {
      console.log(`[GitHub Webhook] Ignoring PR action: ${payload.action}, merged: ${payload.pull_request.merged}`)
      return c.json({ success: true, message: 'PR not merged, ignored' })
    }

    const pr = payload.pull_request
    const repo = payload.repository.full_name // "owner/repo"
    const prNumber = pr.number

    console.log(`[GitHub Webhook] PR #${prNumber} merged in ${repo}`)

    const db = getDbClient()

    // Find tasks linked to this PR
    const linkedTasks = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        status: schema.tasks.status,
        projectId: schema.tasks.projectId,
        githubPrNumber: schema.tasks.githubPrNumber,
        githubPrRepository: schema.tasks.githubPrRepository,
        githubPrLinkedBy: schema.tasks.githubPrLinkedBy,
      })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.githubPrRepository, repo),
          eq(schema.tasks.githubPrNumber, prNumber)
        )
      )

    if (linkedTasks.length === 0) {
      console.log(`[GitHub Webhook] No tasks linked to PR #${prNumber} in ${repo}`)
      return c.json({ success: true, message: 'No linked tasks found' })
    }

    console.log(`[GitHub Webhook] Found ${linkedTasks.length} task(s) linked to PR #${prNumber}`)

    // Process each linked task
    for (const task of linkedTasks) {
      // Skip if task is already DONE
      if (task.status === 'DONE') {
        console.log(`[GitHub Webhook] Task ${task.taskId} already DONE, skipping`)
        continue
      }

      // Get project info for notifications
      const [project] = await db
        .select({
          id: schema.projects.id,
          name: schema.projects.name,
          userId: schema.projects.userId,
        })
        .from(schema.projects)
        .where(eq(schema.projects.id, task.projectId))

      if (!project) {
        console.warn(`[GitHub Webhook] Project not found for task ${task.taskId}`)
        continue
      }

      // Get the user's organization (if any) for integration notifications
      const [userOrg] = await db
        .select({
          organizationId: schema.organizationMembers.organizationId,
        })
        .from(schema.organizationMembers)
        .where(eq(schema.organizationMembers.userId, project.userId))
        .limit(1)

      // Update task status to DONE and update PR state
      const [updatedTask] = await db
        .update(schema.tasks)
        .set({
          status: 'DONE',
          githubPrState: 'merged',
          updatedAt: new Date(),
        })
        .where(eq(schema.tasks.id, task.id))
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

      if (!updatedTask) {
        console.error(`[GitHub Webhook] Failed to update task ${task.taskId}`)
        continue
      }

      console.log(`[GitHub Webhook] Task ${task.taskId} status updated to DONE via PR #${prNumber}`)

      // Update project's updatedAt
      await db
        .update(schema.projects)
        .set({ updatedAt: new Date() })
        .where(eq(schema.projects.id, task.projectId))

      // Log activity
      const actorId = task.githubPrLinkedBy || project.userId
      await db.insert(schema.activityLog).values({
        action: 'task_status_changed',
        entityType: 'task',
        entityId: task.id,
        taskId: task.taskId,
        actorId,
        organizationId: userOrg?.organizationId,
        projectId: project.id,
        taskUuid: task.id,
        description: `Task completed via PR #${prNumber} merge`,
        metadata: {
          prNumber,
          prUrl: pr.html_url,
          prTitle: pr.title,
          repository: repo,
          mergedBy: payload.sender.login,
          previousStatus: task.status,
          newStatus: 'DONE',
        },
      })

      // Broadcast task update via WebSocket
      broadcastTaskUpdated(
        task.projectId,
        {
          id: updatedTask.id,
          taskId: updatedTask.taskId,
          name: updatedTask.name,
          description: updatedTask.description,
          status: updatedTask.status,
          complexity: updatedTask.complexity,
          estimatedHours: updatedTask.estimatedHours,
          dependencies: updatedTask.dependencies ?? [],
          assigneeId: updatedTask.assigneeId,
          assignedBy: updatedTask.assignedBy,
          assignedAt: updatedTask.assignedAt,
          createdAt: updatedTask.createdAt,
          updatedAt: updatedTask.updatedAt,
        },
        {
          id: 'github-webhook',
          email: `${payload.sender.login}@github.com`,
          name: payload.sender.login,
        }
      )

      // Send integration notifications (Slack/Discord) if user has an organization
      if (userOrg?.organizationId) {
        sendIntegrationNotifications({
          organizationId: userOrg.organizationId,
          projectId: project.id,
          eventType: 'task_completed',
          eventData: {
            type: 'task_completed',
            title: `Task Completed: ${task.taskId}`,
            body: `PR #${prNumber} merged - ${pr.title}`,
            link: pr.html_url,
            projectName: project.name,
            taskId: task.taskId,
            taskName: task.name,
            actorName: payload.sender.login,
            metadata: {
              prNumber,
              prUrl: pr.html_url,
              repository: repo,
              completedVia: 'github_pr_merge',
            },
          },
        }).catch(err => console.error('[GitHub Webhook] Failed to send notifications:', err))
      }

      // Send notification to task assignee if assigned
      if (updatedTask.assigneeId) {
        const notification = {
          id: crypto.randomUUID(),
          type: 'status_change' as const,
          title: `Task ${task.taskId} Completed`,
          body: `Your task was completed via PR #${prNumber} merge`,
          link: `/dashboard/projects/${project.id}?task=${task.taskId}`,
          read: false,
          createdAt: new Date().toISOString(),
        }

        // Save notification to database
        await db.insert(schema.notifications).values({
          userId: updatedTask.assigneeId,
          type: 'status_change',
          title: notification.title,
          body: notification.body,
          link: notification.link,
          projectId: project.id,
          taskId: task.taskId,
        }).catch(err => console.error('[GitHub Webhook] Failed to save notification:', err))

        // Send real-time notification
        sendNotificationToUser(project.id, updatedTask.assigneeId, notification)
      }
    }

    return c.json({
      success: true,
      message: `Processed ${linkedTasks.length} task(s)`,
      tasksUpdated: linkedTasks.filter(t => t.status !== 'DONE').map(t => t.taskId),
    })
  } catch (error) {
    console.error('[GitHub Webhook] Processing error:', error)
    captureException(error)
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

// Helper function to log activity (fire-and-forget) and broadcast via WebSocket (T6.3)
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

    // Insert and return the activity
    const [activity] = await db
      .insert(schema.activityLog)
      .values({
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
      .returning()

    // If we have a projectId, broadcast the activity via WebSocket (T6.3)
    if (params.projectId && activity) {
      // Fetch actor info for the broadcast
      const [actor] = await db
        .select({
          id: schema.users.id,
          email: schema.users.email,
          name: schema.users.name,
        })
        .from(schema.users)
        .where(eq(schema.users.id, params.actorId))
        .limit(1)

      if (actor) {
        broadcastActivityCreated(
          params.projectId,
          {
            id: activity.id,
            action: activity.action,
            entityType: activity.entityType,
            entityId: activity.entityId,
            taskId: activity.taskId,
            taskUuid: activity.taskUuid,
            metadata: activity.metadata as Record<string, unknown> | null,
            description: activity.description,
            createdAt: activity.createdAt.toISOString(),
            actor: {
              id: actor.id,
              email: actor.email,
              name: actor.name,
            },
          },
          params.actorId // Exclude the actor from receiving their own activity
        )

        // Send Slack/Discord notifications (T8.7)
        // Only for important events that teams care about
        const slackEvents = [
          'task_status_changed',
          'task_assigned',
          'task_unassigned',
          'comment_created',
          'member_joined',
          'member_removed',
        ]

        if (params.organizationId && slackEvents.includes(params.action)) {
          // Send to integration webhooks asynchronously
          sendIntegrationNotifications({
            organizationId: params.organizationId,
            projectId: params.projectId,
            eventType: params.action,
            eventData: {
              type: params.action,
              title: params.description || `${params.action.replace(/_/g, ' ')}`,
              body: params.description,
              link: params.projectId && params.taskId
                ? `${process.env['APP_URL'] || 'https://planflow.tools'}/projects/${params.projectId}/tasks/${params.taskId}`
                : undefined,
              projectName: (params.metadata as Record<string, unknown> | undefined)?.['projectName'] as string | undefined,
              taskId: params.taskId,
              taskName: (params.metadata as Record<string, unknown> | undefined)?.['taskName'] as string | undefined,
              actorName: actor.name || actor.email,
              actorEmail: actor.email,
              metadata: params.metadata,
            },
          }).catch(err => console.error('Integration notification error:', err))
        }
      }
    }
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

// POST /projects/:id/tasks/:taskId/work - Start or stop working on a task (T6.1)
app.post('/projects/:id/tasks/:taskId/work', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    const body = await c.req.json()
    const action = body.action as string

    if (!action || !['start', 'stop'].includes(action)) {
      return c.json({ success: false, error: 'Invalid action. Must be "start" or "stop"' }, 400)
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

    // Import connection manager and broadcast function
    const { connectionManager, broadcastWorkingOnChanged } = await import('./websocket/index.js')

    if (action === 'stop') {
      // Clear working on status
      connectionManager.clearWorkingOn(projectId, user.id)
      broadcastWorkingOnChanged(projectId, user.id, null)

      return c.json({
        success: true,
        data: {
          action: 'stop',
          workingOn: null,
        },
      })
    }

    // action === 'start'
    // Find the task by taskId (human-readable) or UUID
    const isUuid = uuidRegex.test(taskIdParam)

    let task: { id: string; taskId: string; name: string } | undefined

    if (isUuid) {
      const [result] = await db
        .select({ id: schema.tasks.id, taskId: schema.tasks.taskId, name: schema.tasks.name })
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.id, taskIdParam),
            eq(schema.tasks.projectId, projectId)
          )
        )
        .limit(1)
      task = result
    } else {
      // Human-readable task ID
      const [result] = await db
        .select({ id: schema.tasks.id, taskId: schema.tasks.taskId, name: schema.tasks.name })
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.taskId, taskIdParam),
            eq(schema.tasks.projectId, projectId)
          )
        )
        .limit(1)
      task = result
    }

    if (!task) {
      return c.json({ success: false, error: 'Task not found' }, 404)
    }

    // Set working on status
    const startedAt = connectionManager.setWorkingOn(projectId, user.id, {
      taskId: task.taskId,
      taskUuid: task.id,
      taskName: task.name,
    })

    const workingOnData = {
      taskId: task.taskId,
      taskUuid: task.id,
      taskName: task.name,
      startedAt: startedAt.toISOString(),
    }

    // Broadcast to other clients
    broadcastWorkingOnChanged(projectId, user.id, workingOnData)

    return c.json({
      success: true,
      data: {
        action: 'start',
        workingOn: workingOnData,
      },
    })
  } catch (error) {
    console.error('Work on task error:', error)
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

// ============================================
// Push Notifications API (T6.8)
// ============================================

// GET /notifications/push/vapid-public-key - Get VAPID public key for subscribing
app.get('/notifications/push/vapid-public-key', async (c) => {
  const publicKey = getVapidPublicKey()

  if (!publicKey) {
    return c.json({
      success: false,
      error: 'Push notifications are not configured on this server',
    }, 503)
  }

  return c.json({
    success: true,
    data: {
      publicKey,
    },
  })
})

// POST /notifications/push/subscribe - Subscribe to push notifications
app.post('/notifications/push/subscribe', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const body = await c.req.json()

    // Validate subscription object
    if (!body.subscription || !body.subscription.endpoint || !body.subscription.keys) {
      return c.json({
        success: false,
        error: 'Invalid subscription object. Must include endpoint and keys (p256dh, auth)',
      }, 400)
    }

    const { endpoint, keys } = body.subscription

    if (!keys.p256dh || !keys.auth) {
      return c.json({
        success: false,
        error: 'Subscription keys must include p256dh and auth',
      }, 400)
    }

    const userAgent = c.req.header('User-Agent')

    const subscription = await subscribeToPush(
      user.id,
      { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
      userAgent
    )

    return c.json({
      success: true,
      data: {
        id: subscription.id,
        createdAt: subscription.createdAt,
      },
    })
  } catch (error) {
    console.error('Push subscribe error:', error)
    captureException(error)
    return c.json({ success: false, error: 'Failed to subscribe to push notifications' }, 500)
  }
})

// DELETE /notifications/push/subscribe - Unsubscribe from push notifications
app.delete('/notifications/push/subscribe', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const body = await c.req.json()

    if (!body.endpoint) {
      return c.json({
        success: false,
        error: 'Endpoint is required to unsubscribe',
      }, 400)
    }

    const success = await unsubscribeFromPush(user.id, body.endpoint)

    return c.json({
      success: true,
      data: {
        unsubscribed: success,
      },
    })
  } catch (error) {
    console.error('Push unsubscribe error:', error)
    captureException(error)
    return c.json({ success: false, error: 'Failed to unsubscribe from push notifications' }, 500)
  }
})

// GET /notifications/preferences - Get notification preferences
app.get('/notifications/preferences', auth, async (c) => {
  try {
    const { user } = getAuth(c)

    const preferences = await getNotificationPreferences(user.id)

    // Return defaults if no preferences set
    if (!preferences) {
      return c.json({
        success: true,
        data: {
          pushEnabled: true,
          pushMentions: true,
          pushAssignments: true,
          pushComments: true,
          pushStatusChanges: false,
          pushTaskCreated: false,
          pushInvitations: true,
          emailEnabled: true,
          emailMentions: true,
          emailAssignments: true,
          emailDigest: false,
          emailDigestFrequency: 'daily',
          emailDigestTime: '09:00',
          emailDigestTimezone: 'UTC',
          lastDigestSentAt: null,
          toastEnabled: true,
        },
      })
    }

    return c.json({
      success: true,
      data: {
        pushEnabled: preferences.pushEnabled,
        pushMentions: preferences.pushMentions,
        pushAssignments: preferences.pushAssignments,
        pushComments: preferences.pushComments,
        pushStatusChanges: preferences.pushStatusChanges,
        pushTaskCreated: preferences.pushTaskCreated,
        pushInvitations: preferences.pushInvitations,
        emailEnabled: preferences.emailEnabled,
        emailMentions: preferences.emailMentions,
        emailAssignments: preferences.emailAssignments,
        emailDigest: preferences.emailDigest,
        emailDigestFrequency: preferences.emailDigestFrequency,
        emailDigestTime: preferences.emailDigestTime,
        emailDigestTimezone: preferences.emailDigestTimezone,
        lastDigestSentAt: preferences.lastDigestSentAt,
        toastEnabled: preferences.toastEnabled,
      },
    })
  } catch (error) {
    console.error('Get notification preferences error:', error)
    captureException(error)
    return c.json({ success: false, error: 'Failed to get notification preferences' }, 500)
  }
})

// PATCH /notifications/preferences - Update notification preferences
app.patch('/notifications/preferences', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const body = await c.req.json()

    // Only allow updating specific fields
    const booleanFields = [
      'pushEnabled',
      'pushMentions',
      'pushAssignments',
      'pushComments',
      'pushStatusChanges',
      'pushTaskCreated',
      'pushInvitations',
      'emailEnabled',
      'emailMentions',
      'emailAssignments',
      'emailDigest',
      'toastEnabled',
    ] as const

    const stringFields = [
      'emailDigestFrequency',
      'emailDigestTime',
      'emailDigestTimezone',
    ] as const

    const updates: Record<string, boolean | string> = {}

    for (const field of booleanFields) {
      if (typeof body[field] === 'boolean') {
        updates[field] = body[field]
      }
    }

    for (const field of stringFields) {
      if (typeof body[field] === 'string') {
        // Validate values
        if (field === 'emailDigestFrequency' && !['daily', 'weekly', 'none'].includes(body[field])) {
          continue
        }
        if (field === 'emailDigestTime' && !/^\d{2}:\d{2}$/.test(body[field])) {
          continue
        }
        updates[field] = body[field]
      }
    }

    if (Object.keys(updates).length === 0) {
      return c.json({
        success: false,
        error: 'No valid fields to update',
      }, 400)
    }

    const preferences = await updateNotificationPreferences(user.id, updates)

    return c.json({
      success: true,
      data: {
        pushEnabled: preferences.pushEnabled,
        pushMentions: preferences.pushMentions,
        pushAssignments: preferences.pushAssignments,
        pushComments: preferences.pushComments,
        pushStatusChanges: preferences.pushStatusChanges,
        pushTaskCreated: preferences.pushTaskCreated,
        pushInvitations: preferences.pushInvitations,
        emailEnabled: preferences.emailEnabled,
        emailMentions: preferences.emailMentions,
        emailAssignments: preferences.emailAssignments,
        emailDigest: preferences.emailDigest,
        emailDigestFrequency: preferences.emailDigestFrequency,
        emailDigestTime: preferences.emailDigestTime,
        emailDigestTimezone: preferences.emailDigestTimezone,
        lastDigestSentAt: preferences.lastDigestSentAt,
        toastEnabled: preferences.toastEnabled,
      },
    })
  } catch (error) {
    console.error('Update notification preferences error:', error)
    captureException(error)
    return c.json({ success: false, error: 'Failed to update notification preferences' }, 500)
  }
})

// POST /notifications/push/test - Send a test push notification (for debugging)
app.post('/notifications/push/test', auth, async (c) => {
  try {
    const { user } = getAuth(c)

    if (!isPushConfigured()) {
      return c.json({
        success: false,
        error: 'Push notifications are not configured on this server',
      }, 503)
    }

    const result = await sendPushNotification(user.id, {
      title: 'Test Notification',
      body: 'Push notifications are working! 🎉',
      icon: '/icons/notification.png',
      data: {
        type: 'test',
        url: '/dashboard',
      },
    })

    return c.json({
      success: true,
      data: {
        sent: result.success,
        failed: result.failed,
        message: result.success > 0
          ? 'Test notification sent successfully'
          : 'No active subscriptions found for this user',
      },
    })
  } catch (error) {
    console.error('Push test error:', error)
    captureException(error)
    return c.json({ success: false, error: 'Failed to send test notification' }, 500)
  }
})

// POST /notifications/digest/test - Send a test digest email (for debugging)
app.post('/notifications/digest/test', auth, async (c) => {
  try {
    const { user } = getAuth(c)

    if (!isEmailServiceConfigured()) {
      return c.json({
        success: false,
        error: 'Email service is not configured on this server',
      }, 503)
    }

    const db = getDbClient()

    // Get user details
    const [userData] = await db
      .select({
        email: schema.users.email,
        name: schema.users.name,
      })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))

    if (!userData) {
      return c.json({ success: false, error: 'User not found' }, 404)
    }

    // Get recent notifications (last 24 hours)
    const oneDayAgo = new Date()
    oneDayAgo.setHours(oneDayAgo.getHours() - 24)

    const recentNotifications = await db
      .select({
        id: schema.notifications.id,
        type: schema.notifications.type,
        title: schema.notifications.title,
        body: schema.notifications.body,
        link: schema.notifications.link,
        projectId: schema.notifications.projectId,
        taskId: schema.notifications.taskId,
        createdAt: schema.notifications.createdAt,
      })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.userId, user.id),
          gt(schema.notifications.createdAt, oneDayAgo)
        )
      )
      .orderBy(desc(schema.notifications.createdAt))
      .limit(20)

    if (recentNotifications.length === 0) {
      return c.json({
        success: false,
        error: 'No notifications in the last 24 hours to include in digest',
      }, 400)
    }

    // Import sendDigestEmail dynamically
    const { sendDigestEmail } = await import('./lib/email.js')

    const result = await sendDigestEmail({
      to: userData.email,
      userName: userData.name,
      frequency: 'daily',
      notifications: recentNotifications,
    })

    if (!result.success) {
      return c.json({
        success: false,
        error: result.error || 'Failed to send digest email',
      }, 500)
    }

    return c.json({
      success: true,
      data: {
        messageId: result.messageId,
        notificationCount: recentNotifications.length,
        message: 'Test digest email sent successfully',
      },
    })
  } catch (error) {
    console.error('Digest test error:', error)
    captureException(error)
    return c.json({ success: false, error: 'Failed to send test digest' }, 500)
  }
})

// GET /notifications/digest/history - Get digest send history
app.get('/notifications/digest/history', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    const limit = Math.min(Number(c.req.query('limit')) || 10, 50)

    const history = await db
      .select()
      .from(schema.digestSendLog)
      .where(eq(schema.digestSendLog.userId, user.id))
      .orderBy(desc(schema.digestSendLog.sentAt))
      .limit(limit)

    return c.json({
      success: true,
      data: {
        digests: history.map((d) => ({
          id: d.id,
          frequency: d.frequency,
          notificationCount: d.notificationCount,
          fromDate: d.fromDate,
          toDate: d.toDate,
          sentAt: d.sentAt,
          status: d.status,
          errorMessage: d.errorMessage,
        })),
      },
    })
  } catch (error) {
    console.error('Get digest history error:', error)
    captureException(error)
    return c.json({ success: false, error: 'Failed to get digest history' }, 500)
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

    // Send real-time notification via WebSocket (T6.4)
    if (notification && data.projectId) {
      const wsNotification: NotificationData = {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        link: notification.link,
        createdAt: notification.createdAt.toISOString(),
      }
      sendNotificationToUser(data.projectId, data.userId, wsNotification)
    }

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

    // Send browser push notification (T6.8)
    if (notification && isPushConfigured()) {
      const pushPayload = createPushPayload(notification)
      sendPushNotification(data.userId, pushPayload).catch((error) => {
        console.error('Failed to send push notification:', error)
      })
    }

    return notification
  } catch (error) {
    // Log error but don't throw - notification creation should not block operations
    console.error('Create notification error:', error)
    return null
  }
}

// ============================================
// Integrations API (T8.7 - Slack Webhooks)
// ============================================

// Zod schemas for integration requests
import { z } from 'zod'

const CreateIntegrationRequestSchema = z.object({
  provider: z.enum(['slack', 'discord']),
  name: z.string().min(1).max(100),
  webhookUrl: z.string().url(),
  projectId: z.string().uuid().optional(),
  config: z.object({
    channel: z.string().optional(),
    username: z.string().optional(),
    icon_emoji: z.string().optional(),
    icon_url: z.string().url().optional(),
    includeLinks: z.boolean().optional(),
    mentionUsers: z.boolean().optional(),
  }).optional(),
  enabledEvents: z.array(z.string()).optional(),
})

const UpdateIntegrationRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  webhookUrl: z.string().url().optional(),
  active: z.boolean().optional(),
  config: z.object({
    channel: z.string().optional(),
    username: z.string().optional(),
    icon_emoji: z.string().optional(),
    icon_url: z.string().url().optional(),
    includeLinks: z.boolean().optional(),
    mentionUsers: z.boolean().optional(),
  }).optional(),
  enabledEvents: z.array(z.string()).optional(),
})

// POST /organizations/:id/integrations - Create integration
app.post('/organizations/:id/integrations', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orgId)) {
      return c.json({ success: false, error: 'Invalid organization ID format' }, 400)
    }

    const body = await c.req.json()
    const validation = CreateIntegrationRequestSchema.safeParse(body)

    if (!validation.success) {
      return c.json({
        success: false,
        error: 'Validation failed',
        details: validation.error.flatten().fieldErrors,
      }, 400)
    }

    const { provider, name, webhookUrl, projectId, config, enabledEvents } = validation.data
    const db = getDbClient()

    // Check membership (must be owner or admin)
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
      return c.json({ success: false, error: 'Only owners and admins can create integrations' }, 403)
    }

    // Validate webhook URL for Slack
    if (provider === 'slack' && !isValidSlackWebhookUrl(webhookUrl)) {
      return c.json({ success: false, error: 'Invalid Slack webhook URL. Must be a valid hooks.slack.com URL.' }, 400)
    }

    // Validate webhook URL for Discord
    if (provider === 'discord' && !isValidDiscordWebhookUrl(webhookUrl)) {
      return c.json({ success: false, error: 'Invalid Discord webhook URL. Must be a valid discord.com/api/webhooks URL.' }, 400)
    }

    // If projectId provided, verify it exists
    // Note: Projects are currently user-owned, not organization-owned
    if (projectId) {
      const [project] = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.id, projectId))
        .limit(1)

      if (!project) {
        return c.json({ success: false, error: 'Project not found' }, 404)
      }
    }

    // Create integration
    const [integration] = await db
      .insert(schema.integrations)
      .values({
        organizationId: orgId,
        projectId: projectId || null,
        provider: provider as 'slack' | 'discord',
        name,
        webhookUrl,
        config: config || {},
        enabledEvents: enabledEvents || null,
        createdBy: user.id,
        active: true,
      })
      .returning()

    return c.json({
      success: true,
      data: { integration },
    }, 201)
  } catch (error) {
    console.error('Create integration error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /organizations/:id/integrations - List integrations
app.get('/organizations/:id/integrations', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orgId)) {
      return c.json({ success: false, error: 'Invalid organization ID format' }, 400)
    }

    const db = getDbClient()

    // Check membership
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

    // Get all integrations for this organization
    const integrations = await db
      .select({
        id: schema.integrations.id,
        organizationId: schema.integrations.organizationId,
        projectId: schema.integrations.projectId,
        provider: schema.integrations.provider,
        name: schema.integrations.name,
        active: schema.integrations.active,
        config: schema.integrations.config,
        enabledEvents: schema.integrations.enabledEvents,
        createdBy: schema.integrations.createdBy,
        createdAt: schema.integrations.createdAt,
        updatedAt: schema.integrations.updatedAt,
        lastDeliveryAt: schema.integrations.lastDeliveryAt,
        lastDeliveryStatus: schema.integrations.lastDeliveryStatus,
      })
      .from(schema.integrations)
      .where(eq(schema.integrations.organizationId, orgId))
      .orderBy(desc(schema.integrations.createdAt))

    return c.json({
      success: true,
      data: { integrations },
    })
  } catch (error) {
    console.error('List integrations error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /organizations/:id/integrations/:integrationId - Get integration details
app.get('/organizations/:id/integrations/:integrationId', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')
    const integrationId = c.req.param('integrationId')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orgId) || !uuidRegex.test(integrationId)) {
      return c.json({ success: false, error: 'Invalid ID format' }, 400)
    }

    const db = getDbClient()

    // Check membership
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

    // Get integration
    const [integration] = await db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.id, integrationId),
          eq(schema.integrations.organizationId, orgId)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'Integration not found' }, 404)
    }

    // Get recent webhook deliveries
    const webhookHistory = await db
      .select()
      .from(schema.integrationWebhooks)
      .where(eq(schema.integrationWebhooks.integrationId, integrationId))
      .orderBy(desc(schema.integrationWebhooks.deliveredAt))
      .limit(10)

    return c.json({
      success: true,
      data: { integration, webhookHistory },
    })
  } catch (error) {
    console.error('Get integration error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// PATCH /organizations/:id/integrations/:integrationId - Update integration
app.patch('/organizations/:id/integrations/:integrationId', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')
    const integrationId = c.req.param('integrationId')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orgId) || !uuidRegex.test(integrationId)) {
      return c.json({ success: false, error: 'Invalid ID format' }, 400)
    }

    const body = await c.req.json()
    const validation = UpdateIntegrationRequestSchema.safeParse(body)

    if (!validation.success) {
      return c.json({
        success: false,
        error: 'Validation failed',
        details: validation.error.flatten().fieldErrors,
      }, 400)
    }

    const db = getDbClient()

    // Check membership (must be owner or admin)
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
      return c.json({ success: false, error: 'Only owners and admins can update integrations' }, 403)
    }

    // Get existing integration
    const [existingIntegration] = await db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.id, integrationId),
          eq(schema.integrations.organizationId, orgId)
        )
      )
      .limit(1)

    if (!existingIntegration) {
      return c.json({ success: false, error: 'Integration not found' }, 404)
    }

    const { name, webhookUrl, active, config, enabledEvents } = validation.data

    // Validate webhook URL if being updated for Slack
    if (webhookUrl && existingIntegration.provider === 'slack' && !isValidSlackWebhookUrl(webhookUrl)) {
      return c.json({ success: false, error: 'Invalid Slack webhook URL' }, 400)
    }

    // Validate webhook URL if being updated for Discord
    if (webhookUrl && existingIntegration.provider === 'discord' && !isValidDiscordWebhookUrl(webhookUrl)) {
      return c.json({ success: false, error: 'Invalid Discord webhook URL' }, 400)
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }
    if (name !== undefined) updateData['name'] = name
    if (webhookUrl !== undefined) updateData['webhookUrl'] = webhookUrl
    if (active !== undefined) updateData['active'] = active
    if (config !== undefined) updateData['config'] = { ...existingIntegration.config as object, ...config }
    if (enabledEvents !== undefined) updateData['enabledEvents'] = enabledEvents

    const [updatedIntegration] = await db
      .update(schema.integrations)
      .set(updateData)
      .where(eq(schema.integrations.id, integrationId))
      .returning()

    return c.json({
      success: true,
      data: { integration: updatedIntegration },
    })
  } catch (error) {
    console.error('Update integration error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// DELETE /organizations/:id/integrations/:integrationId - Delete integration
app.delete('/organizations/:id/integrations/:integrationId', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')
    const integrationId = c.req.param('integrationId')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orgId) || !uuidRegex.test(integrationId)) {
      return c.json({ success: false, error: 'Invalid ID format' }, 400)
    }

    const db = getDbClient()

    // Check membership (must be owner or admin)
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
      return c.json({ success: false, error: 'Only owners and admins can delete integrations' }, 403)
    }

    const [deletedIntegration] = await db
      .delete(schema.integrations)
      .where(
        and(
          eq(schema.integrations.id, integrationId),
          eq(schema.integrations.organizationId, orgId)
        )
      )
      .returning({ id: schema.integrations.id })

    if (!deletedIntegration) {
      return c.json({ success: false, error: 'Integration not found' }, 404)
    }

    return c.json({
      success: true,
      data: { message: 'Integration deleted successfully' },
    })
  } catch (error) {
    console.error('Delete integration error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// POST /organizations/:id/integrations/:integrationId/test - Send test webhook
app.post('/organizations/:id/integrations/:integrationId/test', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')
    const integrationId = c.req.param('integrationId')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orgId) || !uuidRegex.test(integrationId)) {
      return c.json({ success: false, error: 'Invalid ID format' }, 400)
    }

    const db = getDbClient()

    // Check membership
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

    // Get integration
    const [integration] = await db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.id, integrationId),
          eq(schema.integrations.organizationId, orgId)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'Integration not found' }, 404)
    }

    if (!integration.webhookUrl) {
      return c.json({ success: false, error: 'No webhook URL configured' }, 400)
    }

    // Send test message based on provider
    let result: { success: boolean; error?: string; statusCode?: number; durationMs?: number }

    if (integration.provider === 'slack') {
      result = await sendSlackTestMessage(
        integration.webhookUrl,
        integration.config as SlackConfig
      )
    } else if (integration.provider === 'discord') {
      result = await sendDiscordTestMessage(
        integration.webhookUrl,
        integration.config as DiscordConfig
      )
    } else {
      return c.json({ success: false, error: 'Unsupported provider for test message' }, 400)
    }

    // Log the delivery
    await db.insert(schema.integrationWebhooks).values({
      integrationId: integration.id,
      eventType: 'test',
      payload: { test: true },
      statusCode: result.statusCode?.toString() || null,
      error: result.error || null,
      success: result.success,
      durationMs: result.durationMs?.toString() || null,
    })

    // Update last delivery status
    await db
      .update(schema.integrations)
      .set({
        lastDeliveryAt: new Date(),
        lastDeliveryStatus: result.success ? 'success' : 'failed',
        lastDeliveryError: result.error || null,
        updatedAt: new Date(),
      })
      .where(eq(schema.integrations.id, integrationId))

    if (result.success) {
      return c.json({
        success: true,
        data: { message: 'Test message sent successfully', durationMs: result.durationMs },
      })
    } else {
      return c.json({
        success: false,
        error: result.error || 'Failed to send test message',
      }, 400)
    }
  } catch (error) {
    console.error('Test integration error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// Helper function to send integration notifications (Slack/Discord)
export async function sendIntegrationNotifications(params: {
  organizationId: string
  projectId?: string
  eventType: string
  eventData: {
    type: string
    title: string
    body?: string
    link?: string
    projectName?: string
    taskId?: string
    taskName?: string
    actorName?: string
    actorEmail?: string
    metadata?: Record<string, unknown>
  }
}) {
  try {
    const db = getDbClient()

    // Find active integrations for this organization
    const integrations = await db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.organizationId, params.organizationId),
          eq(schema.integrations.active, true),
          // If projectId is specified, include org-wide integrations OR project-specific ones
          params.projectId
            ? isNull(schema.integrations.projectId)
            : isNull(schema.integrations.projectId)
        )
      )

    // Also get project-specific integrations if projectId is provided
    if (params.projectId) {
      const projectIntegrations = await db
        .select()
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.organizationId, params.organizationId),
            eq(schema.integrations.projectId, params.projectId),
            eq(schema.integrations.active, true)
          )
        )
      integrations.push(...projectIntegrations)
    }

    // Send to each integration
    for (const integration of integrations) {
      // Check if this event type is enabled
      if (integration.enabledEvents && integration.enabledEvents.length > 0) {
        if (!integration.enabledEvents.includes(params.eventType)) {
          continue // Skip this integration for this event
        }
      }

      if (!integration.webhookUrl) continue

      // Send based on provider
      if (integration.provider === 'slack') {
        const result = await sendSlackNotification(
          integration.webhookUrl,
          {
            ...params.eventData,
            organizationId: params.organizationId,
            projectId: params.projectId,
            timestamp: new Date(),
          },
          integration.config as SlackConfig
        )

        // Log delivery (async, don't block)
        db.insert(schema.integrationWebhooks).values({
          integrationId: integration.id,
          eventType: params.eventType,
          payload: params.eventData,
          statusCode: result.statusCode?.toString() || null,
          error: result.error || null,
          success: result.success,
          durationMs: result.durationMs?.toString() || null,
        }).catch(err => console.error('Failed to log webhook:', err))

        // Update last delivery status
        db.update(schema.integrations)
          .set({
            lastDeliveryAt: new Date(),
            lastDeliveryStatus: result.success ? 'success' : 'failed',
            lastDeliveryError: result.error || null,
          })
          .where(eq(schema.integrations.id, integration.id))
          .catch(err => console.error('Failed to update integration status:', err))
      }

      // Discord webhook integration (T8.9)
      if (integration.provider === 'discord') {
        const result = await sendDiscordNotification(
          integration.webhookUrl,
          {
            ...params.eventData,
            organizationId: params.organizationId,
            projectId: params.projectId,
            timestamp: new Date(),
          },
          integration.config as DiscordConfig
        )

        // Log delivery (async, don't block)
        db.insert(schema.integrationWebhooks).values({
          integrationId: integration.id,
          eventType: params.eventType,
          payload: params.eventData,
          statusCode: result.statusCode?.toString() || null,
          error: result.error || null,
          success: result.success,
          durationMs: result.durationMs?.toString() || null,
        }).catch(err => console.error('Failed to log Discord webhook:', err))

        // Update last delivery status
        db.update(schema.integrations)
          .set({
            lastDeliveryAt: new Date(),
            lastDeliveryStatus: result.success ? 'success' : 'failed',
            lastDeliveryError: result.error || null,
          })
          .where(eq(schema.integrations.id, integration.id))
          .catch(err => console.error('Failed to update Discord integration status:', err))
      }
    }
  } catch (error) {
    // Don't throw - integration notifications should not block operations
    console.error('Send integration notifications error:', error)
  }
}

// ============================================
// User-scoped Slack/Discord Integration Routes (T8.8)
// These endpoints use the user's default organization
// ============================================

// Helper to get user's default organization
async function getUserDefaultOrganization(userId: string) {
  const db = getDbClient()
  const [membership] = await db
    .select({
      organizationId: schema.organizationMembers.organizationId,
      role: schema.organizationMembers.role,
    })
    .from(schema.organizationMembers)
    .where(eq(schema.organizationMembers.userId, userId))
    .orderBy(schema.organizationMembers.createdAt)
    .limit(1)
  return membership
}

// GET /integrations - List all integrations for user's default organization
app.get('/integrations', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    // Get user's default organization
    const membership = await getUserDefaultOrganization(user.id)
    if (!membership) {
      return c.json({
        success: true,
        data: { integrations: [] },
      })
    }

    // Get integrations
    const integrations = await db
      .select()
      .from(schema.integrations)
      .where(eq(schema.integrations.organizationId, membership.organizationId))
      .orderBy(schema.integrations.createdAt)

    // Format integrations for frontend
    const formattedIntegrations = integrations.map((integration) => ({
      id: integration.id,
      type: integration.provider,
      status: integration.active ? 'connected' : 'disconnected',
      connectedAt: integration.createdAt?.toISOString() || null,
      enabledEvents: integration.enabledEvents || [],
      metadata: {
        workspace: (integration.config as Record<string, unknown>)?.['workspace'] || null,
        channel: (integration.config as Record<string, unknown>)?.['channel'] || null,
        server: (integration.config as Record<string, unknown>)?.['server'] || null,
        webhookConfigured: !!integration.webhookUrl,
      },
    }))

    return c.json({
      success: true,
      data: { integrations: formattedIntegrations },
    })
  } catch (error) {
    console.error('Get integrations error:', error)
    return c.json({ success: false, error: 'Failed to fetch integrations' }, 500)
  }
})

// POST /integrations/:type/webhook - Configure webhook for Slack/Discord
app.post('/integrations/:type/webhook', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const type = c.req.param('type') as 'slack' | 'discord'

    if (type !== 'slack' && type !== 'discord') {
      return c.json({ success: false, error: 'Invalid integration type' }, 400)
    }

    const body = await c.req.json()
    const { webhookUrl, channel } = body

    if (!webhookUrl) {
      return c.json({ success: false, error: 'Webhook URL is required' }, 400)
    }

    // Validate webhook URL format
    if (type === 'slack' && !webhookUrl.startsWith('https://hooks.slack.com/')) {
      return c.json({ success: false, error: 'Invalid Slack webhook URL' }, 400)
    }
    if (type === 'discord' && !webhookUrl.includes('discord.com/api/webhooks/')) {
      return c.json({ success: false, error: 'Invalid Discord webhook URL' }, 400)
    }

    const db = getDbClient()

    // Get user's default organization
    const membership = await getUserDefaultOrganization(user.id)
    if (!membership) {
      return c.json({ success: false, error: 'No organization found' }, 404)
    }

    // Check if integration already exists
    const [existing] = await db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.organizationId, membership.organizationId),
          eq(schema.integrations.provider, type)
        )
      )
      .limit(1)

    const config = type === 'slack'
      ? { channel: channel || null }
      : {}

    // Default enabled events
    const defaultEvents = [
      'task_status_changed',
      'task_assigned',
      'task_completed',
      'comment_created',
      'mention',
      'member_joined',
    ]

    let integration: typeof schema.integrations.$inferSelect | undefined
    if (existing) {
      // Update existing
      const [updated] = await db
        .update(schema.integrations)
        .set({
          webhookUrl,
          config,
          active: true,
          updatedAt: new Date(),
        })
        .where(eq(schema.integrations.id, existing.id))
        .returning()
      integration = updated
    } else {
      // Create new
      const [created] = await db
        .insert(schema.integrations)
        .values({
          organizationId: membership.organizationId,
          provider: type,
          name: type === 'slack' ? 'Slack' : 'Discord',
          webhookUrl,
          config,
          enabledEvents: defaultEvents,
          active: true,
          createdBy: user.id,
        })
        .returning()
      integration = created
    }

    if (!integration) {
      return c.json({ success: false, error: 'Failed to save integration' }, 500)
    }

    return c.json({
      success: true,
      data: {
        integration: {
          id: integration.id,
          type: integration.provider,
          status: 'connected',
          connectedAt: integration.createdAt?.toISOString() || null,
          enabledEvents: integration.enabledEvents || defaultEvents,
          metadata: {
            channel: (integration.config as Record<string, unknown>)?.['channel'] || null,
            webhookConfigured: true,
          },
        },
      },
    })
  } catch (error) {
    console.error('Configure webhook error:', error)
    return c.json({ success: false, error: 'Failed to configure webhook' }, 500)
  }
})

// DELETE /integrations/:type - Disconnect Slack/Discord integration
app.delete('/integrations/:type', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const type = c.req.param('type') as 'slack' | 'discord'

    if (type !== 'slack' && type !== 'discord') {
      return c.json({ success: false, error: 'Invalid integration type' }, 400)
    }

    const db = getDbClient()

    // Get user's default organization
    const membership = await getUserDefaultOrganization(user.id)
    if (!membership) {
      return c.json({ success: false, error: 'No organization found' }, 404)
    }

    // Delete integration
    await db
      .delete(schema.integrations)
      .where(
        and(
          eq(schema.integrations.organizationId, membership.organizationId),
          eq(schema.integrations.provider, type)
        )
      )

    return c.json({
      success: true,
      message: `${type.charAt(0).toUpperCase() + type.slice(1)} disconnected successfully`,
    })
  } catch (error) {
    console.error('Disconnect integration error:', error)
    return c.json({ success: false, error: 'Failed to disconnect integration' }, 500)
  }
})

// PATCH /integrations/:type/:id - Update integration (including notification preferences)
app.patch('/integrations/:type/:id', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const type = c.req.param('type') as 'slack' | 'discord'
    const integrationId = c.req.param('id')

    if (type !== 'slack' && type !== 'discord') {
      return c.json({ success: false, error: 'Invalid integration type' }, 400)
    }

    const body = await c.req.json()
    const { enabledEvents, active, name, webhookUrl, config } = body

    const db = getDbClient()

    // Get user's default organization
    const membership = await getUserDefaultOrganization(user.id)
    if (!membership) {
      return c.json({ success: false, error: 'No organization found' }, 404)
    }

    // Verify integration belongs to user's organization
    const [integration] = await db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.id, integrationId),
          eq(schema.integrations.organizationId, membership.organizationId)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'Integration not found' }, 404)
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (enabledEvents !== undefined) {
      updateData['enabledEvents'] = enabledEvents
    }
    if (active !== undefined) {
      updateData['active'] = active
    }
    if (name !== undefined) {
      updateData['name'] = name
    }
    if (webhookUrl !== undefined) {
      updateData['webhookUrl'] = webhookUrl
    }
    if (config !== undefined) {
      updateData['config'] = { ...integration.config as Record<string, unknown>, ...config }
    }

    // Update integration
    const [updated] = await db
      .update(schema.integrations)
      .set(updateData)
      .where(eq(schema.integrations.id, integrationId))
      .returning()

    if (!updated) {
      return c.json({ success: false, error: 'Failed to update integration' }, 500)
    }

    return c.json({
      success: true,
      data: {
        integration: {
          id: updated.id,
          type: updated.provider,
          status: updated.active ? 'connected' : 'disconnected',
          connectedAt: updated.createdAt?.toISOString() || null,
          enabledEvents: updated.enabledEvents || [],
          metadata: {
            channel: (updated.config as Record<string, unknown>)?.['channel'] || null,
            webhookConfigured: !!updated.webhookUrl,
          },
        },
      },
    })
  } catch (error) {
    console.error('Update integration error:', error)
    return c.json({ success: false, error: 'Failed to update integration' }, 500)
  }
})

// POST /integrations/:type/:id/test - Send test message
app.post('/integrations/:type/:id/test', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const type = c.req.param('type') as 'slack' | 'discord'
    const integrationId = c.req.param('id')

    if (type !== 'slack' && type !== 'discord') {
      return c.json({ success: false, error: 'Invalid integration type' }, 400)
    }

    const db = getDbClient()

    // Get user's default organization
    const membership = await getUserDefaultOrganization(user.id)
    if (!membership) {
      return c.json({ success: false, error: 'No organization found' }, 404)
    }

    // Get integration
    const [integration] = await db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.id, integrationId),
          eq(schema.integrations.organizationId, membership.organizationId)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'Integration not found' }, 404)
    }

    if (!integration.webhookUrl) {
      return c.json({ success: false, error: 'No webhook URL configured' }, 400)
    }

    // Send test message
    let result: { success: boolean; error?: string; statusCode?: number; durationMs?: number }

    if (type === 'slack') {
      result = await sendSlackTestMessage(
        integration.webhookUrl,
        integration.config as SlackConfig
      )
    } else {
      result = await sendDiscordTestMessage(
        integration.webhookUrl,
        integration.config as DiscordConfig
      )
    }

    // Log delivery
    await db.insert(schema.integrationWebhooks).values({
      integrationId: integration.id,
      eventType: 'test',
      payload: { test: true },
      statusCode: result.statusCode?.toString() || null,
      error: result.error || null,
      success: result.success,
      durationMs: result.durationMs?.toString() || null,
    })

    // Update last delivery status
    await db
      .update(schema.integrations)
      .set({
        lastDeliveryAt: new Date(),
        lastDeliveryStatus: result.success ? 'success' : 'failed',
        lastDeliveryError: result.error || null,
        updatedAt: new Date(),
      })
      .where(eq(schema.integrations.id, integrationId))

    if (result.success) {
      return c.json({
        success: true,
        message: 'Test message sent successfully',
      })
    } else {
      return c.json({
        success: false,
        error: result.error || 'Failed to send test message',
      }, 400)
    }
  } catch (error) {
    console.error('Test webhook error:', error)
    return c.json({ success: false, error: 'Failed to send test message' }, 500)
  }
})

// ============================================
// GitHub OAuth Routes (T8.2)
// ============================================

// Get GitHub OAuth configuration status
app.get('/integrations/github/config', jwtAuth, async (c) => {
  try {
    const config = getGitHubConfig()
    return c.json({
      success: true,
      data: {
        configured: config.configured,
        scopes: config.scopes,
      },
    })
  } catch (error) {
    console.error('Get GitHub config error:', error)
    return c.json({ success: false, error: 'Failed to get GitHub configuration' }, 500)
  }
})

// Get current GitHub integration status
app.get('/integrations/github', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    // Check if GitHub OAuth is configured
    if (!isGitHubConfigured()) {
      return c.json({
        success: true,
        data: {
          configured: false,
          connected: false,
          integration: null,
        },
      })
    }

    // Get current integration
    const [integration] = await db
      .select({
        id: schema.githubIntegrations.id,
        githubId: schema.githubIntegrations.githubId,
        githubUsername: schema.githubIntegrations.githubUsername,
        githubEmail: schema.githubIntegrations.githubEmail,
        githubAvatarUrl: schema.githubIntegrations.githubAvatarUrl,
        githubName: schema.githubIntegrations.githubName,
        grantedScopes: schema.githubIntegrations.grantedScopes,
        isConnected: schema.githubIntegrations.isConnected,
        lastSyncAt: schema.githubIntegrations.lastSyncAt,
        createdAt: schema.githubIntegrations.createdAt,
        updatedAt: schema.githubIntegrations.updatedAt,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    return c.json({
      success: true,
      data: {
        configured: true,
        connected: !!integration,
        integration: integration || null,
      },
    })
  } catch (error) {
    console.error('Get GitHub integration error:', error)
    return c.json({ success: false, error: 'Failed to get GitHub integration' }, 500)
  }
})

// Start GitHub OAuth flow - get authorization URL
app.post('/integrations/github/authorize', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    // Check if GitHub OAuth is configured
    if (!isGitHubConfigured()) {
      return c.json(
        {
          success: false,
          error: 'GitHub integration is not configured on the server',
        },
        400
      )
    }

    // Check if user already has an active connection
    const [existingIntegration] = await db
      .select({ id: schema.githubIntegrations.id })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (existingIntegration) {
      return c.json(
        {
          success: false,
          error: 'GitHub is already connected. Disconnect first to reconnect.',
        },
        400
      )
    }

    // Generate state token for CSRF protection
    const state = generateOAuthState()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    // Store state token
    await db.insert(schema.githubOAuthStates).values({
      userId: user.id,
      state,
      expiresAt,
    })

    // Build authorization URL
    const authorizationUrl = buildAuthorizationUrl(state)

    return c.json({
      success: true,
      data: {
        authorizationUrl,
        state,
        expiresIn: 600, // 10 minutes in seconds
      },
    })
  } catch (error) {
    console.error('GitHub authorize error:', error)
    return c.json({ success: false, error: 'Failed to initiate GitHub authorization' }, 500)
  }
})

// Handle GitHub OAuth callback
app.post('/integrations/github/callback', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    // Parse and validate request
    const body = await c.req.json()
    const validation = GitHubCallbackRequestSchema.safeParse(body)

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

    const { code, state } = validation.data

    // Verify state token
    const [storedState] = await db
      .select({
        id: schema.githubOAuthStates.id,
        userId: schema.githubOAuthStates.userId,
        expiresAt: schema.githubOAuthStates.expiresAt,
        usedAt: schema.githubOAuthStates.usedAt,
      })
      .from(schema.githubOAuthStates)
      .where(eq(schema.githubOAuthStates.state, state))
      .limit(1)

    if (!storedState) {
      return c.json(
        {
          success: false,
          error: 'Invalid or expired state token',
        },
        400
      )
    }

    // Check if state was already used
    if (storedState.usedAt) {
      return c.json(
        {
          success: false,
          error: 'State token has already been used',
        },
        400
      )
    }

    // Check if state belongs to this user
    if (storedState.userId !== user.id) {
      return c.json(
        {
          success: false,
          error: 'State token mismatch',
        },
        403
      )
    }

    // Check if state is expired
    if (new Date() > storedState.expiresAt) {
      return c.json(
        {
          success: false,
          error: 'State token has expired. Please try again.',
        },
        400
      )
    }

    // Mark state as used
    await db
      .update(schema.githubOAuthStates)
      .set({ usedAt: new Date() })
      .where(eq(schema.githubOAuthStates.id, storedState.id))

    // Exchange code for access token
    const tokenResult = await exchangeCodeForToken(code)

    if (!tokenResult) {
      return c.json(
        {
          success: false,
          error: 'Failed to exchange authorization code for token',
        },
        400
      )
    }

    // Fetch GitHub user info
    const githubUser = await fetchGitHubUser(tokenResult.accessToken)

    if (!githubUser) {
      return c.json(
        {
          success: false,
          error: 'Failed to fetch GitHub user information',
        },
        400
      )
    }

    // Get email if not provided
    let email = githubUser.email
    if (!email) {
      email = await fetchGitHubEmail(tokenResult.accessToken)
    }

    // Check if this GitHub account is already linked to another user
    const [existingLink] = await db
      .select({
        id: schema.githubIntegrations.id,
        userId: schema.githubIntegrations.userId,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.githubId, String(githubUser.id)),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (existingLink && existingLink.userId !== user.id) {
      return c.json(
        {
          success: false,
          error: 'This GitHub account is already linked to another user',
        },
        400
      )
    }

    // Disconnect any existing integration for this user
    await db
      .update(schema.githubIntegrations)
      .set({
        isConnected: false,
        disconnectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )

    // Parse granted scopes
    const grantedScopes = tokenResult.scope ? tokenResult.scope.split(/[,\s]+/) : []

    // Create new integration record
    const [newIntegration] = await db
      .insert(schema.githubIntegrations)
      .values({
        userId: user.id,
        githubId: String(githubUser.id),
        githubUsername: githubUser.login,
        githubEmail: email,
        githubAvatarUrl: githubUser.avatar_url,
        githubName: githubUser.name,
        accessToken: tokenResult.accessToken,
        grantedScopes,
        isConnected: true,
        lastSyncAt: new Date(),
      })
      .returning({
        id: schema.githubIntegrations.id,
        githubId: schema.githubIntegrations.githubId,
        githubUsername: schema.githubIntegrations.githubUsername,
        githubEmail: schema.githubIntegrations.githubEmail,
        githubAvatarUrl: schema.githubIntegrations.githubAvatarUrl,
        githubName: schema.githubIntegrations.githubName,
        grantedScopes: schema.githubIntegrations.grantedScopes,
        isConnected: schema.githubIntegrations.isConnected,
        lastSyncAt: schema.githubIntegrations.lastSyncAt,
        createdAt: schema.githubIntegrations.createdAt,
        updatedAt: schema.githubIntegrations.updatedAt,
      })

    return c.json({
      success: true,
      data: {
        integration: newIntegration,
        message: `Successfully connected to GitHub as @${githubUser.login}`,
      },
    })
  } catch (error) {
    console.error('GitHub callback error:', error)
    return c.json({ success: false, error: 'Failed to complete GitHub authorization' }, 500)
  }
})

// Disconnect GitHub integration
app.post('/integrations/github/disconnect', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    // Find and disconnect integration
    const [updated] = await db
      .update(schema.githubIntegrations)
      .set({
        isConnected: false,
        disconnectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .returning({ id: schema.githubIntegrations.id })

    if (!updated) {
      return c.json(
        {
          success: false,
          error: 'No active GitHub integration found',
        },
        404
      )
    }

    return c.json({
      success: true,
      data: {
        message: 'GitHub integration disconnected successfully',
      },
    })
  } catch (error) {
    console.error('GitHub disconnect error:', error)
    return c.json({ success: false, error: 'Failed to disconnect GitHub integration' }, 500)
  }
})

// Refresh GitHub user info
app.post('/integrations/github/refresh', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    // Get current integration
    const [integration] = await db
      .select({
        id: schema.githubIntegrations.id,
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json(
        {
          success: false,
          error: 'No active GitHub integration found',
        },
        404
      )
    }

    // Validate token is still valid
    const isValid = await validateAccessToken(integration.accessToken)

    if (!isValid) {
      // Token is invalid, mark as disconnected
      await db
        .update(schema.githubIntegrations)
        .set({
          isConnected: false,
          disconnectedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.githubIntegrations.id, integration.id))

      return c.json(
        {
          success: false,
          error: 'GitHub token is no longer valid. Please reconnect.',
        },
        401
      )
    }

    // Fetch fresh user info
    const githubUser = await fetchGitHubUser(integration.accessToken)

    if (!githubUser) {
      return c.json(
        {
          success: false,
          error: 'Failed to fetch GitHub user information',
        },
        500
      )
    }

    // Get email if not provided
    let email = githubUser.email
    if (!email) {
      email = await fetchGitHubEmail(integration.accessToken)
    }

    // Update integration with fresh data
    const [updated] = await db
      .update(schema.githubIntegrations)
      .set({
        githubUsername: githubUser.login,
        githubEmail: email,
        githubAvatarUrl: githubUser.avatar_url,
        githubName: githubUser.name,
        lastSyncAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.githubIntegrations.id, integration.id))
      .returning({
        id: schema.githubIntegrations.id,
        githubId: schema.githubIntegrations.githubId,
        githubUsername: schema.githubIntegrations.githubUsername,
        githubEmail: schema.githubIntegrations.githubEmail,
        githubAvatarUrl: schema.githubIntegrations.githubAvatarUrl,
        githubName: schema.githubIntegrations.githubName,
        grantedScopes: schema.githubIntegrations.grantedScopes,
        isConnected: schema.githubIntegrations.isConnected,
        lastSyncAt: schema.githubIntegrations.lastSyncAt,
        createdAt: schema.githubIntegrations.createdAt,
        updatedAt: schema.githubIntegrations.updatedAt,
      })

    return c.json({
      success: true,
      data: {
        integration: updated,
      },
    })
  } catch (error) {
    console.error('GitHub refresh error:', error)
    return c.json({ success: false, error: 'Failed to refresh GitHub information' }, 500)
  }
})

// List user's GitHub repositories
app.get('/integrations/github/repos', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    const page = Number(c.req.query('page')) || 1
    const perPage = Math.min(Number(c.req.query('per_page')) || 30, 100)

    // Get current integration
    const [integration] = await db
      .select({
        id: schema.githubIntegrations.id,
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json(
        {
          success: false,
          error: 'No active GitHub integration found',
        },
        404
      )
    }

    // Fetch repositories
    const repos = await fetchGitHubRepositories(integration.accessToken, page, perPage)

    return c.json({
      success: true,
      data: {
        repositories: repos.map((repo) => ({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          owner: repo.owner.login,
          ownerAvatar: repo.owner.avatar_url,
          description: repo.description,
          private: repo.private,
          htmlUrl: repo.html_url,
          defaultBranch: repo.default_branch,
        })),
        page,
        perPage,
      },
    })
  } catch (error) {
    console.error('GitHub repos error:', error)
    return c.json({ success: false, error: 'Failed to fetch GitHub repositories' }, 500)
  }
})

// ============================================
// GitHub Issues API (T8.3)
// ============================================

// List issues in a repository
app.get('/integrations/github/repos/:owner/:repo/issues', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const owner = c.req.param('owner')
    const repo = c.req.param('repo')
    const db = getDbClient()

    const state = (c.req.query('state') as 'open' | 'closed' | 'all') || 'open'
    const page = Number(c.req.query('page')) || 1
    const perPage = Math.min(Number(c.req.query('per_page')) || 30, 100)
    const search = c.req.query('search')

    // Get current integration
    const [integration] = await db
      .select({
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'No active GitHub integration found' }, 404)
    }

    let issues
    let totalCount = 0

    if (search && search.trim()) {
      // Use search API
      const result = await searchGitHubIssues(integration.accessToken, owner, repo, search.trim(), {
        state: state === 'all' ? undefined : state,
        page,
        perPage,
      })
      issues = result.items
      totalCount = result.totalCount
    } else {
      // List issues
      issues = await listGitHubIssues(integration.accessToken, owner, repo, {
        state,
        page,
        perPage,
      })
    }

    return c.json({
      success: true,
      data: {
        issues: issues.map((issue) => ({
          id: issue.id,
          number: issue.number,
          title: issue.title,
          state: issue.state,
          htmlUrl: issue.html_url,
          createdAt: issue.created_at,
          updatedAt: issue.updated_at,
          user: {
            login: issue.user.login,
            avatarUrl: issue.user.avatar_url,
          },
          labels: issue.labels.map((l) => ({
            name: l.name,
            color: l.color,
          })),
        })),
        page,
        perPage,
        totalCount,
      },
    })
  } catch (error) {
    console.error('GitHub issues list error:', error)
    return c.json({ success: false, error: 'Failed to fetch GitHub issues' }, 500)
  }
})

// Get a single GitHub issue
app.get('/integrations/github/repos/:owner/:repo/issues/:issueNumber', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const owner = c.req.param('owner')
    const repo = c.req.param('repo')
    const issueNumber = Number(c.req.param('issueNumber'))
    const db = getDbClient()

    if (isNaN(issueNumber) || issueNumber <= 0) {
      return c.json({ success: false, error: 'Invalid issue number' }, 400)
    }

    // Get current integration
    const [integration] = await db
      .select({
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'No active GitHub integration found' }, 404)
    }

    const issue = await fetchGitHubIssue(integration.accessToken, owner, repo, issueNumber)

    if (!issue) {
      return c.json({ success: false, error: 'Issue not found' }, 404)
    }

    return c.json({
      success: true,
      data: {
        issue: {
          id: issue.id,
          number: issue.number,
          title: issue.title,
          body: issue.body,
          state: issue.state,
          htmlUrl: issue.html_url,
          createdAt: issue.created_at,
          updatedAt: issue.updated_at,
          closedAt: issue.closed_at,
          user: {
            login: issue.user.login,
            avatarUrl: issue.user.avatar_url,
          },
          labels: issue.labels.map((l) => ({
            name: l.name,
            color: l.color,
          })),
          assignees: issue.assignees.map((a) => ({
            login: a.login,
            avatarUrl: a.avatar_url,
          })),
        },
      },
    })
  } catch (error) {
    console.error('GitHub issue fetch error:', error)
    return c.json({ success: false, error: 'Failed to fetch GitHub issue' }, 500)
  }
})

// ============================================
// Task GitHub Link Routes (T8.3)
// ============================================

// POST /projects/:id/tasks/:taskId/link-github - Link task to GitHub issue
app.post('/projects/:id/tasks/:taskId/link-github', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

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
    const { issueNumber, repository } = body

    if (!issueNumber || !repository) {
      return c.json({ success: false, error: 'issueNumber and repository are required' }, 400)
    }

    // Validate repository format
    const repoRegex = /^[^/]+\/[^/]+$/
    if (!repoRegex.test(repository)) {
      return c.json({ success: false, error: 'Repository must be in format "owner/repo"' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Find the task
    const [existingTask] = await db
      .select({ id: schema.tasks.id, name: schema.tasks.name })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!existingTask) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    // Get GitHub integration
    const [integration] = await db
      .select({
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'No active GitHub integration found. Please connect GitHub first.' }, 400)
    }

    // Fetch the issue from GitHub to verify it exists and get details
    const [owner = '', repo = ''] = repository.split('/')
    const issue = await fetchGitHubIssue(integration.accessToken, owner, repo, issueNumber)

    if (!issue) {
      return c.json({ success: false, error: `GitHub issue #${issueNumber} not found in ${repository}` }, 404)
    }

    // Update task with GitHub link
    const [updated] = await db
      .update(schema.tasks)
      .set({
        githubIssueNumber: issue.number,
        githubRepository: repository,
        githubIssueUrl: issue.html_url,
        githubIssueTitle: issue.title,
        githubIssueState: issue.state,
        githubLinkedBy: user.id,
        githubLinkedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, existingTask.id))
      .returning({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubIssueNumber: schema.tasks.githubIssueNumber,
        githubRepository: schema.tasks.githubRepository,
        githubIssueUrl: schema.tasks.githubIssueUrl,
        githubIssueTitle: schema.tasks.githubIssueTitle,
        githubIssueState: schema.tasks.githubIssueState,
        githubLinkedAt: schema.tasks.githubLinkedAt,
      })

    return c.json({
      success: true,
      data: {
        task: updated,
        githubIssue: {
          number: issue.number,
          title: issue.title,
          state: issue.state,
          htmlUrl: issue.html_url,
        },
      },
    })
  } catch (error) {
    console.error('Link task to GitHub error:', error)
    return c.json({ success: false, error: 'Failed to link task to GitHub issue' }, 500)
  }
})

// DELETE /projects/:id/tasks/:taskId/link-github - Unlink task from GitHub issue
app.delete('/projects/:id/tasks/:taskId/link-github', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Find the task
    const [existingTask] = await db
      .select({ id: schema.tasks.id, githubIssueNumber: schema.tasks.githubIssueNumber })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!existingTask) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    if (!existingTask.githubIssueNumber) {
      return c.json({ success: false, error: 'Task is not linked to a GitHub issue' }, 400)
    }

    // Remove GitHub link
    const [updated] = await db
      .update(schema.tasks)
      .set({
        githubIssueNumber: null,
        githubRepository: null,
        githubIssueUrl: null,
        githubIssueTitle: null,
        githubIssueState: null,
        githubLinkedBy: null,
        githubLinkedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, existingTask.id))
      .returning({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
      })

    return c.json({
      success: true,
      data: {
        task: updated,
        message: 'GitHub issue unlinked successfully',
      },
    })
  } catch (error) {
    console.error('Unlink task from GitHub error:', error)
    return c.json({ success: false, error: 'Failed to unlink task from GitHub issue' }, 500)
  }
})

// GET /projects/:id/tasks/:taskId/github-link - Get task's GitHub link status
app.get('/projects/:id/tasks/:taskId/github-link', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Get task with GitHub link info
    const [task] = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubIssueNumber: schema.tasks.githubIssueNumber,
        githubRepository: schema.tasks.githubRepository,
        githubIssueUrl: schema.tasks.githubIssueUrl,
        githubIssueTitle: schema.tasks.githubIssueTitle,
        githubIssueState: schema.tasks.githubIssueState,
        githubLinkedBy: schema.tasks.githubLinkedBy,
        githubLinkedAt: schema.tasks.githubLinkedAt,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!task) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    const isLinked = !!task.githubIssueNumber

    return c.json({
      success: true,
      data: {
        linked: isLinked,
        task: {
          id: task.id,
          taskId: task.taskId,
          name: task.name,
        },
        githubLink: isLinked
          ? {
              issueNumber: task.githubIssueNumber,
              repository: task.githubRepository,
              issueUrl: task.githubIssueUrl,
              issueTitle: task.githubIssueTitle,
              issueState: task.githubIssueState,
              linkedAt: task.githubLinkedAt,
            }
          : null,
      },
    })
  } catch (error) {
    console.error('Get task GitHub link error:', error)
    return c.json({ success: false, error: 'Failed to get task GitHub link' }, 500)
  }
})

// POST /projects/:id/tasks/:taskId/create-github-issue - Create GitHub issue from task
app.post('/projects/:id/tasks/:taskId/create-github-issue', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    const body = await c.req.json()
    const { repository, labels, assignees } = body

    if (!repository) {
      return c.json({ success: false, error: 'repository is required' }, 400)
    }

    // Validate repository format
    const repoRegex = /^[^/]+\/[^/]+$/
    if (!repoRegex.test(repository)) {
      return c.json({ success: false, error: 'Repository must be in format "owner/repo"' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Get the task
    const [task] = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        description: schema.tasks.description,
        complexity: schema.tasks.complexity,
        githubIssueNumber: schema.tasks.githubIssueNumber,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!task) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    if (task.githubIssueNumber) {
      return c.json({ success: false, error: 'Task is already linked to a GitHub issue' }, 400)
    }

    // Get GitHub integration
    const [integration] = await db
      .select({
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'No active GitHub integration found. Please connect GitHub first.' }, 400)
    }

    // Create issue body
    const issueBody = `## ${task.taskId}: ${task.name}

${task.description || '_No description provided_'}

---

**Complexity:** ${task.complexity || 'Not specified'}
**Project:** ${project.name}

_This issue was created from [PlanFlow](https://planflow.tools)_`

    // Create the GitHub issue
    const [owner = '', repo = ''] = repository.split('/')
    const issue = await createGitHubIssue(integration.accessToken, owner, repo, {
      title: `[${task.taskId}] ${task.name}`,
      body: issueBody,
      labels,
      assignees,
    })

    if (!issue) {
      return c.json({ success: false, error: 'Failed to create GitHub issue' }, 500)
    }

    // Update task with GitHub link
    const [updated] = await db
      .update(schema.tasks)
      .set({
        githubIssueNumber: issue.number,
        githubRepository: repository,
        githubIssueUrl: issue.html_url,
        githubIssueTitle: issue.title,
        githubIssueState: issue.state,
        githubLinkedBy: user.id,
        githubLinkedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, task.id))
      .returning({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubIssueNumber: schema.tasks.githubIssueNumber,
        githubRepository: schema.tasks.githubRepository,
        githubIssueUrl: schema.tasks.githubIssueUrl,
        githubIssueTitle: schema.tasks.githubIssueTitle,
        githubIssueState: schema.tasks.githubIssueState,
        githubLinkedAt: schema.tasks.githubLinkedAt,
      })

    return c.json({
      success: true,
      data: {
        task: updated,
        githubIssue: {
          number: issue.number,
          title: issue.title,
          state: issue.state,
          htmlUrl: issue.html_url,
        },
      },
    })
  } catch (error) {
    console.error('Create GitHub issue from task error:', error)
    return c.json({ success: false, error: 'Failed to create GitHub issue' }, 500)
  }
})

// POST /projects/:id/tasks/:taskId/sync-github-issue - Sync task GitHub issue state
app.post('/projects/:id/tasks/:taskId/sync-github-issue', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Get task with GitHub link
    const [task] = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubIssueNumber: schema.tasks.githubIssueNumber,
        githubRepository: schema.tasks.githubRepository,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!task) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    if (!task.githubIssueNumber || !task.githubRepository) {
      return c.json({ success: false, error: 'Task is not linked to a GitHub issue' }, 400)
    }

    // Get GitHub integration
    const [integration] = await db
      .select({
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'No active GitHub integration found' }, 400)
    }

    // Fetch latest issue state
    const [owner = '', repo = ''] = task.githubRepository.split('/')
    const issue = await fetchGitHubIssue(integration.accessToken, owner, repo, task.githubIssueNumber)

    if (!issue) {
      return c.json({ success: false, error: 'GitHub issue not found - it may have been deleted' }, 404)
    }

    // Update task with latest issue info
    const [updated] = await db
      .update(schema.tasks)
      .set({
        githubIssueTitle: issue.title,
        githubIssueState: issue.state,
        githubIssueUrl: issue.html_url,
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, task.id))
      .returning({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubIssueNumber: schema.tasks.githubIssueNumber,
        githubRepository: schema.tasks.githubRepository,
        githubIssueUrl: schema.tasks.githubIssueUrl,
        githubIssueTitle: schema.tasks.githubIssueTitle,
        githubIssueState: schema.tasks.githubIssueState,
      })

    return c.json({
      success: true,
      data: {
        task: updated,
        synced: true,
      },
    })
  } catch (error) {
    console.error('Sync task GitHub issue error:', error)
    return c.json({ success: false, error: 'Failed to sync GitHub issue' }, 500)
  }
})

// ============================================
// GitHub Pull Request Link API (T8.4)
// ============================================

// POST /projects/:id/tasks/:taskId/link-github-pr - Link task to GitHub PR
app.post('/projects/:id/tasks/:taskId/link-github-pr', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    const body = await c.req.json()
    const { prNumber, repository } = body

    if (!prNumber || typeof prNumber !== 'number') {
      return c.json({ success: false, error: 'prNumber is required and must be a number' }, 400)
    }

    if (!repository) {
      return c.json({ success: false, error: 'repository is required' }, 400)
    }

    // Validate repository format
    const repoRegex = /^[^/]+\/[^/]+$/
    if (!repoRegex.test(repository)) {
      return c.json({ success: false, error: 'Repository must be in format "owner/repo"' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Find the task
    const [existingTask] = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubPrNumber: schema.tasks.githubPrNumber,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!existingTask) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    if (existingTask.githubPrNumber) {
      return c.json({
        success: false,
        error: `Task is already linked to PR #${existingTask.githubPrNumber}. Unlink first to link a different PR.`,
      }, 400)
    }

    // Get GitHub integration
    const [integration] = await db
      .select({
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'No active GitHub integration found. Please connect GitHub first.' }, 400)
    }

    // Fetch the PR from GitHub to verify it exists and get details
    const [owner = '', repo = ''] = repository.split('/')
    const pr = await fetchGitHubPullRequest(integration.accessToken, owner, repo, prNumber)

    if (!pr) {
      return c.json({ success: false, error: `Pull request #${prNumber} not found in ${repository}` }, 404)
    }

    // Determine PR state
    const prState = getPrState(pr)

    // Update task with PR link
    const [updated] = await db
      .update(schema.tasks)
      .set({
        githubPrNumber: pr.number,
        githubPrRepository: repository,
        githubPrUrl: pr.html_url,
        githubPrTitle: pr.title,
        githubPrState: prState,
        githubPrBranch: pr.head.ref,
        githubPrBaseBranch: pr.base.ref,
        githubPrLinkedBy: user.id,
        githubPrLinkedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, existingTask.id))
      .returning({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubPrNumber: schema.tasks.githubPrNumber,
        githubPrRepository: schema.tasks.githubPrRepository,
        githubPrUrl: schema.tasks.githubPrUrl,
        githubPrTitle: schema.tasks.githubPrTitle,
        githubPrState: schema.tasks.githubPrState,
        githubPrBranch: schema.tasks.githubPrBranch,
        githubPrBaseBranch: schema.tasks.githubPrBaseBranch,
        githubPrLinkedAt: schema.tasks.githubPrLinkedAt,
      })

    return c.json({
      success: true,
      data: {
        task: updated,
        githubPr: {
          number: pr.number,
          title: pr.title,
          state: prState,
          htmlUrl: pr.html_url,
          headBranch: pr.head.ref,
          baseBranch: pr.base.ref,
          draft: pr.draft,
        },
      },
    })
  } catch (error) {
    console.error('Link task to GitHub PR error:', error)
    return c.json({ success: false, error: 'Failed to link task to GitHub PR' }, 500)
  }
})

// DELETE /projects/:id/tasks/:taskId/link-github-pr - Unlink task from GitHub PR
app.delete('/projects/:id/tasks/:taskId/link-github-pr', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Find the task
    const [existingTask] = await db
      .select({ id: schema.tasks.id, githubPrNumber: schema.tasks.githubPrNumber })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!existingTask) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    if (!existingTask.githubPrNumber) {
      return c.json({ success: false, error: 'Task is not linked to a GitHub PR' }, 400)
    }

    // Remove GitHub PR link
    const [updated] = await db
      .update(schema.tasks)
      .set({
        githubPrNumber: null,
        githubPrRepository: null,
        githubPrUrl: null,
        githubPrTitle: null,
        githubPrState: null,
        githubPrBranch: null,
        githubPrBaseBranch: null,
        githubPrLinkedBy: null,
        githubPrLinkedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, existingTask.id))
      .returning({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
      })

    return c.json({
      success: true,
      data: {
        task: updated,
        message: 'GitHub PR unlinked successfully',
      },
    })
  } catch (error) {
    console.error('Unlink task from GitHub PR error:', error)
    return c.json({ success: false, error: 'Failed to unlink task from GitHub PR' }, 500)
  }
})

// GET /projects/:id/tasks/:taskId/github-pr - Get task's GitHub PR link status
app.get('/projects/:id/tasks/:taskId/github-pr', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Get task with GitHub PR link info
    const [task] = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubPrNumber: schema.tasks.githubPrNumber,
        githubPrRepository: schema.tasks.githubPrRepository,
        githubPrUrl: schema.tasks.githubPrUrl,
        githubPrTitle: schema.tasks.githubPrTitle,
        githubPrState: schema.tasks.githubPrState,
        githubPrBranch: schema.tasks.githubPrBranch,
        githubPrBaseBranch: schema.tasks.githubPrBaseBranch,
        githubPrLinkedBy: schema.tasks.githubPrLinkedBy,
        githubPrLinkedAt: schema.tasks.githubPrLinkedAt,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!task) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    const isLinked = !!task.githubPrNumber

    return c.json({
      success: true,
      data: {
        linked: isLinked,
        task: {
          id: task.id,
          taskId: task.taskId,
          name: task.name,
        },
        githubPr: isLinked
          ? {
              prNumber: task.githubPrNumber,
              repository: task.githubPrRepository,
              prUrl: task.githubPrUrl,
              prTitle: task.githubPrTitle,
              prState: task.githubPrState,
              headBranch: task.githubPrBranch,
              baseBranch: task.githubPrBaseBranch,
              linkedAt: task.githubPrLinkedAt,
            }
          : null,
      },
    })
  } catch (error) {
    console.error('Get task GitHub PR error:', error)
    return c.json({ success: false, error: 'Failed to get task GitHub PR' }, 500)
  }
})

// POST /projects/:id/tasks/:taskId/sync-github-pr - Sync task GitHub PR state
app.post('/projects/:id/tasks/:taskId/sync-github-pr', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Get task with GitHub PR link
    const [task] = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubPrNumber: schema.tasks.githubPrNumber,
        githubPrRepository: schema.tasks.githubPrRepository,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!task) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    if (!task.githubPrNumber || !task.githubPrRepository) {
      return c.json({ success: false, error: 'Task is not linked to a GitHub PR' }, 400)
    }

    // Get GitHub integration
    const [integration] = await db
      .select({
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'No active GitHub integration found' }, 400)
    }

    // Fetch latest PR state
    const [owner = '', repo = ''] = task.githubPrRepository.split('/')
    const pr = await fetchGitHubPullRequest(integration.accessToken, owner, repo, task.githubPrNumber)

    if (!pr) {
      return c.json({ success: false, error: 'GitHub PR not found - it may have been deleted' }, 404)
    }

    // Determine PR state
    const prState = getPrState(pr)

    // Update task with latest PR info
    const [updated] = await db
      .update(schema.tasks)
      .set({
        githubPrTitle: pr.title,
        githubPrState: prState,
        githubPrUrl: pr.html_url,
        githubPrBranch: pr.head.ref,
        githubPrBaseBranch: pr.base.ref,
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, task.id))
      .returning({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubPrNumber: schema.tasks.githubPrNumber,
        githubPrRepository: schema.tasks.githubPrRepository,
        githubPrUrl: schema.tasks.githubPrUrl,
        githubPrTitle: schema.tasks.githubPrTitle,
        githubPrState: schema.tasks.githubPrState,
        githubPrBranch: schema.tasks.githubPrBranch,
        githubPrBaseBranch: schema.tasks.githubPrBaseBranch,
      })

    return c.json({
      success: true,
      data: {
        task: updated,
        synced: true,
        prState,
      },
    })
  } catch (error) {
    console.error('Sync task GitHub PR error:', error)
    return c.json({ success: false, error: 'Failed to sync GitHub PR' }, 500)
  }
})

// POST /projects/:id/tasks/:taskId/create-github-pr - Create GitHub PR from task (T8.10)
app.post('/projects/:id/tasks/:taskId/create-github-pr', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    const body = await c.req.json()
    const { repository, title, body: prBody, head, base, draft } = body

    // Validate required fields
    if (!repository) {
      return c.json({ success: false, error: 'repository is required' }, 400)
    }
    if (!title) {
      return c.json({ success: false, error: 'title is required' }, 400)
    }
    if (!head) {
      return c.json({ success: false, error: 'head branch is required' }, 400)
    }
    if (!base) {
      return c.json({ success: false, error: 'base branch is required' }, 400)
    }

    // Validate repository format
    const repoRegex = /^[^/]+\/[^/]+$/
    if (!repoRegex.test(repository)) {
      return c.json({ success: false, error: 'Repository must be in format "owner/repo"' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Get task
    const [task] = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        description: schema.tasks.description,
        githubPrNumber: schema.tasks.githubPrNumber,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!task) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    // Check if task already has a PR linked
    if (task.githubPrNumber) {
      return c.json({ success: false, error: 'Task already has a PR linked. Unlink it first to create a new PR.' }, 400)
    }

    // Get GitHub integration
    const [integration] = await db
      .select({
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'No active GitHub integration found. Connect GitHub first.' }, 400)
    }

    // Create the PR on GitHub
    const [owner = '', repo = ''] = repository.split('/')
    const createdPr = await createGitHubPullRequest(integration.accessToken, owner, repo, {
      title,
      body: prBody || `This PR implements ${task.taskId}: ${task.name}\n\n${task.description || ''}`.trim(),
      head,
      base,
      draft: draft || false,
    })

    if (!createdPr) {
      return c.json({
        success: false,
        error: 'Failed to create PR on GitHub. Make sure the branch exists and there are commits to merge.'
      }, 400)
    }

    // Determine PR state
    const prState = getPrState(createdPr)

    // Update task with the PR link
    const [updated] = await db
      .update(schema.tasks)
      .set({
        githubPrNumber: createdPr.number,
        githubPrRepository: repository,
        githubPrUrl: createdPr.html_url,
        githubPrTitle: createdPr.title,
        githubPrState: prState,
        githubPrBranch: createdPr.head.ref,
        githubPrBaseBranch: createdPr.base.ref,
        githubPrLinkedBy: user.id,
        githubPrLinkedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, task.id))
      .returning({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubPrNumber: schema.tasks.githubPrNumber,
        githubPrRepository: schema.tasks.githubPrRepository,
        githubPrUrl: schema.tasks.githubPrUrl,
        githubPrTitle: schema.tasks.githubPrTitle,
        githubPrState: schema.tasks.githubPrState,
        githubPrBranch: schema.tasks.githubPrBranch,
        githubPrBaseBranch: schema.tasks.githubPrBaseBranch,
        githubPrLinkedAt: schema.tasks.githubPrLinkedAt,
      })

    return c.json({
      success: true,
      data: {
        task: updated,
        githubPr: {
          number: createdPr.number,
          title: createdPr.title,
          state: prState,
          htmlUrl: createdPr.html_url,
          headBranch: createdPr.head.ref,
          baseBranch: createdPr.base.ref,
          draft: createdPr.draft,
        },
      },
    })
  } catch (error) {
    console.error('Create GitHub PR from task error:', error)
    return c.json({ success: false, error: 'Failed to create GitHub PR' }, 500)
  }
})

// GET /integrations/github/repos/:owner/:repo/pulls - List PRs in a repository
app.get('/integrations/github/repos/:owner/:repo/pulls', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const owner = c.req.param('owner')
    const repo = c.req.param('repo')
    const db = getDbClient()

    // Get query params
    const state = c.req.query('state') as 'open' | 'closed' | 'all' | undefined
    const page = parseInt(c.req.query('page') || '1', 10)
    const perPage = parseInt(c.req.query('per_page') || '30', 10)
    const search = c.req.query('search')

    // Get GitHub integration
    const [integration] = await db
      .select({
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'No active GitHub integration found' }, 400)
    }

    let prs: GitHubPullRequest[]
    let totalCount: number | undefined

    if (search) {
      // Use search API
      const result = await searchGitHubPullRequests(integration.accessToken, owner, repo, search, {
        state: state === 'all' ? undefined : (state as 'open' | 'closed' | undefined),
        page,
        perPage,
      })
      prs = result.items
      totalCount = result.totalCount
    } else {
      // Use list API
      prs = await listGitHubPullRequests(integration.accessToken, owner, repo, {
        state: state || 'open',
        page,
        perPage,
      })
    }

    // Transform to frontend format
    const formattedPrs = prs.map((pr) => ({
      id: pr.id,
      number: pr.number,
      title: pr.title,
      state: pr.mergedState || getPrState(pr),
      htmlUrl: pr.html_url,
      draft: pr.draft,
      headBranch: pr.head.ref,
      baseBranch: pr.base.ref,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      mergedAt: pr.merged_at,
      user: {
        login: pr.user.login,
        avatarUrl: pr.user.avatar_url,
      },
      labels: pr.labels.map((l) => ({
        name: l.name,
        color: l.color,
      })),
    }))

    return c.json({
      success: true,
      data: {
        pullRequests: formattedPrs,
        page,
        perPage,
        totalCount,
      },
    })
  } catch (error) {
    console.error('List GitHub PRs error:', error)
    return c.json({ success: false, error: 'Failed to fetch GitHub pull requests' }, 500)
  }
})

// GET /integrations/github/repos/:owner/:repo/pulls/:prNumber - Get a specific PR
app.get('/integrations/github/repos/:owner/:repo/pulls/:prNumber', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const owner = c.req.param('owner')
    const repo = c.req.param('repo')
    const prNumber = parseInt(c.req.param('prNumber'), 10)
    const db = getDbClient()

    if (isNaN(prNumber) || prNumber <= 0) {
      return c.json({ success: false, error: 'Invalid PR number' }, 400)
    }

    // Get GitHub integration
    const [integration] = await db
      .select({
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'No active GitHub integration found' }, 400)
    }

    const pr = await fetchGitHubPullRequest(integration.accessToken, owner, repo, prNumber)

    if (!pr) {
      return c.json({ success: false, error: `Pull request #${prNumber} not found` }, 404)
    }

    const prState = getPrState(pr)

    return c.json({
      success: true,
      data: {
        pullRequest: {
          id: pr.id,
          number: pr.number,
          title: pr.title,
          body: pr.body,
          state: prState,
          htmlUrl: pr.html_url,
          draft: pr.draft,
          headBranch: pr.head.ref,
          baseBranch: pr.base.ref,
          createdAt: pr.created_at,
          updatedAt: pr.updated_at,
          closedAt: pr.closed_at,
          mergedAt: pr.merged_at,
          user: {
            login: pr.user.login,
            avatarUrl: pr.user.avatar_url,
          },
          labels: pr.labels.map((l) => ({
            name: l.name,
            color: l.color,
          })),
          assignees: pr.assignees.map((a) => ({
            login: a.login,
            avatarUrl: a.avatar_url,
          })),
          requestedReviewers: pr.requested_reviewers.map((r) => ({
            login: r.login,
            avatarUrl: r.avatar_url,
          })),
        },
      },
    })
  } catch (error) {
    console.error('Get GitHub PR error:', error)
    return c.json({ success: false, error: 'Failed to fetch GitHub pull request' }, 500)
  }
})

// ============================================
// Branch Name Generation API (T8.6)
// ============================================

// GET /projects/:id/tasks/:taskId/branch-name - Generate branch name for a task
app.get('/projects/:id/tasks/:taskId/branch-name', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Get optional prefix from query params
    const prefixParam = c.req.query('prefix') as BranchPrefix | undefined
    const autoDetect = c.req.query('auto') !== 'false' // Default to auto-detect

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Get the task
    const [task] = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!task) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    // Generate branch name
    let branchName: string
    let detectedPrefix: BranchPrefix

    if (prefixParam) {
      // Use provided prefix
      branchName = generateBranchName(task.taskId, task.name, { prefix: prefixParam })
      detectedPrefix = prefixParam
    } else if (autoDetect) {
      // Auto-detect prefix based on task name
      const result = generateBranchNameAuto(task.taskId, task.name)
      branchName = result.branchName
      detectedPrefix = result.detectedPrefix
    } else {
      // Default to 'feature' prefix
      branchName = generateBranchName(task.taskId, task.name, { prefix: 'feature' })
      detectedPrefix = 'feature'
    }

    // Generate all prefix variants for the UI
    const variants: Record<BranchPrefix, string> = {
      feature: generateBranchName(task.taskId, task.name, { prefix: 'feature' }),
      fix: generateBranchName(task.taskId, task.name, { prefix: 'fix' }),
      hotfix: generateBranchName(task.taskId, task.name, { prefix: 'hotfix' }),
      chore: generateBranchName(task.taskId, task.name, { prefix: 'chore' }),
      docs: generateBranchName(task.taskId, task.name, { prefix: 'docs' }),
      refactor: generateBranchName(task.taskId, task.name, { prefix: 'refactor' }),
      test: generateBranchName(task.taskId, task.name, { prefix: 'test' }),
    }

    // Generate git command for convenience
    const gitCommand = `git checkout -b ${branchName}`

    return c.json({
      success: true,
      data: {
        task: {
          id: task.id,
          taskId: task.taskId,
          name: task.name,
        },
        branchName,
        detectedPrefix,
        variants,
        gitCommand,
      },
    })
  } catch (error) {
    console.error('Generate branch name error:', error)
    return c.json({ success: false, error: 'Failed to generate branch name' }, 500)
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

// Start email digest scheduler
startDigestScheduler()

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`)

  // Stop digest scheduler
  stopDigestScheduler()

  // Flush Sentry events before shutdown
  await flushSentry(2000)

  // Close server
  server.close(() => {
    console.log('HTTP server closed')
    process.exit(0)
  })

  // Force shutdown after timeout
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

export default app
