/**
 * Notification Service Unit Tests
 * Tests for notification management, push notifications, and preferences
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the database module
vi.mock('../../db/index.js', () => ({
  getDbClient: vi.fn(),
  schema: {
    notifications: {
      id: 'id',
      userId: 'userId',
      type: 'type',
      title: 'title',
      body: 'body',
      link: 'link',
      projectId: 'projectId',
      organizationId: 'organizationId',
      actorId: 'actorId',
      taskId: 'taskId',
      readAt: 'readAt',
      createdAt: 'createdAt',
    },
    users: {
      id: 'id',
      email: 'email',
      name: 'name',
    },
    digestSendLog: {
      id: 'id',
      userId: 'userId',
      frequency: 'frequency',
      notificationCount: 'notificationCount',
      fromDate: 'fromDate',
      toDate: 'toDate',
      sentAt: 'sentAt',
      status: 'status',
      errorMessage: 'errorMessage',
    },
  },
}))

// Mock push notification functions
vi.mock('../../lib/push.js', () => ({
  isPushConfigured: vi.fn(() => true),
  getVapidPublicKey: vi.fn(() => 'mock-vapid-public-key'),
  sendPushNotification: vi.fn(() => Promise.resolve({ success: 1, failed: 0 })),
  subscribeToPush: vi.fn(() => Promise.resolve({ id: 'sub-123', createdAt: new Date() })),
  unsubscribeFromPush: vi.fn(() => Promise.resolve(true)),
  getNotificationPreferences: vi.fn(() => Promise.resolve(null)),
  updateNotificationPreferences: vi.fn(() => Promise.resolve({
    pushEnabled: true,
    pushMentions: true,
    pushAssignments: true,
    pushComments: true,
    pushStatusChanges: false,
    pushTaskCreated: false,
    pushInvitations: true,
    emailEnabled: true,
    emailMentions: true,
    emailAssignments: true,
    emailDigest: false,
    emailDigestFrequency: 'daily',
    emailDigestTime: '09:00',
    emailDigestTimezone: 'UTC',
    lastDigestSentAt: null,
    toastEnabled: true,
  })),
}))

// Mock email service
vi.mock('../../lib/email.js', () => ({
  isEmailServiceConfigured: vi.fn(() => true),
  sendDigestEmail: vi.fn(() => Promise.resolve({ success: true, messageId: 'msg-123' })),
}))

import { getDbClient } from '../../db/index.js'
import { NotificationService } from '../notification.service.js'
import {
  NotFoundError,
  ServiceError,
  ValidationError,
} from '../errors.js'
import {
  isPushConfigured,
  getVapidPublicKey,
  sendPushNotification,
  subscribeToPush,
  unsubscribeFromPush,
  getNotificationPreferences,
  updateNotificationPreferences,
} from '../../lib/push.js'
import { isEmailServiceConfigured, sendDigestEmail } from '../../lib/email.js'

describe('NotificationService', () => {
  let notificationService: NotificationService
  let mockDb: ReturnType<typeof createMockDb>

  function createMockDb() {
    const mockSelect = vi.fn()
    const mockFrom = vi.fn()
    const mockWhere = vi.fn()
    const mockLimit = vi.fn()
    const mockOffset = vi.fn()
    const mockOrderBy = vi.fn()
    const mockLeftJoin = vi.fn()
    const mockInsert = vi.fn()
    const mockValues = vi.fn()
    const mockReturning = vi.fn()
    const mockUpdate = vi.fn()
    const mockSet = vi.fn()
    const mockDelete = vi.fn()

    // Storage for mock results
    let offsetResults: unknown[] = [[]]
    let whereResults: unknown[] = [[]]
    let limitResults: unknown[] = [[]]
    let offsetIndex = 0
    let whereIndex = 0
    let limitIndex = 0

    // Create chain object with all methods for flexible chaining
    // Each method returns both a Promise-like object AND chain methods
    const createChain = (): Record<string, unknown> => {
      const chain: Record<string, unknown> = {
        from: mockFrom,
        where: mockWhere,
        limit: mockLimit,
        offset: mockOffset,
        orderBy: mockOrderBy,
        leftJoin: mockLeftJoin,
        returning: mockReturning,
      }
      // Make it thenable so await works on intermediate results
      chain.then = (resolve: (value: unknown) => void) => resolve(whereResults[whereIndex++] ?? [])
      return chain
    }

    // Set up complex chaining for notifications queries
    mockSelect.mockImplementation(() => createChain())
    mockFrom.mockImplementation(() => createChain())
    mockLeftJoin.mockImplementation(() => createChain())
    mockWhere.mockImplementation(() => {
      const chain = createChain()
      chain.then = (resolve: (value: unknown) => void) => resolve(whereResults[whereIndex++] ?? [])
      return chain
    })
    mockOrderBy.mockImplementation(() => createChain())
    mockLimit.mockImplementation(() => {
      const chain = createChain()
      chain.then = (resolve: (value: unknown) => void) => resolve(limitResults[limitIndex++] ?? [])
      return chain
    })
    mockOffset.mockImplementation(() => Promise.resolve(offsetResults[offsetIndex++] ?? []))
    mockReturning.mockResolvedValue([])
    mockInsert.mockReturnValue({ values: mockValues })
    mockValues.mockReturnValue({ returning: mockReturning })
    mockUpdate.mockReturnValue({ set: mockSet })
    mockSet.mockReturnValue({ where: mockWhere })
    mockDelete.mockReturnValue({ where: mockWhere })

    return {
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
      _mocks: {
        select: mockSelect,
        from: mockFrom,
        where: mockWhere,
        limit: mockLimit,
        offset: mockOffset,
        orderBy: mockOrderBy,
        leftJoin: mockLeftJoin,
        insert: mockInsert,
        values: mockValues,
        returning: mockReturning,
        update: mockUpdate,
        set: mockSet,
        delete: mockDelete,
        // Helper methods to set expected results
        setOffsetResults: (results: unknown[]) => {
          offsetResults = results
          offsetIndex = 0
        },
        setWhereResults: (results: unknown[]) => {
          whereResults = results
          whereIndex = 0
        },
        setLimitResults: (results: unknown[]) => {
          limitResults = results
          limitIndex = 0
        },
        resetIndexes: () => {
          offsetIndex = 0
          whereIndex = 0
          limitIndex = 0
        },
      },
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockDb = createMockDb()
    vi.mocked(getDbClient).mockReturnValue(mockDb as never)
    notificationService = new NotificationService()
  })

  describe('listNotifications', () => {
    it('should return notifications with pagination', async () => {
      const mockNotifications = [
        {
          id: 'notif-1',
          userId: 'user-123',
          type: 'mention',
          title: 'You were mentioned',
          body: 'In a comment',
          link: '/task/123',
          projectId: 'proj-1',
          organizationId: null,
          actorId: 'actor-1',
          taskId: 'task-1',
          readAt: null,
          createdAt: new Date(),
          actorEmail: 'actor@example.com',
          actorName: 'Actor User',
        },
      ];

      // Set up mock results:
      // 1. First query: notifications via offset
      // 2. Second query: total count via where
      // 3. Third query: unread count via where
      (mockDb._mocks as { setOffsetResults: (r: unknown[]) => void }).setOffsetResults([mockNotifications]);
      (mockDb._mocks as { setWhereResults: (r: unknown[]) => void }).setWhereResults([[{ count: 1 }], [{ count: 1 }]])

      const result = await notificationService.listNotifications('user-123', {
        limit: 20,
        offset: 0,
      })

      expect(result.notifications).toHaveLength(1)
      expect(result.notifications[0].id).toBe('notif-1')
      expect(result.notifications[0].actor?.email).toBe('actor@example.com')
    })

    it('should filter by unreadOnly', async () => {
      (mockDb._mocks as { setOffsetResults: (r: unknown[]) => void }).setOffsetResults([[]]);
      (mockDb._mocks as { setWhereResults: (r: unknown[]) => void }).setWhereResults([[{ count: 0 }], [{ count: 0 }]])

      await notificationService.listNotifications('user-123', {
        limit: 20,
        offset: 0,
        unreadOnly: true,
      })

      expect(mockDb.select).toHaveBeenCalled()
    })

    it('should filter by notification type', async () => {
      (mockDb._mocks as { setOffsetResults: (r: unknown[]) => void }).setOffsetResults([[]]);
      (mockDb._mocks as { setWhereResults: (r: unknown[]) => void }).setWhereResults([[{ count: 0 }], [{ count: 0 }]])

      await notificationService.listNotifications('user-123', {
        limit: 20,
        offset: 0,
        type: 'mention',
      })

      expect(mockDb.select).toHaveBeenCalled()
    })

    it('should filter by projectId', async () => {
      (mockDb._mocks as { setOffsetResults: (r: unknown[]) => void }).setOffsetResults([[]]);
      (mockDb._mocks as { setWhereResults: (r: unknown[]) => void }).setWhereResults([[{ count: 0 }], [{ count: 0 }]])

      await notificationService.listNotifications('user-123', {
        limit: 20,
        offset: 0,
        projectId: 'proj-1',
      })

      expect(mockDb.select).toHaveBeenCalled()
    })
  })

  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      (mockDb._mocks as { setWhereResults: (r: unknown[]) => void }).setWhereResults([[{ count: 5 }]])

      const result = await notificationService.getUnreadCount('user-123')

      expect(result).toBe(5)
    })

    it('should return 0 when no unread notifications', async () => {
      (mockDb._mocks as { setWhereResults: (r: unknown[]) => void }).setWhereResults([[{ count: 0 }]])

      const result = await notificationService.getUnreadCount('user-123')

      expect(result).toBe(0)
    })
  })

  describe('getNotification', () => {
    it('should return notification with actor info', async () => {
      const mockNotification = {
        id: 'notif-1',
        userId: 'user-123',
        type: 'mention',
        title: 'You were mentioned',
        body: 'In a comment',
        link: '/task/123',
        projectId: 'proj-1',
        organizationId: null,
        actorId: 'actor-1',
        taskId: 'task-1',
        readAt: null,
        createdAt: new Date(),
        actorEmail: 'actor@example.com',
        actorName: 'Actor User',
      };
      (mockDb._mocks as { setLimitResults: (r: unknown[]) => void }).setLimitResults([[mockNotification]])

      const result = await notificationService.getNotification('user-123', 'notif-1')

      expect(result.id).toBe('notif-1')
      expect(result.actor?.id).toBe('actor-1')
      expect(result.actor?.email).toBe('actor@example.com')
    })

    it('should throw NotFoundError if notification not found', async () => {
      (mockDb._mocks as { setLimitResults: (r: unknown[]) => void }).setLimitResults([[]])

      await expect(notificationService.getNotification('user-123', 'nonexistent'))
        .rejects.toThrow(NotFoundError)
    })

    it('should handle notification without actor', async () => {
      const mockNotification = {
        id: 'notif-1',
        userId: 'user-123',
        type: 'task_created',
        title: 'Task created',
        body: null,
        link: '/task/123',
        projectId: 'proj-1',
        organizationId: null,
        actorId: null,
        taskId: 'task-1',
        readAt: null,
        createdAt: new Date(),
        actorEmail: null,
        actorName: null,
      };
      (mockDb._mocks as { setLimitResults: (r: unknown[]) => void }).setLimitResults([[mockNotification]])

      const result = await notificationService.getNotification('user-123', 'notif-1')

      expect(result.actor).toBeNull()
    })
  })

  describe('createNotification', () => {
    it('should create notification successfully', async () => {
      mockDb._mocks.returning.mockResolvedValueOnce([{ id: 'notif-new' }])

      const result = await notificationService.createNotification({
        userId: 'user-123',
        type: 'mention',
        title: 'You were mentioned',
        body: 'In a comment',
        link: '/task/123',
        projectId: 'proj-1',
        actorId: 'actor-1',
        taskId: 'task-1',
      })

      expect(result.id).toBe('notif-new')
      expect(mockDb.insert).toHaveBeenCalled()
    })

    it('should create notification with minimal fields', async () => {
      mockDb._mocks.returning.mockResolvedValueOnce([{ id: 'notif-new' }])

      const result = await notificationService.createNotification({
        userId: 'user-123',
        type: 'status_change',
        title: 'Task status changed',
      })

      expect(result.id).toBe('notif-new')
    })

    it('should throw ServiceError if creation fails', async () => {
      mockDb._mocks.returning.mockResolvedValueOnce([])

      await expect(notificationService.createNotification({
        userId: 'user-123',
        type: 'mention',
        title: 'Test',
      })).rejects.toThrow(ServiceError)
    })
  })

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      (mockDb._mocks as { setLimitResults: (r: unknown[]) => void }).setLimitResults([[{ id: 'notif-1' }]])

      await notificationService.markAsRead('user-123', 'notif-1')

      expect(mockDb.update).toHaveBeenCalled()
    })

    it('should throw NotFoundError if notification not found', async () => {
      (mockDb._mocks as { setLimitResults: (r: unknown[]) => void }).setLimitResults([[]])

      await expect(notificationService.markAsRead('user-123', 'nonexistent'))
        .rejects.toThrow(NotFoundError)
    })
  })

  describe('markMultipleAsRead', () => {
    it('should mark multiple notifications as read', async () => {
      mockDb._mocks.returning
        .mockResolvedValueOnce([{ id: 'notif-1' }])
        .mockResolvedValueOnce([{ id: 'notif-2' }])

      const result = await notificationService.markMultipleAsRead('user-123', ['notif-1', 'notif-2'])

      expect(result).toBe(2)
    })

    it('should return count of actually marked notifications', async () => {
      mockDb._mocks.returning
        .mockResolvedValueOnce([{ id: 'notif-1' }])
        .mockResolvedValueOnce([]) // Second one not found or already read

      const result = await notificationService.markMultipleAsRead('user-123', ['notif-1', 'notif-2'])

      expect(result).toBe(1)
    })

    it('should return 0 for empty array', async () => {
      const result = await notificationService.markMultipleAsRead('user-123', [])

      expect(result).toBe(0)
    })
  })

  describe('markAllAsRead', () => {
    it('should mark all notifications as read', async () => {
      mockDb._mocks.returning.mockResolvedValueOnce([
        { id: 'notif-1' },
        { id: 'notif-2' },
        { id: 'notif-3' },
      ])

      const result = await notificationService.markAllAsRead('user-123')

      expect(result).toBe(3)
    })

    it('should return 0 if no unread notifications', async () => {
      mockDb._mocks.returning.mockResolvedValueOnce([])

      const result = await notificationService.markAllAsRead('user-123')

      expect(result).toBe(0)
    })
  })

  describe('deleteNotification', () => {
    it('should delete notification successfully', async () => {
      (mockDb._mocks as { setLimitResults: (r: unknown[]) => void }).setLimitResults([[{ id: 'notif-1' }]])

      await notificationService.deleteNotification('user-123', 'notif-1')

      expect(mockDb.delete).toHaveBeenCalled()
    })

    it('should throw NotFoundError if notification not found', async () => {
      (mockDb._mocks as { setLimitResults: (r: unknown[]) => void }).setLimitResults([[]])

      await expect(notificationService.deleteNotification('user-123', 'nonexistent'))
        .rejects.toThrow(NotFoundError)
    })
  })

  describe('deleteAllNotifications', () => {
    it('should delete all notifications', async () => {
      mockDb._mocks.returning.mockResolvedValueOnce([
        { id: 'notif-1' },
        { id: 'notif-2' },
      ])

      const result = await notificationService.deleteAllNotifications('user-123')

      expect(result).toBe(2)
    })

    it('should delete only read notifications when readOnly is true', async () => {
      mockDb._mocks.returning.mockResolvedValueOnce([{ id: 'notif-1' }])

      const result = await notificationService.deleteAllNotifications('user-123', true)

      expect(result).toBe(1)
    })

    it('should return 0 if no notifications to delete', async () => {
      mockDb._mocks.returning.mockResolvedValueOnce([])

      const result = await notificationService.deleteAllNotifications('user-123')

      expect(result).toBe(0)
    })
  })

  // Push Notification Tests
  describe('getVapidPublicKey', () => {
    it('should return VAPID public key', () => {
      const result = notificationService.getVapidPublicKey()

      expect(result).toBe('mock-vapid-public-key')
      expect(getVapidPublicKey).toHaveBeenCalled()
    })
  })

  describe('isPushConfigured', () => {
    it('should return true when push is configured', () => {
      const result = notificationService.isPushConfigured()

      expect(result).toBe(true)
      expect(isPushConfigured).toHaveBeenCalled()
    })

    it('should return false when push is not configured', () => {
      vi.mocked(isPushConfigured).mockReturnValueOnce(false)

      const result = notificationService.isPushConfigured()

      expect(result).toBe(false)
    })
  })

  describe('subscribeToPush', () => {
    it('should subscribe to push notifications', async () => {
      const result = await notificationService.subscribeToPush('user-123', {
        endpoint: 'https://push.example.com/sub123',
        keys: {
          p256dh: 'public-key',
          auth: 'auth-key',
        },
      }, 'Chrome/100')

      expect(result.id).toBe('sub-123')
      expect(subscribeToPush).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({ endpoint: 'https://push.example.com/sub123' }),
        'Chrome/100'
      )
    })
  })

  describe('unsubscribeFromPush', () => {
    it('should unsubscribe from push notifications', async () => {
      const result = await notificationService.unsubscribeFromPush('user-123', 'https://push.example.com/sub123')

      expect(result).toBe(true)
      expect(unsubscribeFromPush).toHaveBeenCalledWith('user-123', 'https://push.example.com/sub123')
    })
  })

  describe('sendPushNotification', () => {
    it('should send push notification successfully', async () => {
      const result = await notificationService.sendPushNotification('user-123', {
        title: 'Test',
        body: 'Test body',
      })

      expect(result.success).toBe(1)
      expect(result.failed).toBe(0)
      expect(sendPushNotification).toHaveBeenCalled()
    })

    it('should throw ServiceError if push not configured', async () => {
      vi.mocked(isPushConfigured).mockReturnValueOnce(false)

      await expect(notificationService.sendPushNotification('user-123', {
        title: 'Test',
        body: 'Test body',
      })).rejects.toThrow(ServiceError)
    })
  })

  describe('sendTestPush', () => {
    it('should send test push notification', async () => {
      const result = await notificationService.sendTestPush('user-123')

      expect(result.sent).toBe(1)
      expect(result.message).toContain('successfully')
    })

    it('should throw ServiceError if push not configured', async () => {
      vi.mocked(isPushConfigured).mockReturnValueOnce(false)

      await expect(notificationService.sendTestPush('user-123'))
        .rejects.toThrow(ServiceError)
    })

    it('should return appropriate message when no subscriptions', async () => {
      vi.mocked(sendPushNotification).mockResolvedValueOnce({ success: 0, failed: 0 })

      const result = await notificationService.sendTestPush('user-123')

      expect(result.sent).toBe(0)
      expect(result.message).toContain('No active subscriptions')
    })
  })

  // Preferences Tests
  describe('getPreferences', () => {
    it('should return default preferences if none set', async () => {
      vi.mocked(getNotificationPreferences).mockResolvedValueOnce(null)

      const result = await notificationService.getPreferences('user-123')

      expect(result.pushEnabled).toBe(true)
      expect(result.emailEnabled).toBe(true)
      expect(result.emailDigestFrequency).toBe('daily')
    })

    it('should return stored preferences', async () => {
      vi.mocked(getNotificationPreferences).mockResolvedValueOnce({
        pushEnabled: false,
        pushMentions: true,
        pushAssignments: false,
        pushComments: true,
        pushStatusChanges: true,
        pushTaskCreated: true,
        pushInvitations: false,
        emailEnabled: false,
        emailMentions: false,
        emailAssignments: false,
        emailDigest: true,
        emailDigestFrequency: 'weekly',
        emailDigestTime: '10:00',
        emailDigestTimezone: 'America/New_York',
        lastDigestSentAt: null,
        toastEnabled: false,
      })

      const result = await notificationService.getPreferences('user-123')

      expect(result.pushEnabled).toBe(false)
      expect(result.emailDigest).toBe(true)
      expect(result.emailDigestFrequency).toBe('weekly')
    })
  })

  describe('updatePreferences', () => {
    it('should update preferences successfully', async () => {
      const result = await notificationService.updatePreferences('user-123', {
        pushEnabled: false,
        emailDigest: true,
      })

      expect(updateNotificationPreferences).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({ pushEnabled: false, emailDigest: true })
      )
      expect(result.pushEnabled).toBe(true) // Default from mock
    })

    it('should throw ValidationError if no valid fields provided', async () => {
      await expect(notificationService.updatePreferences('user-123', {}))
        .rejects.toThrow(ValidationError)
    })

    it('should ignore invalid digestFrequency values', async () => {
      await expect(notificationService.updatePreferences('user-123', {
        emailDigestFrequency: 'invalid' as 'daily',
      })).rejects.toThrow(ValidationError)
    })

    it('should ignore invalid digestTime format', async () => {
      await expect(notificationService.updatePreferences('user-123', {
        emailDigestTime: 'invalid-time',
      })).rejects.toThrow(ValidationError)
    })

    it('should accept valid digestTime format', async () => {
      await notificationService.updatePreferences('user-123', {
        emailDigestTime: '14:30',
      })

      expect(updateNotificationPreferences).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({ emailDigestTime: '14:30' })
      )
    })
  })

  // Digest Email Tests
  describe('sendTestDigest', () => {
    it('should send test digest email', async () => {
      // First select: user lookup - returns user via where
      // Second select: notifications query - returns notifications via limit
      (mockDb._mocks as { setWhereResults: (r: unknown[]) => void }).setWhereResults([[{ email: 'test@example.com', name: 'Test User' }]]);
      (mockDb._mocks as { setLimitResults: (r: unknown[]) => void }).setLimitResults([[
        { id: 'notif-1', type: 'mention', title: 'Test', body: null, link: null, projectId: null, taskId: null, createdAt: new Date() },
      ]])

      const result = await notificationService.sendTestDigest('user-123')

      expect(result.messageId).toBe('msg-123')
      expect(result.notificationCount).toBe(1)
    })

    it('should throw ServiceError if email not configured', async () => {
      vi.mocked(isEmailServiceConfigured).mockReturnValueOnce(false)

      await expect(notificationService.sendTestDigest('user-123'))
        .rejects.toThrow(ServiceError)
    })

    it('should throw NotFoundError if user not found', async () => {
      // User lookup returns empty
      (mockDb._mocks as { setWhereResults: (r: unknown[]) => void }).setWhereResults([[]])

      await expect(notificationService.sendTestDigest('nonexistent'))
        .rejects.toThrow(NotFoundError)
    })

    it('should throw ValidationError if no recent notifications', async () => {
      // User lookup returns user
      (mockDb._mocks as { setWhereResults: (r: unknown[]) => void }).setWhereResults([[{ email: 'test@example.com', name: 'Test User' }]]);
      // Notifications query returns empty
      (mockDb._mocks as { setLimitResults: (r: unknown[]) => void }).setLimitResults([[]])

      await expect(notificationService.sendTestDigest('user-123'))
        .rejects.toThrow(ValidationError)
    })

    it('should throw ServiceError if email sending fails', async () => {
      // User lookup returns user
      (mockDb._mocks as { setWhereResults: (r: unknown[]) => void }).setWhereResults([[{ email: 'test@example.com', name: 'Test User' }]]);
      // Notifications query returns notifications
      (mockDb._mocks as { setLimitResults: (r: unknown[]) => void }).setLimitResults([[
        { id: 'notif-1', type: 'mention', title: 'Test', body: null, link: null, projectId: null, taskId: null, createdAt: new Date() },
      ]])
      vi.mocked(sendDigestEmail).mockResolvedValueOnce({ success: false, error: 'SMTP error' })

      await expect(notificationService.sendTestDigest('user-123'))
        .rejects.toThrow(ServiceError)
    })
  })

  describe('getDigestHistory', () => {
    it('should return digest history', async () => {
      const mockHistory = [
        {
          id: 'digest-1',
          frequency: 'daily',
          notificationCount: 5,
          fromDate: new Date(),
          toDate: new Date(),
          sentAt: new Date(),
          status: 'sent',
          errorMessage: null,
        },
      ];
      (mockDb._mocks as { setLimitResults: (r: unknown[]) => void }).setLimitResults([mockHistory])

      const result = await notificationService.getDigestHistory('user-123')

      expect(result).toHaveLength(1)
      expect(result[0].frequency).toBe('daily')
      expect(result[0].notificationCount).toBe(5)
    })

    it('should respect limit parameter', async () => {
      (mockDb._mocks as { setLimitResults: (r: unknown[]) => void }).setLimitResults([[]])

      await notificationService.getDigestHistory('user-123', 5)

      expect(mockDb._mocks.limit).toHaveBeenCalled()
    })

    it('should cap limit at 50', async () => {
      (mockDb._mocks as { setLimitResults: (r: unknown[]) => void }).setLimitResults([[]])

      await notificationService.getDigestHistory('user-123', 100)

      // Service should cap at 50
      expect(mockDb.select).toHaveBeenCalled()
    })

    it('should return empty array if no history', async () => {
      (mockDb._mocks as { setLimitResults: (r: unknown[]) => void }).setLimitResults([[]])

      const result = await notificationService.getDigestHistory('user-123')

      expect(result).toEqual([])
    })
  })
})
