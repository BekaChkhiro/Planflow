/**
 * PlanFlow MCP Server — Working On Tool
 *
 * Signal what task you are currently working on.
 * Updates real-time presence so teammates can see your focus.
 *
 * T21.3 — planflow_working_on
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
import { getCurrentProjectId } from './use.js'

const WorkingOnInputSchema = z.object({
  projectId: z
    .string()
    .uuid('Project ID must be a valid UUID')
    .optional()
    .describe('Project ID. Uses current project from planflow_use() if omitted.'),
  action: z
    .enum(['start', 'stop'])
    .describe('Whether to start or stop working on a task'),
  taskId: z
    .string()
    .optional()
    .describe('Task ID to work on (e.g., "T1.1", "T2.3"). Required when action=start.'),
})

type WorkingOnInput = z.infer<typeof WorkingOnInputSchema>

/**
 * planflow_working_on tool implementation
 */
export const workingOnTool: ToolDefinition<WorkingOnInput> = {
  name: 'planflow_working_on',

  description: `Signal what task you are currently working on in PlanFlow.

Updates your real-time presence so teammates can see your focus.
Automatically stopped when you start working on a different task.

Usage:
  planflow_working_on(projectId: "uuid", action: "start", taskId: "T1.1")
  planflow_working_on(projectId: "uuid", action: "stop")

Parameters:
  - projectId (required): Project UUID
  - action (required): "start" or "stop"
  - taskId (optional): Task ID (required when action=start)

Prerequisites:
  • Logged in with planflow_login()`,

  inputSchema: WorkingOnInputSchema,

  async execute(input: WorkingOnInput): Promise<ReturnType<typeof createSuccessResult>> {
    const projectId = input.projectId || getCurrentProjectId()

    if (!projectId) {
      return createErrorResult(
        '❌ No project ID provided and no current project set.\n\n' +
          'Either:\n' +
          '  1. Pass projectId: planflow_working_on(projectId: "uuid", action: "start", taskId: "T1.1")\n' +
          '  2. Set current project: planflow_use(projectId: "uuid")'
      )
    }

    logger.info('Working on tool called', {
      projectId,
      action: input.action,
      taskId: input.taskId,
    })

    if (!isAuthenticated()) {
      return createErrorResult(
        '❌ Not logged in.\n\n' +
          'Please authenticate first using:\n' +
          '  planflow_login(token: "your-api-token")\n\n' +
          'Get your token at: https://planflow.tools/settings/api-tokens'
      )
    }

    if (input.action === 'start' && !input.taskId) {
      return createErrorResult(
        '❌ taskId is required when action is "start".\n\n' +
          'Usage: planflow_working_on(projectId: "uuid", action: "start", taskId: "T1.1")'
      )
    }

    try {
      const client = getApiClient()

      if (input.action === 'start' && input.taskId) {
        const result = await client.startWorkingOn(input.projectId, input.taskId)
        logger.info('Started working on task', { taskId: input.taskId })

        return createSuccessResult(
          `✅ Now working on ${result.workingOn.taskId}: ${result.workingOn.taskName}\n\n` +
            `💡 Teammates can see your focus in real-time.\n` +
            `   Stop with: planflow_working_on(projectId: "${projectId}", action: "stop")`
        )
      }

      // action === 'stop'
      const result = await client.stopWorkingOn(projectId)
      logger.info('Stopped working')

      return createSuccessResult(
        `✅ Stopped working on current task.\n\n` +
          `💡 Start a new task with:\n` +
          `   planflow_working_on(projectId: "${projectId}", action: "start", taskId: "T1.1")`
      )
    } catch (error) {
      logger.error('Working on update failed', { error: String(error) })

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
            `❌ Project or task not found: ${projectId}\n\n` +
              'Use planflow_projects() and planflow_task_list() to verify IDs.'
          )
        }
        return createErrorResult(`❌ API error: ${error.message}`)
      }

      const message = error instanceof Error ? error.message : String(error)
      return createErrorResult(`❌ Failed to update working status: ${message}`)
    }
  },
}
