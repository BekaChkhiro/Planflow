import { Hono } from 'hono'
import {
  NotificationsQuerySchema,
  MarkNotificationsReadRequestSchema,
} from '@planflow/shared'
import { auth, getAuth } from '../middleware/index.js'
import { notificationService, ServiceError } from '../services/index.js'
import { captureException } from '../lib/sentry.js'
import { logger } from '../lib/logger.js'

const notificationsRoutes = new Hono()

// Helper to validate UUID format
const isValidUUID = (id: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(id)
}

// Helper to handle service errors
const handleServiceError = (c: any, error: unknown) => {
  if (error instanceof ServiceError) {
    return c.json({
      success: false,
      error: error.message,
      code: error.code,
    }, error.statusCode as any)
  }

  logger.error({ err: error }, 'Unexpected error')
  captureException(error)
  return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
}

// ============================================
// Notifications API (T5.10)
// ============================================

// GET /notifications - Get current user's notifications
notificationsRoutes.get('/', auth, async (c) => {
  try {
    const { user } = getAuth(c)

    // Parse query parameters
    const queryParams = {
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
      unreadOnly: c.req.query('unreadOnly'),
      type: c.req.query('type'),
      projectId: c.req.query('projectId'),
    }

    const validation = NotificationsQuerySchema.safeParse(queryParams)
    if (!validation.success) {
      return c.json({
        success: false,
        error: 'Invalid query parameters',
        details: validation.error.flatten().fieldErrors,
      }, 400)
    }

    const result = await notificationService.listNotifications(user.id, validation.data)

    return c.json({
      success: true,
      data: result,
    })
  } catch (error) {
    return handleServiceError(c, error)
  }
})

// GET /notifications/unread-count - Get unread notification count
notificationsRoutes.get('/unread-count', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const unreadCount = await notificationService.getUnreadCount(user.id)

    return c.json({
      success: true,
      data: { unreadCount },
    })
  } catch (error) {
    return handleServiceError(c, error)
  }
})

// GET /notifications/:id - Get a specific notification
notificationsRoutes.get('/:id', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const notificationId = c.req.param('id')

    if (!isValidUUID(notificationId)) {
      return c.json({ success: false, error: 'Invalid notification ID format' }, 400)
    }

    const notification = await notificationService.getNotification(user.id, notificationId)

    return c.json({
      success: true,
      data: { notification },
    })
  } catch (error) {
    return handleServiceError(c, error)
  }
})

// PATCH /notifications/:id/read - Mark a single notification as read
notificationsRoutes.patch('/:id/read', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const notificationId = c.req.param('id')

    if (!isValidUUID(notificationId)) {
      return c.json({ success: false, error: 'Invalid notification ID format' }, 400)
    }

    await notificationService.markAsRead(user.id, notificationId)
    const notification = await notificationService.getNotification(user.id, notificationId)

    return c.json({
      success: true,
      data: { notification },
    })
  } catch (error) {
    return handleServiceError(c, error)
  }
})

// POST /notifications/mark-read - Mark multiple notifications as read
notificationsRoutes.post('/mark-read', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const body = await c.req.json()

    const validation = MarkNotificationsReadRequestSchema.safeParse(body)
    if (!validation.success) {
      return c.json({
        success: false,
        error: 'Invalid request body',
        details: validation.error.flatten().fieldErrors,
      }, 400)
    }

    const markedCount = await notificationService.markMultipleAsRead(
      user.id,
      validation.data.notificationIds
    )

    return c.json({
      success: true,
      data: { markedCount },
    })
  } catch (error) {
    return handleServiceError(c, error)
  }
})

// POST /notifications/mark-all-read - Mark all notifications as read
notificationsRoutes.post('/mark-all-read', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const markedCount = await notificationService.markAllAsRead(user.id)

    return c.json({
      success: true,
      data: { markedCount },
    })
  } catch (error) {
    return handleServiceError(c, error)
  }
})

// DELETE /notifications/:id - Delete a notification
notificationsRoutes.delete('/:id', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const notificationId = c.req.param('id')

    if (!isValidUUID(notificationId)) {
      return c.json({ success: false, error: 'Invalid notification ID format' }, 400)
    }

    await notificationService.deleteNotification(user.id, notificationId)

    return c.json({
      success: true,
      data: { deleted: true },
    })
  } catch (error) {
    return handleServiceError(c, error)
  }
})

