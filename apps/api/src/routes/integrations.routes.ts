import { Hono } from 'hono'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { GitHubCallbackRequestSchema } from '@planflow/shared'
import { getDbClient, schema } from '../db/index.js'
import { jwtAuth, auth, getAuth } from '../middleware/index.js'
import {
  isGitHubConfigured,
  getGitHubConfig,
  generateOAuthState,
  buildAuthorizationUrl,
  exchangeCodeForToken,
  fetchGitHubUser,
  fetchGitHubEmail,
  fetchGitHubRepositories,
  validateAccessToken,
  fetchGitHubIssue,
  listGitHubIssues,
  searchGitHubIssues,
  createGitHubIssue,
  fetchGitHubPullRequest,
  listGitHubPullRequests,
  searchGitHubPullRequests,
  createGitHubPullRequest,
  getPrState,
  generateBranchName,
  generateBranchNameAuto,
  type GitHubPullRequest,
  type BranchPrefix,
} from '../lib/github.js'
import {
  sendSlackNotification,
  sendSlackTestMessage,
  isValidSlackWebhookUrl,
  type SlackConfig,
} from '../lib/slack.js'
import {
  sendDiscordNotification,
  sendDiscordTestMessage,
  isValidDiscordWebhookUrl,
  type DiscordConfig,
} from '../lib/discord.js'

const integrationsRoutes = new Hono()

// ============================================
// Zod Schemas for Integration Requests
// ============================================

const CreateIntegrationRequestSchema = z.object({
  provider: z.enum(['slack', 'discord']),
  name: z.string().min(1).max(100),
  webhookUrl: z.string().url(),
  projectId: z.string().uuid().optional(),
  config: z.object({
    channel: z.string().optional(),
    username: z.string().optional(),
    icon_emoji: z.string().optional(),
    icon_url: z.string().url().optional(),
    includeLinks: z.boolean().optional(),
    mentionUsers: z.boolean().optional(),
  }).optional(),
  enabledEvents: z.array(z.string()).optional(),
})

const UpdateIntegrationRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  webhookUrl: z.string().url().optional(),
  active: z.boolean().optional(),
  config: z.object({
    channel: z.string().optional(),
    username: z.string().optional(),
    icon_emoji: z.string().optional(),
    icon_url: z.string().url().optional(),
    includeLinks: z.boolean().optional(),
    mentionUsers: z.boolean().optional(),
  }).optional(),
  enabledEvents: z.array(z.string()).optional(),
})

// ============================================
// Helper Functions
// ============================================

// Helper to get user's default organization
async function getUserDefaultOrganization(userId: string) {
  const db = getDbClient()
  const [membership] = await db
    .select({
      organizationId: schema.organizationMembers.organizationId,
      role: schema.organizationMembers.role,
    })
    .from(schema.organizationMembers)
    .where(eq(schema.organizationMembers.userId, userId))
    .orderBy(schema.organizationMembers.createdAt)
    .limit(1)
  return membership
}

// ============================================
// Organization-scoped Integration Routes
// ============================================

