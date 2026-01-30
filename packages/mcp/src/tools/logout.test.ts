/**
 * Integration Tests for planflow_logout tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logoutTool } from './logout.js'
import { fixtures, getResultText, isErrorResult } from '../__tests__/test-utils.js'

// Mock dependencies
vi.mock('../config.js', () => ({
  isAuthenticated: vi.fn(),
  loadConfig: vi.fn(),
  clearCredentials: vi.fn(),
}))

vi.mock('../api-client.js', () => ({
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

describe('planflow_logout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('tool metadata', () => {
    it('should have correct name', () => {
      expect(logoutTool.name).toBe('planflow_logout')
    })

    it('should have a description', () => {
      expect(logoutTool.description).toBeDefined()
      expect(logoutTool.description.length).toBeGreaterThan(0)
    })

    it('should have input schema for empty object', () => {
      expect(logoutTool.inputSchema).toBeDefined()
    })
  })

  describe('input validation', () => {
    it('should accept empty object', () => {
      const result = logoutTool.inputSchema.safeParse({})
      expect(result.success).toBe(true)
    })

    it('should reject undefined (Zod requires object)', () => {
      const result = logoutTool.inputSchema.safeParse(undefined)
      // Zod object schema doesn't accept undefined
      expect(result.success).toBe(false)
    })
  })

  describe('when not authenticated', () => {
    it('should return not logged in error', async () => {
      const { isAuthenticated } = await import('../config.js')
      vi.mocked(isAuthenticated).mockReturnValue(false)

      const result = await logoutTool.execute({})

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('Not currently logged in')
    })
  })

  describe('when authenticated', () => {
    it('should successfully logout', async () => {
      const { isAuthenticated, loadConfig, clearCredentials } = await import('../config.js')
      const { resetApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)
      vi.mocked(loadConfig).mockReturnValue({
        apiToken: 'mock-token',
        apiUrl: 'https://api.planflow.dev',
        userId: fixtures.user().id,
        userEmail: fixtures.user().email,
      })

      const result = await logoutTool.execute({})

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('Successfully logged out')
      expect(text).toContain(fixtures.user().email)

      expect(clearCredentials).toHaveBeenCalled()
      expect(resetApiClient).toHaveBeenCalled()
    })

    it('should include login instructions after logout', async () => {
      const { isAuthenticated, loadConfig, clearCredentials } = await import('../config.js')
      const { resetApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)
      vi.mocked(loadConfig).mockReturnValue({
        apiToken: 'mock-token',
        apiUrl: 'https://api.planflow.dev',
        userId: fixtures.user().id,
        userEmail: fixtures.user().email,
      })

      const result = await logoutTool.execute({})
      const text = getResultText(result)

      expect(text).toContain('planflow_login')
    })
  })
})
