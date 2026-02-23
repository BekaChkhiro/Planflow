import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { webhookRateLimit } from '../middleware/index.js'
import { webhookService, ServiceError } from '../services/index.js'
import { captureException } from '../lib/sentry.js'
import { logger } from '../lib/logger.js'
import { getDbClient, schema } from '../db/index.js'
import { verifyGitHubWebhookSignatureWithSecret } from '../lib/github.js'

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

// Project-specific GitHub webhook handler
// This endpoint uses project-specific webhook secrets for verification
webhooksRoutes.post('/github/project/:projectId', webhookRateLimit, async (c) => {
  try {
    const projectId = c.req.param('projectId')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      logger.warn('[GitHub Project Webhook] Invalid project ID format')
      return c.json({ success: false, error: 'Invalid project ID' }, 400)
    }

    // Get raw body for signature verification
    const rawBody = await c.req.text()
    const signature = c.req.header('x-hub-signature-256')
    const eventType = c.req.header('x-github-event')
    const deliveryId = c.req.header('x-github-delivery')

    if (!signature) {
      logger.warn('[GitHub Project Webhook] Missing signature header')
      return c.json({ success: false, error: 'Missing signature' }, 401)
    }

    if (!eventType || !deliveryId) {
      logger.warn('[GitHub Project Webhook] Missing event headers')
      return c.json({ success: false, error: 'Missing event headers' }, 400)
    }

    // Find project and get webhook secret
    const db = getDbClient()
    const [project] = await db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        githubWebhookSecret: schema.projects.githubWebhookSecret,
        githubRepository: schema.projects.githubRepository,
      })
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))

    if (!project) {
      logger.warn(`[GitHub Project Webhook] Project not found: ${projectId}`)
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    if (!project.githubWebhookSecret) {
      logger.warn(`[GitHub Project Webhook] No webhook secret configured for project: ${projectId}`)
      return c.json({ success: false, error: 'Webhook not configured for this project' }, 400)
    }

    // Verify signature using project-specific secret
    if (!verifyGitHubWebhookSignatureWithSecret(rawBody, signature, project.githubWebhookSecret)) {
      logger.warn(`[GitHub Project Webhook] Invalid signature for project: ${projectId}`)
      return c.json({ success: false, error: 'Invalid signature' }, 401)
    }

    logger.info(`[GitHub Project Webhook] Event: ${eventType}, Project: ${projectId}, Delivery: ${deliveryId}`)

    // Process the webhook event using the service
    const result = await webhookService.processGitHubWebhookForProject(
      rawBody,
      eventType,
      deliveryId,
      projectId
    )

    return c.json(result)
  } catch (error) {
    if (error instanceof ServiceError) {
      logger.warn(`[GitHub Project Webhook] ${error.code}: ${error.message}`)
      return c.json({
        success: false,
        error: error.message,
        code: error.code,
      }, error.statusCode as any)
    }

    logger.error({ err: error }, '[GitHub Project Webhook] Processing error')
    captureException(error)
    return c.json({ success: false, error: 'Webhook processing failed' }, 500)
  }
})

export { webhooksRoutes }
