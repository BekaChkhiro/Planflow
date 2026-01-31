/**
 * PlanFlow MCP Server - Projects Tool
 *
 * Lists all projects for the authenticated user.
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
 * Input schema for planflow_projects tool
 * No inputs required - returns all projects for the authenticated user
 */
const ProjectsInputSchema = z.object({})

type ProjectsInput = z.infer<typeof ProjectsInputSchema>

/**
 * Format a date for display
 */
function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Truncate a string to a maximum length
 */
function truncate(str: string | null | undefined, maxLength: number): string {
  if (!str) return '-'
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 3) + '...'
}

/**
 * planflow_projects tool implementation
 *
 * Lists all projects for the authenticated user with key details.
 */
export const projectsTool: ToolDefinition<ProjectsInput> = {
  name: 'planflow_projects',

  description: `List all your PlanFlow projects.

Displays a table of all projects with their names, descriptions, and creation dates.

Usage:
  planflow_projects()

No parameters required. You must be logged in first with planflow_login.

Returns:
  - Project ID (use for other commands)
  - Project name
  - Description (truncated)
  - Created date
  - Updated date`,

  inputSchema: ProjectsInputSchema,

  async execute(_input: ProjectsInput): Promise<ReturnType<typeof createSuccessResult>> {
    logger.info('Fetching projects list')

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
      // Get the API client and fetch projects
      const client = getApiClient()
      const projects = await client.listProjects()

      logger.info('Successfully retrieved projects', { count: projects.length })

      // Handle empty projects list
      if (projects.length === 0) {
        return createSuccessResult(
          '📁 No projects found.\n\n' +
            "You don't have any projects yet.\n\n" +
            '💡 Create your first project:\n' +
            '  planflow_create(name: "My Project", description: "Optional description")\n\n' +
            'Or create one at: https://planflow.tools/projects/new'
        )
      }

      // Format projects as a table
      const headers = ['ID', 'Name', 'Description', 'Created', 'Updated']
      const rows = projects.map((project) => [
        project.id.slice(0, 8) + '...', // Show first 8 chars of UUID
        truncate(project.name, 25),
        truncate(project.description, 30),
        formatDate(project.createdAt),
        formatDate(project.updatedAt),
      ])

      // Build output
      const output = [
        `📁 Your Projects (${projects.length})\n`,
        formatTable(headers, rows),
        '\n\n💡 Commands:',
        '  • planflow_sync(projectId: "...")     - Sync project plan',
        '  • planflow_task_list(projectId: "...") - List project tasks',
        '  • planflow_create(name: "...")        - Create new project',
        '\n📋 Full project IDs:',
        ...projects.map((p) => `  • ${p.name}: ${p.id}`),
      ].join('\n')

      return createSuccessResult(output)

    } catch (error) {
      logger.error('Failed to fetch projects', { error: String(error) })

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
        return createErrorResult(
          `❌ API error: ${error.message}\n\n` +
            'Please check your internet connection and try again.'
        )
      }

      // Generic error
      const message = error instanceof Error ? error.message : String(error)
      return createErrorResult(
        `❌ Failed to fetch projects: ${message}\n\n` +
          'Please try again or check your connection.'
      )
    }
  },
}