// POST /organizations/:id/integrations - Create integration
integrationsRoutes.post('/organizations/:id/integrations', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orgId)) {
      return c.json({ success: false, error: 'Invalid organization ID format' }, 400)
    }

    const body = await c.req.json()
    const validation = CreateIntegrationRequestSchema.safeParse(body)

    if (!validation.success) {
      return c.json({
        success: false,
        error: 'Validation failed',
        details: validation.error.flatten().fieldErrors,
      }, 400)
    }

    const { provider, name, webhookUrl, projectId, config, enabledEvents } = validation.data
    const db = getDbClient()

    // Check membership (must be owner or admin)
    const [membership] = await db
      .select({ role: schema.organizationMembers.role })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, orgId),
          eq(schema.organizationMembers.userId, user.id)
        )
      )
      .limit(1)

    if (!membership) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    if (membership.role !== 'owner' && membership.role !== 'admin') {
      return c.json({ success: false, error: 'Only owners and admins can create integrations' }, 403)
    }

    // Validate webhook URL for Slack
    if (provider === 'slack' && !isValidSlackWebhookUrl(webhookUrl)) {
      return c.json({ success: false, error: 'Invalid Slack webhook URL. Must be a valid hooks.slack.com URL.' }, 400)
    }

    // Validate webhook URL for Discord
    if (provider === 'discord' && !isValidDiscordWebhookUrl(webhookUrl)) {
      return c.json({ success: false, error: 'Invalid Discord webhook URL. Must be a valid discord.com/api/webhooks URL.' }, 400)
    }

    // If projectId provided, verify it exists
    if (projectId) {
      const [project] = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.id, projectId))
        .limit(1)

      if (!project) {
        return c.json({ success: false, error: 'Project not found' }, 404)
      }
    }

    // Create integration
    const [integration] = await db
      .insert(schema.integrations)
      .values({
        organizationId: orgId,
        projectId: projectId || null,
        provider: provider as 'slack' | 'discord',
        name,
        webhookUrl,
        config: config || {},
        enabledEvents: enabledEvents || null,
        createdBy: user.id,
        active: true,
      })
      .returning()

    return c.json({
      success: true,
      data: { integration },
    }, 201)
  } catch (error) {
    console.error('Create integration error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /organizations/:id/integrations - List integrations
integrationsRoutes.get('/organizations/:id/integrations', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orgId)) {
      return c.json({ success: false, error: 'Invalid organization ID format' }, 400)
    }

    const db = getDbClient()

    // Check membership
    const [membership] = await db
      .select({ role: schema.organizationMembers.role })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, orgId),
          eq(schema.organizationMembers.userId, user.id)
        )
      )
      .limit(1)

    if (!membership) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    // Get all integrations for this organization
    const integrations = await db
      .select({
        id: schema.integrations.id,
        organizationId: schema.integrations.organizationId,
        projectId: schema.integrations.projectId,
        provider: schema.integrations.provider,
        name: schema.integrations.name,
        active: schema.integrations.active,
        config: schema.integrations.config,
        enabledEvents: schema.integrations.enabledEvents,
        createdBy: schema.integrations.createdBy,
        createdAt: schema.integrations.createdAt,
        updatedAt: schema.integrations.updatedAt,
        lastDeliveryAt: schema.integrations.lastDeliveryAt,
        lastDeliveryStatus: schema.integrations.lastDeliveryStatus,
      })
      .from(schema.integrations)
      .where(eq(schema.integrations.organizationId, orgId))
      .orderBy(desc(schema.integrations.createdAt))

    return c.json({
      success: true,
      data: { integrations },
    })
  } catch (error) {
    console.error('List integrations error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /organizations/:id/integrations/:integrationId - Get integration details
integrationsRoutes.get('/organizations/:id/integrations/:integrationId', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')
    const integrationId = c.req.param('integrationId')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orgId) || !uuidRegex.test(integrationId)) {
      return c.json({ success: false, error: 'Invalid ID format' }, 400)
    }

    const db = getDbClient()

    // Check membership
    const [membership] = await db
      .select({ role: schema.organizationMembers.role })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, orgId),
          eq(schema.organizationMembers.userId, user.id)
        )
      )
      .limit(1)

    if (!membership) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    // Get integration
    const [integration] = await db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.id, integrationId),
          eq(schema.integrations.organizationId, orgId)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'Integration not found' }, 404)
    }

    // Get recent webhook deliveries
    const webhookHistory = await db
      .select()
      .from(schema.integrationWebhooks)
      .where(eq(schema.integrationWebhooks.integrationId, integrationId))
      .orderBy(desc(schema.integrationWebhooks.deliveredAt))
      .limit(10)

    return c.json({
      success: true,
      data: { integration, webhookHistory },
    })
  } catch (error) {
    console.error('Get integration error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// PATCH /organizations/:id/integrations/:integrationId - Update integration
integrationsRoutes.patch('/organizations/:id/integrations/:integrationId', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')
    const integrationId = c.req.param('integrationId')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orgId) || !uuidRegex.test(integrationId)) {
      return c.json({ success: false, error: 'Invalid ID format' }, 400)
    }

    const body = await c.req.json()
    const validation = UpdateIntegrationRequestSchema.safeParse(body)

    if (!validation.success) {
      return c.json({
        success: false,
        error: 'Validation failed',
        details: validation.error.flatten().fieldErrors,
      }, 400)
    }

    const db = getDbClient()

    // Check membership (must be owner or admin)
    const [membership] = await db
      .select({ role: schema.organizationMembers.role })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, orgId),
          eq(schema.organizationMembers.userId, user.id)
        )
      )
      .limit(1)

    if (!membership) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    if (membership.role !== 'owner' && membership.role !== 'admin') {
      return c.json({ success: false, error: 'Only owners and admins can update integrations' }, 403)
    }

    // Get existing integration
    const [existingIntegration] = await db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.id, integrationId),
          eq(schema.integrations.organizationId, orgId)
        )
      )
      .limit(1)

    if (!existingIntegration) {
      return c.json({ success: false, error: 'Integration not found' }, 404)
    }

    const { name, webhookUrl, active, config, enabledEvents } = validation.data

    // Validate webhook URL if being updated for Slack
    if (webhookUrl && existingIntegration.provider === 'slack' && !isValidSlackWebhookUrl(webhookUrl)) {
      return c.json({ success: false, error: 'Invalid Slack webhook URL' }, 400)
    }

    // Validate webhook URL if being updated for Discord
    if (webhookUrl && existingIntegration.provider === 'discord' && !isValidDiscordWebhookUrl(webhookUrl)) {
      return c.json({ success: false, error: 'Invalid Discord webhook URL' }, 400)
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }
    if (name !== undefined) updateData['name'] = name
    if (webhookUrl !== undefined) updateData['webhookUrl'] = webhookUrl
    if (active !== undefined) updateData['active'] = active
    if (config !== undefined) updateData['config'] = { ...existingIntegration.config as object, ...config }
    if (enabledEvents !== undefined) updateData['enabledEvents'] = enabledEvents

    const [updatedIntegration] = await db
      .update(schema.integrations)
      .set(updateData)
      .where(eq(schema.integrations.id, integrationId))
      .returning()

    return c.json({
      success: true,
      data: { integration: updatedIntegration },
    })
  } catch (error) {
    console.error('Update integration error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// DELETE /organizations/:id/integrations/:integrationId - Delete integration
integrationsRoutes.delete('/organizations/:id/integrations/:integrationId', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')
    const integrationId = c.req.param('integrationId')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orgId) || !uuidRegex.test(integrationId)) {
      return c.json({ success: false, error: 'Invalid ID format' }, 400)
    }

    const db = getDbClient()

    // Check membership (must be owner or admin)
    const [membership] = await db
      .select({ role: schema.organizationMembers.role })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, orgId),
          eq(schema.organizationMembers.userId, user.id)
        )
      )
      .limit(1)

    if (!membership) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    if (membership.role !== 'owner' && membership.role !== 'admin') {
      return c.json({ success: false, error: 'Only owners and admins can delete integrations' }, 403)
    }

    const [deletedIntegration] = await db
      .delete(schema.integrations)
      .where(
        and(
          eq(schema.integrations.id, integrationId),
          eq(schema.integrations.organizationId, orgId)
        )
      )
      .returning({ id: schema.integrations.id })

    if (!deletedIntegration) {
      return c.json({ success: false, error: 'Integration not found' }, 404)
    }

    return c.json({
      success: true,
      data: { message: 'Integration deleted successfully' },
    })
  } catch (error) {
    console.error('Delete integration error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// POST /organizations/:id/integrations/:integrationId/test - Send test webhook
integrationsRoutes.post('/organizations/:id/integrations/:integrationId/test', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')
    const integrationId = c.req.param('integrationId')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orgId) || !uuidRegex.test(integrationId)) {
      return c.json({ success: false, error: 'Invalid ID format' }, 400)
    }

    const db = getDbClient()

    // Check membership
    const [membership] = await db
      .select({ role: schema.organizationMembers.role })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, orgId),
          eq(schema.organizationMembers.userId, user.id)
        )
      )
      .limit(1)

    if (!membership) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    // Get integration
    const [integration] = await db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.id, integrationId),
          eq(schema.integrations.organizationId, orgId)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'Integration not found' }, 404)
    }

    if (!integration.webhookUrl) {
      return c.json({ success: false, error: 'No webhook URL configured' }, 400)
    }

    // Send test message based on provider
    let result: { success: boolean; error?: string; statusCode?: number; durationMs?: number }

    if (integration.provider === 'slack') {
      result = await sendSlackTestMessage(
        integration.webhookUrl,
        integration.config as SlackConfig
      )
    } else if (integration.provider === 'discord') {
      result = await sendDiscordTestMessage(
        integration.webhookUrl,
        integration.config as DiscordConfig
      )
    } else {
      return c.json({ success: false, error: 'Unsupported provider for test message' }, 400)
    }

    // Log the delivery
    await db.insert(schema.integrationWebhooks).values({
      integrationId: integration.id,
      eventType: 'test',
      payload: { test: true },
      statusCode: result.statusCode?.toString() || null,
      error: result.error || null,
      success: result.success,
      durationMs: result.durationMs?.toString() || null,
    })

    // Update last delivery status
    await db
      .update(schema.integrations)
      .set({
        lastDeliveryAt: new Date(),
        lastDeliveryStatus: result.success ? 'success' : 'failed',
        lastDeliveryError: result.error || null,
        updatedAt: new Date(),
      })
      .where(eq(schema.integrations.id, integrationId))

    if (result.success) {
      return c.json({
        success: true,
        data: { message: 'Test message sent successfully', durationMs: result.durationMs },
      })
    } else {
      return c.json({
        success: false,
        error: result.error || 'Failed to send test message',
      }, 400)
    }
  } catch (error) {
    console.error('Test integration error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// ============================================
// User-scoped Slack/Discord Integration Routes
// ============================================

// GET /integrations - List all integrations for user's default organization
integrationsRoutes.get('/integrations', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    // Get user's default organization
    const membership = await getUserDefaultOrganization(user.id)
    if (!membership) {
      return c.json({
        success: true,
        data: { integrations: [] },
      })
    }

    // Get integrations
    const integrations = await db
      .select()
      .from(schema.integrations)
      .where(eq(schema.integrations.organizationId, membership.organizationId))
      .orderBy(schema.integrations.createdAt)

    // Format integrations for frontend
    const formattedIntegrations = integrations.map((integration) => ({
      id: integration.id,
      type: integration.provider,
      status: integration.active ? 'connected' : 'disconnected',
      connectedAt: integration.createdAt?.toISOString() || null,
      enabledEvents: integration.enabledEvents || [],
      metadata: {
        workspace: (integration.config as Record<string, unknown>)?.['workspace'] || null,
        channel: (integration.config as Record<string, unknown>)?.['channel'] || null,
        server: (integration.config as Record<string, unknown>)?.['server'] || null,
        webhookConfigured: !!integration.webhookUrl,
      },
    }))

    return c.json({
      success: true,
      data: { integrations: formattedIntegrations },
    })
  } catch (error) {
    console.error('Get integrations error:', error)
    return c.json({ success: false, error: 'Failed to fetch integrations' }, 500)
  }
})

// POST /integrations/:type/webhook - Configure webhook for Slack/Discord
integrationsRoutes.post('/integrations/:type/webhook', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const type = c.req.param('type') as 'slack' | 'discord'

    if (type !== 'slack' && type !== 'discord') {
      return c.json({ success: false, error: 'Invalid integration type' }, 400)
    }

    const body = await c.req.json()
    const { webhookUrl, channel } = body

    if (!webhookUrl) {
      return c.json({ success: false, error: 'Webhook URL is required' }, 400)
    }

    // Validate webhook URL format
    if (type === 'slack' && !webhookUrl.startsWith('https://hooks.slack.com/')) {
      return c.json({ success: false, error: 'Invalid Slack webhook URL' }, 400)
    }
    if (type === 'discord' && !webhookUrl.includes('discord.com/api/webhooks/')) {
      return c.json({ success: false, error: 'Invalid Discord webhook URL' }, 400)
    }

    const db = getDbClient()

    // Get user's default organization
    const membership = await getUserDefaultOrganization(user.id)
    if (!membership) {
      return c.json({ success: false, error: 'No organization found' }, 404)
    }

    // Check if integration already exists
    const [existing] = await db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.organizationId, membership.organizationId),
          eq(schema.integrations.provider, type)
        )
      )
      .limit(1)

    const config = type === 'slack'
      ? { channel: channel || null }
      : {}

    // Default enabled events
    const defaultEvents = [
      'task_status_changed',
      'task_assigned',
      'task_completed',
      'comment_created',
      'mention',
      'member_joined',
    ]

    let integration: typeof schema.integrations.$inferSelect | undefined
    if (existing) {
      // Update existing
      const [updated] = await db
        .update(schema.integrations)
        .set({
          webhookUrl,
          config,
          active: true,
          updatedAt: new Date(),
        })
        .where(eq(schema.integrations.id, existing.id))
        .returning()
      integration = updated
    } else {
      // Create new
      const [created] = await db
        .insert(schema.integrations)
        .values({
          organizationId: membership.organizationId,
          provider: type,
          name: type === 'slack' ? 'Slack' : 'Discord',
          webhookUrl,
          config,
          enabledEvents: defaultEvents,
          active: true,
          createdBy: user.id,
        })
        .returning()
      integration = created
    }

    if (!integration) {
      return c.json({ success: false, error: 'Failed to save integration' }, 500)
    }

    return c.json({
      success: true,
      data: {
        integration: {
          id: integration.id,
          type: integration.provider,
          status: 'connected',
          connectedAt: integration.createdAt?.toISOString() || null,
          enabledEvents: integration.enabledEvents || defaultEvents,
          metadata: {
            channel: (integration.config as Record<string, unknown>)?.['channel'] || null,
            webhookConfigured: true,
          },
        },
      },
    })
  } catch (error) {
    console.error('Configure webhook error:', error)
    return c.json({ success: false, error: 'Failed to configure webhook' }, 500)
  }
})

