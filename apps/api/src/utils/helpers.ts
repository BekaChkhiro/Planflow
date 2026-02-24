import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import type { SubscriptionTier, SubscriptionStatus, ProjectLimits } from '@planflow/shared'
import { count, eq } from 'drizzle-orm'
import { getDbClient, schema } from '../db/index.js'

// ============================================================================
// Token Generation & Hashing
// ============================================================================

// Helper to generate secure random tokens
export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex')
}

// Helper to hash tokens (for secure storage)
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// Helper to generate API tokens (shorter than refresh tokens, prefixed for identification)
export function generateApiToken(): string {
  return `pf_${crypto.randomBytes(32).toString('hex')}`
}

// Check if token is an API token (prefixed with pf_)
export function isApiToken(token: string): boolean {
  return token.startsWith('pf_')
}

// ============================================================================
// JWT Verification
// ============================================================================

export interface JwtPayload {
  userId: string
  email: string
}

export interface JwtVerifyResult {
  success: true
  payload: JwtPayload
}

export interface JwtVerifyError {
  success: false
  error: 'missing_secret' | 'expired' | 'invalid' | 'verification_failed'
  message: string
}

/**
 * Verify JWT token and extract payload
 * Returns detailed error information for different failure cases
 */
export function verifyJwtWithDetails(token: string): JwtVerifyResult | JwtVerifyError {
  const jwtSecret = process.env['JWT_SECRET']
  if (!jwtSecret) {
    return { success: false, error: 'missing_secret', message: 'Server configuration error' }
  }
  try {
    const decoded = jwt.verify(token, jwtSecret) as JwtPayload
    return { success: true, payload: decoded }
  } catch (err) {
    const errorName = err instanceof Error ? err.name : ''
    if (errorName === 'TokenExpiredError') {
      return { success: false, error: 'expired', message: 'Token expired' }
    }
    if (errorName === 'JsonWebTokenError') {
      return { success: false, error: 'invalid', message: 'Invalid token' }
    }
    return { success: false, error: 'verification_failed', message: 'Token verification failed' }
  }
}

/**
 * Simple JWT verification - returns payload or null
 * Use verifyJwtWithDetails() when you need error details
 */
export function verifyJwt(token: string): JwtPayload | null {
  const result = verifyJwtWithDetails(token)
  return result.success ? result.payload : null
}

// Helper to extract Bearer token from Authorization header
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  return authHeader.slice(7)
}

// ============================================================================
// API Token Verification
// ============================================================================

export interface ApiTokenUser {
  id: string
  email: string
  name?: string
}

export interface ApiTokenVerifySuccess {
  success: true
  user: ApiTokenUser
  tokenId: string
}

export interface ApiTokenVerifyError {
  success: false
  error: 'invalid' | 'revoked' | 'expired' | 'user_not_found'
  message: string
}

/**
 * Verify API token and return user info
 * This is the single source of truth for API token verification logic
 */
export async function verifyApiToken(token: string): Promise<ApiTokenVerifySuccess | ApiTokenVerifyError> {
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
    return { success: false, error: 'invalid', message: 'Invalid API token' }
  }

  if (storedToken.isRevoked) {
    return { success: false, error: 'revoked', message: 'API token has been revoked' }
  }

  if (storedToken.expiresAt && new Date() > storedToken.expiresAt) {
    return { success: false, error: 'expired', message: 'API token has expired' }
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
    return { success: false, error: 'user_not_found', message: 'User not found' }
  }

  // Update last used timestamp (fire and forget)
  db.update(schema.apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiTokens.id, storedToken.id))
    .then(() => {})
    .catch((err) => console.error('Failed to update API token lastUsedAt:', err))

  return {
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name ?? undefined,
    },
    tokenId: storedToken.id,
  }
}

// Helper to generate a URL-friendly slug from a name
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Project limits by subscription tier (-1 = unlimited)
export const PROJECT_LIMITS: Record<SubscriptionTier, number> = {
  free: 3,
  pro: -1,
  team: -1,
  enterprise: -1,
}

// Grace period for canceled subscriptions (days)
export const CANCELED_GRACE_PERIOD_DAYS = 7

// Helper to get user's subscription (defaults to free tier if none exists)
export async function getUserSubscription(userId: string) {
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
export async function canCreateProject(userId: string): Promise<{
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
  const effectiveTier = subscription.tier
  const effectiveStatus = subscription.status

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
export async function getProjectLimits(userId: string): Promise<ProjectLimits> {
  const result = await canCreateProject(userId)
  return {
    currentCount: result.currentCount,
    maxProjects: result.maxProjects,
    canCreate: result.allowed,
    tier: result.tier,
    status: result.status,
  }
}
