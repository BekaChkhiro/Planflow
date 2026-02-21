/**
 * Discord Webhook Integration
 *
 * Sends notifications to Discord channels via incoming webhooks.
 * Follows the same non-blocking pattern as the Slack integration.
 *
 * Discord Webhook Docs: https://discord.com/developers/docs/resources/webhook
 */

import type { DiscordConfig as DiscordConfigType, IntegrationEventData } from '../db/schema/integrations'

// Re-export DiscordConfig for use by other modules
export type DiscordConfig = DiscordConfigType

// ============================================
// Types
// ============================================

export interface DiscordWebhookResult {
  success: boolean
  error?: string
  statusCode?: number
  durationMs?: number
}

export interface DiscordEmbed {
  title?: string
  description?: string
  url?: string
  color?: number
  timestamp?: string
  footer?: {
    text: string
    icon_url?: string
  }
  author?: {
    name: string
    url?: string
    icon_url?: string
  }
  fields?: Array<{
    name: string
    value: string
    inline?: boolean
  }>
  thumbnail?: {
    url: string
  }
  image?: {
    url: string
  }
}

export interface DiscordMessage {
  content?: string
  username?: string
  avatar_url?: string
  embeds?: DiscordEmbed[]
}

// ============================================
// Configuration
// ============================================

const APP_URL = process.env['APP_URL'] || 'https://planflow.tools'
const DEFAULT_USERNAME = 'PlanFlow'
const DEFAULT_AVATAR_URL = `${APP_URL}/planflow-icon.png`

// Event type emoji mapping
const EVENT_EMOJIS: Record<string, string> = {
  task_created: '✨',
  task_updated: '📝',
  task_status_changed: '🔄',
  task_assigned: '👤',
  task_unassigned: '👋',
  task_completed: '✅',
  comment_created: '💬',
  comment_reply: '↩️',
  mention: '📣',
  member_joined: '🎉',
  member_removed: '👋',
  plan_updated: '📋',
}

// Event type colors for embeds (Discord uses decimal color values)
// These are converted from hex colors
const EVENT_COLORS: Record<string, number> = {
  task_created: 0x22c55e, // green
  task_updated: 0x3b82f6, // blue
  task_status_changed: 0xf59e0b, // amber
  task_assigned: 0x8b5cf6, // violet
  task_unassigned: 0x6b7280, // gray
  task_completed: 0x10b981, // emerald
  comment_created: 0x6366f1, // indigo
  comment_reply: 0x6366f1, // indigo
  mention: 0xec4899, // pink
  member_joined: 0x22c55e, // green
  member_removed: 0xef4444, // red
  plan_updated: 0x0ea5e9, // sky
}

// Default embed color (PlanFlow brand color - indigo)
const DEFAULT_COLOR = 0x6366f1

// ============================================
// Message Formatting
// ============================================

/**
 * Formats an event into a Discord message with embeds
 */
export function formatDiscordMessage(
  event: IntegrationEventData,
  config: DiscordConfig = {}
): DiscordMessage {
  const emoji = EVENT_EMOJIS[event.type] || '📌'
  const color = EVENT_COLORS[event.type] || DEFAULT_COLOR

  // Use plain content if embeds are disabled
  if (config.useEmbeds === false) {
    return formatSimpleMessage(event, config)
  }

  // Build the embed
  const embed: DiscordEmbed = {
    title: `${emoji} ${event.title}`,
    color,
    timestamp: event.timestamp.toISOString(),
  }

  // Add description if body is present
  if (event.body) {
    embed.description = event.body
  }

  // Add URL link
  if (event.link) {
    embed.url = event.link
  }

  // Build fields for context information
  const fields: DiscordEmbed['fields'] = []

  if (event.projectName) {
    fields.push({
      name: '📁 Project',
      value: event.projectName,
      inline: true,
    })
  }

  if (event.taskId && event.taskName) {
    fields.push({
      name: '📋 Task',
      value: `${event.taskId} - ${event.taskName}`,
      inline: true,
    })
  } else if (event.taskId) {
    fields.push({
      name: '📋 Task',
      value: event.taskId,
      inline: true,
    })
  }

  if (fields.length > 0) {
    embed.fields = fields
  }

  // Add footer with actor name
  if (event.actorName) {
    embed.footer = {
      text: `By ${event.actorName}`,
    }
  }

  return {
    username: config.username || DEFAULT_USERNAME,
    avatar_url: config.avatar_url || DEFAULT_AVATAR_URL,
    embeds: [embed],
  }
}

/**
 * Formats a simple text message for Discord (without embeds)
 */
