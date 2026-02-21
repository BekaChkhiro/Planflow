/**
 * PlanFlow MCP Server - Comment Tool
 *
 * Add a comment to a task in a project.
 * Supports @mentions and replies to existing comments.
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
 * Input schema for planflow_comment tool
 */
const CommentInputSchema = z.object({
  projectId: z
    .string()
    .uuid('Project ID must be a valid UUID')
    .describe('Project ID containing the task'),
  taskId: z
    .string()
    .describe('Task ID to add comment to (e.g., "T1.1")'),
  content: z
    .string()
    .min(1, 'Comment content is required')
    .max(10000, 'Comment must be at most 10000 characters')
    .describe('Comment content (supports @mentions like @user@email.com)'),
  parentId: z
    .string()
    .uuid('Parent comment ID must be a valid UUID')
    .optional()
    .describe('Optional: Reply to a specific comment by providing its ID'),
})

type CommentInput = z.infer<typeof CommentInputSchema>

/**
 * Format author name (first name or email prefix)
 */
function formatAuthorName(name: string | null, email: string): string {
  if (name) {
    return name
  }
  return email.split('@')[0]
}

/**
 * planflow_comment tool implementation
 *
 * Add a comment to a task.
 */
export const commentTool: ToolDefinition<CommentInput> = {
  name: 'planflow_comment',

  description: `Add a comment to a PlanFlow task.

Post a comment on a specific task. Supports @mentions to notify team members.

Usage:
  planflow_comment(projectId: "uuid", taskId: "T1.1", content: "Great progress!")
  planflow_comment(projectId: "uuid", taskId: "T1.1", content: "@john@email.com please review")
  planflow_comment(projectId: "uuid", taskId: "T1.1", content: "I agree!", parentId: "comment-uuid")

Parameters:
  - projectId (required): Project UUID
  - taskId (required): Task ID (e.g., "T1.1", "T2.3")
  - content (required): Comment text (max 10000 chars)
  - parentId (optional): Comment ID to reply to

Features:
  - @mentions: Include @email to notify team members
  - Replies: Use parentId to create threaded replies
  - Notifications: Mentioned users and task assignee get notified

You must be logged in first with planflow_login.`,

  inputSchema: CommentInputSchema,

  async execute(input: CommentInput): Promise<ReturnType<typeof createSuccessResult>> {
    logger.info('Comment tool called', {
      projectId: input.projectId,
      taskId: input.taskId,
      contentLength: input.content.length,
      isReply: !!input.parentId,
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

      logger.info('Creating comment', {
        projectId: input.projectId,
        taskId: input.taskId,
        parentId: input.parentId,
      })

      const response = await client.createComment(input.projectId, input.taskId, {
        content: input.content,
        parentId: input.parentId,
      })

      const comment = response.comment
      const authorName = formatAuthorName(comment.author.name, comment.author.email)

      logger.info('Successfully created comment', {
        commentId: comment.id,
        taskId: input.taskId,
      })

      // T6.2: Auto-signal "working on" status when commenting on a task
      // Adding a comment is a strong signal that user is actively working on this task
      try {
        await client.startWorkingOn(input.projectId, input.taskId)
        logger.debug('Auto-started working on task from comment', { taskId: input.taskId })
      } catch (workingOnError) {
        // Non-fatal: log but don't fail the comment creation
        logger.debug('Failed to update working on status from comment (non-fatal)', {
          error: String(workingOnError),
        })
      }

      // Build success message
      const isReply = !!input.parentId
      const actionWord = isReply ? 'Reply' : 'Comment'

      // Check for mentions in content
      const mentionMatches = input.content.match(/@[\w.+-]+@[\w.-]+\.\w+/g)
      const mentionCount = mentionMatches ? mentionMatches.length : 0

      // Truncate content for display if needed
      const displayContent = input.content.length > 100
        ? input.content.slice(0, 97) + '...'
        : input.content

      const outputLines = [
        `✅ ${actionWord} added to ${input.taskId}\n`,
        '─'.repeat(50),
        '',
        `💬 ${authorName}:`,
        `   "${displayContent}"`,
        '',
      ]

      // Add mention notification info
      if (mentionCount > 0) {
        outputLines.push(
          `📬 ${mentionCount} user${mentionCount > 1 ? 's' : ''} mentioned and will be notified`
        )
        outputLines.push('')
      }

      outputLines.push('─'.repeat(50))
      outputLines.push('\n💡 Commands:')
      outputLines.push(`  • View comments: planflow_comments(projectId: "...", taskId: "${input.taskId}")`)
      outputLines.push(`  • Reply: planflow_comment(projectId: "...", taskId: "${input.taskId}", content: "...", parentId: "${comment.id}")`)

      return createSuccessResult(outputLines.join('\n'))
    } catch (error) {
      logger.error('Failed to create comment', { error: String(error) })

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
          // Could be project or task not found
          const message = error.message.toLowerCase()
          if (message.includes('task')) {
            return createErrorResult(
              `❌ Task not found: ${input.taskId}\n\n` +
                'Please check the task ID and try again.\n' +
                'Use planflow_task_list(projectId: "...") to list available tasks.'
            )
          }
          if (input.parentId && message.includes('comment')) {
            return createErrorResult(
              `❌ Parent comment not found: ${input.parentId}\n\n` +
                'The comment you\'re trying to reply to doesn\'t exist.\n' +
                `Use planflow_comments(projectId: "...", taskId: "${input.taskId}") to view existing comments.`
            )
          }
          return createErrorResult(
            `❌ Project not found: ${input.projectId}\n\n` +
              'Please check the project ID and try again.\n' +
              'Use planflow_projects() to list your available projects.'
          )
        }
        if (error.statusCode === 400) {
          return createErrorResult(
            `❌ Invalid request: ${error.message}\n\n` +
              'Please check your input and try again.'
          )
        }
        return createErrorResult(
          `❌ API error: ${error.message}\n\n` + 'Please check your internet connection and try again.'
        )
      }

      // Generic error
      const message = error instanceof Error ? error.message : String(error)
      return createErrorResult(
        `❌ Failed to add comment: ${message}\n\n` + 'Please try again or check your connection.'
      )
    }
  },
}
