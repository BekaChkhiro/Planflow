/**
 * PlanFlow MCP Server — Changes Tool
 *
 * View the recent changes stream for a project.
 * Shows what has been modified recently across tasks, knowledge, comments, etc.
 *
 * T21.3 — planflow_changes
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
} from './types.js'

const ChangesInputSchema = z.object({
  projectId: z
    .string()
    .uuid('Project ID must be a valid UUID')
    .describe('Project ID to get changes for'),
  entityType: z
    .enum(['task', 'knowledge', 'comment', 'project'])
    .optional()
    .describe('Optional: filter by entity type'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(50)
    .describe('Maximum changes to fetch (default: 50)'),
})

type ChangesInput = z.infer<typeof ChangesInputSchema>

/**
 * Format relative time
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
 * planflow_changes tool implementation
 */
export const changesTool: ToolDefinition<ChangesInput> = {
  name: 'planflow_changes',

  description: `View recent changes for a PlanFlow project.

Shows what has been modified recently — tasks updated, knowledge added,
comments posted, project settings changed, etc.

Usage:
  planflow_changes(projectId: "uuid")
  planflow_changes(projectId: "uuid", limit: 20)
  planflow_changes(projectId: "uuid", entityType: "task")

Parameters:
  - projectId (required): Project UUID
  - entityType (optional): Filter by type — task | knowledge | comment | project
  - limit (optional): Max changes to fetch (default: 50, max: 200)

Prerequisites:
  • Logged in with planflow_login()`,

  inputSchema: ChangesInputSchema,

  async execute(input: ChangesInput): Promise<ReturnType<typeof createSuccessResult>> {
    logger.info('Changes tool called', {
      projectId: input.projectId,
      entityType: input.entityType,
      limit: input.limit,
    })

    if (!isAuthenticated()) {
      return createErrorResult(
        '❌ Not logged in.\n\n' +
          'Please authenticate first using:\n' +
          '  planflow_login(token: "your-api-token")\n\n' +
          'Get your token at: https://planflow.tools/settings/api-tokens'
      )
    }

    try {
      const client = getApiClient()

      const response = await client.getChanges(input.projectId, {
        entityType: input.entityType,
        limit: input.limit,
      })

      logger.info('Changes retrieved', { count: response.changes.length, total: response.total })

      if (response.changes.length === 0) {
        const filterMsg = input.entityType ? ` for ${input.entityType}` : ''
        return createSuccessResult(
          `📋 No recent changes found${filterMsg}.\n\n` +
            'Changes will appear when tasks are updated, knowledge is added,\n' +
            'comments are posted, or project settings are modified.'
        )
      }

      const lines: string[] = [
        `📋 Recent Changes${input.entityType ? ` (${input.entityType})` : ''}`,
        `${response.total} total changes\n`,
      ]

      for (const change of response.changes.slice(0, 20)) {
        const time = formatRelativeTime(change.timestamp)
        const emoji = getActionEmoji(change.action)
        lines.push(
          `${emoji} ${change.action}  ${change.entityType}${change.entityId ? ` ${change.entityId}` : ''}`,
          `   ${change.description || '(no description)'}`,
          `   by ${change.userEmail} · ${time}`,
          ''
        )
      }

      if (response.changes.length > 20) {
        lines.push(`... and ${response.changes.length - 20} more changes`)
      }

      lines.push(
        '\n💡 Filter with:',
        '  planflow_changes(projectId: "...", entityType: "task")',
        '  planflow_changes(projectId: "...", limit: 100)'
      )

      return createSuccessResult(lines.join('\n'))
    } catch (error) {
      logger.error('Changes fetch failed', { error: String(error) })

      if (error instanceof AuthError) {
        return createErrorResult(
          '❌ Authentication error. Please log out and log in again.\n' +
            '  planflow_logout()\n' +
            '  planflow_login(token: "your-new-token")'
        )
      }

      if (error instanceof ApiError) {
        if (error.statusCode === 404) {
          return createErrorResult(
            `❌ Project not found: ${input.projectId}\n\n` +
              'Use planflow_projects() to list your available projects.'
          )
        }
        return createErrorResult(`❌ API error: ${error.message}`)
      }

      const message = error instanceof Error ? error.message : String(error)
      return createErrorResult(`❌ Failed to get changes: ${message}`)
    }
  },
}

function getActionEmoji(action: string): string {
  if (action.includes('created')) return '✨'
  if (action.includes('updated')) return '📝'
  if (action.includes('deleted')) return '🗑️'
  if (action.includes('status')) return '🔄'
  if (action.includes('assigned')) return '👤'
  if (action.includes('comment')) return '💬'
  if (action.includes('plan')) return '📄'
  return '📌'
}