// DELETE /integrations/:type - Disconnect Slack/Discord integration
integrationsRoutes.delete('/integrations/:type', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const type = c.req.param('type') as 'slack' | 'discord'

    if (type !== 'slack' && type !== 'discord') {
      return c.json({ success: false, error: 'Invalid integration type' }, 400)
    }

    const db = getDbClient()

    // Get user's default organization
    const membership = await getUserDefaultOrganization(user.id)
    if (!membership) {
      return c.json({ success: false, error: 'No organization found' }, 404)
    }

    // Delete integration
    await db
      .delete(schema.integrations)
      .where(
        and(
          eq(schema.integrations.organizationId, membership.organizationId),
          eq(schema.integrations.provider, type)
        )
      )

    return c.json({
      success: true,
      message: `${type.charAt(0).toUpperCase() + type.slice(1)} disconnected successfully`,
    })
  } catch (error) {
    console.error('Disconnect integration error:', error)
    return c.json({ success: false, error: 'Failed to disconnect integration' }, 500)
  }
})

// PATCH /integrations/:type/:id - Update integration (including notification preferences)
integrationsRoutes.patch('/integrations/:type/:id', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const type = c.req.param('type') as 'slack' | 'discord'
    const integrationId = c.req.param('id')

    if (type !== 'slack' && type !== 'discord') {
      return c.json({ success: false, error: 'Invalid integration type' }, 400)
    }

    const body = await c.req.json()
    const { enabledEvents, active, name, webhookUrl, config } = body

    const db = getDbClient()

    // Get user's default organization
    const membership = await getUserDefaultOrganization(user.id)
    if (!membership) {
      return c.json({ success: false, error: 'No organization found' }, 404)
    }

    // Verify integration belongs to user's organization
    const [integration] = await db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.id, integrationId),
          eq(schema.integrations.organizationId, membership.organizationId)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'Integration not found' }, 404)
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (enabledEvents !== undefined) {
      updateData['enabledEvents'] = enabledEvents
    }
    if (active !== undefined) {
      updateData['active'] = active
    }
    if (name !== undefined) {
      updateData['name'] = name
    }
    if (webhookUrl !== undefined) {
      updateData['webhookUrl'] = webhookUrl
    }
    if (config !== undefined) {
      updateData['config'] = { ...integration.config as Record<string, unknown>, ...config }
    }

    // Update integration
    const [updated] = await db
      .update(schema.integrations)
      .set(updateData)
      .where(eq(schema.integrations.id, integrationId))
      .returning()

    if (!updated) {
      return c.json({ success: false, error: 'Failed to update integration' }, 500)
    }

    return c.json({
      success: true,
      data: {
        integration: {
          id: updated.id,
          type: updated.provider,
          status: updated.active ? 'connected' : 'disconnected',
          connectedAt: updated.createdAt?.toISOString() || null,
          enabledEvents: updated.enabledEvents || [],
          metadata: {
            channel: (updated.config as Record<string, unknown>)?.['channel'] || null,
            webhookConfigured: !!updated.webhookUrl,
          },
        },
      },
    })
  } catch (error) {
    console.error('Update integration error:', error)
    return c.json({ success: false, error: 'Failed to update integration' }, 500)
  }
})

// POST /integrations/:type/:id/test - Send test message
integrationsRoutes.post('/integrations/:type/:id/test', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const type = c.req.param('type') as 'slack' | 'discord'
    const integrationId = c.req.param('id')

    if (type !== 'slack' && type !== 'discord') {
      return c.json({ success: false, error: 'Invalid integration type' }, 400)
    }

    const db = getDbClient()

    // Get user's default organization
    const membership = await getUserDefaultOrganization(user.id)
    if (!membership) {
      return c.json({ success: false, error: 'No organization found' }, 404)
    }

    // Get integration
    const [integration] = await db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.id, integrationId),
          eq(schema.integrations.organizationId, membership.organizationId)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'Integration not found' }, 404)
    }

    if (!integration.webhookUrl) {
      return c.json({ success: false, error: 'No webhook URL configured' }, 400)
    }

    // Send test message
    let result: { success: boolean; error?: string; statusCode?: number; durationMs?: number }

    if (type === 'slack') {
      result = await sendSlackTestMessage(
        integration.webhookUrl,
        integration.config as SlackConfig
      )
    } else {
      result = await sendDiscordTestMessage(
        integration.webhookUrl,
        integration.config as DiscordConfig
      )
    }

    // Log delivery
    await db.insert(schema.integrationWebhooks).values({
      integrationId: integration.id,
      eventType: 'test',
      payload: { test: true },
      statusCode: result.statusCode?.toString() || null,
      error: result.error || null,
      success: result.success,
      durationMs: result.durationMs?.toString() || null,
    })

    // Update last delivery status
    await db
      .update(schema.integrations)
      .set({
        lastDeliveryAt: new Date(),
        lastDeliveryStatus: result.success ? 'success' : 'failed',
        lastDeliveryError: result.error || null,
        updatedAt: new Date(),
      })
      .where(eq(schema.integrations.id, integrationId))

    if (result.success) {
      return c.json({
        success: true,
        message: 'Test message sent successfully',
      })
    } else {
      return c.json({
        success: false,
        error: result.error || 'Failed to send test message',
      }, 400)
    }
  } catch (error) {
    console.error('Test webhook error:', error)
    return c.json({ success: false, error: 'Failed to send test message' }, 500)
  }
})

// ============================================
// GitHub OAuth Routes
// ============================================

// Get GitHub OAuth configuration status
integrationsRoutes.get('/integrations/github/config', jwtAuth, async (c) => {
  try {
    const config = getGitHubConfig()
    return c.json({
      success: true,
      data: {
        configured: config.configured,
        scopes: config.scopes,
      },
    })
  } catch (error) {
    console.error('Get GitHub config error:', error)
    return c.json({ success: false, error: 'Failed to get GitHub configuration' }, 500)
  }
})

// Get current GitHub integration status
integrationsRoutes.get('/integrations/github', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    // Check if GitHub OAuth is configured
    if (!isGitHubConfigured()) {
      return c.json({
        success: true,
        data: {
          configured: false,
          connected: false,
          integration: null,
        },
      })
    }

    // Get current integration
    const [integration] = await db
      .select({
        id: schema.githubIntegrations.id,
        githubId: schema.githubIntegrations.githubId,
        githubUsername: schema.githubIntegrations.githubUsername,
        githubEmail: schema.githubIntegrations.githubEmail,
        githubAvatarUrl: schema.githubIntegrations.githubAvatarUrl,
        githubName: schema.githubIntegrations.githubName,
        grantedScopes: schema.githubIntegrations.grantedScopes,
        isConnected: schema.githubIntegrations.isConnected,
        lastSyncAt: schema.githubIntegrations.lastSyncAt,
        createdAt: schema.githubIntegrations.createdAt,
        updatedAt: schema.githubIntegrations.updatedAt,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    return c.json({
      success: true,
      data: {
        configured: true,
        connected: !!integration,
        integration: integration || null,
      },
    })
  } catch (error) {
    console.error('Get GitHub integration error:', error)
    return c.json({ success: false, error: 'Failed to get GitHub integration' }, 500)
  }
})

// Start GitHub OAuth flow - get authorization URL
integrationsRoutes.post('/integrations/github/authorize', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    // Check if GitHub OAuth is configured
    if (!isGitHubConfigured()) {
      return c.json(
        {
          success: false,
          error: 'GitHub integration is not configured on the server',
        },
        400
      )
    }

    // Check if user already has an active connection
    const [existingIntegration] = await db
      .select({ id: schema.githubIntegrations.id })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (existingIntegration) {
      return c.json(
        {
          success: false,
          error: 'GitHub is already connected. Disconnect first to reconnect.',
        },
        400
      )
    }

    // Generate state token for CSRF protection
    const state = generateOAuthState()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    // Store state token
    await db.insert(schema.githubOAuthStates).values({
      userId: user.id,
      state,
      expiresAt,
    })

    // Build authorization URL
    const authorizationUrl = buildAuthorizationUrl(state)

    return c.json({
      success: true,
      data: {
        authorizationUrl,
        state,
        expiresIn: 600, // 10 minutes in seconds
      },
    })
  } catch (error) {
    console.error('GitHub authorize error:', error)
    return c.json({ success: false, error: 'Failed to initiate GitHub authorization' }, 500)
  }
})

