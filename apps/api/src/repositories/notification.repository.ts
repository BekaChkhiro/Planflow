/**
 * Notification Repository
 * Handles all notification-related database operations
 */

import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { schema } from '../db/index.js'
import { BaseRepository, type FindAllOptions, type PaginatedResult as _PaginatedResult } from './base.repository.js'

// Notification type enum values
export const NotificationTypes = [
  'mention',
  'assignment',
  'unassignment',
  'comment',
  'comment_reply',
  'status_change',
  'task_created',
  'task_deleted',
  'invitation',
  'member_joined',
  'member_removed',
  'role_changed',
] as const

export type NotificationType = (typeof NotificationTypes)[number]

// Types
export interface Notification {
  id: string
  userId: string
  type: NotificationType
  title: string
  body: string | null
  link: string | null
  projectId: string | null
  organizationId: string | null
  actorId: string | null
  taskId: string | null
  readAt: Date | null
  createdAt: Date
}

export interface NotificationWithActor extends Notification {
  actor: {
    id: string
    email: string
    name: string | null
  } | null
}

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

export interface NotificationStats {
  total: number
  unread: number
  read: number
}

/**
 * NotificationRepository - Handles notification data access
 */
export class NotificationRepository extends BaseRepository {
  /**
   * Find notification by ID
   */
  async findById(id: string): Promise<Notification | null> {
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
      })
      .from(schema.notifications)
      .where(eq(schema.notifications.id, id))
      .limit(1)

    return notification ?? null
  }

  /**
   * Find all notifications for a user
   */
  async findAllByUserId(userId: string, options?: FindAllOptions & { unreadOnly?: boolean }): Promise<Notification[]> {
    const limit = options?.limit ?? 50
    const offset = options?.offset ?? 0
    const unreadOnly = options?.unreadOnly ?? false

    const conditions = [eq(schema.notifications.userId, userId)]
    if (unreadOnly) {
      conditions.push(isNull(schema.notifications.readAt))
    }

    const notifications = await this.db
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
      })
      .from(schema.notifications)
      .where(and(...conditions))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(limit)
      .offset(offset)

    return notifications
  }

  /**
   * Find notifications with actor info
   */
  async findAllByUserIdWithActor(
    userId: string,
    options?: FindAllOptions & { unreadOnly?: boolean }
  ): Promise<NotificationWithActor[]> {
    const notifications = await this.findAllByUserId(userId, options)

    // Get unique actor IDs
    const actorIds = [...new Set(notifications.filter((n) => n.actorId).map((n) => n.actorId!))]

    // Fetch actors
    const actorMap: Map<string, { id: string; email: string; name: string | null }> = new Map()
    for (const actorId of actorIds) {
      const [actor] = await this.db
        .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
        .from(schema.users)
        .where(eq(schema.users.id, actorId))
        .limit(1)
      if (actor) {
        actorMap.set(actor.id, actor)
      }
    }

    // Map notifications with actors
    return notifications.map((notification) => ({
      ...notification,
      actor: notification.actorId ? actorMap.get(notification.actorId) ?? null : null,
    }))
  }

  /**
   * Count unread notifications for a user
   */
  async countUnreadByUserId(userId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)))

    return result?.count ?? 0
  }

  /**
   * Get notification stats for a user
   */
  async getStatsByUserId(userId: string): Promise<NotificationStats> {
    const notifications = await this.db
      .select({ readAt: schema.notifications.readAt })
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, userId))

    const stats: NotificationStats = {
      total: notifications.length,
      unread: notifications.filter((n) => n.readAt === null).length,
      read: notifications.filter((n) => n.readAt !== null).length,
    }

    return stats
  }

  /**
   * Create a new notification
   */
  async create(data: CreateNotificationInput): Promise<Notification> {
    const [newNotification] = await this.db
      .insert(schema.notifications)
      .values({
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body ?? null,
        link: data.link ?? null,
        projectId: data.projectId ?? null,
        organizationId: data.organizationId ?? null,
        actorId: data.actorId ?? null,
        taskId: data.taskId ?? null,
      })
      .returning({
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
      })

    if (!newNotification) {
      throw new Error('Failed to create notification')
    }

    return newNotification
  }

  /**
   * Create multiple notifications (batch insert)
   */
  async createMany(notifications: CreateNotificationInput[]): Promise<number> {
    if (notifications.length === 0) return 0

    const values = notifications.map((n) => ({
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body ?? null,
      link: n.link ?? null,
      projectId: n.projectId ?? null,
      organizationId: n.organizationId ?? null,
      actorId: n.actorId ?? null,
      taskId: n.taskId ?? null,
    }))

    await this.db.insert(schema.notifications).values(values)

    return notifications.length
  }

  /**
   * Mark notification as read
   */
  async markAsRead(id: string): Promise<Notification | null> {
    const [updated] = await this.db
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(eq(schema.notifications.id, id))
      .returning({
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
      })

    return updated ?? null
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsReadByUserId(userId: string): Promise<number> {
    const result = await this.db
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)))
      .returning({ id: schema.notifications.id })

    return result.length
  }

  /**
   * Delete notification by ID
   */
  async delete(id: string): Promise<boolean> {
    const [deleted] = await this.db
      .delete(schema.notifications)
      .where(eq(schema.notifications.id, id))
      .returning({ id: schema.notifications.id })

    return !!deleted
  }

  /**
   * Delete all notifications for a user
   */
  async deleteAllByUserId(userId: string): Promise<number> {
    const result = await this.db
      .delete(schema.notifications)
      .where(eq(schema.notifications.userId, userId))
      .returning({ id: schema.notifications.id })

    return result.length
  }

  /**
   * Delete read notifications older than a certain date
   */
  async deleteOldReadNotifications(userId: string, olderThan: Date): Promise<number> {
    const result = await this.db
      .delete(schema.notifications)
      .where(
        and(
          eq(schema.notifications.userId, userId),
          sql`${schema.notifications.readAt} IS NOT NULL`,
          sql`${schema.notifications.createdAt} < ${olderThan.toISOString()}`
        )
      )
      .returning({ id: schema.notifications.id })

    return result.length
  }
}

// Export singleton instance
export const notificationRepository = new NotificationRepository()
