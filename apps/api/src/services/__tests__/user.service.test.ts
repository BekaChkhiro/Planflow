/**
 * User Service Unit Tests
 * Tests for user profile management business logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import bcrypt from 'bcrypt'

// Mock the database module
vi.mock('../../db/index.js', () => ({
  getDbClient: vi.fn(),
  schema: {
    users: {
      id: 'id',
      email: 'email',
      name: 'name',
      passwordHash: 'passwordHash',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
  },
}))

import { getDbClient } from '../../db/index.js'
import { UserService } from '../user.service.js'
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../errors.js'

describe('UserService', () => {
  let userService: UserService
  let mockDb: ReturnType<typeof createMockDb>

  function createMockDb() {
    const mockSelect = vi.fn()
    const mockFrom = vi.fn()
    const mockWhere = vi.fn()
    const mockLimit = vi.fn()
    const mockInsert = vi.fn()
    const mockValues = vi.fn()
    const mockReturning = vi.fn()
    const mockUpdate = vi.fn()
    const mockSet = vi.fn()

    // Set up chaining
    mockSelect.mockReturnValue({ from: mockFrom })
    mockFrom.mockReturnValue({ where: mockWhere, limit: mockLimit })
    mockWhere.mockReturnValue({ limit: mockLimit, returning: mockReturning })
    mockLimit.mockResolvedValue([])
    mockReturning.mockResolvedValue([])
    mockInsert.mockReturnValue({ values: mockValues })
    mockValues.mockReturnValue({ returning: mockReturning })
    mockUpdate.mockReturnValue({ set: mockSet })
    mockSet.mockReturnValue({ where: mockWhere })

    return {
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      _mocks: {
        select: mockSelect,
        from: mockFrom,
        where: mockWhere,
        limit: mockLimit,
        insert: mockInsert,
        values: mockValues,
        returning: mockReturning,
        update: mockUpdate,
        set: mockSet,
      },
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockDb = createMockDb()
    vi.mocked(getDbClient).mockReturnValue(mockDb as never)
    userService = new UserService()
  })

  describe('getUserById', () => {
    it('should return user profile', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      }
      mockDb._mocks.limit.mockResolvedValueOnce([mockUser])

      const result = await userService.getUserById('user-123')

      expect(result.id).toBe('user-123')
      expect(result.email).toBe('test@example.com')
      expect(result.name).toBe('Test User')
    })

    it('should throw NotFoundError if user not found', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([])

      await expect(userService.getUserById('nonexistent'))
        .rejects.toThrow(NotFoundError)
    })
  })

  describe('getUserByEmail', () => {
    it('should return user profile by email', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockDb._mocks.limit.mockResolvedValueOnce([mockUser])

      const result = await userService.getUserByEmail('test@example.com')

      expect(result).not.toBeNull()
      expect(result?.email).toBe('test@example.com')
    })

    it('should return null if user not found', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([])

      const result = await userService.getUserByEmail('nonexistent@example.com')

      expect(result).toBeNull()
    })

    it('should normalize email to lowercase', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockDb._mocks.limit.mockResolvedValueOnce([mockUser])

      await userService.getUserByEmail('TEST@EXAMPLE.COM')

      expect(mockDb._mocks.where).toHaveBeenCalled()
    })
  })

  describe('updateProfile', () => {
    const existingUser = {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    it('should update user name', async () => {
      const updatedUser = { ...existingUser, name: 'New Name', updatedAt: new Date() }
      mockDb._mocks.returning.mockResolvedValueOnce([updatedUser])

      const result = await userService.updateProfile('user-123', { name: 'New Name' })

      expect(result.name).toBe('New Name')
      expect(mockDb.update).toHaveBeenCalled()
    })

    it('should update user email', async () => {
      // First mock: check for existing email (none found)
      mockDb._mocks.limit.mockResolvedValueOnce([])
      // Second mock: update returns user
      const updatedUser = { ...existingUser, email: 'new@example.com', updatedAt: new Date() }
      mockDb._mocks.returning.mockResolvedValueOnce([updatedUser])

      const result = await userService.updateProfile('user-123', { email: 'new@example.com' })

      expect(result.email).toBe('new@example.com')
    })

    it('should update both name and email', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([])
      const updatedUser = {
        ...existingUser,
        name: 'New Name',
        email: 'new@example.com',
        updatedAt: new Date(),
      }
      mockDb._mocks.returning.mockResolvedValueOnce([updatedUser])

      const result = await userService.updateProfile('user-123', {
        name: 'New Name',
        email: 'new@example.com',
      })

      expect(result.name).toBe('New Name')
      expect(result.email).toBe('new@example.com')
    })

    it('should throw ValidationError if no fields provided', async () => {
      await expect(userService.updateProfile('user-123', {}))
        .rejects.toThrow(ValidationError)
    })

    it('should throw ConflictError if email already exists', async () => {
      // Email already used by another user
      mockDb._mocks.limit.mockResolvedValueOnce([{ id: 'other-user' }])

      await expect(userService.updateProfile('user-123', { email: 'taken@example.com' }))
        .rejects.toThrow(ConflictError)
    })

    it('should throw NotFoundError if user not found', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([]) // No existing email
      mockDb._mocks.returning.mockResolvedValueOnce([]) // Update returns nothing

      await expect(userService.updateProfile('nonexistent', { name: 'New Name' }))
        .rejects.toThrow(NotFoundError)
    })

    it('should normalize email to lowercase', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([])
      const updatedUser = { ...existingUser, email: 'new@example.com', updatedAt: new Date() }
      mockDb._mocks.returning.mockResolvedValueOnce([updatedUser])

      await userService.updateProfile('user-123', { email: 'NEW@EXAMPLE.COM' })

      expect(mockDb._mocks.set).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@example.com' })
      )
    })

    it('should allow same user to keep their email', async () => {
      // No other user with this email
      mockDb._mocks.limit.mockResolvedValueOnce([])
      const updatedUser = { ...existingUser, name: 'New Name', updatedAt: new Date() }
      mockDb._mocks.returning.mockResolvedValueOnce([updatedUser])

      const result = await userService.updateProfile('user-123', {
        name: 'New Name',
        email: 'test@example.com', // Same email
      })

      expect(result.name).toBe('New Name')
    })
  })

  describe('changePassword', () => {
    const mockUserWithPassword = {
      passwordHash: '$2b$12$validHashedPassword',
    }

    it('should change password with correct current password', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([mockUserWithPassword])
      vi.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true as never)
      vi.spyOn(bcrypt, 'hash').mockResolvedValueOnce('$2b$12$newHashedPassword' as never)

      await userService.changePassword('user-123', {
        currentPassword: 'oldPassword',
        newPassword: 'newSecurePassword',
      })

      expect(mockDb.update).toHaveBeenCalled()
      expect(bcrypt.hash).toHaveBeenCalledWith('newSecurePassword', 12)
    })

    it('should throw NotFoundError if user not found', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([])

      await expect(userService.changePassword('nonexistent', {
        currentPassword: 'password',
        newPassword: 'newPassword',
      })).rejects.toThrow(NotFoundError)
    })

    it('should throw AuthenticationError for incorrect current password', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([mockUserWithPassword])
      vi.spyOn(bcrypt, 'compare').mockResolvedValueOnce(false as never)

      await expect(userService.changePassword('user-123', {
        currentPassword: 'wrongPassword',
        newPassword: 'newPassword',
      })).rejects.toThrow(AuthenticationError)
    })

    it('should hash new password with correct salt rounds', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([mockUserWithPassword])
      vi.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true as never)
      const hashSpy = vi.spyOn(bcrypt, 'hash').mockResolvedValueOnce('$2b$12$newHash' as never)

      await userService.changePassword('user-123', {
        currentPassword: 'oldPassword',
        newPassword: 'newPassword',
      })

      expect(hashSpy).toHaveBeenCalledWith('newPassword', 12)
    })
  })

  describe('verifyPassword', () => {
    it('should return true for valid password', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([{
        passwordHash: '$2b$12$validHash',
      }])
      vi.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true as never)

      const result = await userService.verifyPassword('user-123', 'correctPassword')

      expect(result).toBe(true)
    })

    it('should return false for invalid password', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([{
        passwordHash: '$2b$12$validHash',
      }])
      vi.spyOn(bcrypt, 'compare').mockResolvedValueOnce(false as never)

      const result = await userService.verifyPassword('user-123', 'wrongPassword')

      expect(result).toBe(false)
    })

    it('should return false if user not found', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([])

      const result = await userService.verifyPassword('nonexistent', 'password')

      expect(result).toBe(false)
    })
  })
})
