/**
 * User Repository
 * Handles all user-related database operations
 */

import { eq } from 'drizzle-orm'
import { schema } from '../db/index.js'
import { BaseRepository, type FindAllOptions, type PaginatedResult } from './base.repository.js'

// Types
export interface User {
  id: string
  email: string
  name: string
  createdAt: Date
  updatedAt: Date
}

export interface UserWithPassword extends User {
  passwordHash: string
}

export interface CreateUserInput {
  email: string
  passwordHash: string
  name: string
}

export interface UpdateUserInput {
  email?: string
  name?: string
  passwordHash?: string
}

/**
 * UserRepository - Handles user data access
 */
export class UserRepository extends BaseRepository {
  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    const [user] = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        createdAt: schema.users.createdAt,
        updatedAt: schema.users.updatedAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1)

    return user ?? null
  }

  /**
   * Find user by ID with password hash (for authentication)
   */
  async findByIdWithPassword(id: string): Promise<UserWithPassword | null> {
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
      .where(eq(schema.users.id, id))
      .limit(1)

    return user ?? null
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.toLowerCase()

    const [user] = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        createdAt: schema.users.createdAt,
        updatedAt: schema.users.updatedAt,
      })
      .from(schema.users)
      .where(eq(schema.users.email, normalizedEmail))
      .limit(1)

    return user ?? null
  }

  /**
   * Find user by email with password hash (for authentication)
   */
  async findByEmailWithPassword(email: string): Promise<UserWithPassword | null> {
    const normalizedEmail = email.toLowerCase()

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

    return user ?? null
  }

  /**
   * Check if user exists by email
   */
  async existsByEmail(email: string): Promise<boolean> {
    const normalizedEmail = email.toLowerCase()

    const [existing] = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, normalizedEmail))
      .limit(1)

    return !!existing
  }

  /**
   * Find all users (with pagination)
   */
  async findAll(options?: FindAllOptions): Promise<User[]> {
    const limit = options?.limit ?? 50
    const offset = options?.offset ?? 0

    const users = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        createdAt: schema.users.createdAt,
        updatedAt: schema.users.updatedAt,
      })
      .from(schema.users)
      .limit(limit)
      .offset(offset)

    return users
  }

  /**
   * Find users by IDs (batch lookup)
   */
  async findByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return []

    const users: User[] = []
    for (const id of ids) {
      const user = await this.findById(id)
      if (user) users.push(user)
    }

    return users
  }

  /**
   * Find users as a map by IDs (useful for batch lookups)
   */
  async findByIdsAsMap(ids: string[]): Promise<Map<string, User>> {
    const users = await this.findByIds(ids)
    return new Map(users.map((u) => [u.id, u]))
  }

  /**
   * Create a new user
   */
  async create(data: CreateUserInput): Promise<User> {
    const [newUser] = await this.db
      .insert(schema.users)
      .values({
        email: data.email.toLowerCase(),
        passwordHash: data.passwordHash,
        name: data.name,
      })
      .returning({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        createdAt: schema.users.createdAt,
        updatedAt: schema.users.updatedAt,
      })

    if (!newUser) {
      throw new Error('Failed to create user')
    }

    return newUser
  }

  /**
   * Update user by ID
   */
  async update(id: string, data: UpdateUserInput): Promise<User | null> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (data.email !== undefined) updateData['email'] = data.email.toLowerCase()
    if (data.name !== undefined) updateData['name'] = data.name
    if (data.passwordHash !== undefined) updateData['passwordHash'] = data.passwordHash

    const [updated] = await this.db
      .update(schema.users)
      .set(updateData)
      .where(eq(schema.users.id, id))
      .returning({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        createdAt: schema.users.createdAt,
        updatedAt: schema.users.updatedAt,
      })

    return updated ?? null
  }

  /**
   * Delete user by ID
   */
  async delete(id: string): Promise<boolean> {
    const [deleted] = await this.db
      .delete(schema.users)
      .where(eq(schema.users.id, id))
      .returning({ id: schema.users.id })

    return !!deleted
  }
}

// Export singleton instance
export const userRepository = new UserRepository()
