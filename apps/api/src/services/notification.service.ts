/**
 * Notification Service
 * Handles notification CRUD operations, push notifications, and digest management
 */

import { and, count, desc, eq, gt, isNotNull, isNull, inArray as _inArray } from 'drizzle-orm'
import { getDbClient, schema } from '../db/index.js'
import {
  isPushConfigured,
  getVapidPublicKey,
  sendPushNotification,
  subscribeToPush,
  unsubscribeFromPush,
  getNotificationPreferences,
  updateNotificationPreferences,
  type PushPayload,
} from '../lib/push.js'
import { isEmailServiceConfigured, sendDigestEmail } from '../lib/email.js'
import {
  NotFoundError,
  ServiceError,
  ValidationError,
} from './errors.js'

// Types
export interface NotificationQuery {
  limit: number
  offset: number
  unreadOnly?: boolean
  type?: NotificationType
  projectId?: string
}

export interface NotificationWithActor {
  id: string
  userId: string
  type: string
  title: string
  body: string | null
  link: string | null
  projectId: string | null
  organizationId: string | null
  actorId: string | null
  taskId: string | null
  readAt: Date | null
  createdAt: Date
  actor: {
    id: string
    email: string | null
    name: string | null
  } | null
}

export interface NotificationsListResult {
  notifications: NotificationWithActor[]
  unreadCount: number
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

export interface PushSubscriptionInput {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

export interface NotificationPreferences {
  pushEnabled: boolean
  pushMentions: boolean
  pushAssignments: boolean
  pushComments: boolean
  pushStatusChanges: boolean
  pushTaskCreated: boolean
  pushInvitations: boolean
  emailEnabled: boolean
  emailMentions: boolean
  emailAssignments: boolean
  emailDigest: boolean
  emailDigestFrequency: string
  emailDigestTime: string
  emailDigestTimezone: string
  lastDigestSentAt: Date | null
  toastEnabled: boolean
}

// Valid notification types from the database enum
export type NotificationType =
  | 'mention'
  | 'assignment'
  | 'unassignment'
  | 'comment'
  | 'comment_reply'
  | 'status_change'
  | 'task_created'
  | 'task_deleted'
  | 'invitation'
  | 'member_joined'
  | 'member_removed'
  | 'role_changed'

export interface CreateNotificationInput {
  userId: string
  type: NotificationType
  title: string
  body?: string | null
  link?: string | null
  projectId?: string | null
  organizationId?: string | null
  actorId?: string | null
  taskId?: string | null
}

/**
 * NotificationService - Handles all notification-related business logic
 */
export class NotificationService {
  private db = getDbClient()

  /**
   * List notifications for a user with pagination and filtering
   */
  async listNotifications(userId: string, query: NotificationQuery): Promise<NotificationsListResult> {
    const { limit, offset, unreadOnly, type, projectId } = query

    // Build query conditions
    const conditions = [eq(schema.notifications.userId, userId)]

    if (unreadOnly) {
      conditions.push(isNull(schema.notifications.readAt))
    }

    if (type) {
      conditions.push(eq(schema.notifications.type, type))
    }

    if (projectId) {
      conditions.push(eq(schema.notifications.projectId, projectId))
    }

    // Get notifications with actor info
    const notificationsResult = await this.db
      .select({
        id: schema.notifications.id,
        userId: schema.notifications.userId,
        type: schema.notifications.type,
        title: schema.notifications.title,
        body: schema.notifications.body,
        link: schema.notifications.link,
        projectId: schema.notifications.projectId,
        organizationId: schema.notifications.organizationId,
        actorId: schema.notifications.actorId,
        taskId: schema.notifications.taskId,
        readAt: schema.notifications.readAt,
        createdAt: schema.notifications.createdAt,
        actorEmail: schema.users.email,
        actorName: schema.users.name,
      })
      .from(schema.notifications)
      .leftJoin(schema.users, eq(schema.notifications.actorId, schema.users.id))
      .where(and(...conditions))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(limit)
      .offset(offset)

    // Get total count for pagination
    const [countResult] = await this.db
      .select({ count: count() })
      .from(schema.notifications)
      .where(and(...conditions))

    // Get unread count
    const [unreadCountResult] = await this.db
      .select({ count: count() })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.userId, userId),
          isNull(schema.notifications.readAt)
        )
      )

