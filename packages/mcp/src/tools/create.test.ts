/**
 * Integration Tests for planflow_create tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createTool } from './create.js'
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

describe('planflow_create', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('tool metadata', () => {
    it('should have correct name', () => {
      expect(createTool.name).toBe('planflow_create')
    })

    it('should have a description', () => {
      expect(createTool.description).toBeDefined()
      expect(createTool.description).toContain('Create')
    })
  })

  describe('input validation', () => {
    it('should require name', () => {
      const result = createTool.inputSchema.safeParse({})
      expect(result.success).toBe(false)
    })

    it('should reject empty name', () => {
      const result = createTool.inputSchema.safeParse({ name: '' })
      expect(result.success).toBe(false)
    })

    it('should accept valid name', () => {
      const result = createTool.inputSchema.safeParse({ name: 'My Project' })
      expect(result.success).toBe(true)
    })

    it('should accept name with description', () => {
      const result = createTool.inputSchema.safeParse({
        name: 'My Project',
        description: 'A test project',
      })
      expect(result.success).toBe(true)
    })

    it('should reject name over 255 characters', () => {
      const result = createTool.inputSchema.safeParse({ name: 'A'.repeat(256) })
      expect(result.success).toBe(false)
    })

    it('should reject description over 1000 characters', () => {
      const result = createTool.inputSchema.safeParse({
        name: 'Valid Name',
        description: 'A'.repeat(1001),
      })
      expect(result.success).toBe(false)
    })
  })

  describe('when not authenticated', () => {
    it('should return error', async () => {
      const { isAuthenticated } = await import('../config.js')
      vi.mocked(isAuthenticated).mockReturnValue(false)

      const result = await createTool.execute({ name: 'Test Project' })

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('Not logged in')
    })
  })

  describe('when authenticated', () => {
    it('should create project successfully', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockProject = fixtures.project({ name: 'New Project' })
      const mockClient = {
        createProject: vi.fn().mockResolvedValue(mockProject),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await createTool.execute({ name: 'New Project' })

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('Project created successfully')
      expect(text).toContain('New Project')
      expect(text).toContain(mockProject.id)

      expect(mockClient.createProject).toHaveBeenCalledWith({
        name: 'New Project',
        description: undefined,
      })
    })

    it('should create project with description', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockProject = fixtures.project({
        name: 'New Project',
        description: 'A great project',
      })
      const mockClient = {
        createProject: vi.fn().mockResolvedValue(mockProject),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await createTool.execute({
        name: 'New Project',
        description: 'A great project',
      })

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('A great project')

      expect(mockClient.createProject).toHaveBeenCalledWith({
        name: 'New Project',
        description: 'A great project',
      })
    })

    it('should show (none) for missing description', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockProject = fixtures.project({ description: null })
      const mockClient = {
        createProject: vi.fn().mockResolvedValue(mockProject),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await createTool.execute({ name: 'Test' })
      const text = getResultText(result)
      expect(text).toContain('(none)')
    })

    it('should handle validation errors', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')
      const { ApiError } = await import('../errors.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        createProject: vi.fn().mockRejectedValue(new ApiError('Name already exists', 400)),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await createTool.execute({ name: 'Duplicate' })

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('Invalid project data')
    })

    it('should handle auth errors', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')
      const { AuthError } = await import('../errors.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        createProject: vi.fn().mockRejectedValue(new AuthError('Expired')),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await createTool.execute({ name: 'Test' })

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('Authentication error')
    })

    it('should handle generic API errors', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')
      const { ApiError } = await import('../errors.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        createProject: vi.fn().mockRejectedValue(new ApiError('Server error', 500)),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await createTool.execute({ name: 'Test' })

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('API error')
    })
  })

  describe('output format', () => {
    it('should include next steps', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockProject = fixtures.project()
      const mockClient = {
        createProject: vi.fn().mockResolvedValue(mockProject),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await createTool.execute({ name: 'Test' })
      const text = getResultText(result)

      expect(text).toContain('Next steps')
      expect(text).toContain('planflow_sync')
      expect(text).toContain('planflow_task_list')
      expect(text).toContain('planflow_projects')
    })

    it('should include project ID for copy', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockProject = fixtures.project()
      const mockClient = {
        createProject: vi.fn().mockResolvedValue(mockProject),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await createTool.execute({ name: 'Test' })
      const text = getResultText(result)

      expect(text).toContain('Save this project ID')
      expect(text).toContain(mockProject.id)
    })
  })
})
