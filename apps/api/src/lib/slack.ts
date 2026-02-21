/**
 * Slack Webhook Integration
 *
 * Sends notifications to Slack channels via incoming webhooks.
 * Follows the same non-blocking pattern as the email service.
 *
 * Slack Webhook Docs: https://api.slack.com/messaging/webhooks
 */

import type { SlackConfig as SlackConfigType, IntegrationEventData } from '../db/schema/integrations'

// Re-export SlackConfig for use by other modules
export type SlackConfig = SlackConfigType

// ============================================
// Types
// ============================================

export interface SlackWebhookResult {
  success: boolean
  error?: string
  statusCode?: number
  durationMs?: number
}

export interface SlackMessage {
  text: string
  blocks?: SlackBlock[]
  attachments?: SlackAttachment[]
  username?: string
  icon_emoji?: string
  icon_url?: string
  channel?: string
}

// Context element types (for context blocks)
export interface SlackContextElement {
  type: 'mrkdwn' | 'plain_text' | 'image'
  text?: string
  image_url?: string
  alt_text?: string
}

// Action element types (for action blocks)
export interface SlackActionElement {
  type: string
  text?: {
    type: string
    text: string
    emoji?: boolean
  }
  url?: string
  action_id?: string
}

export interface SlackBlock {
  type: 'section' | 'divider' | 'header' | 'context' | 'actions'
  text?: {
    type: 'mrkdwn' | 'plain_text'
    text: string
    emoji?: boolean
  }
  fields?: Array<{
    type: 'mrkdwn' | 'plain_text'
    text: string
  }>
  // Use union type to support both context and action elements
  elements?: Array<SlackContextElement | SlackActionElement>
  accessory?: {
    type: string
    text?: {
      type: string
      text: string
    }
    url?: string
    action_id?: string
  }
}

export interface SlackAttachment {
  color?: string
  fallback?: string
  author_name?: string
  author_icon?: string
  title?: string
  title_link?: string
  text?: string
  fields?: Array<{
    title: string
    value: string
    short?: boolean
  }>
  footer?: string
  footer_icon?: string
  ts?: number
}

// ============================================
// Configuration
// ============================================

const APP_URL = process.env['APP_URL'] || 'https://planflow.tools'
const DEFAULT_USERNAME = 'PlanFlow'
const DEFAULT_ICON_EMOJI = ':clipboard:'

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

// Event type colors for attachments
const EVENT_COLORS: Record<string, string> = {
  task_created: '#22c55e', // green
  task_updated: '#3b82f6', // blue
  task_status_changed: '#f59e0b', // amber
  task_assigned: '#8b5cf6', // violet
  task_unassigned: '#6b7280', // gray
  task_completed: '#10b981', // emerald
  comment_created: '#6366f1', // indigo
  comment_reply: '#6366f1', // indigo
  mention: '#ec4899', // pink
  member_joined: '#22c55e', // green
  member_removed: '#ef4444', // red
  plan_updated: '#0ea5e9', // sky
}

// ============================================
// Message Formatting
// ============================================

/**
 * Formats an event into a Slack message with blocks
 */