// Handle GitHub OAuth callback
integrationsRoutes.post('/integrations/github/callback', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    // Parse and validate request
    const body = await c.req.json()
    const validation = GitHubCallbackRequestSchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
        },
        400
      )
    }

    const { code, state } = validation.data

    // Verify state token
    const [storedState] = await db
      .select({
        id: schema.githubOAuthStates.id,
        userId: schema.githubOAuthStates.userId,
        expiresAt: schema.githubOAuthStates.expiresAt,
        usedAt: schema.githubOAuthStates.usedAt,
      })
      .from(schema.githubOAuthStates)
      .where(eq(schema.githubOAuthStates.state, state))
      .limit(1)

    if (!storedState) {
      return c.json(
        {
          success: false,
          error: 'Invalid or expired state token',
        },
        400
      )
    }

    // Check if state was already used
    if (storedState.usedAt) {
      return c.json(
        {
          success: false,
          error: 'State token has already been used',
        },
        400
      )
    }

    // Check if state belongs to this user
    if (storedState.userId !== user.id) {
      return c.json(
        {
          success: false,
          error: 'State token mismatch',
        },
        403
      )
    }

    // Check if state is expired
    if (new Date() > storedState.expiresAt) {
      return c.json(
        {
          success: false,
          error: 'State token has expired. Please try again.',
        },
        400
      )
    }

    // Mark state as used
    await db
      .update(schema.githubOAuthStates)
      .set({ usedAt: new Date() })
      .where(eq(schema.githubOAuthStates.id, storedState.id))

    // Exchange code for access token
    const tokenResult = await exchangeCodeForToken(code)

    if (!tokenResult) {
      return c.json(
        {
          success: false,
          error: 'Failed to exchange authorization code for token',
        },
        400
      )
    }

    // Fetch GitHub user info
    const githubUser = await fetchGitHubUser(tokenResult.accessToken)

    if (!githubUser) {
      return c.json(
        {
          success: false,
          error: 'Failed to fetch GitHub user information',
        },
        400
      )
    }

    // Get email if not provided
    let email = githubUser.email
    if (!email) {
      email = await fetchGitHubEmail(tokenResult.accessToken)
    }

    // Check if this GitHub account is already linked to another user
    const [existingLink] = await db
      .select({
        id: schema.githubIntegrations.id,
        userId: schema.githubIntegrations.userId,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.githubId, String(githubUser.id)),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (existingLink && existingLink.userId !== user.id) {
      return c.json(
        {
          success: false,
          error: 'This GitHub account is already linked to another user',
        },
        400
      )
    }

    // Disconnect any existing integration for this user
    await db
      .update(schema.githubIntegrations)
      .set({
        isConnected: false,
        disconnectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )

    // Parse granted scopes
    const grantedScopes = tokenResult.scope ? tokenResult.scope.split(/[,\s]+/) : []

    // Create new integration record
    const [newIntegration] = await db
      .insert(schema.githubIntegrations)
      .values({
        userId: user.id,
        githubId: String(githubUser.id),
        githubUsername: githubUser.login,
        githubEmail: email,
        githubAvatarUrl: githubUser.avatar_url,
        githubName: githubUser.name,
        accessToken: tokenResult.accessToken,
        grantedScopes,
        isConnected: true,
        lastSyncAt: new Date(),
      })
      .returning({
        id: schema.githubIntegrations.id,
        githubId: schema.githubIntegrations.githubId,
        githubUsername: schema.githubIntegrations.githubUsername,
        githubEmail: schema.githubIntegrations.githubEmail,
        githubAvatarUrl: schema.githubIntegrations.githubAvatarUrl,
        githubName: schema.githubIntegrations.githubName,
        grantedScopes: schema.githubIntegrations.grantedScopes,
        isConnected: schema.githubIntegrations.isConnected,
        lastSyncAt: schema.githubIntegrations.lastSyncAt,
        createdAt: schema.githubIntegrations.createdAt,
        updatedAt: schema.githubIntegrations.updatedAt,
      })

    return c.json({
      success: true,
      data: {
        integration: newIntegration,
        message: `Successfully connected to GitHub as @${githubUser.login}`,
      },
    })
  } catch (error) {
    console.error('GitHub callback error:', error)
    return c.json({ success: false, error: 'Failed to complete GitHub authorization' }, 500)
  }
})

// Disconnect GitHub integration
integrationsRoutes.post('/integrations/github/disconnect', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    // Find and disconnect integration
    const [updated] = await db
      .update(schema.githubIntegrations)
      .set({
        isConnected: false,
        disconnectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .returning({ id: schema.githubIntegrations.id })

    if (!updated) {
      return c.json(
        {
          success: false,
          error: 'No active GitHub integration found',
        },
        404
      )
    }

    return c.json({
      success: true,
      data: {
        message: 'GitHub integration disconnected successfully',
      },
    })
  } catch (error) {
    console.error('GitHub disconnect error:', error)
    return c.json({ success: false, error: 'Failed to disconnect GitHub integration' }, 500)
  }
})

// Refresh GitHub user info
integrationsRoutes.post('/integrations/github/refresh', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    // Get current integration
    const [integration] = await db
      .select({
        id: schema.githubIntegrations.id,
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json(
        {
          success: false,
          error: 'No active GitHub integration found',
        },
        404
      )
    }

    // Validate token is still valid
    const isValid = await validateAccessToken(integration.accessToken)

    if (!isValid) {
      // Token is invalid, mark as disconnected
      await db
        .update(schema.githubIntegrations)
        .set({
          isConnected: false,
          disconnectedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.githubIntegrations.id, integration.id))

      return c.json(
        {
          success: false,
          error: 'GitHub token is no longer valid. Please reconnect.',
        },
        401
      )
    }

    // Fetch fresh user info
    const githubUser = await fetchGitHubUser(integration.accessToken)

    if (!githubUser) {
      return c.json(
        {
          success: false,
          error: 'Failed to fetch GitHub user information',
        },
        500
      )
    }

    // Get email if not provided
    let email = githubUser.email
    if (!email) {
      email = await fetchGitHubEmail(integration.accessToken)
    }

    // Update integration with fresh data
    const [updated] = await db
      .update(schema.githubIntegrations)
      .set({
        githubUsername: githubUser.login,
        githubEmail: email,
        githubAvatarUrl: githubUser.avatar_url,
        githubName: githubUser.name,
        lastSyncAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.githubIntegrations.id, integration.id))
      .returning({
        id: schema.githubIntegrations.id,
        githubId: schema.githubIntegrations.githubId,
        githubUsername: schema.githubIntegrations.githubUsername,
        githubEmail: schema.githubIntegrations.githubEmail,
        githubAvatarUrl: schema.githubIntegrations.githubAvatarUrl,
        githubName: schema.githubIntegrations.githubName,
        grantedScopes: schema.githubIntegrations.grantedScopes,
        isConnected: schema.githubIntegrations.isConnected,
        lastSyncAt: schema.githubIntegrations.lastSyncAt,
        createdAt: schema.githubIntegrations.createdAt,
        updatedAt: schema.githubIntegrations.updatedAt,
      })

    return c.json({
      success: true,
      data: {
        integration: updated,
      },
    })
  } catch (error) {
    console.error('GitHub refresh error:', error)
    return c.json({ success: false, error: 'Failed to refresh GitHub information' }, 500)
  }
})

// List user's GitHub repositories
integrationsRoutes.get('/integrations/github/repos', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    const page = Number(c.req.query('page')) || 1
    const perPage = Math.min(Number(c.req.query('per_page')) || 30, 100)

    // Get current integration
    const [integration] = await db
      .select({
        id: schema.githubIntegrations.id,
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json(
        {
          success: false,
          error: 'No active GitHub integration found',
        },
        404
      )
    }

    // Fetch repositories
    const repos = await fetchGitHubRepositories(integration.accessToken, page, perPage)

    return c.json({
      success: true,
      data: {
        repositories: repos.map((repo) => ({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          owner: repo.owner.login,
          ownerAvatar: repo.owner.avatar_url,
          description: repo.description,
          private: repo.private,
          htmlUrl: repo.html_url,
          defaultBranch: repo.default_branch,
        })),
        page,
        perPage,
      },
    })
  } catch (error) {
    console.error('GitHub repos error:', error)
    return c.json({ success: false, error: 'Failed to fetch GitHub repositories' }, 500)
  }
})

