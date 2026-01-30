/**
 * PlanFlow MCP Server - Create Project Tool
 *
 * Creates a new project for the authenticated user.
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
 * Input schema for planflow_create tool
 */
const CreateInputSchema = z.object({
  name: z
    .string()
    .min(1, 'Project name is required')
    .max(255, 'Project name must be at most 255 characters'),
  description: z
    .string()
    .max(1000, 'Description must be at most 1000 characters')
    .optional(),
})

type CreateInput = z.infer<typeof CreateInputSchema>

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
 * planflow_create tool implementation
 *
 * Creates a new project in PlanFlow.
 */
export const createTool: ToolDefinition<CreateInput> = {
  name: 'planflow_create',

  description: `Create a new PlanFlow project.

Creates a new project with the specified name and optional description.

Usage:
  planflow_create(name: "My Project")
  planflow_create(name: "My Project", description: "A description of my project")

Parameters:
  - name (required): Project name (1-255 characters)
  - description (optional): Project description (max 1000 characters)

You must be logged in first with planflow_login.

Returns:
  - Project ID (use for sync and task commands)
  - Project name
  - Description
  - Created timestamp`,

  inputSchema: CreateInputSchema,

  async execute(input: CreateInput): Promise<ReturnType<typeof createSuccessResult>> {
    logger.info('Creating new project', { name: input.name })

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

    try {
      // Get the API client and create the project
      const client = getApiClient()
      const project = await client.createProject({
        name: input.name,
        description: input.description,
      })

      logger.info('Successfully created project', { projectId: project.id })

      // Build success output
      const output = [
        '✅ Project created successfully!\n',
        formatKeyValue({
          'Project ID': project.id,
          'Name': project.name,
          'Description': project.description || '(none)',
          'Created': formatDate(project.createdAt),
        }),
        '\n\n💡 Next steps:',
        '  • planflow_sync(projectId: "' + project.id + '", direction: "push")  - Upload your PROJECT_PLAN.md',
        '  • planflow_task_list(projectId: "' + project.id + '")               - View project tasks',
        '  • planflow_projects()                                               - List all projects',
        '\n📋 Save this project ID for future commands:',
        `  ${project.id}`,
      ].join('\n')

      return createSuccessResult(output)

    } catch (error) {
      logger.error('Failed to create project', { error: String(error) })

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
        // Handle validation errors
        if (error.statusCode === 400) {
          return createErrorResult(
            `❌ Invalid project data: ${error.message}\n\n` +
              'Please check:\n' +
              '  • Name is between 1-255 characters\n' +
              '  • Description is at most 1000 characters'
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
        `❌ Failed to create project: ${message}\n\n` +
          'Please try again or check your connection.'
      )
    }
  },
}