    // Format response
    const notifications: NotificationWithActor[] = notificationsResult.map((n) => ({
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      projectId: n.projectId,
      organizationId: n.organizationId,
      actorId: n.actorId,
      taskId: n.taskId,
      readAt: n.readAt,
      createdAt: n.createdAt,
      actor: n.actorId
        ? {
            id: n.actorId,
            email: n.actorEmail,
            name: n.actorName,
          }
        : null,
    }))

    const total = Number(countResult?.count ?? 0)

    return {
      notifications,
      unreadCount: Number(unreadCountResult?.count ?? 0),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + notificationsResult.length < total,
      },
    }
  }

  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.userId, userId),
          isNull(schema.notifications.readAt)
        )
      )

    return Number(result?.count ?? 0)
  }

  /**
   * Get a single notification by ID
   */
  async getNotification(userId: string, notificationId: string): Promise<NotificationWithActor> {
    const [notification] = await this.db
      .select({
        id: schema.notifications.id,
        userId: schema.notifications.userId,
        type: schema.notifications.type,
        title: schema.notifications.title,
        body: schema.notifications.body,
        link: schema.notifications.link,
        projectId: schema.notifications.projectId,
        organizationId: schema.notifications.organizationId,
        actorId: schema.notifications.actorId,
        taskId: schema.notifications.taskId,
        readAt: schema.notifications.readAt,
        createdAt: schema.notifications.createdAt,
        actorEmail: schema.users.email,
        actorName: schema.users.name,
      })
      .from(schema.notifications)
      .leftJoin(schema.users, eq(schema.notifications.actorId, schema.users.id))
      .where(
        and(
          eq(schema.notifications.id, notificationId),
          eq(schema.notifications.userId, userId)
        )
      )
      .limit(1)

    if (!notification) {
      throw new NotFoundError('Notification', notificationId)
    }

    return {
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      link: notification.link,
      projectId: notification.projectId,
      organizationId: notification.organizationId,
      actorId: notification.actorId,
      taskId: notification.taskId,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
      actor: notification.actorId
        ? {
            id: notification.actorId,
            email: notification.actorEmail,
            name: notification.actorName,
          }
        : null,
    }
  }

  /**
   * Create a notification
   */
  async createNotification(input: CreateNotificationInput): Promise<{ id: string }> {
    const [notification] = await this.db
      .insert(schema.notifications)
      .values({
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
        projectId: input.projectId ?? null,
        organizationId: input.organizationId ?? null,
        actorId: input.actorId ?? null,
        taskId: input.taskId ?? null,
      })
      .returning({ id: schema.notifications.id })

    if (!notification) {
      throw new ServiceError('Failed to create notification', 'NOTIFICATION_CREATION_FAILED', 500)
    }

    return notification
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(userId: string, notificationId: string): Promise<void> {
    // Check notification exists and belongs to user
    const [existing] = await this.db
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.id, notificationId),
          eq(schema.notifications.userId, userId)
        )
      )
      .limit(1)

    if (!existing) {
      throw new NotFoundError('Notification', notificationId)
    }

    await this.db
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(eq(schema.notifications.id, notificationId))
  }

  /**
   * Mark multiple notifications as read
   */
  async markMultipleAsRead(userId: string, notificationIds: string[]): Promise<number> {
    let markedCount = 0

    for (const id of notificationIds) {
      const [updated] = await this.db
        .update(schema.notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(schema.notifications.id, id),
            eq(schema.notifications.userId, userId),
            isNull(schema.notifications.readAt)
          )
        )
        .returning({ id: schema.notifications.id })

      if (updated) {
        markedCount++
      }
    }

    return markedCount
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.db
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(schema.notifications.userId, userId),
          isNull(schema.notifications.readAt)
        )
      )
      .returning({ id: schema.notifications.id })

    return result.length
  }

  /**
   * Delete a notification
   */
  async deleteNotification(userId: string, notificationId: string): Promise<void> {
    // Check notification exists and belongs to user
    const [existing] = await this.db
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.id, notificationId),
          eq(schema.notifications.userId, userId)
        )
      )
      .limit(1)

    if (!existing) {
      throw new NotFoundError('Notification', notificationId)
    }

    await this.db
      .delete(schema.notifications)
      .where(eq(schema.notifications.id, notificationId))
  }

  /**
   * Delete all notifications for a user (optionally only read ones)
   */
  async deleteAllNotifications(userId: string, readOnly: boolean = false): Promise<number> {
    const conditions = [eq(schema.notifications.userId, userId)]

    if (readOnly) {
      conditions.push(isNotNull(schema.notifications.readAt))
    }

    const result = await this.db
      .delete(schema.notifications)
      .where(and(...conditions))
      .returning({ id: schema.notifications.id })

    return result.length
  }

  // ============================================
  // Push Notification Methods
  // ============================================

  /**
   * Get VAPID public key for push subscriptions
   */
  getVapidPublicKey(): string | null {
    return getVapidPublicKey()
  }

  /**
   * Check if push notifications are configured
   */
  isPushConfigured(): boolean {
    return isPushConfigured()
  }

  /**
   * Subscribe to push notifications
   */
  async subscribeToPush(
    userId: string,
    subscription: PushSubscriptionInput,
    userAgent?: string
  ): Promise<{ id: string; createdAt: Date }> {
    const result = await subscribeToPush(userId, subscription, userAgent)
    return {
      id: result.id,
      createdAt: result.createdAt,
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribeFromPush(userId: string, endpoint: string): Promise<boolean> {
    return unsubscribeFromPush(userId, endpoint)
  }

  /**
   * Send a push notification to a user
   */
  async sendPushNotification(
    userId: string,
    payload: PushPayload
  ): Promise<{ success: number; failed: number }> {
    if (!isPushConfigured()) {
      throw new ServiceError('Push notifications are not configured', 'PUSH_NOT_CONFIGURED', 503)
    }

    return sendPushNotification(userId, payload)
  }

  /**
   * Send a test push notification
   */
  async sendTestPush(userId: string): Promise<{ sent: number; failed: number; message: string }> {
    if (!isPushConfigured()) {
      throw new ServiceError('Push notifications are not configured on this server', 'PUSH_NOT_CONFIGURED', 503)
    }

    const result = await sendPushNotification(userId, {
      title: 'Test Notification',
      body: 'Push notifications are working!',
      icon: '/icons/notification.png',
      data: {
        type: 'test',
        url: '/dashboard',
      },
    })

    return {
      sent: result.success,
      failed: result.failed,
      message: result.success > 0
        ? 'Test notification sent successfully'
        : 'No active subscriptions found for this user',
    }
  }

  // ============================================
  // Notification Preferences Methods
  // ============================================

  /**
   * Get notification preferences for a user
   */
  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const preferences = await getNotificationPreferences(userId)

    // Return defaults if no preferences set
    if (!preferences) {
      return {
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
      }
    }

    return {
      pushEnabled: preferences.pushEnabled,
      pushMentions: preferences.pushMentions,
      pushAssignments: preferences.pushAssignments,
      pushComments: preferences.pushComments,
      pushStatusChanges: preferences.pushStatusChanges,
      pushTaskCreated: preferences.pushTaskCreated,
      pushInvitations: preferences.pushInvitations,
      emailEnabled: preferences.emailEnabled,
      emailMentions: preferences.emailMentions,
      emailAssignments: preferences.emailAssignments,
      emailDigest: preferences.emailDigest,
      emailDigestFrequency: preferences.emailDigestFrequency,
      emailDigestTime: preferences.emailDigestTime,
      emailDigestTimezone: preferences.emailDigestTimezone,
      lastDigestSentAt: preferences.lastDigestSentAt,
      toastEnabled: preferences.toastEnabled,
    }
  }

  /**
   * Update notification preferences for a user
   */
  async updatePreferences(
    userId: string,
    updates: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    // Validate allowed fields
    const booleanFields = [
      'pushEnabled',
      'pushMentions',
      'pushAssignments',
      'pushComments',
      'pushStatusChanges',
      'pushTaskCreated',
      'pushInvitations',
      'emailEnabled',
      'emailMentions',
      'emailAssignments',
      'emailDigest',
      'toastEnabled',
    ] as const

    const stringFields = [
      'emailDigestFrequency',
      'emailDigestTime',
      'emailDigestTimezone',
    ] as const

    const validUpdates: Record<string, boolean | string> = {}

    for (const field of booleanFields) {
      if (typeof updates[field] === 'boolean') {
        validUpdates[field] = updates[field]!
      }
    }

    for (const field of stringFields) {
      if (typeof updates[field] === 'string') {
        // Validate values
        if (field === 'emailDigestFrequency' && !['daily', 'weekly', 'none'].includes(updates[field]!)) {
          continue
        }
        if (field === 'emailDigestTime' && !/^\d{2}:\d{2}$/.test(updates[field]!)) {
          continue
        }
        validUpdates[field] = updates[field]!
      }
    }

    if (Object.keys(validUpdates).length === 0) {
      throw new ValidationError('No valid fields to update')
    }

    const preferences = await updateNotificationPreferences(userId, validUpdates)

    return {
      pushEnabled: preferences.pushEnabled,
      pushMentions: preferences.pushMentions,
      pushAssignments: preferences.pushAssignments,
      pushComments: preferences.pushComments,
      pushStatusChanges: preferences.pushStatusChanges,
      pushTaskCreated: preferences.pushTaskCreated,
      pushInvitations: preferences.pushInvitations,
      emailEnabled: preferences.emailEnabled,
      emailMentions: preferences.emailMentions,
      emailAssignments: preferences.emailAssignments,
      emailDigest: preferences.emailDigest,
      emailDigestFrequency: preferences.emailDigestFrequency,
      emailDigestTime: preferences.emailDigestTime,
      emailDigestTimezone: preferences.emailDigestTimezone,
      lastDigestSentAt: preferences.lastDigestSentAt,
      toastEnabled: preferences.toastEnabled,
    }
  }

  // ============================================
  // Digest Email Methods
  // ============================================

  /**
   * Send a test digest email
   */
  async sendTestDigest(userId: string): Promise<{ messageId?: string; notificationCount: number }> {
    if (!isEmailServiceConfigured()) {
      throw new ServiceError('Email service is not configured on this server', 'EMAIL_NOT_CONFIGURED', 503)
    }

    // Get user details
    const [userData] = await this.db
      .select({
        email: schema.users.email,
        name: schema.users.name,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))

    if (!userData) {
      throw new NotFoundError('User', userId)
    }

    // Get recent notifications (last 24 hours)
    const oneDayAgo = new Date()
    oneDayAgo.setHours(oneDayAgo.getHours() - 24)

    const recentNotifications = await this.db
      .select({
        id: schema.notifications.id,
        type: schema.notifications.type,
        title: schema.notifications.title,
        body: schema.notifications.body,
        link: schema.notifications.link,
        projectId: schema.notifications.projectId,
        taskId: schema.notifications.taskId,
        createdAt: schema.notifications.createdAt,
      })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.userId, userId),
          gt(schema.notifications.createdAt, oneDayAgo)
        )
      )
      .orderBy(desc(schema.notifications.createdAt))
      .limit(20)

    if (recentNotifications.length === 0) {
      throw new ValidationError('No notifications in the last 24 hours to include in digest')
    }

    const result = await sendDigestEmail({
      to: userData.email,
      userName: userData.name,
      frequency: 'daily',
      notifications: recentNotifications,
    })

    if (!result.success) {
      throw new ServiceError(result.error || 'Failed to send digest email', 'DIGEST_SEND_FAILED', 500)
    }

    return {
      messageId: result.messageId,
      notificationCount: recentNotifications.length,
    }
  }

  /**
   * Get digest send history for a user
   */
  async getDigestHistory(userId: string, limit: number = 10): Promise<Array<{
    id: string
    frequency: string
    notificationCount: number
    fromDate: Date | null
    toDate: Date | null
    sentAt: Date
    status: string
    errorMessage: string | null
  }>> {
    const safeLimit = Math.min(limit, 50)

    const history = await this.db
      .select()
      .from(schema.digestSendLog)
      .where(eq(schema.digestSendLog.userId, userId))
      .orderBy(desc(schema.digestSendLog.sentAt))
      .limit(safeLimit)

    return history.map((d) => ({
      id: d.id,
      frequency: d.frequency,
      notificationCount: d.notificationCount,
      fromDate: d.fromDate,
      toDate: d.toDate,
      sentAt: d.sentAt,
      status: d.status,
      errorMessage: d.errorMessage,
    }))
  }
}

// Export singleton instance
export const notificationService = new NotificationService()