// ============================================
// GitHub Issues API
// ============================================

// List issues in a repository
integrationsRoutes.get('/integrations/github/repos/:owner/:repo/issues', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const owner = c.req.param('owner')
    const repo = c.req.param('repo')
    const db = getDbClient()

    const state = (c.req.query('state') as 'open' | 'closed' | 'all') || 'open'
    const page = Number(c.req.query('page')) || 1
    const perPage = Math.min(Number(c.req.query('per_page')) || 30, 100)
    const search = c.req.query('search')

    // Get current integration
    const [integration] = await db
      .select({
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'No active GitHub integration found' }, 404)
    }

    let issues
    let totalCount = 0

    if (search && search.trim()) {
      // Use search API
      const result = await searchGitHubIssues(integration.accessToken, owner, repo, search.trim(), {
        state: state === 'all' ? undefined : state,
        page,
        perPage,
      })
      issues = result.items
      totalCount = result.totalCount
    } else {
      // List issues
      issues = await listGitHubIssues(integration.accessToken, owner, repo, {
        state,
        page,
        perPage,
      })
    }

    return c.json({
      success: true,
      data: {
        issues: issues.map((issue) => ({
          id: issue.id,
          number: issue.number,
          title: issue.title,
          state: issue.state,
          htmlUrl: issue.html_url,
          createdAt: issue.created_at,
          updatedAt: issue.updated_at,
          user: {
            login: issue.user.login,
            avatarUrl: issue.user.avatar_url,
          },
          labels: issue.labels.map((l) => ({
            name: l.name,
            color: l.color,
          })),
        })),
        page,
        perPage,
        totalCount,
      },
    })
  } catch (error) {
    console.error('GitHub issues list error:', error)
    return c.json({ success: false, error: 'Failed to fetch GitHub issues' }, 500)
  }
})

// Get a single GitHub issue
integrationsRoutes.get('/integrations/github/repos/:owner/:repo/issues/:issueNumber', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const owner = c.req.param('owner')
    const repo = c.req.param('repo')
    const issueNumber = Number(c.req.param('issueNumber'))
    const db = getDbClient()

    if (isNaN(issueNumber) || issueNumber <= 0) {
      return c.json({ success: false, error: 'Invalid issue number' }, 400)
    }

    // Get current integration
    const [integration] = await db
      .select({
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'No active GitHub integration found' }, 404)
    }

    const issue = await fetchGitHubIssue(integration.accessToken, owner, repo, issueNumber)

    if (!issue) {
      return c.json({ success: false, error: 'Issue not found' }, 404)
    }

    return c.json({
      success: true,
      data: {
        issue: {
          id: issue.id,
          number: issue.number,
          title: issue.title,
          body: issue.body,
          state: issue.state,
          htmlUrl: issue.html_url,
          createdAt: issue.created_at,
          updatedAt: issue.updated_at,
          closedAt: issue.closed_at,
          user: {
            login: issue.user.login,
            avatarUrl: issue.user.avatar_url,
          },
          labels: issue.labels.map((l) => ({
            name: l.name,
            color: l.color,
          })),
          assignees: issue.assignees.map((a) => ({
            login: a.login,
            avatarUrl: a.avatar_url,
          })),
        },
      },
    })
  } catch (error) {
    console.error('GitHub issue fetch error:', error)
    return c.json({ success: false, error: 'Failed to fetch GitHub issue' }, 500)
  }
})

// ============================================
// Task GitHub Link Routes
// ============================================

// POST /projects/:id/tasks/:taskId/link-github - Link task to GitHub issue
integrationsRoutes.post('/projects/:id/tasks/:taskId/link-github', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format (e.g., T1.1, T2.10)
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    const body = await c.req.json()
    const { issueNumber, repository } = body

    if (!issueNumber || !repository) {
      return c.json({ success: false, error: 'issueNumber and repository are required' }, 400)
    }

    // Validate repository format
    const repoRegex = /^[^/]+\/[^/]+$/
    if (!repoRegex.test(repository)) {
      return c.json({ success: false, error: 'Repository must be in format "owner/repo"' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Find the task
    const [existingTask] = await db
      .select({ id: schema.tasks.id, name: schema.tasks.name })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!existingTask) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    // Get GitHub integration
    const [integration] = await db
      .select({
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'No active GitHub integration found. Please connect GitHub first.' }, 400)
    }

    // Fetch the issue from GitHub to verify it exists and get details
    const [owner = '', repo = ''] = repository.split('/')
    const issue = await fetchGitHubIssue(integration.accessToken, owner, repo, issueNumber)

    if (!issue) {
      return c.json({ success: false, error: `GitHub issue #${issueNumber} not found in ${repository}` }, 404)
    }

    // Update task with GitHub link
    const [updated] = await db
      .update(schema.tasks)
      .set({
        githubIssueNumber: issue.number,
        githubRepository: repository,
        githubIssueUrl: issue.html_url,
        githubIssueTitle: issue.title,
        githubIssueState: issue.state,
        githubLinkedBy: user.id,
        githubLinkedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, existingTask.id))
      .returning({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubIssueNumber: schema.tasks.githubIssueNumber,
        githubRepository: schema.tasks.githubRepository,
        githubIssueUrl: schema.tasks.githubIssueUrl,
        githubIssueTitle: schema.tasks.githubIssueTitle,
        githubIssueState: schema.tasks.githubIssueState,
        githubLinkedAt: schema.tasks.githubLinkedAt,
      })

    return c.json({
      success: true,
      data: {
        task: updated,
        githubIssue: {
          number: issue.number,
          title: issue.title,
          state: issue.state,
          htmlUrl: issue.html_url,
        },
      },
    })
  } catch (error) {
    console.error('Link task to GitHub error:', error)
    return c.json({ success: false, error: 'Failed to link task to GitHub issue' }, 500)
  }
})

// DELETE /projects/:id/tasks/:taskId/link-github - Unlink task from GitHub issue
integrationsRoutes.delete('/projects/:id/tasks/:taskId/link-github', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Find the task
    const [existingTask] = await db
      .select({ id: schema.tasks.id, githubIssueNumber: schema.tasks.githubIssueNumber })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!existingTask) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    if (!existingTask.githubIssueNumber) {
      return c.json({ success: false, error: 'Task is not linked to a GitHub issue' }, 400)
    }

    // Remove GitHub link
    const [updated] = await db
      .update(schema.tasks)
      .set({
        githubIssueNumber: null,
        githubRepository: null,
        githubIssueUrl: null,
        githubIssueTitle: null,
        githubIssueState: null,
        githubLinkedBy: null,
        githubLinkedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, existingTask.id))
      .returning({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
      })

    return c.json({
      success: true,
      data: {
        task: updated,
        message: 'GitHub issue unlinked successfully',
      },
    })
  } catch (error) {
    console.error('Unlink task from GitHub error:', error)
    return c.json({ success: false, error: 'Failed to unlink task from GitHub issue' }, 500)
  }
})

// GET /projects/:id/tasks/:taskId/github-link - Get task's GitHub link status
integrationsRoutes.get('/projects/:id/tasks/:taskId/github-link', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Get task with GitHub link info
    const [task] = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubIssueNumber: schema.tasks.githubIssueNumber,
        githubRepository: schema.tasks.githubRepository,
        githubIssueUrl: schema.tasks.githubIssueUrl,
        githubIssueTitle: schema.tasks.githubIssueTitle,
        githubIssueState: schema.tasks.githubIssueState,
        githubLinkedBy: schema.tasks.githubLinkedBy,
        githubLinkedAt: schema.tasks.githubLinkedAt,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!task) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    const isLinked = !!task.githubIssueNumber

    return c.json({
      success: true,
      data: {
        linked: isLinked,
        task: {
          id: task.id,
          taskId: task.taskId,
          name: task.name,
        },
        githubLink: isLinked
          ? {
              issueNumber: task.githubIssueNumber,
              repository: task.githubRepository,
              issueUrl: task.githubIssueUrl,
              issueTitle: task.githubIssueTitle,
              issueState: task.githubIssueState,
              linkedAt: task.githubLinkedAt,
            }
          : null,
      },
    })
  } catch (error) {
    console.error('Get task GitHub link error:', error)
    return c.json({ success: false, error: 'Failed to get task GitHub link' }, 500)
  }
})

