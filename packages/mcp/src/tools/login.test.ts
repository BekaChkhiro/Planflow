/**
 * Integration Tests for planflow_login tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { loginTool } from './login.js'
import { fixtures, getResultText, isErrorResult } from '../__tests__/test-utils.js'

// Mock dependencies
vi.mock('../config.js', () => ({
  isAuthenticated: vi.fn(),
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
}))

vi.mock('../api-client.js', () => ({
  createApiClient: vi.fn(),
  resetApiClient: vi.fn(),
}))

vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('planflow_login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('tool metadata', () => {
    it('should have correct name', () => {
      expect(loginTool.name).toBe('planflow_login')
    })

    it('should have a description', () => {
      expect(loginTool.description).toBeDefined()
      expect(loginTool.description.length).toBeGreaterThan(0)
    })

    it('should have input schema requiring token', () => {
      expect(loginTool.inputSchema).toBeDefined()
    })
  })

  describe('input validation', () => {
    it('should reject empty token', async () => {
      const result = loginTool.inputSchema.safeParse({ token: '' })
      expect(result.success).toBe(false)
    })

    it('should accept valid token', () => {
      const result = loginTool.inputSchema.safeParse({ token: 'valid-token-123' })
      expect(result.success).toBe(true)
    })

    it('should reject missing token', () => {
      const result = loginTool.inputSchema.safeParse({})
      expect(result.success).toBe(false)
    })
  })

  describe('when already authenticated', () => {
    it('should return warning message', async () => {
      const { isAuthenticated, loadConfig } = await import('../config.js')
      vi.mocked(isAuthenticated).mockReturnValue(true)
      vi.mocked(loadConfig).mockReturnValue({
        apiToken: 'existing-token',
        apiUrl: 'https://api.planflow.dev',
        userId: fixtures.user().id,
        userEmail: 'existing@example.com',
      })

      const result = await loginTool.execute({ token: 'new-token' })

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('Already logged in')
      expect(text).toContain('existing@example.com')
    })
  })

  describe('when not authenticated', () => {
    it('should successfully login with valid token', async () => {
      const { isAuthenticated, saveConfig } = await import('../config.js')
      const { createApiClient, resetApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(false)

      const mockClient = {
        verifyToken: vi.fn().mockResolvedValue({
          user: fixtures.user(),
          tokenName: 'Test Token',
        }),
      }
      vi.mocked(createApiClient).mockReturnValue(mockClient as any)

      const result = await loginTool.execute({ token: 'valid-token-123' })

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('Successfully logged in')
      expect(text).toContain(fixtures.user().name)
      expect(text).toContain(fixtures.user().email)

      expect(saveConfig).toHaveBeenCalledWith({
        apiToken: 'valid-token-123',
        userId: fixtures.user().id,
        userEmail: fixtures.user().email,
      })
      expect(resetApiClient).toHaveBeenCalled()
    })

    it('should return error for invalid token', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { createApiClient } = await import('../api-client.js')
      const { AuthError } = await import('../errors.js')

      vi.mocked(isAuthenticated).mockReturnValue(false)

      const mockClient = {
        verifyToken: vi.fn().mockRejectedValue(new AuthError('Invalid token')),
      }
      vi.mocked(createApiClient).mockReturnValue(mockClient as any)

      const result = await loginTool.execute({ token: 'invalid-token' })

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('Authentication failed')
      expect(text).toContain('Invalid or expired')
    })

    it('should handle network errors', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { createApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(false)

      const mockClient = {
        verifyToken: vi.fn().mockRejectedValue(new Error('Network timeout')),
      }
      vi.mocked(createApiClient).mockReturnValue(mockClient as any)

      const result = await loginTool.execute({ token: 'some-token' })

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('Authentication failed')
      expect(text).toContain('Network timeout')
    })
  })

  describe('output format', () => {
    it('should include helpful next steps on success', async () => {
      const { isAuthenticated, saveConfig } = await import('../config.js')
      const { createApiClient, resetApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(false)

      const mockClient = {
        verifyToken: vi.fn().mockResolvedValue({
          user: fixtures.user(),
          tokenName: 'Test Token',
        }),
      }
      vi.mocked(createApiClient).mockReturnValue(mockClient as any)

      const result = await loginTool.execute({ token: 'valid-token' })
      const text = getResultText(result)

      expect(text).toContain('planflow_projects')
      expect(text).toContain('planflow_create')
      expect(text).toContain('planflow_sync')
    })
  })
})
