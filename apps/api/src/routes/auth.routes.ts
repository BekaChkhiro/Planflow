import { Hono } from 'hono'
import { and, desc, eq, gt } from 'drizzle-orm'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import {
  LoginRequestSchema,
  RegisterRequestSchema,
  RefreshTokenRequestSchema,
} from '@planflow/shared'
import { getDbClient, schema } from '../db/index.js'
import {
  jwtAuth,
  getAuth,
  authRateLimit,
  smallBodyLimit,
} from '../middleware/index.js'
import { generateRefreshToken, hashToken, getProjectLimits, getUserSubscription } from '../utils/helpers.js'
import { sendWelcomeEmail, isEmailServiceConfigured } from '../lib/email.js'

const authRoutes = new Hono()

// Register endpoint (with rate limiting)
authRoutes.post('/register', authRateLimit, smallBodyLimit, async (c) => {
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

    if (!newUser) {
      return c.json({ success: false, error: 'Failed to create user' }, 500)
    }

    // Send welcome email (non-blocking)
    if (isEmailServiceConfigured()) {
      sendWelcomeEmail(newUser.email, newUser.name || 'there').catch((err) => {
        console.error('Failed to send welcome email:', err)
      })
    }

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
authRoutes.post('/login', authRateLimit, smallBodyLimit, async (c) => {
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
authRoutes.post('/refresh', authRateLimit, smallBodyLimit, async (c) => {
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
authRoutes.post('/logout', async (c) => {
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

// Logout from all devices - revokes ALL refresh tokens for the authenticated user
authRoutes.post('/logout-all', jwtAuth, async (c) => {
  try {
    const authContext = getAuth(c)
    const db = getDbClient()

    // Get the current refresh token hash from request (to identify current session)
    let _currentTokenHash: string | null = null
    try {
      const body = await c.req.json()
      if (body.refreshToken) {
        _currentTokenHash = hashToken(body.refreshToken)
      }
    } catch {
      // No body or invalid JSON - that's fine, we'll revoke all tokens
    }

    // Revoke all non-revoked refresh tokens for this user
    const result = await db
      .update(schema.refreshTokens)
      .set({ isRevoked: true })
      .where(
        and(
          eq(schema.refreshTokens.userId, authContext.user.id),
          eq(schema.refreshTokens.isRevoked, false)
        )
      )
      .returning({ id: schema.refreshTokens.id })

    const revokedCount = result.length

    return c.json({
      success: true,
      data: {
        revokedCount,
        message: revokedCount > 0
          ? `Successfully logged out from ${revokedCount} device(s)`
          : 'No active sessions to revoke',
      },
    })
  } catch (error) {
    console.error('Logout all error:', error)
    return c.json(
      {
        success: false,
        error: 'An unexpected error occurred',
      },
      500
    )
  }
})

// Get active sessions - lists all non-revoked, non-expired refresh tokens
authRoutes.get('/sessions', jwtAuth, async (c) => {
  try {
    const authContext = getAuth(c)
    const db = getDbClient()

    // Get the current refresh token from query param (optional, to mark current session)
    const currentRefreshToken = c.req.query('current')
    const currentTokenHash = currentRefreshToken ? hashToken(currentRefreshToken) : null

    // Get all active (non-revoked, non-expired) refresh tokens for this user
    const now = new Date()
    const sessions = await db
      .select({
        id: schema.refreshTokens.id,
        tokenHash: schema.refreshTokens.tokenHash,
        createdAt: schema.refreshTokens.createdAt,
        expiresAt: schema.refreshTokens.expiresAt,
      })
      .from(schema.refreshTokens)
      .where(
        and(
          eq(schema.refreshTokens.userId, authContext.user.id),
          eq(schema.refreshTokens.isRevoked, false),
          gt(schema.refreshTokens.expiresAt, now)
        )
      )
      .orderBy(desc(schema.refreshTokens.createdAt))

    // Map to response format, marking current session
    const sessionList = sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      isCurrent: currentTokenHash ? session.tokenHash === currentTokenHash : false,
    }))

    return c.json({
      success: true,
      data: {
        sessions: sessionList,
        total: sessionList.length,
      },
    })
  } catch (error) {
    console.error('Get sessions error:', error)
    return c.json(
      {
        success: false,
        error: 'An unexpected error occurred',
      },
      500
    )
  }
})

// Revoke a specific session by ID
authRoutes.delete('/sessions/:sessionId', jwtAuth, async (c) => {
  try {
    const authContext = getAuth(c)
    const sessionId = c.req.param('sessionId')
    const db = getDbClient()

    // Revoke the specific session (only if it belongs to this user)
    const result = await db
      .update(schema.refreshTokens)
      .set({ isRevoked: true })
      .where(
        and(
          eq(schema.refreshTokens.id, sessionId),
          eq(schema.refreshTokens.userId, authContext.user.id),
          eq(schema.refreshTokens.isRevoked, false)
        )
      )
      .returning({ id: schema.refreshTokens.id })

    if (result.length === 0) {
      return c.json(
        {
          success: false,
          error: 'Session not found or already revoked',
        },
        404
      )
    }

    return c.json({
      success: true,
      data: {
        message: 'Session revoked successfully',
      },
    })
  } catch (error) {
    console.error('Revoke session error:', error)
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
authRoutes.get('/me', async (c) => {
  // Note: This route uses dynamic auth - handled in main app mounting
  try {
    const authContext = getAuth(c)
    const db = getDbClient()

    // Get full user details
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

    // Get subscription info
    const subscription = await getUserSubscription(user.id)

    // Get project limits
    const limits = await getProjectLimits(user.id)

    return c.json({
      success: true,
      data: {
        user,
        subscription: {
          tier: subscription.tier,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd,
        },
        limits,
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

export { authRoutes }
