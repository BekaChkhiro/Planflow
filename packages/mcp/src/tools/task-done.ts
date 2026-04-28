/**
 * PlanFlow MCP Server — planflow_task_done
 *
 * Closure compound for a task. Marks the task DONE, optionally posts
 * a final summary comment, stops the working_on signal, and suggests
 * a Conventional Commits message derived from the task — three or
 * four cleanup operations rolled into a single call so nothing gets
 * left dangling (a stale "working on" indicator is the most common
 * forgotten-step in the manual flow).
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

const TaskDoneInputSchema = z.object({
  projectId: z
    .string()
    .uuid('Project ID must be a valid UUID')
    .optional()
    .describe('Project ID. Uses current project from planflow_use() if omitted.'),
  taskId: z
    .string()
    .min(1)
    .describe('Task ID to mark complete (e.g., "T1.1").'),
  summary: z
    .string()
    .optional()
    .describe(
      'Optional final comment to post on the task — what was actually done, any follow-ups. Skipped if omitted.'
    ),
  commitType: z
    .enum(['feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'perf'])
    .default('feat')
    .describe(
      'Conventional Commits type for the suggested commit message (default "feat"). Picked from the standard set so the suggestion drops cleanly into git history.'
    ),
})

type TaskDoneInput = z.infer<typeof TaskDoneInputSchema>

/**
 * Build a Conventional Commits message from the task. Format:
 *
 *   <type>(<scope>): <taskId> — <task title>
 *
 *   <description body>
 *
 * `scope` is inferred from the major task ID — e.g. "T2.5" → "T2".
 * Not perfect but matches how PlanFlow plans typically group tasks.
 */
function suggestCommitMessage(
  taskId: string,
  taskName: string,
  description: string | undefined,
  type: string,
  summary: string | undefined
): string {
  const majorMatch = taskId.match(/^([A-Z]+\d+)\b/)
  const scope = majorMatch ? majorMatch[1]!.toLowerCase() : 'task'

  const subject = `${type}(${scope}): ${taskId} — ${taskName}`
  const body = summary ?? description ?? ''
  return body.trim() ? `${subject}\n\n${body.trim()}` : subject
}

export const taskDoneTool: ToolDefinition<TaskDoneInput> = {
  name: 'planflow_task_done',

  description: `Mark a PlanFlow task complete and clean up — three operations in one call.

What this does:
  • Updates task status: TODO/IN_PROGRESS → DONE
  • Optionally posts a final summary comment
  • Stops the "working_on" signal so it doesn't linger
  • Suggests a Conventional Commits-style commit message

Use this when:
  ✅ You've finished work on a specific task and want to wrap up cleanly
  ✅ You want a one-shot replacement for the
     task_update + comment + working_on(stop) trio

Do NOT use when:
  ❌ The task isn't actually done — use planflow_task_progress for partial updates
  ❌ You want to mark BLOCKED — use planflow_task_update directly
  ❌ You're closing without commentary AND without stopping working_on
     — those bare ops still exist as standalone tools

Parameters:
  - projectId (optional): Project UUID. Uses current project if omitted.
  - taskId (required): Task ID to close (e.g., "T1.1")
  - summary (optional): Final comment text — what got done, any follow-ups
  - commitType (optional): Conventional Commits type (default "feat")

Prerequisites:
  • Logged in via planflow_login()`,

  inputSchema: TaskDoneInputSchema,

  async execute(input: TaskDoneInput): Promise<ReturnType<typeof createSuccessResult>> {
    const projectId = input.projectId || getCurrentProjectId()

    if (!projectId) {
      return createErrorResult(
        '❌ No project ID provided and no current project set.\n\n' +
          'Either:\n' +
          '  1. Pass projectId: planflow_task_done(projectId: "uuid", taskId: "T1.1")\n' +
          '  2. Set current project: planflow_use(projectId: "uuid")'
      )
    }

    if (!isAuthenticated()) {
      return createErrorResult(
        '❌ Not logged in.\n\n' +
          'Please authenticate first using:\n' +
          '  planflow_login(token: "your-api-token")'
      )
    }

    logger.info('Task done tool called', { projectId, taskId: input.taskId })

    try {
      const client = getApiClient()

      // Look up the task — we need the title for the commit suggestion
      // and its description for the optional commit body.
      const tasksResult = await client.listTasks(projectId)
      const task = tasksResult.tasks.find((t) => t.taskId === input.taskId)

      if (!task) {
        return createErrorResult(
          `❌ Task not found: ${input.taskId}\n\n` +
            `Use planflow_task_list(projectId: "${projectId}") to see available tasks.`
        )
      }

      // Run the three side-effects in parallel — they don't depend on
      // each other and partial failure is acceptable (we surface what
      // worked and what didn't rather than aborting).
      const [statusResult, commentResult, stopResult] = await Promise.all([
        client.updateTaskStatus(projectId, input.taskId, 'DONE').catch((err) => {
          logger.error('updateTaskStatus failed in task_done', { error: String(err) })
          return { error: err instanceof Error ? err.message : String(err) }
        }),
        input.summary
          ? client
              .createComment(projectId, input.taskId, { content: input.summary })
              .catch((err) => {
                logger.warn('createComment failed in task_done', { error: String(err) })
                return null
              })
          : Promise.resolve(null),
        client.stopWorkingOn(projectId).catch((err) => {
          logger.warn('stopWorkingOn failed in task_done', { error: String(err) })
          return null
        }),
      ])

      const statusUpdated =
        statusResult && !('error' in statusResult)
      const commitMessage = suggestCommitMessage(
        task.taskId,
        task.name,
        task.description,
        input.commitType,
        input.summary
      )

      const lines: string[] = []
      lines.push(`✅ Task ${task.taskId} — "${task.name}" closure`)
      lines.push('')

      if (statusUpdated) {
        lines.push(`🏷️  Status: ${task.status} → DONE`)
      } else {
        const detail = (statusResult as { error: string }).error ?? 'unknown error'
        lines.push(`⚠️  Status update failed: ${detail}`)
        lines.push(`   You may need to mark it done manually: planflow_task_update(...)`)
      }

      if (input.summary) {
        if (commentResult) {
          lines.push(`💬 Summary comment posted`)
        } else {
          lines.push(`⚠️  Summary comment failed (non-fatal)`)
        }
      }

      if (stopResult) {
        lines.push(`🛑 Working signal: stopped`)
      } else {
        lines.push(`(working signal already cleared or stop request failed — non-fatal)`)
      }

      lines.push('')
      lines.push(`━━━ Suggested commit ━━━━━━━━━━━`)
      lines.push(commitMessage)
      lines.push('')

      lines.push(`Next steps:`)
      lines.push(`  • Pick the next task: planflow_task_next()`)
      lines.push(`  • Or start one specifically: planflow_task_start(taskId: "...")`)

      return createSuccessResult(lines.join('\n'))
    } catch (error) {
      logger.error('Task done failed', { error: String(error) })

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
            `❌ Project not found: ${projectId}\n\n` +
              'Use planflow_projects() to list your available projects.'
          )
        }
        return createErrorResult(`❌ API error: ${error.message}`)
      }

      const message = error instanceof Error ? error.message : String(error)
      return createErrorResult(`❌ Task done failed: ${message}`)
    }
  },
}
