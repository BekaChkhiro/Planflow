/**
 * Integration Tests for planflow_projects tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { projectsTool } from './projects.js'
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

describe('planflow_projects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('tool metadata', () => {
    it('should have correct name', () => {
      expect(projectsTool.name).toBe('planflow_projects')
    })

    it('should have a description', () => {
      expect(projectsTool.description).toBeDefined()
      expect(projectsTool.description).toContain('List')
    })
  })

  describe('input validation', () => {
    it('should accept empty object', () => {
      const result = projectsTool.inputSchema.safeParse({})
      expect(result.success).toBe(true)
    })
  })

  describe('when not authenticated', () => {
    it('should return error', async () => {
      const { isAuthenticated } = await import('../config.js')
      vi.mocked(isAuthenticated).mockReturnValue(false)

      const result = await projectsTool.execute({})

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('Not logged in')
    })
  })

  describe('when authenticated', () => {
    it('should return empty state message when no projects', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        listProjects: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await projectsTool.execute({})

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('No projects found')
      expect(text).toContain('planflow_create')
    })

    it('should return projects list', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockProjects = [
        fixtures.project({ name: 'Project Alpha', description: 'First project' }),
        fixtures.project({ id: '770e8400-e29b-41d4-a716-446655440002', name: 'Project Beta', description: 'Second project' }),
      ]

      const mockClient = {
        listProjects: vi.fn().mockResolvedValue(mockProjects),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await projectsTool.execute({})

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('Your Projects (2)')
      expect(text).toContain('Project Alpha')
      expect(text).toContain('Project Beta')
    })

    it('should truncate long descriptions', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const longDescription = 'A'.repeat(100)
      const mockProjects = [
        fixtures.project({ description: longDescription }),
      ]

      const mockClient = {
        listProjects: vi.fn().mockResolvedValue(mockProjects),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await projectsTool.execute({})

      const text = getResultText(result)
      expect(text).toContain('...')
    })

    it('should show full project IDs at the end', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const project = fixtures.project()
      const mockClient = {
        listProjects: vi.fn().mockResolvedValue([project]),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await projectsTool.execute({})

      const text = getResultText(result)
      expect(text).toContain('Full project IDs')
      expect(text).toContain(project.id)
    })

    it('should handle auth errors', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')
      const { AuthError } = await import('../errors.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        listProjects: vi.fn().mockRejectedValue(new AuthError('Expired')),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await projectsTool.execute({})

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('Authentication error')
    })

    it('should handle API errors', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')
      const { ApiError } = await import('../errors.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        listProjects: vi.fn().mockRejectedValue(new ApiError('Server error', 500)),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await projectsTool.execute({})

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('API error')
    })
  })

  describe('output format', () => {
    it('should include helpful commands', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        listProjects: vi.fn().mockResolvedValue([fixtures.project()]),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await projectsTool.execute({})
      const text = getResultText(result)

      expect(text).toContain('planflow_sync')
      expect(text).toContain('planflow_task_list')
      expect(text).toContain('planflow_create')
    })
  })
})