// POST /projects/:id/tasks/:taskId/create-github-issue - Create GitHub issue from task
integrationsRoutes.post('/projects/:id/tasks/:taskId/create-github-issue', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    const body = await c.req.json()
    const { repository, labels, assignees } = body

    if (!repository) {
      return c.json({ success: false, error: 'repository is required' }, 400)
    }

    // Validate repository format
    const repoRegex = /^[^/]+\/[^/]+$/
    if (!repoRegex.test(repository)) {
      return c.json({ success: false, error: 'Repository must be in format "owner/repo"' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Get the task
    const [task] = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        description: schema.tasks.description,
        complexity: schema.tasks.complexity,
        githubIssueNumber: schema.tasks.githubIssueNumber,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!task) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    if (task.githubIssueNumber) {
      return c.json({ success: false, error: 'Task is already linked to a GitHub issue' }, 400)
    }

    // Get GitHub integration
    const [integration] = await db
      .select({
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'No active GitHub integration found. Please connect GitHub first.' }, 400)
    }

    // Create issue body
    const issueBody = `## ${task.taskId}: ${task.name}

${task.description || '_No description provided_'}

---

**Complexity:** ${task.complexity || 'Not specified'}
**Project:** ${project.name}

_This issue was created from [PlanFlow](https://planflow.tools)_`

    // Create the GitHub issue
    const [owner = '', repo = ''] = repository.split('/')
    const issue = await createGitHubIssue(integration.accessToken, owner, repo, {
      title: `[${task.taskId}] ${task.name}`,
      body: issueBody,
      labels,
      assignees,
    })

    if (!issue) {
      return c.json({ success: false, error: 'Failed to create GitHub issue' }, 500)
    }

    // Update task with GitHub link
    const [updated] = await db
      .update(schema.tasks)
      .set({
        githubIssueNumber: issue.number,
        githubRepository: repository,
        githubIssueUrl: issue.html_url,
        githubIssueTitle: issue.title,
        githubIssueState: issue.state,
        githubLinkedBy: user.id,
        githubLinkedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, task.id))
      .returning({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubIssueNumber: schema.tasks.githubIssueNumber,
        githubRepository: schema.tasks.githubRepository,
        githubIssueUrl: schema.tasks.githubIssueUrl,
        githubIssueTitle: schema.tasks.githubIssueTitle,
        githubIssueState: schema.tasks.githubIssueState,
        githubLinkedAt: schema.tasks.githubLinkedAt,
      })

    return c.json({
      success: true,
      data: {
        task: updated,
        githubIssue: {
          number: issue.number,
          title: issue.title,
          state: issue.state,
          htmlUrl: issue.html_url,
        },
      },
    })
  } catch (error) {
    console.error('Create GitHub issue from task error:', error)
    return c.json({ success: false, error: 'Failed to create GitHub issue' }, 500)
  }
})

// POST /projects/:id/tasks/:taskId/sync-github-issue - Sync task GitHub issue state
integrationsRoutes.post('/projects/:id/tasks/:taskId/sync-github-issue', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Get task with GitHub link
    const [task] = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubIssueNumber: schema.tasks.githubIssueNumber,
        githubRepository: schema.tasks.githubRepository,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!task) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    if (!task.githubIssueNumber || !task.githubRepository) {
      return c.json({ success: false, error: 'Task is not linked to a GitHub issue' }, 400)
    }

    // Get GitHub integration
    const [integration] = await db
      .select({
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'No active GitHub integration found' }, 400)
    }

    // Fetch latest issue state
    const [owner = '', repo = ''] = task.githubRepository.split('/')
    const issue = await fetchGitHubIssue(integration.accessToken, owner, repo, task.githubIssueNumber)

    if (!issue) {
      return c.json({ success: false, error: 'GitHub issue not found - it may have been deleted' }, 404)
    }

    // Update task with latest issue info
    const [updated] = await db
      .update(schema.tasks)
      .set({
        githubIssueTitle: issue.title,
        githubIssueState: issue.state,
        githubIssueUrl: issue.html_url,
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, task.id))
      .returning({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubIssueNumber: schema.tasks.githubIssueNumber,
        githubRepository: schema.tasks.githubRepository,
        githubIssueUrl: schema.tasks.githubIssueUrl,
        githubIssueTitle: schema.tasks.githubIssueTitle,
        githubIssueState: schema.tasks.githubIssueState,
      })

    return c.json({
      success: true,
      data: {
        task: updated,
        synced: true,
      },
    })
  } catch (error) {
    console.error('Sync task GitHub issue error:', error)
    return c.json({ success: false, error: 'Failed to sync GitHub issue' }, 500)
  }
})

// ============================================
// GitHub Pull Request Link API
// ============================================

// POST /projects/:id/tasks/:taskId/link-github-pr - Link task to GitHub PR
integrationsRoutes.post('/projects/:id/tasks/:taskId/link-github-pr', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    const body = await c.req.json()
    const { prNumber, repository } = body

    if (!prNumber || typeof prNumber !== 'number') {
      return c.json({ success: false, error: 'prNumber is required and must be a number' }, 400)
    }

    if (!repository) {
      return c.json({ success: false, error: 'repository is required' }, 400)
    }

    // Validate repository format
    const repoRegex = /^[^/]+\/[^/]+$/
    if (!repoRegex.test(repository)) {
      return c.json({ success: false, error: 'Repository must be in format "owner/repo"' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Find the task
    const [existingTask] = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubPrNumber: schema.tasks.githubPrNumber,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!existingTask) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    if (existingTask.githubPrNumber) {
      return c.json({
        success: false,
        error: `Task is already linked to PR #${existingTask.githubPrNumber}. Unlink first to link a different PR.`,
      }, 400)
    }

    // Get GitHub integration
    const [integration] = await db
      .select({
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'No active GitHub integration found. Please connect GitHub first.' }, 400)
    }

    // Fetch the PR from GitHub to verify it exists and get details
    const [owner = '', repo = ''] = repository.split('/')
    const pr = await fetchGitHubPullRequest(integration.accessToken, owner, repo, prNumber)

    if (!pr) {
      return c.json({ success: false, error: `Pull request #${prNumber} not found in ${repository}` }, 404)
    }

    // Determine PR state
    const prState = getPrState(pr)

    // Update task with PR link
    const [updated] = await db
      .update(schema.tasks)
      .set({
        githubPrNumber: pr.number,
        githubPrRepository: repository,
        githubPrUrl: pr.html_url,
        githubPrTitle: pr.title,
        githubPrState: prState,
        githubPrBranch: pr.head.ref,
        githubPrBaseBranch: pr.base.ref,
        githubPrLinkedBy: user.id,
        githubPrLinkedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, existingTask.id))
      .returning({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubPrNumber: schema.tasks.githubPrNumber,
        githubPrRepository: schema.tasks.githubPrRepository,
        githubPrUrl: schema.tasks.githubPrUrl,
        githubPrTitle: schema.tasks.githubPrTitle,
        githubPrState: schema.tasks.githubPrState,
        githubPrBranch: schema.tasks.githubPrBranch,
        githubPrBaseBranch: schema.tasks.githubPrBaseBranch,
        githubPrLinkedAt: schema.tasks.githubPrLinkedAt,
      })

    return c.json({
      success: true,
      data: {
        task: updated,
        githubPr: {
          number: pr.number,
          title: pr.title,
          state: prState,
          htmlUrl: pr.html_url,
          headBranch: pr.head.ref,
          baseBranch: pr.base.ref,
          draft: pr.draft,
        },
      },
    })
  } catch (error) {
    console.error('Link task to GitHub PR error:', error)
    return c.json({ success: false, error: 'Failed to link task to GitHub PR' }, 500)
  }
})

// DELETE /projects/:id/tasks/:taskId/link-github-pr - Unlink task from GitHub PR
integrationsRoutes.delete('/projects/:id/tasks/:taskId/link-github-pr', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Find the task
    const [existingTask] = await db
      .select({ id: schema.tasks.id, githubPrNumber: schema.tasks.githubPrNumber })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!existingTask) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    if (!existingTask.githubPrNumber) {
      return c.json({ success: false, error: 'Task is not linked to a GitHub PR' }, 400)
    }

    // Remove GitHub PR link
    const [updated] = await db
      .update(schema.tasks)
      .set({
        githubPrNumber: null,
        githubPrRepository: null,
        githubPrUrl: null,
        githubPrTitle: null,
        githubPrState: null,
        githubPrBranch: null,
        githubPrBaseBranch: null,
        githubPrLinkedBy: null,
        githubPrLinkedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, existingTask.id))
      .returning({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
      })

    return c.json({
      success: true,
      data: {
        task: updated,
        message: 'GitHub PR unlinked successfully',
      },
    })
  } catch (error) {
    console.error('Unlink task from GitHub PR error:', error)
    return c.json({ success: false, error: 'Failed to unlink task from GitHub PR' }, 500)
  }
})

