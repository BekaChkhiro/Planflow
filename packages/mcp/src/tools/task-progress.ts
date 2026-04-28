/**
 * PlanFlow MCP Server — planflow_task_progress
 *
 * Mid-task journaling. Posts a comment on the task and, optionally,
 * persists the same note as a knowledge entry — turning ad-hoc
 * realisations during work ("we picked rotating refresh tokens
 * because…") into permanent project memory in one call.
 *
 * Designed to be called frequently and casually. Comments are the
 * lightweight default; knowledge promotion is opt-in.
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
import { coerceBoolean } from './_coerce.js'

const TaskProgressInputSchema = z.object({
  projectId: z
    .string()
    .uuid('Project ID must be a valid UUID')
    .optional()
    .describe('Project ID. Uses current project from planflow_use() if omitted.'),
  taskId: z
    .string()
    .min(1)
    .describe('Task ID to log progress on (e.g., "T1.1").'),
  note: z
    .string()
    .min(1, 'Progress note cannot be empty')
    .max(10_000)
    .describe('What just happened — a discovery, a blocker, a decision. Posted as a task comment.'),
  saveAsKnowledge: coerceBoolean()
    .default(false)
    .describe(
      'When true, also persist this note as a knowledge entry. Use for decisions and architectural realisations that future-you (or the AI) should be able to retrieve later — not for routine "still working" updates.'
    ),
  knowledgeType: z
    .enum(['architecture', 'pattern', 'convention', 'decision', 'dependency', 'environment', 'other'])
    .default('decision')
    .describe(
      'Knowledge type when saveAsKnowledge:true. Defaults to "decision" — that\'s by far the most common in-task journaling category.'
    ),
  knowledgeTitle: z
    .string()
    .max(200)
    .optional()
    .describe(
      'Title for the knowledge entry (when saveAsKnowledge:true). Defaults to a derivation from the task ID + first line of the note.'
    ),
})

type TaskProgressInput = z.infer<typeof TaskProgressInputSchema>

/**
 * Build a default knowledge title from the task ID + a short note prefix.
 * Tries to grab the first sentence; falls back to a hard length cap so
 * we don't dump a paragraph into a 200-char title.
 */
function defaultKnowledgeTitle(taskId: string, note: string): string {
  const firstLine = note.split('\n')[0]?.trim() ?? note
  const firstSentence = firstLine.split(/[.!?]/)[0]?.trim() ?? firstLine
  const snippet = firstSentence.length > 120 ? firstSentence.slice(0, 117) + '...' : firstSentence
  return `${taskId}: ${snippet}`
}

export const taskProgressTool: ToolDefinition<TaskProgressInput> = {
  name: 'planflow_task_progress',

  description: `Log progress on a PlanFlow task — comment + optional knowledge capture.

Two-in-one journaling for active task work:
  • Posts the note as a task comment (always)
  • Optionally promotes it to a knowledge entry so future searches and
    planflow_recall surfaces it (saveAsKnowledge:true)

Use this when:
  ✅ You hit a meaningful realisation mid-task ("decided X because Y")
  ✅ You want to leave a paper trail without context-switching to two tools
  ✅ The discovery deserves to outlive the task — set saveAsKnowledge:true

Do NOT use when:
  ❌ You're closing the task — use planflow_task_done (it accepts a summary)
  ❌ You only want a knowledge entry without a task comment — use
     planflow_remember directly
  ❌ The note is sensitive / private — comments are visible to teammates

Parameters:
  - projectId (optional): Project UUID. Uses current project if omitted.
  - taskId (required): Task ID
  - note (required): What happened
  - saveAsKnowledge (optional): default false. When true, persist as knowledge.
  - knowledgeType (optional): default "decision". One of architecture |
    pattern | convention | decision | dependency | environment | other.
  - knowledgeTitle (optional): defaults to "TX.Y: <first sentence>"

Prerequisites:
  • Logged in via planflow_login()`,

  inputSchema: TaskProgressInputSchema,

  async execute(input: TaskProgressInput): Promise<ReturnType<typeof createSuccessResult>> {
    const projectId = input.projectId || getCurrentProjectId()

    if (!projectId) {
      return createErrorResult(
        '❌ No project ID provided and no current project set.\n\n' +
          'Either:\n' +
          '  1. Pass projectId: planflow_task_progress(projectId: "uuid", taskId: "T1.1", note: "...")\n' +
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

    logger.info('Task progress tool called', {
      projectId,
      taskId: input.taskId,
      saveAsKnowledge: input.saveAsKnowledge,
    })

    try {
      const client = getApiClient()

      // Comment + (optional) knowledge in parallel — independent, OK
      // for either to fail without blocking the other (we surface
      // what worked).
      const [commentResult, knowledgeResult] = await Promise.all([
        client
          .createComment(projectId, input.taskId, { content: input.note })
          .catch((err) => {
            logger.error('createComment failed in task_progress', { error: String(err) })
            return { error: err instanceof Error ? err.message : String(err) }
          }),
        input.saveAsKnowledge
          ? client
              .createKnowledge(projectId, {
                title: input.knowledgeTitle ?? defaultKnowledgeTitle(input.taskId, input.note),
                content: input.note,
                type: input.knowledgeType,
                source: 'task',
                tags: [input.taskId],
              })
              .catch((err) => {
                logger.warn('createKnowledge failed in task_progress', { error: String(err) })
                return { error: err instanceof Error ? err.message : String(err) }
              })
          : Promise.resolve(null),
      ])

      const lines: string[] = []
      lines.push(`📝 Progress logged on ${input.taskId}`)
      lines.push('')

      const commentSucceeded =
        commentResult && !('error' in commentResult)
      if (commentSucceeded) {
        lines.push(`💬 Comment posted`)
      } else {
        const detail = (commentResult as { error: string }).error ?? 'unknown error'
        lines.push(`❌ Comment failed: ${detail}`)
        lines.push(`   The note was NOT recorded. Try planflow_comment directly.`)
      }

      if (input.saveAsKnowledge) {
        if (knowledgeResult && !('error' in knowledgeResult)) {
          const k = (knowledgeResult as {
            knowledge: { id: string; title: string; type: string }
          }).knowledge
          lines.push(`📚 Knowledge saved: [${k.type}] ${k.title}`)
          lines.push(`   ID: ${k.id}`)
        } else if (knowledgeResult) {
          const detail = (knowledgeResult as { error: string }).error
          lines.push(`⚠️  Knowledge save failed: ${detail}`)
          lines.push(`   The comment was still posted. Try planflow_remember manually.`)
        }
      }

      lines.push('')
      lines.push(`Next steps:`)
      lines.push(`  • Continue work and log again as needed`)
      lines.push(`  • Mark done when finished: planflow_task_done(taskId: "${input.taskId}")`)

      return createSuccessResult(lines.join('\n'))
    } catch (error) {
      logger.error('Task progress failed', { error: String(error) })

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
            `❌ Project or task not found.\n\n` +
              'Verify projectId and taskId.'
          )
        }
        return createErrorResult(`❌ API error: ${error.message}`)
      }

      const message = error instanceof Error ? error.message : String(error)
      return createErrorResult(`❌ Task progress failed: ${message}`)
    }
  },
}
