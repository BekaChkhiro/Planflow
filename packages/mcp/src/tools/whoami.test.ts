/**
 * Integration Tests for planflow_whoami tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { whoamiTool } from './whoami.js'
import { fixtures, getResultText, isErrorResult } from '../__tests__/test-utils.js'

// Mock dependencies
vi.mock('../config.js', () => ({
  isAuthenticated: vi.fn(),
  loadConfig: vi.fn(),
}))

vi.mock('../api-client.js', () => ({
  getApiClient: vi.fn(),
}))

vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('planflow_whoami', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('tool metadata', () => {
    it('should have correct name', () => {
      expect(whoamiTool.name).toBe('planflow_whoami')
    })

    it('should have a description', () => {
      expect(whoamiTool.description).toBeDefined()
      expect(whoamiTool.description.length).toBeGreaterThan(0)
    })
  })

  describe('input validation', () => {
    it('should accept empty object', () => {
      const result = whoamiTool.inputSchema.safeParse({})
      expect(result.success).toBe(true)
    })
  })

  describe('when not authenticated', () => {
    it('should return error', async () => {
      const { isAuthenticated } = await import('../config.js')
      vi.mocked(isAuthenticated).mockReturnValue(false)

      const result = await whoamiTool.execute({})

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('Not logged in')
      expect(text).toContain('planflow_login')
    })
  })

  describe('when authenticated', () => {
    it('should return user info', async () => {
      const { isAuthenticated, loadConfig } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)
      vi.mocked(loadConfig).mockReturnValue({
        apiToken: 'mock-token',
        apiUrl: 'https://api.planflow.dev',
        userId: fixtures.user().id,
        userEmail: fixtures.user().email,
      })

      const mockUser = {
        ...fixtures.user(),
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-15'),
      }

      const mockClient = {
        getCurrentUser: vi.fn().mockResolvedValue({
          user: mockUser,
          authType: 'api-token',
        }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await whoamiTool.execute({})

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('Current User')
      expect(text).toContain(fixtures.user().name)
      expect(text).toContain(fixtures.user().email)
      expect(text).toContain('API Token')
      expect(text).toContain('Connected')
    })

    it('should show JWT auth type correctly', async () => {
      const { isAuthenticated, loadConfig } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)
      vi.mocked(loadConfig).mockReturnValue({
        apiToken: 'mock-token',
        apiUrl: 'https://api.planflow.dev',
      })

      const mockClient = {
        getCurrentUser: vi.fn().mockResolvedValue({
          user: { ...fixtures.user(), createdAt: new Date(), updatedAt: new Date() },
          authType: 'jwt',
        }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await whoamiTool.execute({})
      const text = getResultText(result)
      expect(text).toContain('JWT')
    })

    it('should handle auth errors', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')
      const { AuthError } = await import('../errors.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        getCurrentUser: vi.fn().mockRejectedValue(new AuthError('Token expired')),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await whoamiTool.execute({})

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('Authentication error')
      expect(text).toContain('session may have expired')
    })

    it('should handle API errors', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')
      const { ApiError } = await import('../errors.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        getCurrentUser: vi.fn().mockRejectedValue(new ApiError('Server error', 500)),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await whoamiTool.execute({})

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('API error')
    })

    it('should handle generic errors', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        getCurrentUser: vi.fn().mockRejectedValue(new Error('Unknown error')),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await whoamiTool.execute({})

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('Failed to fetch user info')
    })
  })

  describe('output format', () => {
    it('should include available commands', async () => {
      const { isAuthenticated, loadConfig } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)
      vi.mocked(loadConfig).mockReturnValue({
        apiToken: 'mock-token',
        apiUrl: 'https://api.planflow.dev',
      })

      const mockClient = {
        getCurrentUser: vi.fn().mockResolvedValue({
          user: { ...fixtures.user(), createdAt: new Date(), updatedAt: new Date() },
          authType: 'api-token',
        }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await whoamiTool.execute({})
      const text = getResultText(result)

      expect(text).toContain('planflow_projects')
      expect(text).toContain('planflow_create')
      expect(text).toContain('planflow_sync')
      expect(text).toContain('planflow_logout')
    })
  })
})
