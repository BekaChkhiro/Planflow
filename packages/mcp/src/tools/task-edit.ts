/**
 * PlanFlow MCP Server — planflow_task_edit
 *
 * Edit any field on a single task by its task ID (e.g. "T21.4").
 * The companion to planflow_task_update — that tool only flips
 * status; this one covers name, description, status, complexity,
 * estimated hours, and dependencies.
 *
 * Designed so that fields the user does NOT pass are not touched.
 * This is the right tool for incremental edits — setting a
 * dependency, fixing a typo in a name, updating an hours estimate —
 * without having to round-trip through planflow_sync (which is for
 * pushing the entire plan file).
 *
 * Dependencies have three ergonomic mutation modes:
 *   • dependencies         → replace the full list
 *   • addDependencies      → append (deduped)
 *   • removeDependencies   → drop specific IDs
 * They can be combined: pass `dependencies` to set a baseline and
 * `addDependencies` to extend it. Replace is applied first.
 */

import { z } from 'zod'
import type { UpdateTaskRequest } from '@planflow/shared'
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

const TaskEditInputSchema = z
  .object({
    projectId: z.string().uuid('Project ID must be a valid UUID'),
    taskId: z.string().describe('Task ID (e.g., "T1.1", "T21.4")'),
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(2000).nullable().optional(),
    status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED']).optional(),
    complexity: z.enum(['Low', 'Medium', 'High']).optional(),
    estimatedHours: z.number().positive().nullable().optional(),
    dependencies: z
      .array(z.string())
      .optional()
      .describe('Replace the full dependency list. Mutually compatible with addDependencies/removeDependencies (replace is applied first).'),
    addDependencies: z
      .array(z.string())
      .optional()
      .describe('Append these task IDs to the dependency list (deduped).'),
    removeDependencies: z
      .array(z.string())
      .optional()
      .describe('Remove these task IDs from the dependency list.'),
  })
  .refine(
    (input) =>
      input.name !== undefined ||
      input.description !== undefined ||
      input.status !== undefined ||
      input.complexity !== undefined ||
      input.estimatedHours !== undefined ||
      input.dependencies !== undefined ||
      input.addDependencies !== undefined ||
      input.removeDependencies !== undefined,
    { message: 'At least one field to update must be provided.' }
  )

type TaskEditInput = z.infer<typeof TaskEditInputSchema>

