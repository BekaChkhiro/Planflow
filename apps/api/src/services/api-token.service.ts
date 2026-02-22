/**
 * API Token Service
 * Handles API token generation, verification, and management for MCP authentication
 */

import { and, eq } from 'drizzle-orm'
import { getDbClient, schema } from '../db/index.js'
import { generateApiToken, hashToken } from '../utils/helpers.js'
import {
  AuthenticationError,
  NotFoundError,
  ServiceError,
} from './errors.js'

// Types
export interface CreateApiTokenInput {
  name: string
  expiresInDays?: number | null
}

export interface ApiToken {
  id: string
  name: string
  lastUsedAt: Date | null
  expiresAt: Date | null
  isRevoked: boolean
  createdAt: Date
}

export interface ApiTokenWithSecret {
  token: string
  id: string
  name: string
  expiresAt: Date | null
  createdAt: Date
}

export interface VerifyApiTokenResult {
  user: {
    id: string
    email: string
    name: string | null
  }
  token: {
    id: string
    name: string
    expiresAt: Date | null
  }
}

/**
 * ApiTokenService - Handles API token operations for MCP authentication
 */
export class ApiTokenService {
  private db = getDbClient()

  /**
   * Create a new API token
   */
  async createToken(userId: string, input: CreateApiTokenInput): Promise<ApiTokenWithSecret> {
    const { name, expiresInDays } = input

    // Generate API token
    const apiToken = generateApiToken()
    const apiTokenHash = hashToken(apiToken)

    // Calculate expiration (optional)
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null

    // Store token in database
    const [newToken] = await this.db
      .insert(schema.apiTokens)
      .values({
        userId,
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
      throw new ServiceError('Failed to create API token', 'TOKEN_CREATION_FAILED', 500)
    }

    // Return the token (only time it's shown in plaintext!)
    return {
      token: apiToken,
      id: newToken.id,
      name: newToken.name,
      expiresAt: newToken.expiresAt,
      createdAt: newToken.createdAt,
    }
  }

  /**
   * List all active API tokens for a user (does not return actual token values)
   */
  async listTokens(userId: string): Promise<ApiToken[]> {
    const tokens = await this.db
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
          eq(schema.apiTokens.userId, userId),
          eq(schema.apiTokens.isRevoked, false)
        )
      )
      .orderBy(schema.apiTokens.createdAt)

    return tokens
  }

  /**
   * Revoke an API token
   */
  async revokeToken(userId: string, tokenId: string): Promise<void> {
    const result = await this.db
      .update(schema.apiTokens)
      .set({ isRevoked: true })
      .where(
        and(
          eq(schema.apiTokens.id, tokenId),
          eq(schema.apiTokens.userId, userId),
          eq(schema.apiTokens.isRevoked, false)
        )
      )
      .returning({ id: schema.apiTokens.id })

    if (result.length === 0) {
      throw new NotFoundError('API token', tokenId)
    }
  }

  /**
   * Revoke all API tokens for a user
   */
  async revokeAllTokens(userId: string): Promise<number> {
    const result = await this.db
      .update(schema.apiTokens)
      .set({ isRevoked: true })
      .where(
        and(
          eq(schema.apiTokens.userId, userId),
          eq(schema.apiTokens.isRevoked, false)
        )
      )
      .returning({ id: schema.apiTokens.id })

    return result.length
  }

  /**
   * Verify an API token and return user info
   * Used by MCP server to validate tokens
   */
  async verifyToken(apiToken: string): Promise<VerifyApiTokenResult> {
    const tokenHash = hashToken(apiToken)

    // Find the token
    const [storedToken] = await this.db
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
      throw new AuthenticationError('Invalid API token')
    }

    if (storedToken.isRevoked) {
      throw new AuthenticationError('API token has been revoked')
    }

    if (storedToken.expiresAt && new Date() > storedToken.expiresAt) {
      throw new AuthenticationError('API token has expired')
    }

    // Get user info
    const [user] = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
      })
      .from(schema.users)
      .where(eq(schema.users.id, storedToken.userId))
      .limit(1)

    if (!user) {
      throw new AuthenticationError('User not found')
    }

    // Update last used timestamp (non-blocking)
    this.db
      .update(schema.apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.apiTokens.id, storedToken.id))
      .then(() => {})
      .catch(() => {})

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      token: {
        id: storedToken.id,
        name: storedToken.name,
        expiresAt: storedToken.expiresAt,
      },
    }
  }

  /**
   * Get token by ID (for user verification)
   */
  async getTokenById(userId: string, tokenId: string): Promise<ApiToken | null> {
    const [token] = await this.db
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
          eq(schema.apiTokens.id, tokenId),
          eq(schema.apiTokens.userId, userId)
        )
      )
      .limit(1)

    return token || null
  }

  /**
   * Update token name
   */
  async updateTokenName(userId: string, tokenId: string, name: string): Promise<ApiToken> {
    const [updated] = await this.db
      .update(schema.apiTokens)
      .set({ name })
      .where(
        and(
          eq(schema.apiTokens.id, tokenId),
          eq(schema.apiTokens.userId, userId),
          eq(schema.apiTokens.isRevoked, false)
        )
      )
      .returning({
        id: schema.apiTokens.id,
        name: schema.apiTokens.name,
        lastUsedAt: schema.apiTokens.lastUsedAt,
        expiresAt: schema.apiTokens.expiresAt,
        isRevoked: schema.apiTokens.isRevoked,
        createdAt: schema.apiTokens.createdAt,
      })

    if (!updated) {
      throw new NotFoundError('API token', tokenId)
    }

    return updated
  }
}

// Export singleton instance
export const apiTokenService = new ApiTokenService()
