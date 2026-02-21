import webpush from 'web-push'
import { db } from '../db/index.js'
import * as schema from '../db/schema/index.js'
import { eq, and } from 'drizzle-orm'

// Initialize VAPID keys from environment variables
const VAPID_PUBLIC_KEY = process.env['VAPID_PUBLIC_KEY']
const VAPID_PRIVATE_KEY = process.env['VAPID_PRIVATE_KEY']
const VAPID_SUBJECT = process.env['VAPID_SUBJECT'] || 'mailto:support@planflow.tools'

// Track if push is configured
let pushConfigured = false

export function configurePush() {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('[Push] VAPID keys not configured. Push notifications disabled.')
    console.warn('[Push] Generate keys with: npx web-push generate-vapid-keys')
    return false
  }

  try {
    webpush.setVapidDetails(
      VAPID_SUBJECT,
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    )
    pushConfigured = true
    console.log('[Push] Web Push configured successfully')
    return true
  } catch (error) {
    console.error('[Push] Failed to configure VAPID:', error)
    return false
  }
}

export function isPushConfigured(): boolean {
  return pushConfigured
}

export function getVapidPublicKey(): string | null {
  return VAPID_PUBLIC_KEY || null
}

interface PushPayload {
  title: string
  body?: string
  icon?: string
  badge?: string
  tag?: string
  data?: {
    url?: string
    notificationId?: string
    type?: string
  }
  actions?: Array<{
    action: string
    title: string
    icon?: string
  }>
}

// Send push notification to a specific user
export async function sendPushNotification(
  userId: string,
  payload: PushPayload
): Promise<{ success: number; failed: number }> {
  if (!pushConfigured) {
    console.warn('[Push] Push not configured, skipping notification')
    return { success: 0, failed: 0 }
  }

  // Get user's push subscriptions
  const subscriptions = await db
    .select()
    .from(schema.pushSubscriptions)
    .where(
      and(
        eq(schema.pushSubscriptions.userId, userId),
        eq(schema.pushSubscriptions.isActive, true)
      )
    )

  if (subscriptions.length === 0) {
    return { success: 0, failed: 0 }
  }

  // Check user's notification preferences
  const [preferences] = await db
    .select()
    .from(schema.notificationPreferences)
    .where(eq(schema.notificationPreferences.userId, userId))
    .limit(1)

  // If preferences exist and push is disabled, skip
  if (preferences && !preferences.pushEnabled) {
    return { success: 0, failed: 0 }
  }

  // Check type-specific preferences
  if (preferences && payload.data?.type) {
    const type = payload.data.type
    if (type === 'mention' && !preferences.pushMentions) return { success: 0, failed: 0 }
    if (type === 'assignment' && !preferences.pushAssignments) return { success: 0, failed: 0 }
    if (type === 'comment' && !preferences.pushComments) return { success: 0, failed: 0 }
    if (type === 'status_change' && !preferences.pushStatusChanges) return { success: 0, failed: 0 }
    if (type === 'task_created' && !preferences.pushTaskCreated) return { success: 0, failed: 0 }
    if (type === 'invitation' && !preferences.pushInvitations) return { success: 0, failed: 0 }
  }

  const results = { success: 0, failed: 0 }

  // Send to all active subscriptions
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify(payload),
          {
            TTL: 60 * 60 * 24, // 24 hours
            urgency: 'high',
          }
        )
        results.success++
      } catch (error: unknown) {
        results.failed++

        // Handle expired/invalid subscriptions
        const statusCode = (error as { statusCode?: number })?.statusCode
        if (statusCode === 410 || statusCode === 404) {
          // Subscription expired or invalid - mark as inactive
          await db
            .update(schema.pushSubscriptions)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(schema.pushSubscriptions.id, subscription.id))
          console.log(`[Push] Marked subscription ${subscription.id} as inactive (expired)`)
        } else {
          console.error(`[Push] Failed to send to subscription ${subscription.id}:`, error)
        }
      }
    })
  )

  return results
}

// Send push notification to multiple users
export async function sendPushNotificationToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<{ success: number; failed: number }> {
  const results = { success: 0, failed: 0 }

  await Promise.all(
    userIds.map(async (userId) => {
      const result = await sendPushNotification(userId, payload)
      results.success += result.success
      results.failed += result.failed
    })
  )

  return results
}

// Create push notification from database notification
export function createPushPayload(
  notification: schema.Notification
): PushPayload {
  const typeIcons: Record<string, string> = {
    mention: '/icons/mention.png',
    assignment: '/icons/assignment.png',
    comment: '/icons/comment.png',
    status_change: '/icons/status.png',
    invitation: '/icons/invitation.png',
    default: '/icons/notification.png',
  }

  return {
    title: notification.title,
    body: notification.body || undefined,
    icon: typeIcons[notification.type] || typeIcons['default'],
    badge: '/icons/badge.png',
    tag: notification.id, // Allows replacing existing notifications with same tag
    data: {
      url: notification.link || undefined,
      notificationId: notification.id,
      type: notification.type,
    },
    actions: [
      {
        action: 'open',
        title: 'View',
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
      },
    ],
  }
}

// Subscribe user to push notifications
export async function subscribeToPush(
  userId: string,
  subscription: {
    endpoint: string
    keys: {
      p256dh: string
      auth: string
    }
  },
  userAgent?: string
): Promise<schema.PushSubscription> {
  // Check if subscription already exists
  const [existing] = await db
    .select()
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.endpoint, subscription.endpoint))
    .limit(1)

  if (existing) {
    // Update existing subscription
    const [updated] = await db
      .update(schema.pushSubscriptions)
      .set({
        userId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(schema.pushSubscriptions.id, existing.id))
      .returning()

    return updated
  }

  // Create new subscription
  const [created] = await db
    .insert(schema.pushSubscriptions)
    .values({
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent,
    })
    .returning()

  // Ensure user has notification preferences
  const [prefs] = await db
    .select()
    .from(schema.notificationPreferences)
    .where(eq(schema.notificationPreferences.userId, userId))
    .limit(1)

  if (!prefs) {
    await db.insert(schema.notificationPreferences).values({ userId })
  }

  return created
}

// Unsubscribe from push notifications
export async function unsubscribeFromPush(
  userId: string,
  endpoint: string
): Promise<boolean> {
  const result = await db
    .delete(schema.pushSubscriptions)
    .where(
      and(
        eq(schema.pushSubscriptions.userId, userId),
        eq(schema.pushSubscriptions.endpoint, endpoint)
      )
    )
    .returning()

  return result.length > 0
}

// Get user's notification preferences
export async function getNotificationPreferences(
  userId: string
): Promise<schema.NotificationPreference | null> {
  const [preferences] = await db
    .select()
    .from(schema.notificationPreferences)
    .where(eq(schema.notificationPreferences.userId, userId))
    .limit(1)

  return preferences || null
}

// Update user's notification preferences
export async function updateNotificationPreferences(
  userId: string,
  updates: Partial<Omit<schema.NotificationPreference, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>
): Promise<schema.NotificationPreference> {
  // Check if preferences exist
  const [existing] = await db
    .select()
    .from(schema.notificationPreferences)
    .where(eq(schema.notificationPreferences.userId, userId))
    .limit(1)

  if (existing) {
    const [updated] = await db
      .update(schema.notificationPreferences)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.notificationPreferences.userId, existing.id))
      .returning()

    return updated
  }

  // Create new preferences with updates
  const [created] = await db
    .insert(schema.notificationPreferences)
    .values({ userId, ...updates })
    .returning()

  return created
}
