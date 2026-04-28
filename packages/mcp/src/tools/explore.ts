/**
 * PlanFlow MCP Server — planflow_explore
 *
 * The "I'm about to make a code change" entry point.
 *
 * Most casual change requests ("add personal ID to registration",
 * "fix the auth redirect", "rename this prop everywhere") benefit from
 * a context bundle BEFORE the LLM starts editing — knowing which files
 * matter, what conventions already exist, what was recently changed,
 * whether there's an open task touching the same area. This tool is
 * the single call that produces that bundle.
 *
 * Differs from planflow_search (one ranked list of chunks) and
 * planflow_recall (anchored on a specific file/task) — explore takes
 * a free-form intent string and assembles a wider, change-oriented
 * snapshot.
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
import { coerceNumber } from './_coerce.js'

const ExploreInputSchema = z.object({
  projectId: z
    .string()
    .uuid('Project ID must be a valid UUID')
    .optional()
    .describe('Project ID. Uses current project from planflow_use() if omitted.'),
  intent: z
    .string()
    .min(1, 'Intent cannot be empty')
    .describe(
      'Free-form description of the change you are about to make ("add personal ID field to registration", "fix auth redirect on Safari"). Used as the search query and to surface related tasks / knowledge.'
    ),
  searchLimit: coerceNumber()
    .int()
    .min(1)
    .max(20)
    .default(8)
    .describe('Number of code/doc chunks to surface (default 8, max 20).'),
  knowledgeLimit: coerceNumber()
    .int()
    .min(0)
    .max(20)
    .default(5)
    .describe('Number of knowledge entries to surface (default 5).'),
})

type ExploreInput = z.infer<typeof ExploreInputSchema>

function formatRelativeTime(input: string | Date | null | undefined): string {
  if (!input) return 'unknown'
  const date = typeof input === 'string' ? new Date(input) : input
  const ms = Date.now() - date.getTime()
  const minutes = Math.floor(ms / 60_000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 30) return `${days}d ago`
  return date.toLocaleDateString()
}

/**
 * Lightweight string match for surfacing related tasks. The task list
 * is a few hundred entries at most for typical projects, so iterating
 * client-side and scoring with a simple "any keyword present" heuristic
 * is fast enough — no need for a dedicated server-side endpoint.
 */
function matchTasksByIntent<T extends { name: string; description?: string; taskId: string }>(
  tasks: T[],
  intent: string,
  limit: number
): T[] {
  const terms = intent
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2)
  if (terms.length === 0) return []

  const scored = tasks.map((t) => {
    const text = `${t.name} ${t.description ?? ''}`.toLowerCase()
    const score = terms.reduce((acc, term) => acc + (text.includes(term) ? 1 : 0), 0)
    return { task: t, score }
  })

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.task)
}

