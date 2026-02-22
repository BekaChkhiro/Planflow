/**
 * Authentication Service
 * Handles user registration, login, token management, and session operations
 */

import { and, desc, eq, gt } from 'drizzle-orm'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { getDbClient, schema } from '../db/index.js'
import { generateRefreshToken, hashToken, getUserSubscription, getProjectLimits } from '../utils/helpers.js'
import { sendWelcomeEmail, isEmailServiceConfigured } from '../lib/email.js'
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ServiceError,
} from './errors.js'

// Constants
const SALT_ROUNDS = 12
const DEFAULT_JWT_EXPIRATION = 900 // 15 minutes
const DEFAULT_REFRESH_EXPIRATION = 2592000 // 30 days

// Types
export interface RegisterUserInput {
  email: string
  password: string
  name?: string
}

export interface LoginResult {
  user: {
    id: string
    email: string
    name: string | null
    createdAt: Date
    updatedAt: Date
  }
  token: string
  refreshToken: string
  expiresIn: number
  refreshExpiresIn: number
}

export interface RefreshTokenResult {
  token: string
  expiresIn: number
}

export interface UserWithSubscription {
  user: {
    id: string
    email: string
    name: string | null
    createdAt: Date
    updatedAt: Date
  }
  subscription: {
    tier: string
    status: string
    currentPeriodEnd: Date | null
  }
  limits: {
    currentCount: number
    maxProjects: number
    canCreate: boolean
    tier: string
    status: string
  }
}

export interface Session {
  id: string
  createdAt: Date
  expiresAt: Date
  isCurrent: boolean
}

/**
 * AuthService - Handles all authentication-related business logic
 */
export class AuthService {
  private db = getDbClient()

