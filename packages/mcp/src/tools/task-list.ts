/**
 * PlanFlow MCP Server - Task List Tool
 *
 * Lists all tasks for a project with optional status filtering.
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
 * Input schema for planflow_task_list tool
 */
const TaskListInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID'),
  status: z
    .enum(['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'])
    .optional()
    .describe('Filter tasks by status'),
})

type TaskListInput = z.infer<typeof TaskListInputSchema>

/**
 * Truncate a string to a maximum length
 */
function truncate(str: string | null | undefined, maxLength: number): string {
  if (!str) return '-'
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 3) + '...'
}

/**
 * Get status emoji
 */
function getStatusEmoji(status: string): string {
  switch (status) {
    case 'TODO':
      return '📋'
    case 'IN_PROGRESS':
      return '🔄'
    case 'DONE':
      return '✅'
    case 'BLOCKED':
      return '🚫'
    default:
      return '❓'
  }
}

/**
 * Get complexity indicator
 */
function getComplexityIndicator(complexity: string): string {
  switch (complexity) {
    case 'Low':
      return '🟢'
    case 'Medium':
      return '🟡'
    case 'High':
      return '🔴'
    default:
      return '⚪'
  }
}

/**
 * planflow_task_list tool implementation
 *
 * Lists all tasks for a project with filtering options.
 */
export const taskListTool: ToolDefinition<TaskListInput> = {
  name: 'planflow_task_list',

  description: `List all tasks for a PlanFlow project.

Displays a table of tasks with their status, complexity, and dependencies.

Usage:
  planflow_task_list(projectId: "uuid")
  planflow_task_list(projectId: "uuid", status: "TODO")

Parameters:
  - projectId (required): The project UUID (get from planflow_projects)
  - status (optional): Filter by status - TODO, IN_PROGRESS, DONE, or BLOCKED

Returns:
  - Task ID (e.g., T1.1)
  - Task name
  - Status with emoji
  - Complexity indicator
  - Estimated hours
  - Dependencies

You must be logged in first with planflow_login.`,

  inputSchema: TaskListInputSchema,

  async execute(input: TaskListInput): Promise<ReturnType<typeof createSuccessResult>> {
    logger.info('Fetching tasks list', { projectId: input.projectId, status: input.status })

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
      // Get the API client and fetch tasks
      const client = getApiClient()
      const response = await client.listTasks(input.projectId)

      logger.info('Successfully retrieved tasks', {
        projectId: input.projectId,
        count: response.tasks.length,
      })

      // Filter tasks by status if provided
      let tasks = response.tasks
      if (input.status) {
        tasks = tasks.filter((t) => t.status === input.status)
        logger.debug('Filtered tasks by status', {
          status: input.status,
          filteredCount: tasks.length,
        })
      }

      // Handle empty tasks list
      if (tasks.length === 0) {
        const filterMessage = input.status ? ` with status "${input.status}"` : ''
        return createSuccessResult(
          `📋 No tasks found${filterMessage}.\n\n` +
            `Project: ${response.projectName}\n\n` +
            (input.status
              ? '💡 Try removing the status filter to see all tasks:\n' +
                `  planflow_task_list(projectId: "${input.projectId}")`
              : '💡 Tasks are created when you sync your PROJECT_PLAN.md:\n' +
                `  planflow_sync(projectId: "${input.projectId}", direction: "push")`)
        )
      }

      // Sort tasks by taskId (T1.1, T1.2, T2.1, etc.)
      tasks.sort((a, b) => {
        const parseTaskId = (id: string) => {
          const match = id.match(/T(\d+)\.(\d+)/)
          if (!match) return [0, 0]
          return [parseInt(match[1]!, 10), parseInt(match[2]!, 10)]
        }
        const [aMajor, aMinor] = parseTaskId(a.taskId)
        const [bMajor, bMinor] = parseTaskId(b.taskId)
        if (aMajor !== bMajor) return aMajor - bMajor
        return aMinor - bMinor
      })

      // Calculate summary stats
      const stats = {
        total: response.tasks.length,
        todo: response.tasks.filter((t) => t.status === 'TODO').length,
        inProgress: response.tasks.filter((t) => t.status === 'IN_PROGRESS').length,
        done: response.tasks.filter((t) => t.status === 'DONE').length,
        blocked: response.tasks.filter((t) => t.status === 'BLOCKED').length,
      }
      const progressPercent = Math.round((stats.done / stats.total) * 100)

      // Format tasks as a table
      const headers = ['ID', 'Name', 'Status', 'Complexity', 'Est.', 'Dependencies']
      const rows = tasks.map((task) => [
        task.taskId,
        truncate(task.name, 30),
        `${getStatusEmoji(task.status)} ${task.status}`,
        `${getComplexityIndicator(task.complexity)} ${task.complexity}`,
        task.estimatedHours ? `${task.estimatedHours}h` : '-',
        task.dependencies.length > 0 ? task.dependencies.join(', ') : '-',
      ])

      // Build progress bar
      const progressBarLength = 10
      const filledBlocks = Math.floor(progressPercent / 10)
      const progressBar = '🟩'.repeat(filledBlocks) + '⬜'.repeat(progressBarLength - filledBlocks)

      // Build output
      const filterLabel = input.status ? ` (filtered: ${input.status})` : ''
      const output = [
        `📋 Tasks for "${response.projectName}"${filterLabel}\n`,
        `Progress: ${progressBar} ${progressPercent}%`,
        `Total: ${stats.total} | ✅ ${stats.done} | 🔄 ${stats.inProgress} | 📋 ${stats.todo} | 🚫 ${stats.blocked}\n`,
        formatTable(headers, rows),
        '\n\n💡 Commands:',
        `  • planflow_task_update(projectId: "${input.projectId}", taskId: "T1.1", status: "DONE")`,
        `  • planflow_task_list(projectId: "${input.projectId}", status: "TODO")`,
        `  • planflow_sync(projectId: "${input.projectId}", direction: "pull")`,
      ].join('\n')

      return createSuccessResult(output)
    } catch (error) {
      logger.error('Failed to fetch tasks', { error: String(error), projectId: input.projectId })

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
        // Handle 404 specifically for project not found
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
        `❌ Failed to fetch tasks: ${message}\n\n` + 'Please try again or check your connection.'
      )
    }
  },
}
