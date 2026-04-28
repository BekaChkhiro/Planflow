/**
 * PlanFlow MCP Server - Notifications Tool
 *
 * View and manage notifications from the PlanFlow platform.
 */

import { z } from 'zod'
import { getApiClient } from '../api-client.js'
import { isAuthenticated } from '../config.js'
import { AuthError, ApiError } from '../errors.js'
import { logger } from '../logger.js'
import {
  type ToolDefinition,
  createSuccessResult,
  createErrorResult,
  formatTable,
} from './types.js'
import { coerceNumber, coerceBoolean } from './_coerce.js'

/**
 * Input schema for planflow_notifications tool
 */
const NotificationsInputSchema = z.object({
  action: z
    .enum(['list', 'read', 'read-all'])
    .default('list')
    .describe('Action to perform: list, read (mark one as read), or read-all'),
  projectId: z
    .string()
    .uuid('Project ID must be a valid UUID')
    .optional()
    .describe('Filter notifications by project (optional)'),
  notificationId: z
    .string()
    .uuid('Notification ID must be a valid UUID')
    .optional()
    .describe('Notification ID to mark as read (required for "read" action)'),
  unreadOnly: coerceBoolean()
    .default(true)
    .describe('Only show unread notifications (default: true)'),
  limit: coerceNumber()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe('Maximum number of notifications to fetch (default: 20)'),
})

type NotificationsInput = z.infer<typeof NotificationsInputSchema>

/**
 * Get notification type emoji
 */
function getTypeEmoji(type: string): string {
  switch (type) {
    case 'comment':
      return '💬'
    case 'status_change':
      return '🔄'
    case 'task_assigned':
      return '👤'
    case 'task_blocked':
      return '🚫'
    case 'task_unblocked':
      return '✅'
    case 'mention':
      return '📣'
    default:
      return '🔔'
  }
}

/**
 * Format relative time (e.g., "5 min ago", "2 hours ago")
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMinutes < 1) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes} min ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

/**
 * Truncate string to max length
 */
function truncate(str: string | null | undefined, maxLength: number): string {
  if (!str) return '-'
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 3) + '...'
}

/**
 * planflow_notifications tool implementation
 *
 * View and manage notifications from the PlanFlow platform.
 */