  /**
   * Register a new user
   */
  async registerUser(input: RegisterUserInput): Promise<{
    id: string
    email: string
    name: string | null
    createdAt: Date
    updatedAt: Date
  }> {
    const { email, password, name } = input
    const normalizedEmail = email.toLowerCase()

    // Check if user already exists
    const [existingUser] = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, normalizedEmail))
      .limit(1)

    if (existingUser) {
      throw new ConflictError('A user with this email already exists')
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

    // Insert user
    const [newUser] = await this.db
      .insert(schema.users)
      .values({
        email: normalizedEmail,
        name: name ?? null,
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
      throw new ServiceError('Failed to create user', 'USER_CREATION_FAILED', 500)
    }

    // Send welcome email (non-blocking)
    if (isEmailServiceConfigured()) {
      sendWelcomeEmail(newUser.email, newUser.name || 'there').catch((err) => {
        console.error('Failed to send welcome email:', err)
      })
    }

    return newUser
  }

  /**
   * Authenticate user and generate tokens
   */
  async login(email: string, password: string): Promise<LoginResult> {
    const normalizedEmail = email.toLowerCase()

    // Find user by email
    const [user] = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        passwordHash: schema.users.passwordHash,
        createdAt: schema.users.createdAt,
        updatedAt: schema.users.updatedAt,
      })
      .from(schema.users)
      .where(eq(schema.users.email, normalizedEmail))
      .limit(1)

    if (!user) {
      throw new AuthenticationError('Invalid email or password')
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash)
    if (!isValidPassword) {
      throw new AuthenticationError('Invalid email or password')
    }

    // Generate tokens
    const { token, expiresIn } = this.generateAccessToken(user.id, user.email)
    const { refreshToken, refreshExpiresIn, refreshExpiresAt } = this.generateRefreshTokenData()

    // Store refresh token
    const refreshTokenHash = hashToken(refreshToken)
    await this.db.insert(schema.refreshTokens).values({
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt: refreshExpiresAt,
    })

    return {
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
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<RefreshTokenResult> {
    const tokenHash = hashToken(refreshToken)

    // Find refresh token
    const [storedToken] = await this.db
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
      throw new AuthenticationError('Invalid refresh token')
    }

    if (storedToken.isRevoked) {
      throw new AuthenticationError('Refresh token has been revoked')
    }

    if (new Date() > storedToken.expiresAt) {
      throw new AuthenticationError('Refresh token has expired')
    }

    // Get user data
    const [user] = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
      })
      .from(schema.users)
      .where(eq(schema.users.id, storedToken.userId))
      .limit(1)

    if (!user) {
      throw new AuthenticationError('User not found')
    }

    // Generate new access token
    const { token, expiresIn } = this.generateAccessToken(user.id, user.email)

    return { token, expiresIn }
  }

  /**
   * Revoke a specific refresh token (logout)
   */
  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken)

    const result = await this.db
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
      throw new AuthenticationError('Invalid or already revoked refresh token')
    }
  }

  /**
   * Revoke all refresh tokens for a user (logout from all devices)
   */
  async logoutAll(userId: string): Promise<number> {
    const result = await this.db
      .update(schema.refreshTokens)
      .set({ isRevoked: true })
      .where(
        and(
          eq(schema.refreshTokens.userId, userId),
          eq(schema.refreshTokens.isRevoked, false)
        )
      )
      .returning({ id: schema.refreshTokens.id })

    return result.length
  }

  /**
   * Get all active sessions for a user
   */
  async getActiveSessions(userId: string, currentRefreshToken?: string): Promise<Session[]> {
    const currentTokenHash = currentRefreshToken ? hashToken(currentRefreshToken) : null
    const now = new Date()

    const sessions = await this.db
      .select({
        id: schema.refreshTokens.id,
        tokenHash: schema.refreshTokens.tokenHash,
        createdAt: schema.refreshTokens.createdAt,
        expiresAt: schema.refreshTokens.expiresAt,
      })
      .from(schema.refreshTokens)
      .where(
        and(
          eq(schema.refreshTokens.userId, userId),
          eq(schema.refreshTokens.isRevoked, false),
          gt(schema.refreshTokens.expiresAt, now)
        )
      )
      .orderBy(desc(schema.refreshTokens.createdAt))

    return sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      isCurrent: currentTokenHash ? session.tokenHash === currentTokenHash : false,
    }))
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const result = await this.db
      .update(schema.refreshTokens)
      .set({ isRevoked: true })
      .where(
        and(
          eq(schema.refreshTokens.id, sessionId),
          eq(schema.refreshTokens.userId, userId),
          eq(schema.refreshTokens.isRevoked, false)
        )
      )
      .returning({ id: schema.refreshTokens.id })

    if (result.length === 0) {
      throw new NotFoundError('Session', sessionId)
    }
  }

  /**
   * Get current user with subscription info
   */
  async getCurrentUser(userId: string): Promise<UserWithSubscription> {
    const [user] = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        createdAt: schema.users.createdAt,
        updatedAt: schema.users.updatedAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1)

    if (!user) {
      throw new NotFoundError('User', userId)
    }

    const subscription = await getUserSubscription(user.id)
    const limits = await getProjectLimits(user.id)

    return {
      user,
      subscription: {
        tier: subscription.tier,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
      limits,
    }
  }

  /**
   * Generate JWT access token
   */
  private generateAccessToken(userId: string, email: string): { token: string; expiresIn: number } {
    const jwtSecret = process.env['JWT_SECRET']
    if (!jwtSecret) {
      throw new ServiceError('JWT_SECRET is not configured', 'CONFIG_ERROR', 500)
    }

    const expiresIn = Number(process.env['JWT_EXPIRATION']) || DEFAULT_JWT_EXPIRATION

    const token = jwt.sign(
      { userId, email },
      jwtSecret,
      { expiresIn }
    )

    return { token, expiresIn }
  }

  /**
   * Generate refresh token data
   */
  private generateRefreshTokenData(): {
    refreshToken: string
    refreshExpiresIn: number
    refreshExpiresAt: Date
  } {
    const refreshExpiresIn = Number(process.env['REFRESH_TOKEN_EXPIRATION']) || DEFAULT_REFRESH_EXPIRATION
    const refreshToken = generateRefreshToken()
    const refreshExpiresAt = new Date(Date.now() + refreshExpiresIn * 1000)

    return { refreshToken, refreshExpiresIn, refreshExpiresAt }
  }
}

// Export singleton instance
export const authService = new AuthService()
