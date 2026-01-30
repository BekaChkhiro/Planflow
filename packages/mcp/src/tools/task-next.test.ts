/**
 * Integration Tests for planflow_task_next tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { taskNextTool } from './task-next.js'
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

describe('planflow_task_next', () => {
  const validProjectId = '660e8400-e29b-41d4-a716-446655440001'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('tool metadata', () => {
    it('should have correct name', () => {
      expect(taskNextTool.name).toBe('planflow_task_next')
    })

    it('should have a description mentioning recommendation', () => {
      expect(taskNextTool.description).toContain('recommend')
    })
  })

  describe('input validation', () => {
    it('should require projectId', () => {
      const result = taskNextTool.inputSchema.safeParse({})
      expect(result.success).toBe(false)
    })

    it('should require valid UUID for projectId', () => {
      const result = taskNextTool.inputSchema.safeParse({ projectId: 'invalid' })
      expect(result.success).toBe(false)
    })

    it('should accept valid projectId', () => {
      const result = taskNextTool.inputSchema.safeParse({ projectId: validProjectId })
      expect(result.success).toBe(true)
    })
  })

  describe('when not authenticated', () => {
    it('should return error', async () => {
      const { isAuthenticated } = await import('../config.js')
      vi.mocked(isAuthenticated).mockReturnValue(false)

      const result = await taskNextTool.execute({ projectId: validProjectId })

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('Not logged in')
    })
  })

  describe('when authenticated', () => {
    it('should handle empty tasks', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        listTasks: vi.fn().mockResolvedValue({
          projectId: validProjectId,
          projectName: 'Test Project',
          tasks: [],
        }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await taskNextTool.execute({ projectId: validProjectId })

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('No tasks found')
      expect(text).toContain('planflow_sync')
    })

    it('should recommend task when available', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockTasks = [
        fixtures.task({ taskId: 'T1.1', name: 'First Task', status: 'TODO', dependencies: [] }),
        fixtures.task({ taskId: 'T1.2', name: 'Second Task', status: 'TODO', dependencies: ['T1.1'] }),
      ]

      const mockClient = {
        listTasks: vi.fn().mockResolvedValue({
          projectId: validProjectId,
          projectName: 'Test Project',
          tasks: mockTasks,
        }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await taskNextTool.execute({ projectId: validProjectId })

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('Recommended Next Task')
      expect(text).toContain('T1.1')
      expect(text).toContain('First Task')
    })

    it('should show all complete message', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockTasks = [
        fixtures.task({ taskId: 'T1.1', status: 'DONE' }),
        fixtures.task({ taskId: 'T1.2', status: 'DONE' }),
      ]

      const mockClient = {
        listTasks: vi.fn().mockResolvedValue({
          projectId: validProjectId,
          projectName: 'Test Project',
          tasks: mockTasks,
        }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await taskNextTool.execute({ projectId: validProjectId })

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('Congratulations')
      expect(text).toContain('All tasks completed')
      expect(text).toContain('100%')
    })

    it('should show no available when all blocked or waiting', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockTasks = [
        fixtures.task({ taskId: 'T1.1', status: 'IN_PROGRESS' }),
        fixtures.task({ taskId: 'T1.2', status: 'TODO', dependencies: ['T1.1'] }),
      ]

      const mockClient = {
        listTasks: vi.fn().mockResolvedValue({
          projectId: validProjectId,
          projectName: 'Test Project',
          tasks: mockTasks,
        }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await taskNextTool.execute({ projectId: validProjectId })

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('No tasks currently available')
      expect(text).toContain('In Progress')
    })

    it('should warn about many in-progress tasks', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockTasks = [
        fixtures.task({ taskId: 'T1.1', status: 'IN_PROGRESS' }),
        fixtures.task({ taskId: 'T1.2', status: 'IN_PROGRESS' }),
        fixtures.task({ taskId: 'T1.3', status: 'IN_PROGRESS' }),
        fixtures.task({ taskId: 'T1.4', status: 'TODO', dependencies: [] }),
      ]

      const mockClient = {
        listTasks: vi.fn().mockResolvedValue({
          projectId: validProjectId,
          projectName: 'Test Project',
          tasks: mockTasks,
        }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await taskNextTool.execute({ projectId: validProjectId })

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('3 tasks in progress')
      expect(text).toContain('Consider finishing')
    })

    it('should prioritize tasks that unlock others', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockTasks = [
        fixtures.task({ taskId: 'T1.1', name: 'Unlocks None', status: 'TODO', dependencies: [] }),
        fixtures.task({ taskId: 'T1.2', name: 'Unlocks Many', status: 'TODO', dependencies: [] }),
        fixtures.task({ taskId: 'T1.3', status: 'TODO', dependencies: ['T1.2'] }),
        fixtures.task({ taskId: 'T1.4', status: 'TODO', dependencies: ['T1.2'] }),
      ]

      const mockClient = {
        listTasks: vi.fn().mockResolvedValue({
          projectId: validProjectId,
          projectName: 'Test Project',
          tasks: mockTasks,
        }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await taskNextTool.execute({ projectId: validProjectId })

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('Unlocks Many')
      expect(text).toContain('Unlocks 2')
    })

    it('should show alternatives', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockTasks = [
        fixtures.task({ taskId: 'T1.1', name: 'First', status: 'TODO', dependencies: [] }),
        fixtures.task({ taskId: 'T1.2', name: 'Second', status: 'TODO', dependencies: [] }),
        fixtures.task({ taskId: 'T1.3', name: 'Third', status: 'TODO', dependencies: [] }),
      ]

      const mockClient = {
        listTasks: vi.fn().mockResolvedValue({
          projectId: validProjectId,
          projectName: 'Test Project',
          tasks: mockTasks,
        }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await taskNextTool.execute({ projectId: validProjectId })

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('Alternative Tasks')
    })

    it('should show progress context', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockTasks = [
        fixtures.task({ taskId: 'T1.1', status: 'DONE' }),
        fixtures.task({ taskId: 'T1.2', status: 'TODO', dependencies: [] }),
      ]

      const mockClient = {
        listTasks: vi.fn().mockResolvedValue({
          projectId: validProjectId,
          projectName: 'Test Project',
          tasks: mockTasks,
        }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await taskNextTool.execute({ projectId: validProjectId })

      const text = getResultText(result)
      expect(text).toContain('Progress:')
      expect(text).toContain('50%')
    })

    it('should handle auth errors', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')
      const { AuthError } = await import('../errors.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        listTasks: vi.fn().mockRejectedValue(new AuthError('Expired')),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await taskNextTool.execute({ projectId: validProjectId })

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
        listTasks: vi.fn().mockRejectedValue(new ApiError('Not found', 404)),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await taskNextTool.execute({ projectId: validProjectId })

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('Project not found')
    })
  })
})
