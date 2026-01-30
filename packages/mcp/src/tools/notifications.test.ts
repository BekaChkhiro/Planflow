/**
 * Integration Tests for planflow_notifications tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { notificationsTool } from './notifications.js'
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

describe('planflow_notifications', () => {
  const validProjectId = '660e8400-e29b-41d4-a716-446655440001'
  const validNotificationId = '880e8400-e29b-41d4-a716-446655440003'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('tool metadata', () => {
    it('should have correct name', () => {
      expect(notificationsTool.name).toBe('planflow_notifications')
    })

    it('should have a description', () => {
      expect(notificationsTool.description).toBeDefined()
      expect(notificationsTool.description).toContain('notification')
    })
  })

  describe('input validation', () => {
    it('should accept empty object (defaults)', () => {
      const result = notificationsTool.inputSchema.safeParse({})
      expect(result.success).toBe(true)
    })

    it('should accept list action', () => {
      const result = notificationsTool.inputSchema.safeParse({ action: 'list' })
      expect(result.success).toBe(true)
    })

    it('should accept read action with notificationId', () => {
      const result = notificationsTool.inputSchema.safeParse({
        action: 'read',
        notificationId: validNotificationId,
      })
      expect(result.success).toBe(true)
    })

    it('should accept read-all action', () => {
      const result = notificationsTool.inputSchema.safeParse({ action: 'read-all' })
      expect(result.success).toBe(true)
    })

    it('should reject invalid action', () => {
      const result = notificationsTool.inputSchema.safeParse({ action: 'invalid' })
      expect(result.success).toBe(false)
    })

    it('should accept projectId filter', () => {
      const result = notificationsTool.inputSchema.safeParse({ projectId: validProjectId })
      expect(result.success).toBe(true)
    })

    it('should reject invalid projectId', () => {
      const result = notificationsTool.inputSchema.safeParse({ projectId: 'invalid' })
      expect(result.success).toBe(false)
    })

    it('should accept unreadOnly filter', () => {
      const result = notificationsTool.inputSchema.safeParse({ unreadOnly: false })
      expect(result.success).toBe(true)
    })

    it('should accept limit', () => {
      const result = notificationsTool.inputSchema.safeParse({ limit: 50 })
      expect(result.success).toBe(true)
    })

    it('should reject limit over 100', () => {
      const result = notificationsTool.inputSchema.safeParse({ limit: 101 })
      expect(result.success).toBe(false)
    })
  })

  describe('when not authenticated', () => {
    it('should return error', async () => {
      const { isAuthenticated } = await import('../config.js')
      vi.mocked(isAuthenticated).mockReturnValue(false)

      const result = await notificationsTool.execute({})

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('Not logged in')
    })
  })

  describe('list action', () => {
    it('should show empty state', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        listNotifications: vi.fn().mockResolvedValue({
          notifications: [],
          unreadCount: 0,
          totalCount: 0,
        }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await notificationsTool.execute({})

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('No')
      expect(text).toContain('notification')
    })

    it('should list notifications', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockNotifications = [
        fixtures.notification({ type: 'status_change', message: 'Task completed' }),
        fixtures.notification({ type: 'comment', message: 'New comment on task' }),
      ]

      const mockClient = {
        listNotifications: vi.fn().mockResolvedValue({
          notifications: mockNotifications,
          unreadCount: 2,
          totalCount: 2,
        }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await notificationsTool.execute({})

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('Notifications')
      expect(text).toContain('Task completed')
      expect(text).toContain('Unread: 2')
    })

    it('should filter by project', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        listNotifications: vi.fn().mockResolvedValue({
          notifications: [fixtures.notification()],
          unreadCount: 1,
          totalCount: 1,
        }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      // Parse through Zod to apply defaults (simulating MCP server behavior)
      const parsed = notificationsTool.inputSchema.parse({ projectId: validProjectId })
      await notificationsTool.execute(parsed)

      expect(mockClient.listNotifications).toHaveBeenCalledWith({
        projectId: validProjectId,
        unreadOnly: true,
        limit: 20,
      })
    })

    it('should filter by unreadOnly', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        listNotifications: vi.fn().mockResolvedValue({
          notifications: [],
          unreadCount: 0,
          totalCount: 5,
        }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      // Parse through Zod to apply defaults (simulating MCP server behavior)
      const parsed = notificationsTool.inputSchema.parse({ unreadOnly: false })
      await notificationsTool.execute(parsed)

      expect(mockClient.listNotifications).toHaveBeenCalledWith({
        projectId: undefined,
        unreadOnly: false,
        limit: 20,
      })
    })
  })

  describe('read action', () => {
    it('should require notificationId', async () => {
      const { isAuthenticated } = await import('../config.js')
      vi.mocked(isAuthenticated).mockReturnValue(true)

      const result = await notificationsTool.execute({ action: 'read' })

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('Missing notificationId')
    })

    it('should mark notification as read', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockNotification = fixtures.notification({ read: true })
      const mockClient = {
        markNotificationRead: vi.fn().mockResolvedValue({
          notification: mockNotification,
        }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await notificationsTool.execute({
        action: 'read',
        notificationId: validNotificationId,
      })

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('marked as read')
    })

    it('should handle notification not found', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')
      const { ApiError } = await import('../errors.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        markNotificationRead: vi.fn().mockRejectedValue(new ApiError('Not found', 404)),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await notificationsTool.execute({
        action: 'read',
        notificationId: validNotificationId,
      })

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('Notification not found')
    })
  })

  describe('read-all action', () => {
    it('should mark all as read', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        markAllNotificationsRead: vi.fn().mockResolvedValue({ markedCount: 5 }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await notificationsTool.execute({ action: 'read-all' })

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('Marked 5 notification')
      expect(text).toContain('all caught up')
    })

    it('should mark all for project', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        markAllNotificationsRead: vi.fn().mockResolvedValue({ markedCount: 2 }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await notificationsTool.execute({
        action: 'read-all',
        projectId: validProjectId,
      })

      expect(isErrorResult(result)).toBe(false)
      const text = getResultText(result)
      expect(text).toContain('for this project')
      expect(mockClient.markAllNotificationsRead).toHaveBeenCalledWith(validProjectId)
    })

    it('should handle singular notification', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        markAllNotificationsRead: vi.fn().mockResolvedValue({ markedCount: 1 }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await notificationsTool.execute({ action: 'read-all' })

      const text = getResultText(result)
      expect(text).toContain('1 notification')
      expect(text).not.toContain('1 notifications')
    })
  })

  describe('error handling', () => {
    it('should handle auth errors', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')
      const { AuthError } = await import('../errors.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        listNotifications: vi.fn().mockRejectedValue(new AuthError('Expired')),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await notificationsTool.execute({})

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
        listNotifications: vi.fn().mockRejectedValue(new ApiError('Server error', 500)),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await notificationsTool.execute({})

      expect(isErrorResult(result)).toBe(true)
      const text = getResultText(result)
      expect(text).toContain('API error')
    })
  })

  describe('output format', () => {
    it('should show notification type emojis', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockNotifications = [
        fixtures.notification({ type: 'comment' }),
        fixtures.notification({ type: 'status_change' }),
        fixtures.notification({ type: 'task_assigned' }),
      ]

      const mockClient = {
        listNotifications: vi.fn().mockResolvedValue({
          notifications: mockNotifications,
          unreadCount: 3,
          totalCount: 3,
        }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await notificationsTool.execute({})
      const text = getResultText(result)

      // Check for type-specific emojis
      expect(text).toMatch(/[💬🔄👤]/)
    })

    it('should include helpful commands', async () => {
      const { isAuthenticated } = await import('../config.js')
      const { getApiClient } = await import('../api-client.js')

      vi.mocked(isAuthenticated).mockReturnValue(true)

      const mockClient = {
        listNotifications: vi.fn().mockResolvedValue({
          notifications: [fixtures.notification()],
          unreadCount: 1,
          totalCount: 1,
        }),
      }
      vi.mocked(getApiClient).mockReturnValue(mockClient as any)

      const result = await notificationsTool.execute({})
      const text = getResultText(result)

      expect(text).toContain('planflow_notifications')
      expect(text).toContain('read')
    })
  })
})