export const exploreTool: ToolDefinition<ExploreInput> = {
  name: 'planflow_explore',

  description: `THE entry point when the user describes a change they want to make.

Whenever the user says something like "add X", "fix Y", "rename Z everywhere",
"refactor the auth flow" — call this tool FIRST, before grep/Read or any edit.

What this does in one shot:
  • Hybrid semantic search across indexed code + docs (Voyage-code-3 + BM25)
  • Looks up related knowledge entries (architectural decisions, conventions)
  • Surfaces recent project activity for the area
  • Detects open tasks that mention the same terms (so you don't duplicate work)
  • Suggests an ordered list of files to touch

Output is a structured, change-oriented snapshot — the LLM can then read
specific chunks (planflow_chunk) and start editing with full context.

Use this when:
  ✅ The user asked for a change but didn't pin a specific file
  ✅ "Where is X handled?" + "I'm about to modify it"
  ✅ Onboarding — getting the lay of the land for an unfamiliar area

Do NOT use when:
  ❌ You already know the file path AND no surrounding context is needed
     → use Read directly
  ❌ You're starting work on a known task → planflow_task_start covers
     this case AND signals working_on
  ❌ You only need a single specific chunk → planflow_chunk(chunkId)

Parameters:
  - projectId (optional): Project UUID. Uses current project if omitted.
  - intent (required): The change description in plain language
  - searchLimit (optional): max code/doc chunks (default 8)
  - knowledgeLimit (optional): max knowledge entries (default 5)

Prerequisites:
  • Logged in via planflow_login()
  • Project indexed via planflow_index() (otherwise the search layer is empty)`,

  inputSchema: ExploreInputSchema,

  async execute(input: ExploreInput): Promise<ReturnType<typeof createSuccessResult>> {
    const projectId = input.projectId || getCurrentProjectId()

    if (!projectId) {
      return createErrorResult(
        '❌ No project ID provided and no current project set.\n\n' +
          'Either:\n' +
          '  1. Pass projectId: planflow_explore(projectId: "uuid", intent: "...")\n' +
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

    logger.info('Explore tool called', { projectId, intent: input.intent })

    try {
      const client = getApiClient()

      // Fan everything out in parallel — the bundle is read-only and
      // each layer is independent. Failures are non-fatal: we surface
      // what worked rather than aborting the whole call.
      const [searchResult, knowledgeResult, activityResult, tasksResult] =
        await Promise.all([
          client.searchProject(projectId, input.intent, { limit: input.searchLimit }).catch(
            (err) => {
              logger.warn('searchProject failed in explore', { error: String(err) })
              return null
            }
          ),
          input.knowledgeLimit > 0
            ? client
                .listKnowledge(projectId, { search: input.intent, limit: input.knowledgeLimit })
                .catch((err) => {
                  logger.warn('listKnowledge failed in explore', { error: String(err) })
                  return null
                })
            : Promise.resolve(null),
          client.getProjectActivity(projectId, { limit: 8 }).catch((err) => {
            logger.warn('getProjectActivity failed in explore', { error: String(err) })
            return null
          }),
          client.listTasks(projectId).catch((err) => {
            logger.warn('listTasks failed in explore', { error: String(err) })
            return null
          }),
        ])

      const lines: string[] = []
      lines.push(`🔍 Exploring: "${input.intent}"`)
      lines.push('')

      // ── Search results ──────────────────────────────────────────
      const results = searchResult?.results ?? []
      if (results.length > 0) {
        lines.push(`━━━ Most-relevant code (${results.length}) ━━━`)
        // Track which files we've seen — output a deduped file list
        // for the suggestion section below.
        const seenFiles = new Set<string>()
        for (let i = 0; i < results.length; i++) {
          const r = results[i]!
          const chunk = r.chunk
          const isCode = 'filePath' in chunk
          const score = r.score.toFixed(3)
          if (isCode) {
            seenFiles.add(chunk.filePath)
            lines.push(
              `#${i + 1} ${chunk.filePath}:${chunk.startLine}-${chunk.endLine}  (${chunk.kind} ${chunk.name}, score ${score}, chunkId ${chunk.id})`
            )
          } else {
            lines.push(`#${i + 1} 📄 ${(chunk as { source: string }).source} (score ${score})`)
          }
        }
        lines.push('')
      } else {
        lines.push(
          `(no semantic search results — project may not be indexed yet; run planflow_index_status to check)`
        )
        lines.push('')
      }

      // ── Knowledge ───────────────────────────────────────────────
      const knowledge = knowledgeResult?.knowledge ?? []
      if (knowledge.length > 0) {
        lines.push(`━━━ Related knowledge (${knowledge.length}) ━━━`)
        for (const entry of knowledge) {
          const preview =
            entry.content.length > 200 ? entry.content.slice(0, 200) + '...' : entry.content
          lines.push(`📐 [${entry.type}] ${entry.title}`)
          lines.push(`    ${preview.replace(/\n/g, '\n    ')}`)
        }
        lines.push('')
      }

      // ── Activity ────────────────────────────────────────────────
      const activity = activityResult?.activities ?? []
      if (activity.length > 0) {
        lines.push(`━━━ Recent activity ━━━━━━━━━━━━`)
        for (const a of activity.slice(0, 5)) {
          const actor = a.actor.name || a.actor.email
          const desc = a.description || a.action
          lines.push(`• ${formatRelativeTime(a.createdAt)} — ${actor}: ${desc}`)
        }
        lines.push('')
      }

      // ── Related tasks ───────────────────────────────────────────
      const tasks = tasksResult?.tasks ?? []
      const matchedTasks = matchTasksByIntent(tasks, input.intent, 5)
      if (matchedTasks.length > 0) {
        lines.push(`━━━ Likely tasks ━━━━━━━━━━━━━━━`)
        for (const t of matchedTasks) {
          lines.push(`• ${t.taskId} — ${t.name}  (${t.status})`)
        }
        lines.push('')
        lines.push(
          `(if any of these match the intent, prefer planflow_task_start(taskId: "...") — it`
        )
        lines.push(`signals working_on and gives a richer task-anchored bundle)`)
        lines.push('')
      }

      // ── Suggested approach ──────────────────────────────────────
      // Group the search results by file path and emit a deduped list.
      // The order roughly mirrors search rank, so the first file is the
      // single highest-signal place to start reading.
      const suggestedFiles: string[] = []
      const seen = new Set<string>()
      for (const r of results) {
        const chunk = r.chunk
        if ('filePath' in chunk) {
          if (!seen.has(chunk.filePath)) {
            seen.add(chunk.filePath)
            suggestedFiles.push(chunk.filePath)
          }
        }
      }

      if (suggestedFiles.length > 0) {
        lines.push(`━━━ Suggested files to read ━━━━`)
        for (let i = 0; i < Math.min(suggestedFiles.length, 6); i++) {
          lines.push(`${i + 1}. ${suggestedFiles[i]}`)
        }
        lines.push('')
      }

      lines.push(`Next steps:`)
      lines.push(`  1. Read full chunks: planflow_chunk(chunkId: "...")  — for any of the #N hits above`)
      lines.push(`  2. Read whole file:  Read tool — when you've picked the file to edit`)
      lines.push(`  3. After edits:      planflow_index  — incremental, near-free`)
      lines.push(
        `  4. (optional) Save the decision: planflow_remember(...) when the change captures a pattern`
      )

      return createSuccessResult(lines.join('\n'))
    } catch (error) {
      logger.error('Explore failed', { error: String(error) })

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
      return createErrorResult(`❌ Explore failed: ${message}`)
    }
  },
}