// GET /projects/:id/tasks/:taskId/github-pr - Get task's GitHub PR link status
integrationsRoutes.get('/projects/:id/tasks/:taskId/github-pr', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Get task with GitHub PR link info
    const [task] = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubPrNumber: schema.tasks.githubPrNumber,
        githubPrRepository: schema.tasks.githubPrRepository,
        githubPrUrl: schema.tasks.githubPrUrl,
        githubPrTitle: schema.tasks.githubPrTitle,
        githubPrState: schema.tasks.githubPrState,
        githubPrBranch: schema.tasks.githubPrBranch,
        githubPrBaseBranch: schema.tasks.githubPrBaseBranch,
        githubPrLinkedBy: schema.tasks.githubPrLinkedBy,
        githubPrLinkedAt: schema.tasks.githubPrLinkedAt,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!task) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    const isLinked = !!task.githubPrNumber

    return c.json({
      success: true,
      data: {
        linked: isLinked,
        task: {
          id: task.id,
          taskId: task.taskId,
          name: task.name,
        },
        githubPr: isLinked
          ? {
              prNumber: task.githubPrNumber,
              repository: task.githubPrRepository,
              prUrl: task.githubPrUrl,
              prTitle: task.githubPrTitle,
              prState: task.githubPrState,
              headBranch: task.githubPrBranch,
              baseBranch: task.githubPrBaseBranch,
              linkedAt: task.githubPrLinkedAt,
            }
          : null,
      },
    })
  } catch (error) {
    console.error('Get task GitHub PR error:', error)
    return c.json({ success: false, error: 'Failed to get task GitHub PR' }, 500)
  }
})

// POST /projects/:id/tasks/:taskId/sync-github-pr - Sync task GitHub PR state
integrationsRoutes.post('/projects/:id/tasks/:taskId/sync-github-pr', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Get task with GitHub PR link
    const [task] = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubPrNumber: schema.tasks.githubPrNumber,
        githubPrRepository: schema.tasks.githubPrRepository,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!task) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    if (!task.githubPrNumber || !task.githubPrRepository) {
      return c.json({ success: false, error: 'Task is not linked to a GitHub PR' }, 400)
    }

    // Get GitHub integration
    const [integration] = await db
      .select({
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'No active GitHub integration found' }, 400)
    }

    // Fetch latest PR state
    const [owner = '', repo = ''] = task.githubPrRepository.split('/')
    const pr = await fetchGitHubPullRequest(integration.accessToken, owner, repo, task.githubPrNumber)

    if (!pr) {
      return c.json({ success: false, error: 'GitHub PR not found - it may have been deleted' }, 404)
    }

    // Determine PR state
    const prState = getPrState(pr)

    // Update task with latest PR info
    const [updated] = await db
      .update(schema.tasks)
      .set({
        githubPrTitle: pr.title,
        githubPrState: prState,
        githubPrUrl: pr.html_url,
        githubPrBranch: pr.head.ref,
        githubPrBaseBranch: pr.base.ref,
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, task.id))
      .returning({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubPrNumber: schema.tasks.githubPrNumber,
        githubPrRepository: schema.tasks.githubPrRepository,
        githubPrUrl: schema.tasks.githubPrUrl,
        githubPrTitle: schema.tasks.githubPrTitle,
        githubPrState: schema.tasks.githubPrState,
        githubPrBranch: schema.tasks.githubPrBranch,
        githubPrBaseBranch: schema.tasks.githubPrBaseBranch,
      })

    return c.json({
      success: true,
      data: {
        task: updated,
        synced: true,
        prState,
      },
    })
  } catch (error) {
    console.error('Sync task GitHub PR error:', error)
    return c.json({ success: false, error: 'Failed to sync GitHub PR' }, 500)
  }
})

// POST /projects/:id/tasks/:taskId/create-github-pr - Create GitHub PR from task
integrationsRoutes.post('/projects/:id/tasks/:taskId/create-github-pr', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    const body = await c.req.json()
    const { repository, title, body: prBody, head, base, draft } = body

    // Validate required fields
    if (!repository) {
      return c.json({ success: false, error: 'repository is required' }, 400)
    }
    if (!title) {
      return c.json({ success: false, error: 'title is required' }, 400)
    }
    if (!head) {
      return c.json({ success: false, error: 'head branch is required' }, 400)
    }
    if (!base) {
      return c.json({ success: false, error: 'base branch is required' }, 400)
    }

    // Validate repository format
    const repoRegex = /^[^/]+\/[^/]+$/
    if (!repoRegex.test(repository)) {
      return c.json({ success: false, error: 'Repository must be in format "owner/repo"' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Get task
    const [task] = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        description: schema.tasks.description,
        githubPrNumber: schema.tasks.githubPrNumber,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!task) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    // Check if task already has a PR linked
    if (task.githubPrNumber) {
      return c.json({ success: false, error: 'Task already has a PR linked. Unlink it first to create a new PR.' }, 400)
    }

    // Get GitHub integration
    const [integration] = await db
      .select({
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'No active GitHub integration found. Connect GitHub first.' }, 400)
    }

    // Create the PR on GitHub
    const [owner = '', repo = ''] = repository.split('/')
    const createdPr = await createGitHubPullRequest(integration.accessToken, owner, repo, {
      title,
      body: prBody || `This PR implements ${task.taskId}: ${task.name}\n\n${task.description || ''}`.trim(),
      head,
      base,
      draft: draft || false,
    })

    if (!createdPr) {
      return c.json({
        success: false,
        error: 'Failed to create PR on GitHub. Make sure the branch exists and there are commits to merge.'
      }, 400)
    }

    // Determine PR state
    const prState = getPrState(createdPr)

    // Update task with the PR link
    const [updated] = await db
      .update(schema.tasks)
      .set({
        githubPrNumber: createdPr.number,
        githubPrRepository: repository,
        githubPrUrl: createdPr.html_url,
        githubPrTitle: createdPr.title,
        githubPrState: prState,
        githubPrBranch: createdPr.head.ref,
        githubPrBaseBranch: createdPr.base.ref,
        githubPrLinkedBy: user.id,
        githubPrLinkedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, task.id))
      .returning({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubPrNumber: schema.tasks.githubPrNumber,
        githubPrRepository: schema.tasks.githubPrRepository,
        githubPrUrl: schema.tasks.githubPrUrl,
        githubPrTitle: schema.tasks.githubPrTitle,
        githubPrState: schema.tasks.githubPrState,
        githubPrBranch: schema.tasks.githubPrBranch,
        githubPrBaseBranch: schema.tasks.githubPrBaseBranch,
        githubPrLinkedAt: schema.tasks.githubPrLinkedAt,
      })

    return c.json({
      success: true,
      data: {
        task: updated,
        githubPr: {
          number: createdPr.number,
          title: createdPr.title,
          state: prState,
          htmlUrl: createdPr.html_url,
          headBranch: createdPr.head.ref,
          baseBranch: createdPr.base.ref,
          draft: createdPr.draft,
        },
      },
    })
  } catch (error) {
    console.error('Create GitHub PR from task error:', error)
    return c.json({ success: false, error: 'Failed to create GitHub PR' }, 500)
  }
})

// GET /integrations/github/repos/:owner/:repo/pulls - List PRs in a repository
integrationsRoutes.get('/integrations/github/repos/:owner/:repo/pulls', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const owner = c.req.param('owner')
    const repo = c.req.param('repo')
    const db = getDbClient()

    // Get query params
    const state = c.req.query('state') as 'open' | 'closed' | 'all' | undefined
    const page = parseInt(c.req.query('page') || '1', 10)
    const perPage = parseInt(c.req.query('per_page') || '30', 10)
    const search = c.req.query('search')

    // Get GitHub integration
    const [integration] = await db
      .select({
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'No active GitHub integration found' }, 400)
    }

    let prs: GitHubPullRequest[]
    let totalCount: number | undefined

    if (search) {
      // Use search API
      const result = await searchGitHubPullRequests(integration.accessToken, owner, repo, search, {
        state: state === 'all' ? undefined : (state as 'open' | 'closed' | undefined),
        page,
        perPage,
      })
      prs = result.items
      totalCount = result.totalCount
    } else {
      // Use list API
      prs = await listGitHubPullRequests(integration.accessToken, owner, repo, {
        state: state || 'open',
        page,
        perPage,
      })
    }

    // Transform to frontend format
    const formattedPrs = prs.map((pr) => ({
      id: pr.id,
      number: pr.number,
      title: pr.title,
      state: pr.mergedState || getPrState(pr),
      htmlUrl: pr.html_url,
      draft: pr.draft,
      headBranch: pr.head.ref,
      baseBranch: pr.base.ref,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      mergedAt: pr.merged_at,
      user: {
        login: pr.user.login,
        avatarUrl: pr.user.avatar_url,
      },
      labels: pr.labels.map((l) => ({
        name: l.name,
        color: l.color,
      })),
    }))

    return c.json({
      success: true,
      data: {
        pullRequests: formattedPrs,
        page,
        perPage,
        totalCount,
      },
    })
  } catch (error) {
    console.error('List GitHub PRs error:', error)
    return c.json({ success: false, error: 'Failed to fetch GitHub pull requests' }, 500)
  }
})