function statusEmoji(status: string): string {
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

function complexityIndicator(complexity: string): string {
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

export const taskEditTool: ToolDefinition<TaskEditInput> = {
  name: 'planflow_task_edit',

  description: `Edit any field on a single task by its task ID.

The right tool when you want to change ONE task's metadata without
pushing the entire PROJECT_PLAN.md back. Wraps PATCH /tasks/:taskId
on the API — it enforces task locks and broadcasts the update over
WebSocket, so other clients see the change immediately.

Usage:
  planflow_task_edit(projectId: "uuid", taskId: "T21.4", dependencies: ["T21.3"])
  planflow_task_edit(projectId: "uuid", taskId: "T21.10", addDependencies: ["T21.9"])
  planflow_task_edit(projectId: "uuid", taskId: "T22.1", complexity: "High", estimatedHours: 6)

Fields (all optional, at least one required):
  - name              string (1–255 chars)
  - description       string | null (max 2000 chars)
  - status            TODO | IN_PROGRESS | DONE | BLOCKED
  - complexity        Low | Medium | High
  - estimatedHours    positive number | null
  - dependencies      string[] — REPLACES the full list
  - addDependencies   string[] — appends (deduped)
  - removeDependencies string[] — drops specific IDs

Tip — for status-only changes prefer planflow_task_update (it auto-
manages the working_on signal). For starting/finishing a task use
the compound tools planflow_task_start / planflow_task_done.

You must be logged in first with planflow_login.`,

  inputSchema: TaskEditInputSchema,

  async execute(input: TaskEditInput): Promise<ReturnType<typeof createSuccessResult>> {
    logger.info('Editing task', { projectId: input.projectId, taskId: input.taskId })

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

      // Compute the final dependency list when add/remove are used.
      // We do this client-side so the server still receives a single
      // structured `dependencies` array (the simplest contract for the
      // PATCH endpoint) and the user gets compositional ergonomics.
      let finalDependencies: string[] | undefined = input.dependencies

      const needsCurrent =
        input.addDependencies !== undefined || input.removeDependencies !== undefined

      if (needsCurrent) {
        const baseline =
          finalDependencies !== undefined
            ? finalDependencies
            : await fetchCurrentDependencies(client, input.projectId, input.taskId)

        const set = new Set(baseline)
        for (const dep of input.addDependencies ?? []) set.add(dep)
        for (const dep of input.removeDependencies ?? []) set.delete(dep)
        finalDependencies = Array.from(set)
      }

      // Build the request body — only fields the caller actually
      // touched. This mirrors the parser's "undefined = absent"
      // semantics so the server's PATCH route does the right thing.
      const updates: UpdateTaskRequest = {}
      if (input.name !== undefined) updates.name = input.name
      if (input.description !== undefined) updates.description = input.description
      if (input.status !== undefined) updates.status = input.status
      if (input.complexity !== undefined) updates.complexity = input.complexity
      if (input.estimatedHours !== undefined) updates.estimatedHours = input.estimatedHours
      if (finalDependencies !== undefined) updates.dependencies = finalDependencies

      const task = await client.editTask(input.projectId, input.taskId, updates)

      const output = [
        `✏️  Task ${task.taskId} updated!\n`,
        formatKeyValue({
          'Task ID': task.taskId,
          'Name': task.name,
          'Status': `${statusEmoji(task.status)} ${task.status}`,
          'Complexity': `${complexityIndicator(task.complexity)} ${task.complexity}`,
          'Estimated': task.estimatedHours ? `${task.estimatedHours}h` : '-',
          'Dependencies':
            task.dependencies.length > 0 ? task.dependencies.join(', ') : 'None',
        }),
        '\n💡 The change has been broadcast over WebSocket — teammates see it live.',
      ].join('\n')

      logger.info('Successfully edited task', { taskId: task.taskId })
      return createSuccessResult(output)
    } catch (error) {
      logger.error('Failed to edit task', {
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
        if (error.statusCode === 404) {
          return createErrorResult(
            `❌ Task not found: ${input.taskId}\n\n` +
              'Please check the task ID and try again.\n' +
              `Use planflow_task_list(projectId: "${input.projectId}") to see available tasks.`
          )
        }
        if (error.statusCode === 423) {
          return createErrorResult(
            `🔒 Task ${input.taskId} is currently locked by another user.\n\n` +
              'Wait for the lock to clear and try again.'
          )
        }
        return createErrorResult(
          `❌ API error: ${error.message}\n\n` +
            'Please check your internet connection and try again.'
        )
      }

      const message = error instanceof Error ? error.message : String(error)
      return createErrorResult(
        `❌ Failed to edit task: ${message}\n\n` +
          'Please try again or check your connection.'
      )
    }
  },
}

/**
 * Read the task's current dependencies so addDependencies /
 * removeDependencies can be applied as a delta. Kept as a separate
 * helper so the main flow stays linear and so this round-trip is
 * skipped entirely when the caller passes `dependencies` directly.
 */
async function fetchCurrentDependencies(
  client: ReturnType<typeof getApiClient>,
  projectId: string,
  taskId: string
): Promise<string[]> {
  const { tasks } = await client.listTasks(projectId)
  const task = tasks.find((t) => t.taskId === taskId)
  if (!task) {
    throw new ApiError(`Task ${taskId} not found in project`, 404)
  }
  return task.dependencies ?? []
}
