/**
 * PlanFlow MCP Server - Activity Tool
 *
 * View recent activity for a project or specific task.
 * Shows who did what and when in the project.
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

/**
 * Input schema for planflow_activity tool
 */
const ActivityInputSchema = z.object({
  projectId: z
    .string()
    .uuid('Project ID must be a valid UUID')
    .describe('Project ID to get activity for'),
  taskId: z
    .string()
    .optional()
    .describe('Optional: Filter activity for a specific task (e.g., "T1.1")'),
  action: z
    .enum([
      'task_created',
      'task_updated',
      'task_deleted',
      'task_status_changed',
      'task_assigned',
      'task_unassigned',
      'comment_created',
      'comment_updated',
      'comment_deleted',
      'project_updated',
      'plan_updated',
      'member_invited',
      'member_joined',
      'member_removed',
      'member_role_changed',
    ])
    .optional()
    .describe('Optional: Filter by action type'),
  entityType: z
    .enum(['task', 'comment', 'project', 'member', 'invitation'])
    .optional()
    .describe('Optional: Filter by entity type'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe('Maximum number of activities to fetch (default: 20)'),
})

type ActivityInput = z.infer<typeof ActivityInputSchema>

/**
 * Get action emoji for visual feedback
 */
function getActionEmoji(action: string): string {
  switch (action) {
    // Task actions
    case 'task_created':
      return '✨'
    case 'task_updated':
      return '📝'
    case 'task_deleted':
      return '🗑️'
    case 'task_status_changed':
      return '🔄'
    case 'task_assigned':
      return '👤'
    case 'task_unassigned':
      return '👤'
    // Comment actions
    case 'comment_created':
      return '💬'
    case 'comment_updated':
      return '✏️'
    case 'comment_deleted':
      return '🗑️'
    // Project actions
    case 'project_created':
      return '🆕'
    case 'project_updated':
      return '📋'
    case 'project_deleted':
      return '🗑️'
    case 'plan_updated':
      return '📄'
    // Member actions
    case 'member_invited':
      return '📨'
    case 'member_joined':
      return '🎉'
    case 'member_removed':
      return '👋'
    case 'member_role_changed':
      return '🔑'
    default:
      return '📌'
  }
}

/**
 * Format action name for display
 */
function formatActionName(action: string): string {
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
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
  if (diffMinutes < 60) return `${diffMinutes}m ago`
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
 * Format actor name (first name or email prefix)
 */
function formatActorName(name: string | null, email: string): string {
  if (name) {
    // Return first name or full name if short
    const firstName = name.split(' ')[0]
    return firstName.length <= 12 ? firstName : truncate(name, 12)
  }
  // Use email prefix
  return truncate(email.split('@')[0], 12)
}

/**
 * planflow_activity tool implementation
 *
 * View recent activity for a project or specific task.
 */
export const activityTool: ToolDefinition<ActivityInput> = {
  name: 'planflow_activity',

  description: `View recent activity for a PlanFlow project.

See what's happening in your project - who did what and when.

Usage:
  planflow_activity(projectId: "uuid")                    # Recent project activity
  planflow_activity(projectId: "uuid", taskId: "T1.1")    # Activity for specific task
  planflow_activity(projectId: "uuid", action: "task_status_changed")  # Filter by action
  planflow_activity(projectId: "uuid", limit: 50)         # Get more activities

Parameters:
  - projectId (required): Project UUID
  - taskId (optional): Filter by task (e.g., "T1.1", "T2.3")
  - action (optional): Filter by action type
  - entityType (optional): Filter by entity type (task, comment, project, member)
  - limit (optional): Max activities to fetch (default: 20, max: 100)

Action Types:
  Task: task_created, task_updated, task_status_changed, task_assigned, task_unassigned
  Comment: comment_created, comment_updated, comment_deleted
  Project: project_updated, plan_updated
  Team: member_invited, member_joined, member_removed, member_role_changed

Entity Types:
  task, comment, project, member, invitation

You must be logged in first with planflow_login.`,

  inputSchema: ActivityInputSchema,

  async execute(input: ActivityInput): Promise<ReturnType<typeof createSuccessResult>> {
    logger.info('Activity tool called', {
      projectId: input.projectId,
      taskId: input.taskId,
      action: input.action,
    })

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

      logger.info('Fetching activity', {
        projectId: input.projectId,
        taskId: input.taskId,
        action: input.action,
        entityType: input.entityType,
        limit: input.limit,
      })

      // Fetch activity based on whether taskId is provided
      const response = input.taskId
        ? await client.getTaskActivity(input.projectId, input.taskId, {
            action: input.action,
            limit: input.limit,
          })
        : await client.getProjectActivity(input.projectId, {
            action: input.action,
            entityType: input.entityType,
            taskId: input.taskId,
            limit: input.limit,
          })

      logger.info('Successfully retrieved activity', {
        count: response.activities.length,
        total: response.pagination.total,
      })

      // Handle empty activity
      if (response.activities.length === 0) {
        const filterMessage = input.taskId
          ? ` for task ${input.taskId}`
          : input.action
            ? ` with action "${input.action}"`
            : ''

        return createSuccessResult(
          `📋 No activity found${filterMessage}\n\n` +
            '💡 Activity will appear when:\n' +
            '  • Tasks are created, updated, or completed\n' +
            '  • Comments are added\n' +
            '  • Team members join or are invited\n' +
            '  • The project plan is updated'
        )
      }

      // Format activities as a table
      const headers = ['', 'Who', 'Action', 'Details', 'When']
      const rows = response.activities.map((a) => {
        // Build details string
        let details = ''
        if (a.taskId) {
          details = a.taskId
        }
        if (a.description) {
          details = details ? `${details}: ${truncate(a.description, 25)}` : truncate(a.description, 30)
        }
        if (!details && a.metadata) {
          // Try to extract useful info from metadata
          const meta = a.metadata as Record<string, unknown>
          if (meta.oldStatus && meta.newStatus) {
            details = `${meta.oldStatus} → ${meta.newStatus}`
          } else if (meta.assigneeName) {
            details = `→ ${meta.assigneeName}`
          } else if (meta.inviteeEmail) {
            details = truncate(String(meta.inviteeEmail), 20)
          }
        }

        return [
          getActionEmoji(a.action),
          formatActorName(a.actor.name, a.actor.email),
          formatActionName(a.action),
          details || '-',
          formatRelativeTime(a.createdAt),
        ]
      })

      // Build title
      const titleParts = ['📋 Recent Activity']
      if (input.taskId) {
        titleParts.push(`for ${input.taskId}`)
      }
      if (input.action) {
        titleParts.push(`(${formatActionName(input.action)})`)
      }

      // Build pagination info
      const paginationInfo = response.pagination.hasMore
        ? `Showing ${response.activities.length} of ${response.pagination.total}`
        : `${response.activities.length} activities`

      const output = [
        `${titleParts.join(' ')}\n`,
        `${paginationInfo}\n`,
        formatTable(headers, rows),
        '\n\n💡 Commands:',
        '  • planflow_activity(projectId: "...", taskId: "T1.1") - Task activity',
        '  • planflow_activity(projectId: "...", action: "task_status_changed") - Filter by action',
        '  • planflow_activity(projectId: "...", limit: 50) - Get more activities',
      ].join('\n')

      return createSuccessResult(output)
    } catch (error) {
      logger.error('Failed to get activity', { error: String(error) })

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
          return createErrorResult(
            `❌ Project not found: ${input.projectId}\n\n` +
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
        `❌ Failed to get activity: ${message}\n\n` + 'Please try again or check your connection.'
      )
    }
  },
}
