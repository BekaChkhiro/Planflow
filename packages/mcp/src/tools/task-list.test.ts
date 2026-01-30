/**
 * Integration Tests for planflow_task_list tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { taskListTool } from './task-list.js'
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

describe('planflow_task_list', () => {
  const validProjectId = '660e8400-e29b-41d4-a716-446655440001'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('tool metadata', () => {
    it('should have correct name', () => {
      expect(taskListTool.name).toBe('planflow_task_list')
    })

    it('should have a description', () => {
      expect(taskListTool.description).toBeDefined()
      expect(taskListTool.description).toContain('List')
    })
  })

  describe('input validation', () => {
    it('should require projectId', () => {
      const result = taskListTool.inputSchema.safeParse({})
      expect(result.success).toBe(false)
    })

    it('should require valid UUID for projectId', () => {
      const result = taskListTool.inputSchema.safeParse({ projectId: 'invalid' })
      expect(result.success).toBe(false)
    })

    it('should accept valid projectId', () => {
      const result = taskListTool.inputSchema.safeParse({ projectId: validProjectId })
      expect(result.success).toBe(true)
    })

    it('should accept valid status filter', () => {
      const result = taskListTool.inputSchema.safeParse({
        projectId: validProjectId,
        status: 'TODO',
      })
      expect(result.success).toBe(true)
    })

    it('should reject invalid status', () => {
      const result = taskListTool.inputSchema.safeParse({
        projectId: validProjectId,
        status: 'INVALID',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('when not authenticated', () => {
    it('should return error', async () => {
      const { isAuthenticated } = await import('../config.js')
      vi.mocked(isAuthenticated).mockReturnValue(false)

      const result = await taskListTool.execute({ projectId: validProjectId })

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('Not logged in')
    })
  })

  describe('when authenticated', () => {
    it('should return empty state when no tasks', async () => {
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

      const result = await taskListTool.execute({ projectId: validProjectId })

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('No tasks found')
      expect(text).toContain('planflow_sync')
    })

    it('should display tasks in table format', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockTasks = [
        fixtures.task({ taskId: 'T1.1', name: 'First Task', status: 'DONE' }),
        fixtures.task({ taskId: 'T1.2', name: 'Second Task', status: 'IN_PROGRESS' }),
        fixtures.task({ taskId: 'T1.3', name: 'Third Task', status: 'TODO' }),
      ]

      const mockClient = {
        listTasks: vi.fn().mockResolvedValue({
          projectId: validProjectId,
          projectName: 'Test Project',
          tasks: mockTasks,
        }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await taskListTool.execute({ projectId: validProjectId })

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('Test Project')
      expect(text).toContain('T1.1')
      expect(text).toContain('T1.2')
      expect(text).toContain('T1.3')
      expect(text).toContain('First Task')
      expect(text).toContain('Second Task')
    })

    it('should filter by status', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockTasks = [
        fixtures.task({ taskId: 'T1.1', name: 'Done Task', status: 'DONE' }),
        fixtures.task({ taskId: 'T1.2', name: 'Todo Task', status: 'TODO' }),
      ]

      const mockClient = {
        listTasks: vi.fn().mockResolvedValue({
          projectId: validProjectId,
          projectName: 'Test Project',
          tasks: mockTasks,
        }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await taskListTool.execute({
        projectId: validProjectId,
        status: 'TODO',
      })

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('filtered: TODO')
      expect(text).toContain('Todo Task')
      // The table should only show filtered tasks
    })

    it('should show progress bar and stats', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockTasks = [
        fixtures.task({ taskId: 'T1.1', status: 'DONE' }),
        fixtures.task({ taskId: 'T1.2', status: 'DONE' }),
        fixtures.task({ taskId: 'T1.3', status: 'TODO' }),
        fixtures.task({ taskId: 'T1.4', status: 'TODO' }),
      ]

      const mockClient = {
        listTasks: vi.fn().mockResolvedValue({
          projectId: validProjectId,
          projectName: 'Test Project',
          tasks: mockTasks,
        }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await taskListTool.execute({ projectId: validProjectId })
      const text = getResultText(result)

      expect(text).toContain('Progress:')
      expect(text).toContain('50%')
      expect(text).toContain('Total: 4')
    })

    it('should sort tasks by ID', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      // Return tasks in random order
      const mockTasks = [
        fixtures.task({ taskId: 'T2.1', name: 'Phase 2 Task' }),
        fixtures.task({ taskId: 'T1.3', name: 'Third Task' }),
        fixtures.task({ taskId: 'T1.1', name: 'First Task' }),
      ]

      const mockClient = {
        listTasks: vi.fn().mockResolvedValue({
          projectId: validProjectId,
          projectName: 'Test Project',
          tasks: mockTasks,
        }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await taskListTool.execute({ projectId: validProjectId })
      const text = getResultText(result)

      // Verify tasks appear in sorted order
      const t11Index = text.indexOf('T1.1')
      const t13Index = text.indexOf('T1.3')
      const t21Index = text.indexOf('T2.1')

      expect(t11Index).toBeLessThan(t13Index)
      expect(t13Index).toBeLessThan(t21Index)
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

      const result = await taskListTool.execute({ projectId: validProjectId })

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

      const result = await taskListTool.execute({ projectId: validProjectId })

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('Project not found')
    })
  })
})
