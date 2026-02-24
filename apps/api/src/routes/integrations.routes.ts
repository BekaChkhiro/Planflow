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
  createGitHubIssue as _createGitHubIssue,
  fetchGitHubPullRequest,
  listGitHubPullRequests,
  searchGitHubPullRequests,
  createGitHubPullRequest as _createGitHubPullRequest,
  getPrState,
  generateBranchName as _generateBranchName,
  generateBranchNameAuto as _generateBranchNameAuto,
  type GitHubPullRequest,
  type BranchPrefix as _BranchPrefix,
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