export function formatSlackMessage(
  event: IntegrationEventData,
  config: SlackConfig = {}
): SlackMessage {
  const emoji = EVENT_EMOJIS[event.type] || '📌'
  const color = EVENT_COLORS[event.type] || '#6366f1'

  // Build the main text (fallback for notifications)
  let text = `${emoji} ${event.title}`
  if (event.body) {
    text += `\n${event.body}`
  }

  // Build blocks for rich formatting
  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${emoji} ${event.title}`,
        emoji: true,
      },
    },
  ]

  // Add body if present
  if (event.body) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: event.body,
      },
    })
  }

  // Add context fields (project, task, actor)
  const contextElements: string[] = []

  if (event.projectName) {
    contextElements.push(`📁 *Project:* ${event.projectName}`)
  }

  if (event.taskId && event.taskName) {
    contextElements.push(`📋 *Task:* ${event.taskId} - ${event.taskName}`)
  } else if (event.taskId) {
    contextElements.push(`📋 *Task:* ${event.taskId}`)
  }

  if (event.actorName) {
    contextElements.push(`👤 *By:* ${event.actorName}`)
  }

  if (contextElements.length > 0) {
    blocks.push({
      type: 'context',
      elements: contextElements.map((text) => ({
        type: 'mrkdwn',
        text,
      })),
    })
  }

  // Add action button if link is provided
  if (event.link && config.includeLinks !== false) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View in PlanFlow',
            emoji: true,
          },
          url: event.link,
          action_id: 'view_in_planflow',
        },
      ],
    })
  }

  return {
    text,
    blocks,
    username: config.username || DEFAULT_USERNAME,
    icon_emoji: config.icon_emoji || DEFAULT_ICON_EMOJI,
    icon_url: config.icon_url,
    channel: config.channel,
  }
}

/**
 * Formats a simple text message for Slack
 */
export function formatSimpleMessage(
  text: string,
  config: SlackConfig = {}
): SlackMessage {
  return {
    text,
    username: config.username || DEFAULT_USERNAME,
    icon_emoji: config.icon_emoji || DEFAULT_ICON_EMOJI,
    icon_url: config.icon_url,
    channel: config.channel,
  }
}

// ============================================
// Webhook Delivery
// ============================================

/**
 * Sends a message to a Slack webhook URL
 *
 * Non-blocking - logs errors but doesn't throw.
 *
 * @param webhookUrl - The Slack incoming webhook URL
 * @param message - The message payload
 * @returns Result with success status
 */
export async function sendSlackWebhook(
  webhookUrl: string,
  message: SlackMessage
): Promise<SlackWebhookResult> {
  const startTime = Date.now()

  // Validate webhook URL
  if (!webhookUrl || !webhookUrl.startsWith('https://hooks.slack.com/')) {
    return {
      success: false,
      error: 'Invalid Slack webhook URL',
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

    if (response.ok) {
      console.log(`Slack webhook delivered successfully (${durationMs}ms)`)
      return {
        success: true,
        statusCode: response.status,
        durationMs,
      }
    }

    // Slack returns "ok" for success, or an error message
    const responseText = await response.text()
    console.error(`Slack webhook failed: ${response.status} - ${responseText}`)

    return {
      success: false,
      error: responseText || `HTTP ${response.status}`,
      statusCode: response.status,
      durationMs,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`Slack webhook error: ${message}`)

    return {
      success: false,
      error: message,
      durationMs,
    }
  }
}

/**
 * Sends an event notification to Slack
 *
 * @param webhookUrl - The Slack incoming webhook URL
 * @param event - The event data to send
 * @param config - Optional Slack configuration
 * @returns Result with success status
 */
export async function sendSlackNotification(
  webhookUrl: string,
  event: IntegrationEventData,
  config: SlackConfig = {}
): Promise<SlackWebhookResult> {
  const message = formatSlackMessage(event, config)
  return sendSlackWebhook(webhookUrl, message)
}

/**
 * Sends a test message to verify webhook configuration
 *
 * @param webhookUrl - The Slack incoming webhook URL
 * @param config - Optional Slack configuration
 * @returns Result with success status
 */
export async function sendSlackTestMessage(
  webhookUrl: string,
  config: SlackConfig = {}
): Promise<SlackWebhookResult> {
  const message = formatSlackMessage(
    {
      type: 'task_created',
      title: 'PlanFlow Integration Test',
      body: 'This is a test message to verify your Slack integration is working correctly.',
      link: `${APP_URL}/dashboard`,
      organizationId: 'test',
      timestamp: new Date(),
    },
    config
  )

  return sendSlackWebhook(webhookUrl, message)
}

// ============================================
// Event-Specific Formatters
// ============================================

/**
 * Formats a task status change notification
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
 * Formats a task assignment notification
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
    body: `*${params.assignerName}* assigned *${params.taskName}* to *${params.assigneeName}*`,
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
 * Formats a task completion notification
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
    body: `*${params.taskName}* was completed by *${params.completedByName}*`,
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
 * Formats a comment notification
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
    body: `*${params.authorName}*: ${params.commentPreview}`,
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
 * Formats a mention notification
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
    body: `*${params.mentionedByName}* mentioned *${params.mentionedUserName}*: ${params.commentPreview}`,
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
 * Formats a member joined notification
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
    body: `*${params.memberName}* (${params.memberEmail}) joined *${params.organizationName}* as ${params.role}`,
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
 * Validates a Slack webhook URL
 */
export function isValidSlackWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'hooks.slack.com' &&
      parsed.pathname.startsWith('/services/')
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