export function formatSimpleMessage(
  event: IntegrationEventData,
  config: DiscordConfig = {}
): DiscordMessage {
  const emoji = EVENT_EMOJIS[event.type] || '📌'

  let content = `**${emoji} ${event.title}**`
  if (event.body) {
    content += `\n${event.body}`
  }
  if (event.link) {
    content += `\n\n🔗 [View in PlanFlow](${event.link})`
  }

  return {
    content,
    username: config.username || DEFAULT_USERNAME,
    avatar_url: config.avatar_url || DEFAULT_AVATAR_URL,
  }
}

// ============================================
// Webhook Delivery
// ============================================

/**
 * Sends a message to a Discord webhook URL
 *
 * Non-blocking - logs errors but doesn't throw.
 *
 * @param webhookUrl - The Discord webhook URL
 * @param message - The message payload
 * @returns Result with success status
 */
export async function sendDiscordWebhook(
  webhookUrl: string,
  message: DiscordMessage
): Promise<DiscordWebhookResult> {
  const startTime = Date.now()

  // Validate webhook URL
  if (!webhookUrl || !isValidDiscordWebhookUrl(webhookUrl)) {
    return {
      success: false,
      error: 'Invalid Discord webhook URL',
      durationMs: Date.now() - startTime,
    }
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    })

    const durationMs = Date.now() - startTime

    // Discord returns 204 No Content on success
    if (response.ok || response.status === 204) {
      console.log(`Discord webhook delivered successfully (${durationMs}ms)`)
      return {
        success: true,
        statusCode: response.status,
        durationMs,
      }
    }

    // Discord returns error details as JSON
    let errorMessage = `HTTP ${response.status}`
    try {
      const errorData = await response.json() as { message?: string }
      if (errorData && typeof errorData.message === 'string') {
        errorMessage = errorData.message
      }
    } catch {
      // Ignore JSON parse errors
    }

    console.error(`Discord webhook failed: ${response.status} - ${errorMessage}`)

    return {
      success: false,
      error: errorMessage,
      statusCode: response.status,
      durationMs,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`Discord webhook error: ${message}`)

    return {
      success: false,
      error: message,
      durationMs,
    }
  }
}

/**
 * Sends an event notification to Discord
 *
 * @param webhookUrl - The Discord webhook URL
 * @param event - The event data to send
 * @param config - Optional Discord configuration
 * @returns Result with success status
 */
export async function sendDiscordNotification(
  webhookUrl: string,
  event: IntegrationEventData,
  config: DiscordConfig = {}
): Promise<DiscordWebhookResult> {
  const message = formatDiscordMessage(event, config)
  return sendDiscordWebhook(webhookUrl, message)
}

/**
 * Sends a test message to verify webhook configuration
 *
 * @param webhookUrl - The Discord webhook URL
 * @param config - Optional Discord configuration
 * @returns Result with success status
 */
export async function sendDiscordTestMessage(
  webhookUrl: string,
  config: DiscordConfig = {}
): Promise<DiscordWebhookResult> {
  const message = formatDiscordMessage(
    {
      type: 'task_created',
      title: 'PlanFlow Integration Test',
      body: 'This is a test message to verify your Discord integration is working correctly. 🎉',
      link: `${APP_URL}/dashboard`,
      organizationId: 'test',
      timestamp: new Date(),
    },
    config
  )

  return sendDiscordWebhook(webhookUrl, message)
}

// ============================================
// Event-Specific Formatters
// ============================================

/**
 * Formats a task status change notification for Discord
 */
export function formatTaskStatusChange(params: {
  taskId: string
  taskName: string
  oldStatus: string
  newStatus: string
  actorName: string
  projectName?: string
  projectId?: string
  organizationId: string
  link?: string
}): IntegrationEventData {
  const statusEmoji: Record<string, string> = {
    TODO: '📋',
    IN_PROGRESS: '🔄',
    DONE: '✅',
    BLOCKED: '🚫',
  }

  const oldEmoji = statusEmoji[params.oldStatus] || '📋'
  const newEmoji = statusEmoji[params.newStatus] || '📋'

  return {
    type: 'task_status_changed',
    title: `Task ${params.taskId} status changed`,
    body: `${oldEmoji} ${params.oldStatus} → ${newEmoji} ${params.newStatus}`,
    taskId: params.taskId,
    taskName: params.taskName,
    actorName: params.actorName,
    projectName: params.projectName,
    organizationId: params.organizationId,
    link: params.link || `${APP_URL}/projects/${params.projectId}/tasks/${params.taskId}`,
    timestamp: new Date(),
    metadata: {
      oldStatus: params.oldStatus,
      newStatus: params.newStatus,
    },
  }
}

/**
 * Formats a task assignment notification for Discord
 */
