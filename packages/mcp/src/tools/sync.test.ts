/**
 * Integration Tests for planflow_sync tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { syncTool } from './sync.js'
import { fixtures, getResultText, isErrorResult } from '../__tests__/test-utils.js'

// Mock dependencies
vi.mock('../config.js', () => ({
  isAuthenticated: vi.fn(),
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

describe('planflow_sync', () => {
  const validProjectId = '660e8400-e29b-41d4-a716-446655440001'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('tool metadata', () => {
    it('should have correct name', () => {
      expect(syncTool.name).toBe('planflow_sync')
    })

    it('should have a description mentioning push and pull', () => {
      expect(syncTool.description).toContain('push')
      expect(syncTool.description).toContain('pull')
    })
  })

  describe('input validation', () => {
    it('should require projectId', () => {
      const result = syncTool.inputSchema.safeParse({ direction: 'push' })
      expect(result.success).toBe(false)
    })

    it('should require valid UUID for projectId', () => {
      const result = syncTool.inputSchema.safeParse({
        projectId: 'not-a-uuid',
        direction: 'push',
      })
      expect(result.success).toBe(false)
    })

    it('should require direction', () => {
      const result = syncTool.inputSchema.safeParse({ projectId: validProjectId })
      expect(result.success).toBe(false)
    })

    it('should only accept push or pull for direction', () => {
      const result = syncTool.inputSchema.safeParse({
        projectId: validProjectId,
        direction: 'invalid',
      })
      expect(result.success).toBe(false)
    })

    it('should accept valid push input', () => {
      const result = syncTool.inputSchema.safeParse({
        projectId: validProjectId,
        direction: 'push',
        content: '# Plan',
      })
      expect(result.success).toBe(true)
    })

    it('should accept valid pull input', () => {
      const result = syncTool.inputSchema.safeParse({
        projectId: validProjectId,
        direction: 'pull',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('when not authenticated', () => {
    it('should return error', async () => {
      const { isAuthenticated } = await import('../config.js')
      vi.mocked(isAuthenticated).mockReturnValue(false)

      const result = await syncTool.execute({
        projectId: validProjectId,
        direction: 'pull',
      })

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('Not logged in')
    })
  })

  describe('push operation', () => {
    it('should require content for push', async () => {
      const { isAuthenticated } = await import('../config.js')
      vi.mocked(isAuthenticated).mockReturnValue(true)

      const result = await syncTool.execute({
        projectId: validProjectId,
        direction: 'push',
        // No content provided
      })

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('Content is required')
    })

    it('should push content successfully', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        updateProjectPlan: vi.fn().mockResolvedValue({
          projectId: validProjectId,
          projectName: 'Test Project',
          plan: '# My Plan',
          updatedAt: new Date(),
        }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await syncTool.execute({
        projectId: validProjectId,
        direction: 'push',
        content: '# My Plan',
      })

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('Plan synced to cloud')
      expect(text).toContain('push')
      expect(text).toContain('Test Project')
    })

    it('should show file size info', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        updateProjectPlan: vi.fn().mockResolvedValue({
          projectId: validProjectId,
          projectName: 'Test Project',
          plan: '# Plan\n\nLine 1\nLine 2\nLine 3',
          updatedAt: new Date(),
        }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await syncTool.execute({
        projectId: validProjectId,
        direction: 'push',
        content: '# Plan\n\nLine 1\nLine 2\nLine 3',
      })

      const text = getResultText(result)
      expect(text).toContain('bytes')
      expect(text).toContain('lines')
    })
  })

  describe('pull operation', () => {
    it('should pull content successfully', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const planContent = '# Downloaded Plan\n\n## Tasks\n\n- Task 1'
      const mockClient = {
        getProjectPlan: vi.fn().mockResolvedValue({
          projectId: validProjectId,
          projectName: 'Test Project',
          plan: planContent,
          updatedAt: new Date(),
        }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await syncTool.execute({
        projectId: validProjectId,
        direction: 'pull',
      })

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('Plan retrieved from cloud')
      expect(text).toContain('pull')
      expect(text).toContain('Downloaded Plan')
    })

    it('should handle empty plan', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        getProjectPlan: vi.fn().mockResolvedValue({
          projectId: validProjectId,
          projectName: 'Empty Project',
          plan: null,
          updatedAt: new Date(),
        }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await syncTool.execute({
        projectId: validProjectId,
        direction: 'pull',
      })

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('No plan exists')
      expect(text).toContain('push')
    })
  })

  describe('error handling', () => {
    it('should handle auth errors', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')
      const { AuthError } = await import('../errors.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        getProjectPlan: vi.fn().mockRejectedValue(new AuthError('Expired')),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await syncTool.execute({
        projectId: validProjectId,
        direction: 'pull',
      })

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('Authentication error')
    })

    it('should handle project not found', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')
      const { ApiError } = await import('../errors.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        getProjectPlan: vi.fn().mockRejectedValue(new ApiError('Not found', 404)),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await syncTool.execute({
        projectId: validProjectId,
        direction: 'pull',
      })

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('Project not found')
    })

    it('should handle generic API errors', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')
      const { ApiError } = await import('../errors.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        updateProjectPlan: vi.fn().mockRejectedValue(new ApiError('Server error', 500)),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await syncTool.execute({
        projectId: validProjectId,
        direction: 'push',
        content: '# Plan',
      })

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('API error')
    })

    it('should handle network errors', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        getProjectPlan: vi.fn().mockRejectedValue(new Error('Network timeout')),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await syncTool.execute({
        projectId: validProjectId,
        direction: 'pull',
      })

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('Failed to sync plan')
    })
  })
})
