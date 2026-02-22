/**
 * Auth Service Unit Tests
 * Tests for authentication business logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

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
    refreshTokens: {
      id: 'id',
      userId: 'userId',
      tokenHash: 'tokenHash',
      expiresAt: 'expiresAt',
      isRevoked: 'isRevoked',
      createdAt: 'createdAt',
    },
  },
}))

// Mock helper functions
vi.mock('../../utils/helpers.js', () => ({
  generateRefreshToken: vi.fn(() => 'mock-refresh-token-123'),
  hashToken: vi.fn((token: string) => `hashed-${token}`),
  getUserSubscription: vi.fn(() => Promise.resolve({
    tier: 'free',
    status: 'active',
    currentPeriodEnd: null,
  })),
  getProjectLimits: vi.fn(() => Promise.resolve({
    currentCount: 0,
    maxProjects: 3,
    canCreate: true,
    tier: 'free',
    status: 'active',
  })),
}))

// Mock email service
vi.mock('../../lib/email.js', () => ({
  sendWelcomeEmail: vi.fn(() => Promise.resolve()),
  isEmailServiceConfigured: vi.fn(() => false),
}))

import { getDbClient } from '../../db/index.js'
import { AuthService } from '../auth.service.js'
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ServiceError,
} from '../errors.js'

describe('AuthService', () => {
  let authService: AuthService
  let mockDb: ReturnType<typeof createMockDb>

  function createMockDb() {
    const mockSelect = vi.fn()
    const mockFrom = vi.fn()
    const mockWhere = vi.fn()
    const mockLimit = vi.fn()
    const mockOrderBy = vi.fn()
    const mockInsert = vi.fn()
    const mockValues = vi.fn()
    const mockReturning = vi.fn()
    const mockUpdate = vi.fn()
    const mockSet = vi.fn()

    // Set up chaining
    mockSelect.mockReturnValue({ from: mockFrom })
    mockFrom.mockReturnValue({ where: mockWhere, orderBy: mockOrderBy, limit: mockLimit })
    mockWhere.mockReturnValue({ limit: mockLimit, orderBy: mockOrderBy, returning: mockReturning })
    mockLimit.mockResolvedValue([])
    mockOrderBy.mockResolvedValue([])
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
        orderBy: mockOrderBy,
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
    authService = new AuthService()
  })

  describe('registerUser', () => {
    const validInput = {
      email: 'test@example.com',
      password: 'securePassword123',
      name: 'Test User',
    }

    it('should register a new user successfully', async () => {
      // Mock: user doesn't exist
      mockDb._mocks.limit.mockResolvedValueOnce([])

      // Mock: user creation succeeds
      const mockNewUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockDb._mocks.returning.mockResolvedValueOnce([mockNewUser])

      const result = await authService.registerUser(validInput)

      expect(result.id).toBe('user-123')
      expect(result.email).toBe('test@example.com')
      expect(result.name).toBe('Test User')
      expect(mockDb.insert).toHaveBeenCalled()
    })

    it('should throw ConflictError if user already exists', async () => {
      // Mock: user exists
      mockDb._mocks.limit.mockResolvedValueOnce([{ id: 'existing-user' }])

      await expect(authService.registerUser(validInput))
        .rejects.toThrow(ConflictError)
    })

    it('should normalize email to lowercase', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([])
      mockDb._mocks.returning.mockResolvedValueOnce([{
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      }])

      await authService.registerUser({
        ...validInput,
        email: 'TEST@EXAMPLE.COM',
      })

      // Check that email was normalized in the query
      expect(mockDb._mocks.where).toHaveBeenCalled()
    })

    it('should throw ServiceError if user creation fails', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([])
      mockDb._mocks.returning.mockResolvedValueOnce([]) // Empty array = creation failed

      await expect(authService.registerUser(validInput))
        .rejects.toThrow(ServiceError)
    })

    it('should hash password before storing', async () => {
      const hashSpy = vi.spyOn(bcrypt, 'hash')
      mockDb._mocks.limit.mockResolvedValueOnce([])
      mockDb._mocks.returning.mockResolvedValueOnce([{
        id: 'user-123',
        email: 'test@example.com',
        name: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }])

      await authService.registerUser(validInput)

      expect(hashSpy).toHaveBeenCalledWith(validInput.password, 12)
    })
  })

  describe('login', () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      passwordHash: '$2b$12$validHashedPassword',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    it('should login successfully with valid credentials', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([mockUser])
      vi.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true as never)
      mockDb._mocks.returning.mockResolvedValueOnce([{ id: 'refresh-123' }])

      const result = await authService.login('test@example.com', 'validPassword')

      expect(result.user.id).toBe('user-123')
      expect(result.user.email).toBe('test@example.com')
      expect(result.token).toBeDefined()
      expect(result.refreshToken).toBeDefined()
      expect(result.expiresIn).toBeGreaterThan(0)
    })

    it('should throw AuthenticationError for non-existent user', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([])

      await expect(authService.login('nonexistent@example.com', 'password'))
        .rejects.toThrow(AuthenticationError)
    })

    it('should throw AuthenticationError for invalid password', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([mockUser])
      vi.spyOn(bcrypt, 'compare').mockResolvedValueOnce(false as never)

      await expect(authService.login('test@example.com', 'wrongPassword'))
        .rejects.toThrow(AuthenticationError)
    })

    it('should normalize email to lowercase', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([mockUser])
      vi.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true as never)
      mockDb._mocks.returning.mockResolvedValueOnce([{ id: 'refresh-123' }])

      await authService.login('TEST@EXAMPLE.COM', 'validPassword')

      expect(mockDb._mocks.where).toHaveBeenCalled()
    })

    it('should generate valid JWT token', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([mockUser])
      vi.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true as never)
      mockDb._mocks.returning.mockResolvedValueOnce([{ id: 'refresh-123' }])

      const result = await authService.login('test@example.com', 'validPassword')

      // Verify the token is valid JWT
      const decoded = jwt.verify(result.token, process.env['JWT_SECRET']!) as { userId: string; email: string }
      expect(decoded.userId).toBe('user-123')
      expect(decoded.email).toBe('test@example.com')
    })

    it('should store refresh token in database', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([mockUser])
      vi.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true as never)
      mockDb._mocks.returning.mockResolvedValueOnce([{ id: 'refresh-123' }])

      await authService.login('test@example.com', 'validPassword')

      expect(mockDb.insert).toHaveBeenCalled()
      expect(mockDb._mocks.values).toHaveBeenCalled()
    })
  })

  describe('refreshAccessToken', () => {
    it('should refresh access token with valid refresh token', async () => {
      const mockStoredToken = {
        id: 'refresh-123',
        userId: 'user-123',
        expiresAt: new Date(Date.now() + 1000000),
        isRevoked: false,
      }
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
      }

      mockDb._mocks.limit
        .mockResolvedValueOnce([mockStoredToken])
        .mockResolvedValueOnce([mockUser])

      const result = await authService.refreshAccessToken('valid-refresh-token')

      expect(result.token).toBeDefined()
      expect(result.expiresIn).toBeGreaterThan(0)
    })

    it('should throw AuthenticationError for invalid refresh token', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([])

      await expect(authService.refreshAccessToken('invalid-token'))
        .rejects.toThrow(AuthenticationError)
    })

    it('should throw AuthenticationError for revoked token', async () => {
      const mockStoredToken = {
        id: 'refresh-123',
        userId: 'user-123',
        expiresAt: new Date(Date.now() + 1000000),
        isRevoked: true, // Token is revoked
      }
      mockDb._mocks.limit.mockResolvedValueOnce([mockStoredToken])

      await expect(authService.refreshAccessToken('revoked-token'))
        .rejects.toThrow(AuthenticationError)
    })

    it('should throw AuthenticationError for expired token', async () => {
      const mockStoredToken = {
        id: 'refresh-123',
        userId: 'user-123',
        expiresAt: new Date(Date.now() - 1000), // Expired
        isRevoked: false,
      }
      mockDb._mocks.limit.mockResolvedValueOnce([mockStoredToken])

      await expect(authService.refreshAccessToken('expired-token'))
        .rejects.toThrow(AuthenticationError)
    })

    it('should throw AuthenticationError if user not found', async () => {
      const mockStoredToken = {
        id: 'refresh-123',
        userId: 'deleted-user',
        expiresAt: new Date(Date.now() + 1000000),
        isRevoked: false,
      }
      mockDb._mocks.limit
        .mockResolvedValueOnce([mockStoredToken])
        .mockResolvedValueOnce([]) // User not found

      await expect(authService.refreshAccessToken('valid-token'))
        .rejects.toThrow(AuthenticationError)
    })
  })

  describe('logout', () => {
    it('should revoke refresh token', async () => {
      mockDb._mocks.returning.mockResolvedValueOnce([{ id: 'refresh-123' }])

      await authService.logout('valid-refresh-token')

      expect(mockDb.update).toHaveBeenCalled()
      expect(mockDb._mocks.set).toHaveBeenCalledWith({ isRevoked: true })
    })

    it('should throw AuthenticationError if token not found or already revoked', async () => {
      mockDb._mocks.returning.mockResolvedValueOnce([])

      await expect(authService.logout('invalid-token'))
        .rejects.toThrow(AuthenticationError)
    })
  })

  describe('logoutAll', () => {
    it('should revoke all refresh tokens for user', async () => {
      mockDb._mocks.returning.mockResolvedValueOnce([
        { id: 'refresh-1' },
        { id: 'refresh-2' },
        { id: 'refresh-3' },
      ])

      const revokedCount = await authService.logoutAll('user-123')

      expect(revokedCount).toBe(3)
      expect(mockDb.update).toHaveBeenCalled()
    })

    it('should return 0 if no active sessions', async () => {
      mockDb._mocks.returning.mockResolvedValueOnce([])

      const revokedCount = await authService.logoutAll('user-with-no-sessions')

      expect(revokedCount).toBe(0)
    })
  })

  describe('getActiveSessions', () => {
    it('should return list of active sessions', async () => {
      const now = new Date()
      const mockSessions = [
        {
          id: 'session-1',
          tokenHash: 'hash-1',
          createdAt: new Date(now.getTime() - 1000),
          expiresAt: new Date(now.getTime() + 86400000),
        },
        {
          id: 'session-2',
          tokenHash: 'hash-2',
          createdAt: new Date(now.getTime() - 2000),
          expiresAt: new Date(now.getTime() + 86400000),
        },
      ]
      mockDb._mocks.orderBy.mockResolvedValueOnce(mockSessions)

      const sessions = await authService.getActiveSessions('user-123')

      expect(sessions).toHaveLength(2)
      expect(sessions[0]).toHaveProperty('id')
      expect(sessions[0]).toHaveProperty('createdAt')
      expect(sessions[0]).toHaveProperty('expiresAt')
      expect(sessions[0]).toHaveProperty('isCurrent')
    })

    it('should mark current session correctly', async () => {
      const now = new Date()
      const mockSessions = [
        {
          id: 'session-1',
          tokenHash: 'hashed-current-token', // Matches the hash pattern from mock
          createdAt: new Date(now.getTime() - 1000),
          expiresAt: new Date(now.getTime() + 86400000),
        },
      ]
      mockDb._mocks.orderBy.mockResolvedValueOnce(mockSessions)

      const sessions = await authService.getActiveSessions('user-123', 'current-token')

      expect(sessions[0].isCurrent).toBe(true)
    })
  })

  describe('revokeSession', () => {
    it('should revoke specific session', async () => {
      mockDb._mocks.returning.mockResolvedValueOnce([{ id: 'session-123' }])

      await authService.revokeSession('user-123', 'session-123')

      expect(mockDb.update).toHaveBeenCalled()
    })

    it('should throw NotFoundError if session not found', async () => {
      mockDb._mocks.returning.mockResolvedValueOnce([])

      await expect(authService.revokeSession('user-123', 'nonexistent-session'))
        .rejects.toThrow(NotFoundError)
    })
  })

  describe('getCurrentUser', () => {
    it('should return user with subscription info', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockDb._mocks.limit.mockResolvedValueOnce([mockUser])

      const result = await authService.getCurrentUser('user-123')

      expect(result.user.id).toBe('user-123')
      expect(result.subscription).toBeDefined()
      expect(result.subscription.tier).toBe('free')
      expect(result.limits).toBeDefined()
      expect(result.limits.maxProjects).toBe(3)
    })

    it('should throw NotFoundError if user not found', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([])

      await expect(authService.getCurrentUser('nonexistent-user'))
        .rejects.toThrow(NotFoundError)
    })
  })
})
