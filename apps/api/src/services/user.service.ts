/**
 * User Service
 * Handles user profile management operations
 */

import { eq, ne, and } from 'drizzle-orm'
import bcrypt from 'bcrypt'
import { getDbClient, schema } from '../db/index.js'
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from './errors.js'

// Constants
const SALT_ROUNDS = 12

// Types
export interface UpdateProfileInput {
  name?: string
  email?: string
}

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}

export interface UserProfile {
  id: string
  email: string
  name: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * UserService - Handles user profile operations
 */
export class UserService {
  private db = getDbClient()

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<UserProfile> {
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

    return user
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<UserProfile | null> {
    const [user] = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        createdAt: schema.users.createdAt,
        updatedAt: schema.users.updatedAt,
      })
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase()))
      .limit(1)

    return user || null
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, input: UpdateProfileInput): Promise<UserProfile> {
    const { name, email } = input

    // Validate at least one field is provided
    if (name === undefined && email === undefined) {
      throw new ValidationError('At least one field (name or email) must be provided')
    }

    // If email is being changed, check uniqueness
    if (email !== undefined) {
      const normalizedEmail = email.toLowerCase()
      const [existingUser] = await this.db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(
          and(
            eq(schema.users.email, normalizedEmail),
            ne(schema.users.id, userId)
          )
        )
        .limit(1)

      if (existingUser) {
        throw new ConflictError('A user with this email already exists')
      }
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }
    if (name !== undefined) updateData['name'] = name
    if (email !== undefined) updateData['email'] = email.toLowerCase()

    const [updatedUser] = await this.db
      .update(schema.users)
      .set(updateData)
      .where(eq(schema.users.id, userId))
      .returning({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        createdAt: schema.users.createdAt,
        updatedAt: schema.users.updatedAt,
      })

    if (!updatedUser) {
      throw new NotFoundError('User', userId)
    }

    return updatedUser
  }

  /**
   * Change user password
   */
  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const { currentPassword, newPassword } = input

    // Get current password hash
    const [user] = await this.db
      .select({ passwordHash: schema.users.passwordHash })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1)

    if (!user) {
      throw new NotFoundError('User', userId)
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!isValidPassword) {
      throw new AuthenticationError('Current password is incorrect')
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS)

    // Update password
    await this.db
      .update(schema.users)
      .set({
        passwordHash: newPasswordHash,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, userId))
  }

  /**
   * Verify user password (utility for other services)
   */
  async verifyPassword(userId: string, password: string): Promise<boolean> {
    const [user] = await this.db
      .select({ passwordHash: schema.users.passwordHash })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1)

    if (!user) {
      return false
    }

    return bcrypt.compare(password, user.passwordHash)
  }
}

// Export singleton instance
export const userService = new UserService()