export function formatTaskAssignment(params: {
  taskId: string
  taskName: string
  assigneeName: string
  assigneeEmail?: string
  assignerName: string
  projectName?: string
  projectId?: string
  organizationId: string
  link?: string
}): IntegrationEventData {
  return {
    type: 'task_assigned',
    title: `Task ${params.taskId} assigned to ${params.assigneeName}`,
    body: `**${params.assignerName}** assigned **${params.taskName}** to **${params.assigneeName}**`,
    taskId: params.taskId,
    taskName: params.taskName,
    actorName: params.assignerName,
    projectName: params.projectName,
    organizationId: params.organizationId,
    link: params.link || `${APP_URL}/projects/${params.projectId}/tasks/${params.taskId}`,
    timestamp: new Date(),
    metadata: {
      assigneeName: params.assigneeName,
      assigneeEmail: params.assigneeEmail,
    },
  }
}

/**
 * Formats a task completion notification for Discord
 */
export function formatTaskCompletion(params: {
  taskId: string
  taskName: string
  completedByName: string
  projectName?: string
  projectId?: string
  organizationId: string
  link?: string
}): IntegrationEventData {
  return {
    type: 'task_completed',
    title: `Task ${params.taskId} completed! 🎉`,
    body: `**${params.taskName}** was completed by **${params.completedByName}**`,
    taskId: params.taskId,
    taskName: params.taskName,
    actorName: params.completedByName,
    projectName: params.projectName,
    organizationId: params.organizationId,
    link: params.link || `${APP_URL}/projects/${params.projectId}/tasks/${params.taskId}`,
    timestamp: new Date(),
  }
}

/**
 * Formats a comment notification for Discord
 */
export function formatCommentCreated(params: {
  taskId: string
  taskName?: string
  commentPreview: string
  authorName: string
  isReply?: boolean
  projectName?: string
  projectId?: string
  organizationId: string
  link?: string
}): IntegrationEventData {
  const type = params.isReply ? 'comment_reply' : 'comment_created'
  const title = params.isReply
    ? `New reply on ${params.taskId}`
    : `New comment on ${params.taskId}`

  return {
    type,
    title,
    body: `**${params.authorName}**: ${params.commentPreview}`,
    taskId: params.taskId,
    taskName: params.taskName,
    actorName: params.authorName,
    projectName: params.projectName,
    organizationId: params.organizationId,
    link: params.link || `${APP_URL}/projects/${params.projectId}/tasks/${params.taskId}`,
    timestamp: new Date(),
    metadata: {
      commentPreview: params.commentPreview,
      isReply: params.isReply,
    },
  }
}

/**
 * Formats a mention notification for Discord
 */
export function formatMention(params: {
  taskId: string
  taskName?: string
  mentionedUserName: string
  mentionedByName: string
  commentPreview: string
  projectName?: string
  projectId?: string
  organizationId: string
  link?: string
}): IntegrationEventData {
  return {
    type: 'mention',
    title: `${params.mentionedUserName} was mentioned`,
    body: `**${params.mentionedByName}** mentioned **${params.mentionedUserName}**: ${params.commentPreview}`,
    taskId: params.taskId,
    taskName: params.taskName,
    actorName: params.mentionedByName,
    projectName: params.projectName,
    organizationId: params.organizationId,
    link: params.link || `${APP_URL}/projects/${params.projectId}/tasks/${params.taskId}`,
    timestamp: new Date(),
    metadata: {
      mentionedUserName: params.mentionedUserName,
      commentPreview: params.commentPreview,
    },
  }
}

/**
 * Formats a member joined notification for Discord
 */
export function formatMemberJoined(params: {
  memberName: string
  memberEmail: string
  role: string
  organizationName: string
  organizationId: string
  invitedByName?: string
}): IntegrationEventData {
  return {
    type: 'member_joined',
    title: `${params.memberName} joined the team`,
    body: `**${params.memberName}** (${params.memberEmail}) joined **${params.organizationName}** as ${params.role}`,
    actorName: params.invitedByName,
    organizationId: params.organizationId,
    link: `${APP_URL}/dashboard/team`,
    timestamp: new Date(),
    metadata: {
      memberName: params.memberName,
      memberEmail: params.memberEmail,
      role: params.role,
      organizationName: params.organizationName,
    },
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Validates a Discord webhook URL
 *
 * Discord webhook URLs follow the format:
 * https://discord.com/api/webhooks/{webhook.id}/{webhook.token}
 * or the older format:
 * https://discordapp.com/api/webhooks/{webhook.id}/{webhook.token}
 */
export function isValidDiscordWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'discord.com' || parsed.hostname === 'discordapp.com') &&
      parsed.pathname.startsWith('/api/webhooks/')
    )
  } catch {
    return false
  }
}

/**
 * Truncates text to a maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength - 3) + '...'
}