export const notificationsTool: ToolDefinition<NotificationsInput> = {
  name: 'planflow_notifications',

  description: `View and manage PlanFlow notifications.

Get notified about task updates, comments, and team activities.

Usage:
  planflow_notifications()                              # List unread notifications
  planflow_notifications(unreadOnly: false)             # List all notifications
  planflow_notifications(projectId: "uuid")             # Filter by project
  planflow_notifications(action: "read", notificationId: "uuid")  # Mark as read
  planflow_notifications(action: "read-all")            # Mark all as read

Parameters:
  - action (optional): "list" (default), "read", or "read-all"
  - projectId (optional): Filter by project UUID
  - notificationId (required for "read"): Notification UUID to mark as read
  - unreadOnly (optional): Only show unread (default: true)
  - limit (optional): Max notifications to fetch (default: 20, max: 100)

Notification Types:
  - comment: Someone commented on a task
  - status_change: Task status was updated
  - task_assigned: You were assigned to a task
  - task_blocked: A task was blocked
  - task_unblocked: A task was unblocked
  - mention: You were mentioned in a comment

You must be logged in first with planflow_login.`,

  inputSchema: NotificationsInputSchema,

  async execute(input: NotificationsInput): Promise<ReturnType<typeof createSuccessResult>> {
    logger.info('Notifications tool called', { action: input.action, projectId: input.projectId })

    // Check if authenticated locally first
    if (!isAuthenticated()) {
      logger.debug('No active session found')
      return createErrorResult(
        '❌ Not logged in.\n\n' +
          'Please authenticate first using:\n' +
          '  planflow_login(token: "your-api-token")\n\n' +
          'Get your token at: https://planflow.tools/settings/api-tokens'
      )
    }

    try {
      const client = getApiClient()

      // Handle different actions
      switch (input.action) {
        case 'read': {
          // Mark single notification as read
          if (!input.notificationId) {
            return createErrorResult(
              '❌ Missing notificationId\n\n' +
                'To mark a notification as read, provide the notification ID:\n' +
                '  planflow_notifications(action: "read", notificationId: "uuid")\n\n' +
                'Use planflow_notifications() to list notifications and get their IDs.'
            )
          }

          logger.info('Marking notification as read', { notificationId: input.notificationId })
          const result = await client.markNotificationRead(input.notificationId)

          return createSuccessResult(
            `✅ Notification marked as read\n\n` +
              `${getTypeEmoji(result.notification.type)} ${result.notification.message}\n\n` +
              '💡 Commands:\n' +
              '  • planflow_notifications() - View remaining notifications'
          )
        }

        case 'read-all': {
          // Mark all notifications as read
          logger.info('Marking all notifications as read', { projectId: input.projectId })
          const result = await client.markAllNotificationsRead(input.projectId)

          const scopeMessage = input.projectId
            ? 'for this project'
            : 'across all projects'

          return createSuccessResult(
            `✅ Marked ${result.markedCount} notification${result.markedCount !== 1 ? 's' : ''} as read ${scopeMessage}\n\n` +
              '🔔 You\'re all caught up!\n\n' +
              '💡 Commands:\n' +
              '  • planflow_notifications(unreadOnly: false) - View all notifications'
          )
        }

        case 'list':
        default: {
          // List notifications
          logger.info('Fetching notifications', {
            projectId: input.projectId,
            unreadOnly: input.unreadOnly,
            limit: input.limit,
          })

          const response = await client.listNotifications({
            projectId: input.projectId,
            unreadOnly: input.unreadOnly,
            limit: input.limit,
          })

          logger.info('Successfully retrieved notifications', {
            count: response.notifications.length,
            unreadCount: response.unreadCount,
            totalCount: response.totalCount,
          })

          // Handle empty notifications
          if (response.notifications.length === 0) {
            const filterMessage = input.unreadOnly ? 'unread ' : ''
            const projectMessage = input.projectId ? ' for this project' : ''

            return createSuccessResult(
              `🔔 No ${filterMessage}notifications${projectMessage}\n\n` +
                (input.unreadOnly
                  ? '✨ You\'re all caught up!\n\n' +
                    '💡 Commands:\n' +
                    '  • planflow_notifications(unreadOnly: false) - View all notifications'
                  : '💡 Notifications will appear when:\n' +
                    '  • Someone comments on your tasks\n' +
                    '  • Task statuses change\n' +
                    '  • You\'re assigned to a task\n' +
                    '  • You\'re mentioned in a comment')
            )
          }

          // Format notifications as a table
          const headers = ['Type', 'Message', 'Project', 'Task', 'Time', 'Read']
          const rows = response.notifications.map((n) => [
            getTypeEmoji(n.type),
            truncate(n.message, 35),
            truncate(n.projectName, 15),
            n.taskId ?? '-',
            formatRelativeTime(n.createdAt),
            n.read ? '✓' : '•',
          ])

          // Build summary
          const filterLabel = input.unreadOnly ? ' (unread only)' : ''
          const projectLabel = input.projectId ? ` for project` : ''

          const output = [
            `🔔 Notifications${filterLabel}${projectLabel}\n`,
            `Unread: ${response.unreadCount} | Total: ${response.totalCount}\n`,
            formatTable(headers, rows),
            '\n\n💡 Commands:',
            '  • planflow_notifications(action: "read", notificationId: "uuid") - Mark as read',
            '  • planflow_notifications(action: "read-all") - Mark all as read',
            input.unreadOnly
              ? '  • planflow_notifications(unreadOnly: false) - Show all notifications'
              : '  • planflow_notifications() - Show only unread',
          ].join('\n')

          return createSuccessResult(output)
        }
      }
    } catch (error) {
      logger.error('Failed to handle notifications', { error: String(error), action: input.action })

      if (error instanceof AuthError) {
        return createErrorResult(
          '❌ Authentication error: Your session may have expired.\n\n' +
            'Please log out and log in again:\n' +
            '  1. planflow_logout()\n' +
            '  2. planflow_login(token: "your-new-token")\n\n' +
            'Get a new token at: https://planflow.tools/settings/api-tokens'
        )
      }

      if (error instanceof ApiError) {
        if (error.statusCode === 404) {
          if (input.action === 'read') {
            return createErrorResult(
              `❌ Notification not found: ${input.notificationId}\n\n` +
                'The notification may have been deleted or the ID is incorrect.\n' +
                'Use planflow_notifications() to list available notifications.'
            )
          }
          return createErrorResult(
            `❌ Resource not found\n\n` +
              'Please check the project ID and try again.\n' +
              'Use planflow_projects() to list your available projects.'
          )
        }
        return createErrorResult(
          `❌ API error: ${error.message}\n\n` + 'Please check your internet connection and try again.'
        )
      }

      // Generic error
      const message = error instanceof Error ? error.message : String(error)
      return createErrorResult(
        `❌ Failed to handle notifications: ${message}\n\n` + 'Please try again or check your connection.'
      )
    }
  },
}