// GET /integrations/github/repos/:owner/:repo/pulls/:prNumber - Get a specific PR
integrationsRoutes.get('/integrations/github/repos/:owner/:repo/pulls/:prNumber', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const owner = c.req.param('owner')
    const repo = c.req.param('repo')
    const prNumber = parseInt(c.req.param('prNumber'), 10)
    const db = getDbClient()

    if (isNaN(prNumber) || prNumber <= 0) {
      return c.json({ success: false, error: 'Invalid PR number' }, 400)
    }

    // Get GitHub integration
    const [integration] = await db
      .select({
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'No active GitHub integration found' }, 400)
    }

    const pr = await fetchGitHubPullRequest(integration.accessToken, owner, repo, prNumber)

    if (!pr) {
      return c.json({ success: false, error: `Pull request #${prNumber} not found` }, 404)
    }

    const prState = getPrState(pr)

    return c.json({
      success: true,
      data: {
        pullRequest: {
          id: pr.id,
          number: pr.number,
          title: pr.title,
          body: pr.body,
          state: prState,
          htmlUrl: pr.html_url,
          draft: pr.draft,
          headBranch: pr.head.ref,
          baseBranch: pr.base.ref,
          createdAt: pr.created_at,
          updatedAt: pr.updated_at,
          closedAt: pr.closed_at,
          mergedAt: pr.merged_at,
          user: {
            login: pr.user.login,
            avatarUrl: pr.user.avatar_url,
          },
          labels: pr.labels.map((l) => ({
            name: l.name,
            color: l.color,
          })),
          assignees: pr.assignees.map((a) => ({
            login: a.login,
            avatarUrl: a.avatar_url,
          })),
          requestedReviewers: pr.requested_reviewers.map((r) => ({
            login: r.login,
            avatarUrl: r.avatar_url,
          })),
        },
      },
    })
  } catch (error) {
    console.error('Get GitHub PR error:', error)
    return c.json({ success: false, error: 'Failed to fetch GitHub pull request' }, 500)
  }
})

// ============================================
// Branch Name Generation API
// ============================================

// GET /projects/:id/tasks/:taskId/branch-name - Generate branch name for a task
integrationsRoutes.get('/projects/:id/tasks/:taskId/branch-name', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Get optional prefix from query params
    const prefixParam = c.req.query('prefix') as BranchPrefix | undefined
    const autoDetect = c.req.query('auto') !== 'false' // Default to auto-detect

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Get the task
    const [task] = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!task) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    // Generate branch name
    let branchName: string
    let detectedPrefix: BranchPrefix

    if (prefixParam) {
      // Use provided prefix
      branchName = generateBranchName(task.taskId, task.name, { prefix: prefixParam })
      detectedPrefix = prefixParam
    } else if (autoDetect) {
      // Auto-detect prefix based on task name
      const result = generateBranchNameAuto(task.taskId, task.name)
      branchName = result.branchName
      detectedPrefix = result.detectedPrefix
    } else {
      // Default to 'feature' prefix
      branchName = generateBranchName(task.taskId, task.name, { prefix: 'feature' })
      detectedPrefix = 'feature'
    }

    // Generate all prefix variants for the UI
    const variants: Record<BranchPrefix, string> = {
      feature: generateBranchName(task.taskId, task.name, { prefix: 'feature' }),
      fix: generateBranchName(task.taskId, task.name, { prefix: 'fix' }),
      hotfix: generateBranchName(task.taskId, task.name, { prefix: 'hotfix' }),
      chore: generateBranchName(task.taskId, task.name, { prefix: 'chore' }),
      docs: generateBranchName(task.taskId, task.name, { prefix: 'docs' }),
      refactor: generateBranchName(task.taskId, task.name, { prefix: 'refactor' }),
      test: generateBranchName(task.taskId, task.name, { prefix: 'test' }),
    }

    // Generate git command for convenience
    const gitCommand = `git checkout -b ${branchName}`

    return c.json({
      success: true,
      data: {
        task: {
          id: task.id,
          taskId: task.taskId,
          name: task.name,
        },
        branchName,
        detectedPrefix,
        variants,
        gitCommand,
      },
    })
  } catch (error) {
    console.error('Generate branch name error:', error)
    return c.json({ success: false, error: 'Failed to generate branch name' }, 500)
  }
})

// ============================================
// Helper function to send integration notifications (exported for use in main app)
// ============================================

export async function sendIntegrationNotifications(params: {
  organizationId: string
  projectId?: string
  eventType: string
  eventData: {
    type: string
    title: string
    body?: string
    link?: string
    projectName?: string
    taskId?: string
    taskName?: string
    actorName?: string
    actorEmail?: string
    metadata?: Record<string, unknown>
  }
}) {
  try {
    const db = getDbClient()

    // Find active integrations for this organization
    const integrations = await db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.organizationId, params.organizationId),
          eq(schema.integrations.active, true),
          // If projectId is specified, include org-wide integrations OR project-specific ones
          params.projectId
            ? isNull(schema.integrations.projectId)
            : isNull(schema.integrations.projectId)
        )
      )

    // Also get project-specific integrations if projectId is provided
    if (params.projectId) {
      const projectIntegrations = await db
        .select()
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.organizationId, params.organizationId),
            eq(schema.integrations.projectId, params.projectId),
            eq(schema.integrations.active, true)
          )
        )
      integrations.push(...projectIntegrations)
    }

    // Send to each integration
    for (const integration of integrations) {
      // Check if this event type is enabled
      if (integration.enabledEvents && integration.enabledEvents.length > 0) {
        if (!integration.enabledEvents.includes(params.eventType)) {
          continue // Skip this integration for this event
        }
      }

      if (!integration.webhookUrl) continue

      // Send based on provider
      if (integration.provider === 'slack') {
        const result = await sendSlackNotification(
          integration.webhookUrl,
          {
            ...params.eventData,
            organizationId: params.organizationId,
            projectId: params.projectId,
            timestamp: new Date(),
          },
          integration.config as SlackConfig
        )

        // Log delivery (async, don't block)
        db.insert(schema.integrationWebhooks).values({
          integrationId: integration.id,
          eventType: params.eventType,
          payload: params.eventData,
          statusCode: result.statusCode?.toString() || null,
          error: result.error || null,
          success: result.success,
          durationMs: result.durationMs?.toString() || null,
        }).catch(err => console.error('Failed to log webhook:', err))

        // Update last delivery status
        db.update(schema.integrations)
          .set({
            lastDeliveryAt: new Date(),
            lastDeliveryStatus: result.success ? 'success' : 'failed',
            lastDeliveryError: result.error || null,
          })
          .where(eq(schema.integrations.id, integration.id))
          .catch(err => console.error('Failed to update integration status:', err))
      }

      // Discord webhook integration
      if (integration.provider === 'discord') {
        const result = await sendDiscordNotification(
          integration.webhookUrl,
          {
            ...params.eventData,
            organizationId: params.organizationId,
            projectId: params.projectId,
            timestamp: new Date(),
          },
          integration.config as DiscordConfig
        )

        // Log delivery (async, don't block)
        db.insert(schema.integrationWebhooks).values({
          integrationId: integration.id,
          eventType: params.eventType,
          payload: params.eventData,
          statusCode: result.statusCode?.toString() || null,
          error: result.error || null,
          success: result.success,
          durationMs: result.durationMs?.toString() || null,
        }).catch(err => console.error('Failed to log Discord webhook:', err))

        // Update last delivery status
        db.update(schema.integrations)
          .set({
            lastDeliveryAt: new Date(),
            lastDeliveryStatus: result.success ? 'success' : 'failed',
            lastDeliveryError: result.error || null,
          })
          .where(eq(schema.integrations.id, integration.id))
          .catch(err => console.error('Failed to update Discord integration status:', err))
      }
    }
  } catch (error) {
    // Don't throw - integration notifications should not block operations
    console.error('Send integration notifications error:', error)
  }
}

export { integrationsRoutes }