// DELETE /notifications - Delete all notifications for current user
notificationsRoutes.delete('/', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const readOnly = c.req.query('readOnly') === 'true'

    const deletedCount = await notificationService.deleteAllNotifications(user.id, readOnly)

    return c.json({
      success: true,
      data: { deletedCount },
    })
  } catch (error) {
    return handleServiceError(c, error)
  }
})

// ============================================
// Push Notifications API (T6.8)
// ============================================

// GET /notifications/push/vapid-public-key - Get VAPID public key
notificationsRoutes.get('/push/vapid-public-key', async (c) => {
  const publicKey = notificationService.getVapidPublicKey()

  if (!publicKey) {
    return c.json({
      success: false,
      error: 'Push notifications are not configured on this server',
    }, 503)
  }

  return c.json({
    success: true,
    data: { publicKey },
  })
})

// POST /notifications/push/subscribe - Subscribe to push notifications
notificationsRoutes.post('/push/subscribe', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const body = await c.req.json()

    if (!body.subscription || !body.subscription.endpoint || !body.subscription.keys) {
      return c.json({
        success: false,
        error: 'Invalid subscription object. Must include endpoint and keys (p256dh, auth)',
      }, 400)
    }

    const { endpoint, keys } = body.subscription

    if (!keys.p256dh || !keys.auth) {
      return c.json({
        success: false,
        error: 'Subscription keys must include p256dh and auth',
      }, 400)
    }

    const userAgent = c.req.header('User-Agent')

    const subscription = await notificationService.subscribeToPush(
      user.id,
      { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
      userAgent
    )

    return c.json({
      success: true,
      data: {
        id: subscription.id,
        createdAt: subscription.createdAt,
      },
    })
  } catch (error) {
    return handleServiceError(c, error)
  }
})

// DELETE /notifications/push/subscribe - Unsubscribe from push notifications
notificationsRoutes.delete('/push/subscribe', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const body = await c.req.json()

    if (!body.endpoint) {
      return c.json({
        success: false,
        error: 'Endpoint is required to unsubscribe',
      }, 400)
    }

    const success = await notificationService.unsubscribeFromPush(user.id, body.endpoint)

    return c.json({
      success: true,
      data: { unsubscribed: success },
    })
  } catch (error) {
    return handleServiceError(c, error)
  }
})

// GET /notifications/preferences - Get notification preferences
notificationsRoutes.get('/preferences', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const preferences = await notificationService.getPreferences(user.id)

    return c.json({
      success: true,
      data: preferences,
    })
  } catch (error) {
    return handleServiceError(c, error)
  }
})

// PATCH /notifications/preferences - Update notification preferences
notificationsRoutes.patch('/preferences', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const body = await c.req.json()

    const preferences = await notificationService.updatePreferences(user.id, body)

    return c.json({
      success: true,
      data: preferences,
    })
  } catch (error) {
    return handleServiceError(c, error)
  }
})

// POST /notifications/push/test - Send a test push notification
notificationsRoutes.post('/push/test', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const result = await notificationService.sendTestPush(user.id)

    return c.json({
      success: true,
      data: result,
    })
  } catch (error) {
    return handleServiceError(c, error)
  }
})

// POST /notifications/digest/test - Send a test digest email
notificationsRoutes.post('/digest/test', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const result = await notificationService.sendTestDigest(user.id)

    return c.json({
      success: true,
      data: {
        ...result,
        message: 'Test digest email sent successfully',
      },
    })
  } catch (error) {
    return handleServiceError(c, error)
  }
})

// GET /notifications/digest/history - Get digest send history
notificationsRoutes.get('/digest/history', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const limit = Math.min(Number(c.req.query('limit')) || 10, 50)

    const digests = await notificationService.getDigestHistory(user.id, limit)

    return c.json({
      success: true,
      data: { digests },
    })
  } catch (error) {
    return handleServiceError(c, error)
  }
})

export default notificationsRoutes
