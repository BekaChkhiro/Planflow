/**
 * PlanFlow MCP Server - Comments Tool
 *
 * View comments on a task in a project.
 * Shows threaded discussions with author information.
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

/**
 * Input schema for planflow_comments tool
 */
const CommentsInputSchema = z.object({
  projectId: z
    .string()
    .uuid('Project ID must be a valid UUID')
    .describe('Project ID containing the task'),
  taskId: z
    .string()
    .describe('Task ID to view comments for (e.g., "T1.1")'),
})

type CommentsInput = z.infer<typeof CommentsInputSchema>

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
 * Format author name (first name or email prefix)
 */
function formatAuthorName(name: string | null, email: string): string {
  if (name) {
    const firstName = name.split(' ')[0]
    return firstName.length <= 15 ? firstName : name.slice(0, 12) + '...'
  }
  return email.split('@')[0].slice(0, 12)
}

/**
 * Interface for comment type from API
 */
interface Comment {
  id: string
  content: string
  parentId: string | null
  createdAt: string
  author: {
    id: string
    email: string
    name: string | null
  }
  replies?: Comment[]
}

/**
 * Format a single comment with optional indentation for replies
 */
function formatComment(comment: Comment, indent: number = 0): string {
  const prefix = indent > 0 ? '  '.repeat(indent) + '└─ ' : ''
  const authorName = formatAuthorName(comment.author.name, comment.author.email)
  const time = formatRelativeTime(comment.createdAt)

  // Truncate content if too long
  const maxContentLength = 200 - (indent * 2)
  const content = comment.content.length > maxContentLength
    ? comment.content.slice(0, maxContentLength - 3) + '...'
    : comment.content

  const lines = [
    `${prefix}💬 ${authorName} (${time})`,
    `${prefix}   ${content}`,
  ]

  // Format replies recursively
  if (comment.replies && comment.replies.length > 0) {
    for (const reply of comment.replies) {
      lines.push(formatComment(reply, indent + 1))
    }
  }

  return lines.join('\n')
}

/**
 * planflow_comments tool implementation
 *
 * View all comments on a task.
 */
export const commentsTool: ToolDefinition<CommentsInput> = {
  name: 'planflow_comments',

  description: `View comments on a PlanFlow task.

See all comments and replies on a specific task.

Usage:
  planflow_comments(projectId: "uuid", taskId: "T1.1")

Parameters:
  - projectId (required): Project UUID
  - taskId (required): Task ID (e.g., "T1.1", "T2.3")

Output includes:
  - Comment content
  - Author name/email
  - Timestamp
  - Threaded replies

You must be logged in first with planflow_login.`,

  inputSchema: CommentsInputSchema,

  async execute(input: CommentsInput): Promise<ReturnType<typeof createSuccessResult>> {
    logger.info('Comments tool called', {
      projectId: input.projectId,
      taskId: input.taskId,
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

      logger.info('Fetching comments', {
        projectId: input.projectId,
        taskId: input.taskId,
      })

      const response = await client.listComments(input.projectId, input.taskId)

      logger.info('Successfully retrieved comments', {
        count: response.comments.length,
        total: response.totalCount,
      })

      // T6.2: Auto-signal "working on" status when viewing task comments
      // Viewing comments indicates active engagement with the task
      try {
        await client.startWorkingOn(input.projectId, input.taskId)
        logger.debug('Auto-started working on task from comments view', { taskId: input.taskId })
      } catch (workingOnError) {
        // Non-fatal: log but don't fail the comments fetch
        logger.debug('Failed to update working on status from comments view (non-fatal)', {
          error: String(workingOnError),
        })
      }

      // Handle no comments
      if (response.comments.length === 0) {
        return createSuccessResult(
          `💬 No comments on task ${input.taskId}\n\n` +
            '💡 Add a comment using:\n' +
            `  planflow_comment(projectId: "${input.projectId}", taskId: "${input.taskId}", content: "Your comment")`
        )
      }

      // Format comments
      const commentsList = response.comments
        .map((comment) => formatComment(comment as Comment))
        .join('\n\n')

      const output = [
        `💬 Comments on ${input.taskId}\n`,
        `${response.totalCount} comment${response.totalCount !== 1 ? 's' : ''}\n`,
        '─'.repeat(50),
        '',
        commentsList,
        '',
        '─'.repeat(50),
        '\n💡 Commands:',
        `  • Add comment: planflow_comment(projectId: "...", taskId: "${input.taskId}", content: "...")`,
        `  • Reply: planflow_comment(projectId: "...", taskId: "${input.taskId}", content: "...", parentId: "comment-id")`,
      ].join('\n')

      return createSuccessResult(output)
    } catch (error) {
      logger.error('Failed to get comments', { error: String(error) })

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
            `❌ Task not found: ${input.taskId}\n\n` +
              'Please check the task ID and try again.\n' +
              'Use planflow_task_list(projectId: "...") to list available tasks.'
          )
        }
        return createErrorResult(
          `❌ API error: ${error.message}\n\n` + 'Please check your internet connection and try again.'
        )
      }

      // Generic error
      const message = error instanceof Error ? error.message : String(error)
      return createErrorResult(
        `❌ Failed to get comments: ${message}\n\n` + 'Please try again or check your connection.'
      )
    }
  },
}
