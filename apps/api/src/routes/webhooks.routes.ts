import { Hono } from 'hono'
import { webhookRateLimit } from '../middleware/index.js'
import { webhookService, ServiceError } from '../services/index.js'
import { captureException } from '../lib/sentry.js'
import { logger } from '../lib/logger.js'

const webhooksRoutes = new Hono()

// LemonSqueezy webhook handler
webhooksRoutes.post('/lemonsqueezy', webhookRateLimit, async (c) => {
  try {
    // Get raw body for signature verification
    const rawBody = await c.req.text()
    const signature = c.req.header('x-signature')

    if (!signature) {
      logger.warn('[Webhook] Missing signature header')
      return c.json({ success: false, error: 'Missing signature' }, 401)
    }

    const result = await webhookService.processLemonSqueezyWebhook(rawBody, signature)

    return c.json(result)
  } catch (error) {
    if (error instanceof ServiceError) {
      logger.warn(`[Webhook] ${error.code}: ${error.message}`)
      return c.json({
        success: false,
        error: error.message,
        code: error.code,
      }, error.statusCode as any)
    }

    logger.error({ err: error }, '[Webhook] Processing error')
    captureException(error)
    return c.json({ success: false, error: 'Webhook processing failed' }, 500)
  }
})

// GitHub webhook handler
webhooksRoutes.post('/github', webhookRateLimit, async (c) => {
  try {
    // Get raw body for signature verification
    const rawBody = await c.req.text()
    const signature = c.req.header('x-hub-signature-256')
    const eventType = c.req.header('x-github-event')
    const deliveryId = c.req.header('x-github-delivery')

    if (!signature) {
      logger.warn('[GitHub Webhook] Missing signature header')
      return c.json({ success: false, error: 'Missing signature' }, 401)
    }

    if (!eventType || !deliveryId) {
      logger.warn('[GitHub Webhook] Missing event headers')
      return c.json({ success: false, error: 'Missing event headers' }, 400)
    }

    const result = await webhookService.processGitHubWebhook(
      rawBody,
      signature,
      eventType,
      deliveryId
    )

    return c.json(result)
  } catch (error) {
    if (error instanceof ServiceError) {
      logger.warn(`[GitHub Webhook] ${error.code}: ${error.message}`)
      return c.json({
        success: false,
        error: error.message,
        code: error.code,
      }, error.statusCode as any)
    }

    logger.error({ err: error }, '[GitHub Webhook] Processing error')
    captureException(error)
    return c.json({ success: false, error: 'Webhook processing failed' }, 500)
  }
})

export { webhooksRoutes }
