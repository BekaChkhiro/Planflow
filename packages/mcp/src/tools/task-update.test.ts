/**
 * Integration Tests for planflow_task_update tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { taskUpdateTool } from './task-update.js'
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

describe('planflow_task_update', () => {
  const validProjectId = '660e8400-e29b-41d4-a716-446655440001'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('tool metadata', () => {
    it('should have correct name', () => {
      expect(taskUpdateTool.name).toBe('planflow_task_update')
    })

    it('should have a description', () => {
      expect(taskUpdateTool.description).toBeDefined()
      expect(taskUpdateTool.description).toContain('Update')
    })
  })

  describe('input validation', () => {
    it('should require projectId', () => {
      const result = taskUpdateTool.inputSchema.safeParse({
        taskId: 'T1.1',
        status: 'DONE',
      })
      expect(result.success).toBe(false)
    })

    it('should require valid UUID for projectId', () => {
      const result = taskUpdateTool.inputSchema.safeParse({
        projectId: 'invalid',
        taskId: 'T1.1',
        status: 'DONE',
      })
      expect(result.success).toBe(false)
    })

    it('should require taskId', () => {
      const result = taskUpdateTool.inputSchema.safeParse({
        projectId: validProjectId,
        status: 'DONE',
      })
      expect(result.success).toBe(false)
    })

    it('should require status', () => {
      const result = taskUpdateTool.inputSchema.safeParse({
        projectId: validProjectId,
        taskId: 'T1.1',
      })
      expect(result.success).toBe(false)
    })

    it('should accept valid status values', () => {
      for (const status of ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED']) {
        const result = taskUpdateTool.inputSchema.safeParse({
          projectId: validProjectId,
          taskId: 'T1.1',
          status,
        })
        expect(result.success).toBe(true)
      }
    })

    it('should reject invalid status', () => {
      const result = taskUpdateTool.inputSchema.safeParse({
        projectId: validProjectId,
        taskId: 'T1.1',
        status: 'INVALID',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('when not authenticated', () => {
    it('should return error', async () => {
      const { isAuthenticated } = await import('../config.js')
      vi.mocked(isAuthenticated).mockReturnValue(false)

      const result = await taskUpdateTool.execute({
        projectId: validProjectId,
        taskId: 'T1.1',
        status: 'DONE',
      })

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('Not logged in')
    })
  })

  describe('when authenticated', () => {
    it('should update task to IN_PROGRESS', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockTask = fixtures.task({ status: 'IN_PROGRESS' })
      const mockClient = {
        updateTaskStatus: vi.fn().mockResolvedValue(mockTask),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await taskUpdateTool.execute({
        projectId: validProjectId,
        taskId: 'T1.1',
        status: 'IN_PROGRESS',
      })

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('IN_PROGRESS')
      expect(text).toContain('When finished')
    })

    it('should update task to DONE', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockTask = fixtures.task({ status: 'DONE' })
      const mockClient = {
        updateTaskStatus: vi.fn().mockResolvedValue(mockTask),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await taskUpdateTool.execute({
        projectId: validProjectId,
        taskId: 'T1.1',
        status: 'DONE',
      })

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('DONE')
      expect(text).toContain('Great work')
    })

    it('should update task to BLOCKED', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockTask = fixtures.task({ status: 'BLOCKED' })
      const mockClient = {
        updateTaskStatus: vi.fn().mockResolvedValue(mockTask),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await taskUpdateTool.execute({
        projectId: validProjectId,
        taskId: 'T1.1',
        status: 'BLOCKED',
      })

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('BLOCKED')
      expect(text).toContain('Task blocked')
      expect(text).toContain('What is blocking')
    })

    it('should handle task not found', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        updateTaskStatus: vi.fn().mockResolvedValue(null),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await taskUpdateTool.execute({
        projectId: validProjectId,
        taskId: 'T99.99',
        status: 'DONE',
      })

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('Failed to update task')
    })

    it('should handle auth errors', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')
      const { AuthError } = await import('../errors.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        updateTaskStatus: vi.fn().mockRejectedValue(new AuthError('Expired')),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await taskUpdateTool.execute({
        projectId: validProjectId,
        taskId: 'T1.1',
        status: 'DONE',
      })

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('Authentication error')
    })

    it('should handle 404 API errors', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')
      const { ApiError } = await import('../errors.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        updateTaskStatus: vi.fn().mockRejectedValue(new ApiError('Task not found', 404)),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await taskUpdateTool.execute({
        projectId: validProjectId,
        taskId: 'T1.1',
        status: 'DONE',
      })

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('Task not found')
    })
  })

  describe('output format', () => {
    it('should display task details', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockTask = fixtures.task({
        taskId: 'T1.1',
        name: 'Test Task',
        status: 'DONE',
        complexity: 'Medium',
        estimatedHours: 4,
        dependencies: ['T1.0'],
      })
      const mockClient = {
        updateTaskStatus: vi.fn().mockResolvedValue(mockTask),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await taskUpdateTool.execute({
        projectId: validProjectId,
        taskId: 'T1.1',
        status: 'DONE',
      })

      const text = getResultText(result)
      expect(text).toContain('T1.1')
      expect(text).toContain('Test Task')
      expect(text).toContain('Medium')
      expect(text).toContain('4h')
      expect(text).toContain('T1.0')
    })

    it('should include next steps', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockTask = fixtures.task({ status: 'DONE' })
      const mockClient = {
        updateTaskStatus: vi.fn().mockResolvedValue(mockTask),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await taskUpdateTool.execute({
        projectId: validProjectId,
        taskId: 'T1.1',
        status: 'DONE',
      })

      const text = getResultText(result)
      expect(text).toContain('planflow_task_list')
      expect(text).toContain('planflow_sync')
    })
  })
})
