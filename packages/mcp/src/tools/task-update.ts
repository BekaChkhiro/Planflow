/**
 * PlanFlow MCP Server - Task Update Tool
 *
 * Updates task status and other properties for a project task.
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
 * Input schema for planflow_task_update tool
 */
const TaskUpdateInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID'),
  taskId: z.string().describe('Task ID (e.g., "T1.1", "T2.3")'),
  status: z
    .enum(['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'])
    .describe('New status for the task'),
})

type TaskUpdateInput = z.infer<typeof TaskUpdateInputSchema>

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
 * planflow_task_update tool implementation
 *
 * Updates task status in a PlanFlow project.
 */
export const taskUpdateTool: ToolDefinition<TaskUpdateInput> = {
  name: 'planflow_task_update',

  description: `Update task status in a PlanFlow project.

Changes the status of a specific task (e.g., mark as done, in progress, or blocked).

Usage:
  planflow_task_update(projectId: "uuid", taskId: "T1.1", status: "IN_PROGRESS")
  planflow_task_update(projectId: "uuid", taskId: "T2.3", status: "DONE")

Parameters:
  - projectId (required): The project UUID (get from planflow_projects)
  - taskId (required): The task ID (e.g., "T1.1", "T2.3")
  - status (required): New status - TODO, IN_PROGRESS, DONE, or BLOCKED

Status meanings:
  - TODO: Task not yet started
  - IN_PROGRESS: Currently working on this task
  - DONE: Task completed
  - BLOCKED: Task cannot proceed (document blocker reason)

Tip — when starting / finishing a task, prefer the compound tools
that bundle related operations:
  • planflow_task_start(taskId) — fetches context, signals working_on,
    auto-searches code, all in one call.
  • planflow_task_done(taskId, summary?) — marks DONE, posts a comment,
    stops working_on, suggests a commit message.
Use planflow_task_update directly only for BLOCKED transitions or when
you specifically want to skip the side effects.

You must be logged in first with planflow_login.`,

  inputSchema: TaskUpdateInputSchema,

  async execute(input: TaskUpdateInput): Promise<ReturnType<typeof createSuccessResult>> {
    logger.info('Updating task', {
      projectId: input.projectId,
      taskId: input.taskId,
      status: input.status,
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
      // Get the API client and update the task
      const client = getApiClient()
      const updatedTask = await client.updateTaskStatus(
        input.projectId,
        input.taskId,
        input.status
      )

      if (!updatedTask) {
        return createErrorResult(
          `❌ Failed to update task ${input.taskId}.\n\n` +
            'The task may not exist or the update was rejected.\n' +
            'Use planflow_task_list() to see available tasks.'
        )
      }

      logger.info('Successfully updated task', {
        taskId: input.taskId,
        newStatus: input.status,
      })

      // Auto-update working on status based on status change (T6.1)
      try {
        if (input.status === 'IN_PROGRESS') {
          // Auto-start working on this task
          await client.startWorkingOn(input.projectId, input.taskId)
          logger.debug('Auto-started working on task', { taskId: input.taskId })
        } else if (input.status === 'DONE') {
          // Auto-stop working on (clears current task)
          await client.stopWorkingOn(input.projectId)
          logger.debug('Auto-stopped working on task', { taskId: input.taskId })
        }
      } catch (workingOnError) {
        // Non-fatal: log but don't fail the status update
        logger.debug('Failed to update working on status (non-fatal)', {
          error: String(workingOnError),
        })
      }

      // Build success output
      const statusEmoji = getStatusEmoji(updatedTask.status)
      const complexityIndicator = getComplexityIndicator(updatedTask.complexity)

      const taskDetails = formatKeyValue({
        'Task ID': updatedTask.taskId,
        'Name': updatedTask.name,
        'Status': `${statusEmoji} ${updatedTask.status}`,
        'Complexity': `${complexityIndicator} ${updatedTask.complexity}`,
        'Estimated': updatedTask.estimatedHours ? `${updatedTask.estimatedHours}h` : '-',
        'Dependencies': updatedTask.dependencies.length > 0
          ? updatedTask.dependencies.join(', ')
          : 'None',
      })

      // Build contextual next steps
      let nextSteps: string
      switch (input.status) {
        case 'IN_PROGRESS':
          nextSteps = [
            '\n💡 Next steps:',
            `  • When finished: planflow_task_update(projectId: "${input.projectId}", taskId: "${input.taskId}", status: "DONE")`,
            `  • If blocked: planflow_task_update(projectId: "${input.projectId}", taskId: "${input.taskId}", status: "BLOCKED")`,
            `  • Sync changes: planflow_sync(projectId: "${input.projectId}", direction: "pull")`,
          ].join('\n')
          break
        case 'DONE':
          nextSteps = [
            '\n🎉 Great work!',
            '\n💡 Next steps:',
            `  • Find next task: planflow_task_list(projectId: "${input.projectId}", status: "TODO")`,
            `  • Sync changes: planflow_sync(projectId: "${input.projectId}", direction: "pull")`,
          ].join('\n')
          break
        case 'BLOCKED':
          nextSteps = [
            '\n⚠️ Task blocked - document the blocker:',
            '  • What is blocking this task?',
            '  • What needs to happen to unblock it?',
            '  • Who can help resolve this?',
            '\n💡 When unblocked:',
            `  • planflow_task_update(projectId: "${input.projectId}", taskId: "${input.taskId}", status: "IN_PROGRESS")`,
          ].join('\n')
          break
        default:
          nextSteps = [
            '\n💡 Commands:',
            `  • Start task: planflow_task_update(projectId: "${input.projectId}", taskId: "${input.taskId}", status: "IN_PROGRESS")`,
            `  • View all tasks: planflow_task_list(projectId: "${input.projectId}")`,
          ].join('\n')
      }

      const output = [
        `${statusEmoji} Task ${input.taskId} updated to ${input.status}!\n`,
        taskDetails,
        nextSteps,
      ].join('\n')

      return createSuccessResult(output)
    } catch (error) {
      logger.error('Failed to update task', {
        error: String(error),
        projectId: input.projectId,
        taskId: input.taskId,
      })

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
        // Handle 404 specifically for task/project not found
        if (error.statusCode === 404) {
          return createErrorResult(
            `❌ Task not found: ${input.taskId}\n\n` +
              'Please check the task ID and try again.\n' +
              `Use planflow_task_list(projectId: "${input.projectId}") to see available tasks.`
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
        `❌ Failed to update task: ${message}\n\n` +
          'Please try again or check your connection.'
      )
    }
  },
}
