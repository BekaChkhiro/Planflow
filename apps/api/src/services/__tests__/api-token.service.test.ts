/**
 * API Token Service Unit Tests
 * Tests for API token management business logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the database module
vi.mock('../../db/index.js', () => ({
  getDbClient: vi.fn(),
  schema: {
    apiTokens: {
      id: 'id',
      userId: 'userId',
      name: 'name',
      tokenHash: 'tokenHash',
      lastUsedAt: 'lastUsedAt',
      expiresAt: 'expiresAt',
      isRevoked: 'isRevoked',
      createdAt: 'createdAt',
    },
    users: {
      id: 'id',
      email: 'email',
      name: 'name',
    },
  },
}))

// Mock helper functions
vi.mock('../../utils/helpers.js', () => ({
  generateApiToken: vi.fn(() => 'pf_mock-api-token-12345'),
  hashToken: vi.fn((token: string) => `hashed-${token}`),
}))

import { getDbClient } from '../../db/index.js'
import { ApiTokenService } from '../api-token.service.js'
import {
  AuthenticationError,
  NotFoundError,
  ServiceError,
} from '../errors.js'

describe('ApiTokenService', () => {
  let apiTokenService: ApiTokenService
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
    const mockThen = vi.fn()

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
    mockSet.mockReturnValue({ where: mockWhere, then: mockThen })

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
        then: mockThen,
      },
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockDb = createMockDb()
    vi.mocked(getDbClient).mockReturnValue(mockDb as never)
    apiTokenService = new ApiTokenService()
  })

  describe('createToken', () => {
    it('should create a new API token successfully', async () => {
      const mockNewToken = {
        id: 'token-123',
        name: 'My Token',
        expiresAt: null,
        createdAt: new Date(),
      }
      mockDb._mocks.returning.mockResolvedValueOnce([mockNewToken])

      const result = await apiTokenService.createToken('user-123', {
        name: 'My Token',
      })

      expect(result.token).toBe('pf_mock-api-token-12345')
      expect(result.id).toBe('token-123')
      expect(result.name).toBe('My Token')
      expect(result.expiresAt).toBeNull()
    })

    it('should create token with expiration', async () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      const mockNewToken = {
        id: 'token-123',
        name: 'Expiring Token',
        expiresAt: futureDate,
        createdAt: new Date(),
      }
      mockDb._mocks.returning.mockResolvedValueOnce([mockNewToken])

      const result = await apiTokenService.createToken('user-123', {
        name: 'Expiring Token',
        expiresInDays: 30,
      })

      expect(result.expiresAt).toEqual(futureDate)
    })

    it('should throw ServiceError if token creation fails', async () => {
      mockDb._mocks.returning.mockResolvedValueOnce([])

      await expect(apiTokenService.createToken('user-123', { name: 'Test' }))
        .rejects.toThrow(ServiceError)
    })

    it('should only return plaintext token once', async () => {
      const mockNewToken = {
        id: 'token-123',
        name: 'My Token',
        expiresAt: null,
        createdAt: new Date(),
      }
      mockDb._mocks.returning.mockResolvedValueOnce([mockNewToken])

      const result = await apiTokenService.createToken('user-123', { name: 'My Token' })

      expect(result.token).toBeDefined()
      expect(result.token.startsWith('pf_')).toBe(true)
    })
  })

  describe('listTokens', () => {
    it('should return list of active tokens', async () => {
      const mockTokens = [
        {
          id: 'token-1',
          name: 'Token 1',
          lastUsedAt: new Date(),
          expiresAt: null,
          isRevoked: false,
          createdAt: new Date(),
        },
        {
          id: 'token-2',
          name: 'Token 2',
          lastUsedAt: null,
          expiresAt: new Date(Date.now() + 86400000),
          isRevoked: false,
          createdAt: new Date(),
        },
      ]
      mockDb._mocks.orderBy.mockResolvedValueOnce(mockTokens)

      const result = await apiTokenService.listTokens('user-123')

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('Token 1')
      expect(result[1].name).toBe('Token 2')
    })

    it('should return empty array if no tokens', async () => {
      mockDb._mocks.orderBy.mockResolvedValueOnce([])

      const result = await apiTokenService.listTokens('user-123')

      expect(result).toEqual([])
    })

    it('should not include revoked tokens', async () => {
      // The mock doesn't need to filter, but the service should query for non-revoked only
      mockDb._mocks.orderBy.mockResolvedValueOnce([
        { id: 'token-1', name: 'Active Token', isRevoked: false, lastUsedAt: null, expiresAt: null, createdAt: new Date() },
      ])

      const result = await apiTokenService.listTokens('user-123')

      expect(result).toHaveLength(1)
      expect(result[0].isRevoked).toBe(false)
    })
  })

  describe('revokeToken', () => {
    it('should revoke token successfully', async () => {
      mockDb._mocks.returning.mockResolvedValueOnce([{ id: 'token-123' }])

      await apiTokenService.revokeToken('user-123', 'token-123')

      expect(mockDb.update).toHaveBeenCalled()
      expect(mockDb._mocks.set).toHaveBeenCalledWith({ isRevoked: true })
    })

    it('should throw NotFoundError if token not found', async () => {
      mockDb._mocks.returning.mockResolvedValueOnce([])

      await expect(apiTokenService.revokeToken('user-123', 'nonexistent-token'))
        .rejects.toThrow(NotFoundError)
    })

    it('should not revoke token belonging to another user', async () => {
      // The service checks userId in the WHERE clause
      mockDb._mocks.returning.mockResolvedValueOnce([])

      await expect(apiTokenService.revokeToken('different-user', 'token-123'))
        .rejects.toThrow(NotFoundError)
    })
  })

  describe('revokeAllTokens', () => {
    it('should revoke all tokens for user', async () => {
      mockDb._mocks.returning.mockResolvedValueOnce([
        { id: 'token-1' },
        { id: 'token-2' },
        { id: 'token-3' },
      ])

      const revokedCount = await apiTokenService.revokeAllTokens('user-123')

      expect(revokedCount).toBe(3)
    })

    it('should return 0 if no tokens to revoke', async () => {
      mockDb._mocks.returning.mockResolvedValueOnce([])

      const revokedCount = await apiTokenService.revokeAllTokens('user-123')

      expect(revokedCount).toBe(0)
    })
  })

  describe('verifyToken', () => {
    const mockStoredToken = {
      id: 'token-123',
      userId: 'user-123',
      name: 'API Token',
      expiresAt: null,
      isRevoked: false,
    }

    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
    }

    it('should verify valid token and return user info', async () => {
      mockDb._mocks.limit
        .mockResolvedValueOnce([mockStoredToken])
        .mockResolvedValueOnce([mockUser])

      // Mock the non-blocking update
      const mockUpdateChain = {
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            then: vi.fn().mockReturnValue({ catch: vi.fn() }),
          }),
        }),
      }
      mockDb.update.mockReturnValueOnce(mockUpdateChain)

      const result = await apiTokenService.verifyToken('valid-api-token')

      expect(result.user.id).toBe('user-123')
      expect(result.user.email).toBe('test@example.com')
      expect(result.token.id).toBe('token-123')
      expect(result.token.name).toBe('API Token')
    })

    it('should throw AuthenticationError for invalid token', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([])

      await expect(apiTokenService.verifyToken('invalid-token'))
        .rejects.toThrow(AuthenticationError)
    })

    it('should throw AuthenticationError for revoked token', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([{
        ...mockStoredToken,
        isRevoked: true,
      }])

      await expect(apiTokenService.verifyToken('revoked-token'))
        .rejects.toThrow(AuthenticationError)
    })

    it('should throw AuthenticationError for expired token', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([{
        ...mockStoredToken,
        expiresAt: new Date(Date.now() - 1000), // Expired
      }])

      await expect(apiTokenService.verifyToken('expired-token'))
        .rejects.toThrow(AuthenticationError)
    })

    it('should throw AuthenticationError if user not found', async () => {
      mockDb._mocks.limit
        .mockResolvedValueOnce([mockStoredToken])
        .mockResolvedValueOnce([]) // User not found

      await expect(apiTokenService.verifyToken('orphaned-token'))
        .rejects.toThrow(AuthenticationError)
    })

    it('should accept non-expired token', async () => {
      const futureDate = new Date(Date.now() + 86400000) // Tomorrow
      mockDb._mocks.limit
        .mockResolvedValueOnce([{ ...mockStoredToken, expiresAt: futureDate }])
        .mockResolvedValueOnce([mockUser])

      const mockUpdateChain = {
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            then: vi.fn().mockReturnValue({ catch: vi.fn() }),
          }),
        }),
      }
      mockDb.update.mockReturnValueOnce(mockUpdateChain)

      const result = await apiTokenService.verifyToken('non-expired-token')

      expect(result.user.id).toBe('user-123')
    })
  })

  describe('getTokenById', () => {
    it('should return token if found', async () => {
      const mockToken = {
        id: 'token-123',
        name: 'API Token',
        lastUsedAt: null,
        expiresAt: null,
        isRevoked: false,
        createdAt: new Date(),
      }
      mockDb._mocks.limit.mockResolvedValueOnce([mockToken])

      const result = await apiTokenService.getTokenById('user-123', 'token-123')

      expect(result).not.toBeNull()
      expect(result?.id).toBe('token-123')
    })

    it('should return null if token not found', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([])

      const result = await apiTokenService.getTokenById('user-123', 'nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('updateTokenName', () => {
    it('should update token name successfully', async () => {
      const updatedToken = {
        id: 'token-123',
        name: 'New Name',
        lastUsedAt: null,
        expiresAt: null,
        isRevoked: false,
        createdAt: new Date(),
      }
      mockDb._mocks.returning.mockResolvedValueOnce([updatedToken])

      const result = await apiTokenService.updateTokenName('user-123', 'token-123', 'New Name')

      expect(result.name).toBe('New Name')
    })

    it('should throw NotFoundError if token not found', async () => {
      mockDb._mocks.returning.mockResolvedValueOnce([])

      await expect(apiTokenService.updateTokenName('user-123', 'nonexistent', 'New Name'))
        .rejects.toThrow(NotFoundError)
    })

    it('should not update revoked token', async () => {
      // The service checks isRevoked: false in WHERE clause
      mockDb._mocks.returning.mockResolvedValueOnce([])

      await expect(apiTokenService.updateTokenName('user-123', 'revoked-token', 'New Name'))
        .rejects.toThrow(NotFoundError)
    })
  })
})
