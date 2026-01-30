/**
 * PlanFlow MCP Server - Sync Tool
 *
 * Bidirectional synchronization between local PROJECT_PLAN.md files
 * and the PlanFlow cloud backend.
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
  formatKeyValue,
} from './types.js'

/**
 * Input schema for planflow_sync tool
 */
const SyncInputSchema = z.object({
  projectId: z.string().uuid('Invalid project ID format'),
  direction: z.enum(['push', 'pull']),
  content: z.string().optional(), // Required for push, ignored for pull
})

type SyncInput = z.infer<typeof SyncInputSchema>

/**
 * Format a date for display
 */
function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Count lines in a string
 */
function countLines(content: string): number {
  if (!content) return 0
  return content.split('\n').length
}

/**
 * Format byte size for display
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * planflow_sync tool implementation
 *
 * Enables bidirectional sync of PROJECT_PLAN.md with PlanFlow cloud.
 */
export const syncTool: ToolDefinition<SyncInput> = {
  name: 'planflow_sync',

  description: `Sync PROJECT_PLAN.md with PlanFlow cloud.

Bidirectional synchronization between local plan files and the cloud.

Usage:
  planflow_sync(projectId: "uuid", direction: "push", content: "# Plan...")  - Upload local plan
  planflow_sync(projectId: "uuid", direction: "pull")                        - Download cloud plan

Parameters:
  - projectId (required): Project UUID from planflow_create or planflow_projects
  - direction (required): "push" to upload, "pull" to download
  - content (required for push): The markdown content to upload

You must be logged in first with planflow_login.

Returns:
  - Push: Confirmation with size and timestamp
  - Pull: Full plan content (markdown) to save locally`,

  inputSchema: SyncInputSchema,

  async execute(input: SyncInput): Promise<ReturnType<typeof createSuccessResult>> {
    logger.info('Syncing project plan', {
      projectId: input.projectId,
      direction: input.direction,
    })

    // Check if authenticated locally first
    if (!isAuthenticated()) {
      logger.debug('No active session found')
      return createErrorResult(
        '❌ Not logged in.\n\n' +
          'Please authenticate first using:\n' +
          '  planflow_login(token: "your-api-token")\n\n' +
          'Get your token at: https://planflow.dev/settings/api-tokens'
      )
    }

    // Validate content is provided for push
    if (input.direction === 'push' && !input.content) {
      logger.debug('Push requested without content')
      return createErrorResult(
        '❌ Content is required for push operation.\n\n' +
          'Please provide the plan content:\n' +
          '  planflow_sync(\n' +
          `    projectId: "${input.projectId}",\n` +
          '    direction: "push",\n' +
          '    content: "# Your plan content here..."\n' +
          '  )\n\n' +
          '💡 Tip: Read your PROJECT_PLAN.md file and pass its content.'
      )
    }

    try {
      const client = getApiClient()

      if (input.direction === 'push') {
        return await executePush(client, input.projectId, input.content!)
      } else {
        return await executePull(client, input.projectId)
      }
    } catch (error) {
      logger.error('Failed to sync project plan', { error: String(error) })

      if (error instanceof AuthError) {
        return createErrorResult(
          '❌ Authentication error: Your session may have expired.\n\n' +
            'Please log out and log in again:\n' +
            '  1. planflow_logout()\n' +
            '  2. planflow_login(token: "your-new-token")\n\n' +
            'Get a new token at: https://planflow.dev/settings/api-tokens'
        )
      }

      if (error instanceof ApiError) {
        if (error.statusCode === 404) {
          return createErrorResult(
            '❌ Project not found.\n\n' +
              'Please check the project ID and try again.\n' +
              'Run planflow_projects() to list your available projects.'
          )
        }

        return createErrorResult(
          `❌ API error: ${error.message}\n\n` +
            'Please check your internet connection and try again.'
        )
      }

      // Generic error
      const message = error instanceof Error ? error.message : String(error)
      return createErrorResult(
        `❌ Failed to sync plan: ${message}\n\n` +
          'Please try again or check your connection.'
      )
    }
  },
}

/**
 * Execute push operation - upload local plan to cloud
 */
async function executePush(
  client: ReturnType<typeof getApiClient>,
  projectId: string,
  content: string
): Promise<ReturnType<typeof createSuccessResult>> {
  logger.info('Pushing plan to cloud', { projectId, contentLength: content.length })

  const response = await client.updateProjectPlan(projectId, content)

  const bytes = new TextEncoder().encode(content).length
  const lines = countLines(content)

  const output = [
    '✅ Plan synced to cloud!\n',
    formatKeyValue({
      'Project': response.projectName,
      'Direction': 'push',
      'Size': `${formatBytes(bytes)} (${lines} lines)`,
      'Updated': formatDate(response.updatedAt),
    }),
    '\n\n💡 Tip: Your local changes are now saved to the cloud.',
  ].join('\n')

  logger.info('Successfully pushed plan', { projectId })
  return createSuccessResult(output)
}

/**
 * Execute pull operation - download plan from cloud
 */
async function executePull(
  client: ReturnType<typeof getApiClient>,
  projectId: string
): Promise<ReturnType<typeof createSuccessResult>> {
  logger.info('Pulling plan from cloud', { projectId })

  const response = await client.getProjectPlan(projectId)

  // Handle case where no plan exists yet
  if (!response.plan) {
    const output = [
      '⚠️ No plan exists for this project yet.\n',
      formatKeyValue({
        'Project': response.projectName,
        'Project ID': response.projectId,
      }),
      "\n\n💡 Tip: Create a PROJECT_PLAN.md locally and use 'push' to upload it.",
    ].join('\n')

    return createSuccessResult(output)
  }

  const bytes = new TextEncoder().encode(response.plan).length
  const lines = countLines(response.plan)

  const output = [
    '✅ Plan retrieved from cloud!\n',
    formatKeyValue({
      'Project': response.projectName,
      'Direction': 'pull',
      'Size': `${formatBytes(bytes)} (${lines} lines)`,
      'Updated': formatDate(response.updatedAt),
    }),
    '\n\n---',
    response.plan,
    '---',
    '\n💡 Tip: Save this content to PROJECT_PLAN.md in your project.',
  ].join('\n')

  logger.info('Successfully pulled plan', { projectId, contentLength: response.plan.length })
  return createSuccessResult(output)
}
