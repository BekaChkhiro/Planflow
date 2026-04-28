/**
 * PlanFlow MCP Server — planflow_recall
 *
 * "Tell me everything you know about X."
 *
 * Given an anchor — a file path, a task ID, or a chunkId from a previous
 * search — assemble a rich context block:
 *
 *   • For a filePath: every indexed chunk in that file, related knowledge
 *     entries, and recent project activity. With depth:'deep', also the
 *     top semantic-search hits using the file's basename as the query.
 *
 *   • For a taskId: the task, its comments, its activity log, and (in deep
 *     mode) related knowledge.
 *
 *   • For a chunkId: looked up via the file path embedded in the ID; the
 *     specific chunk is highlighted.
 *
 * Designed so an LLM can call it once and get the same context a human
 * would by clicking around in the project.
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

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const RecallInputSchema = z
  .object({
    projectId: z
      .string()
      .uuid('Project ID must be a valid UUID')
      .optional()
      .describe('Project ID. Uses current project from planflow_use() if omitted.'),

    // Exactly one of these must be set:
    filePath: z
      .string()
      .min(1)
      .optional()
      .describe('Anchor: relative file path (e.g., "src/middleware/auth.ts").'),
    taskId: z
      .string()
      .min(1)
      .optional()
      .describe('Anchor: task ID such as "T1.1".'),
    chunkId: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Anchor: a chunkId returned by planflow_search. Resolves to its containing file.'
      ),

    query: z
      .string()
      .optional()
      .describe(
        'Optional refinement. With depth:"deep" it is used as the semantic-search query; otherwise informational only.'
      ),
    depth: z
      .enum(['shallow', 'deep'])
      .default('shallow')
      .describe(
        'shallow: primary data only (fast). deep: adds related semantic-search hits (one extra embedding call).'
      ),
    contentLimit: coerceNumber()
      .int()
      .min(0)
      .max(8000)
      .default(2000)
      .describe(
        'Per-chunk content character cap when listing file chunks. 0 = full content. Default 2000 keeps responses reasonable for LLM consumption.'
      ),
  })
  .refine(
    (d) =>
      Number(Boolean(d.filePath)) +
        Number(Boolean(d.taskId)) +
        Number(Boolean(d.chunkId)) ===
      1,
    {
      message: 'Provide exactly one anchor: filePath, taskId, or chunkId.',
    }
  )

type RecallInput = z.infer<typeof RecallInputSchema>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function basename(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] ?? filePath
}

function clip(content: string, limit: number): string {
  if (limit === 0 || content.length <= limit) return content
  return content.slice(0, limit) + `\n... [clipped at ${limit} chars; raise contentLimit to see more]`
}

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

// chunkId is generated server-side as `${filePath}:${startLine}` (see RAG
// chunker / docs chunker). Splitting on the LAST `:` is safe because file
// paths in the index are POSIX-style and shouldn't contain colons; if the
// pattern ever changes, we still degrade gracefully (no file path → empty
// recall, with a hint to the caller).
function fileFromChunkId(chunkId: string): { filePath: string; startLine: number | null } {
  const idx = chunkId.lastIndexOf(':')
  if (idx === -1) return { filePath: chunkId, startLine: null }
  const filePath = chunkId.slice(0, idx)
  const lineStr = chunkId.slice(idx + 1)
  const line = parseInt(lineStr, 10)
  return { filePath, startLine: Number.isFinite(line) ? line : null }
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export const recallTool: ToolDefinition<RecallInput> = {
  name: 'planflow_recall',

  description: `Aggregate everything PlanFlow knows about an anchor — a file, a task, or a previously-seen chunk — into a single rich context block.

Anchors (provide exactly one):
  • filePath — "src/middleware/auth.ts"
       returns: every indexed chunk in that file (top symbols + content),
                related knowledge entries (matched by file basename),
                recent project activity.
  • taskId   — "T1.1"
       returns: the task, its comments, its activity log,
                (deep mode: related knowledge entries).
  • chunkId  — from a previous planflow_search() result
       returns: same as filePath, with the chunk's location highlighted.

Modes:
  • depth: "shallow" (default) — primary data only. No extra embedding call.
  • depth: "deep" — also runs a semantic search using the file basename
    (or the provided \`query\`), surfacing related code/docs from elsewhere
    in the codebase.

Use this when:
  • You already know which file or task the user is asking about and need
    full context before writing or editing.
  • You found a chunk via planflow_search() and want the surrounding
    structure.
  • The user says "what do you know about X?" — anchor on X.

Do NOT use when:
  • You are still discovering — use planflow_search() first to find the file
  • You only need the high-level project summary — use planflow_context()
  • You already have the file path AND just need the source — use Read directly
    (Read is faster and free; recall is for surrounding context like
    related knowledge entries and recent activity, not just the file body)

Prerequisites:
  • Logged in via planflow_login()
  • For filePath/chunkId anchors: project should be indexed (planflow_index_status)`,

  inputSchema: RecallInputSchema,

  async execute(input: RecallInput): Promise<ReturnType<typeof createSuccessResult>> {
    const projectId = input.projectId || getCurrentProjectId()

    if (!projectId) {
      return createErrorResult(
        '❌ No project ID provided and no current project set.\n\n' +
          'Either:\n' +
          '  1. Pass projectId: planflow_recall(projectId: "uuid", ...)\n' +
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

    logger.info('Recall tool called', {
      projectId,
      filePath: input.filePath,
      taskId: input.taskId,
      chunkId: input.chunkId,
      depth: input.depth,
    })

    try {
      if (input.taskId) {
        return await recallByTask(projectId, input.taskId, input.depth, input.query)
      }

      // filePath / chunkId both resolve to a file path
      let resolvedPath = input.filePath
      let highlightLine: number | null = null

      if (input.chunkId) {
        const parsed = fileFromChunkId(input.chunkId)
        resolvedPath = parsed.filePath
        highlightLine = parsed.startLine
      }

      if (!resolvedPath) {
        return createErrorResult('❌ Could not resolve an anchor file path.')
      }

      return await recallByFile(
        projectId,
        resolvedPath,
        highlightLine,
        input.depth,
        input.query,
        input.contentLimit
      )
    } catch (error) {
      logger.error('Recall failed', { error: String(error) })

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
      return createErrorResult(`❌ Recall failed: ${message}`)
    }
  },
}

// ---------------------------------------------------------------------------
// File-anchored recall
// ---------------------------------------------------------------------------

async function recallByFile(
  projectId: string,
  filePath: string,
  highlightLine: number | null,
  depth: 'shallow' | 'deep',
  query: string | undefined,
  contentLimit: number
) {
  const client = getApiClient()
  const baseName = basename(filePath)

  // Fan out — these are independent, run in parallel.
  const [fileChunksResult, knowledgeResult, activityResult, vectorResult] =
    await Promise.all([
      client.getFileChunks(projectId, filePath).catch((err) => {
        logger.warn('getFileChunks failed in recall', { error: String(err) })
        return { filePath, chunks: [], total: 0 }
      }),
      client
        .listKnowledge(projectId, { search: baseName, limit: 10 })
        .catch((err) => {
          logger.warn('listKnowledge failed in recall', { error: String(err) })
          return null
        }),
      client
        .getProjectActivity(projectId, { limit: 10 })
        .catch((err) => {
          logger.warn('getProjectActivity failed in recall', { error: String(err) })
          return null
        }),
      depth === 'deep'
        ? client
            .searchProject(projectId, query || baseName, { limit: 5 })
            .catch((err) => {
              logger.warn('searchProject failed in recall', { error: String(err) })
              return null
            })
        : Promise.resolve(null),
    ])

  const lines: string[] = []
  lines.push(`🧠 Recall — file: ${filePath}`)
  if (highlightLine !== null) {
    lines.push(`📍 Highlighted line: ${highlightLine} (from chunkId)`)
  }
  lines.push('')

  // ── The file ──────────────────────────────────────────────────────────
  if (fileChunksResult.total === 0) {
    lines.push(`━━━ The File ━━━━━━━━━━━━━━━━━━━━━`)
    lines.push(`⚠️  This file is not currently indexed.`)
    lines.push(`   Run: planflow_index(directory: ".") or pass it via files mode.`)
    lines.push('')
  } else {
    const chunks = fileChunksResult.chunks
    const lastIndexedAt = chunks
      .map((c) => c.indexedAt)
      .filter((v): v is string => Boolean(v))
      .sort()
      .pop()
    const language = chunks[0]?.language ?? 'unknown'
    const lineCount = Math.max(...chunks.map((c) => c.endLine), 0)

    lines.push(`━━━ The File ━━━━━━━━━━━━━━━━━━━━━`)
    lines.push(`chunks:        ${chunks.length}`)
    lines.push(`approx lines:  ${lineCount}`)
    lines.push(`language:      ${language}`)
    lines.push(`last indexed:  ${formatRelativeTime(lastIndexedAt)}`)
    lines.push('')

    lines.push(`Top symbols:`)
    for (const chunk of chunks) {
      const isHighlight = highlightLine !== null && chunk.startLine === highlightLine
      const marker = isHighlight ? '👉 ' : '   '
      lines.push(
        `${marker}${chunk.kind.padEnd(10)} ${chunk.name.padEnd(28)} (lines ${chunk.startLine}-${chunk.endLine})`
      )
    }
    lines.push('')

    lines.push(`Chunks (content):`)
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!
      const isHighlight = highlightLine !== null && chunk.startLine === highlightLine
      lines.push(`━━━ #${i + 1}${isHighlight ? ' 👉 highlighted' : ''} ━━━`)
      lines.push(`name:      ${chunk.name}`)
      lines.push(`kind:      ${chunk.kind}`)
      lines.push(`lines:     ${chunk.startLine}-${chunk.endLine}`)
      lines.push(`chunkId:   ${chunk.id}`)
      lines.push('content:')
      lines.push(clip(chunk.content, contentLimit))
      lines.push('')
    }
  }

  // ── Related knowledge ────────────────────────────────────────────────
  const knowledgeEntries = knowledgeResult?.knowledge ?? []
  if (knowledgeEntries.length > 0) {
    lines.push(`━━━ Related Knowledge (${knowledgeEntries.length}) ━━━`)
    for (const entry of knowledgeEntries) {
      lines.push(`• [${entry.type}] ${entry.title}`)
      lines.push(`    ${entry.content.replace(/\n/g, '\n    ')}`)
    }
    lines.push('')
  } else if (knowledgeResult !== null) {
    lines.push(`━━━ Related Knowledge ━━━━━━━━━━━━`)
    lines.push(`(none matched "${baseName}")`)
    lines.push('')
  }

  // ── Recent activity ──────────────────────────────────────────────────
  const activityEntries = activityResult?.activities ?? []
  if (activityEntries.length > 0) {
    lines.push(`━━━ Recent Activity (last ${activityEntries.length}) ━━━`)
    for (const a of activityEntries) {
      const actor = a.actor.name || a.actor.email
      const desc = a.description || a.action
      lines.push(`• ${formatRelativeTime(a.createdAt)} — ${actor}: ${desc}`)
    }
    lines.push('')
  }

  // ── Deep mode: related search hits ───────────────────────────────────
  if (depth === 'deep' && vectorResult && vectorResult.results.length > 0) {
    lines.push(`━━━ Related (semantic search: "${query || baseName}") ━━━`)
    for (let i = 0; i < vectorResult.results.length; i++) {
      const r = vectorResult.results[i]!
      const chunk = r.chunk
      const isCode = 'filePath' in chunk
      lines.push(
        `#${i + 1} ${isCode ? chunk.filePath : (chunk as { source: string }).source} — ${chunk.name} (score ${r.score.toFixed(3)})`
      )
    }
    lines.push('')
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(`Next steps:`)
  if (depth === 'shallow') {
    lines.push(`  • Get related code: planflow_recall(filePath: "${filePath}", depth: "deep")`)
  }
  lines.push(`  • Find specific symbol: planflow_search(query: "...")`)

  return createSuccessResult(lines.join('\n'))
}

// ---------------------------------------------------------------------------
// Task-anchored recall
// ---------------------------------------------------------------------------

async function recallByTask(
  projectId: string,
  taskId: string,
  depth: 'shallow' | 'deep',
  query: string | undefined
) {
  const client = getApiClient()

  // listTasks returns every task in one shot — fine for project sizes we
  // expect; if this becomes a bottleneck we can add a getTask endpoint.
  const [tasksResult, commentsResult, activityResult, knowledgeResult] =
    await Promise.all([
      client.listTasks(projectId),
      client.listComments(projectId, taskId).catch((err) => {
        logger.warn('listComments failed in recall', { error: String(err) })
        return null
      }),
      client.getTaskActivity(projectId, taskId, { limit: 20 }).catch((err) => {
        logger.warn('getTaskActivity failed in recall', { error: String(err) })
        return null
      }),
      depth === 'deep'
        ? client
            .listKnowledge(projectId, { search: query || taskId, limit: 5 })
            .catch((err) => {
              logger.warn('listKnowledge failed in recall', { error: String(err) })
              return null
            })
        : Promise.resolve(null),
    ])

  const task = tasksResult.tasks.find((t) => t.taskId === taskId)

  if (!task) {
    return createErrorResult(
      `❌ Task not found: ${taskId}\n\n` +
        `Use planflow_task_list(projectId: "${projectId}") to see available tasks.`
    )
  }

  const lines: string[] = []
  lines.push(`🧠 Recall — task: ${task.taskId}`)
  lines.push('')

  // ── The task ─────────────────────────────────────────────────────────
  lines.push(`━━━ The Task ━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(`name:         ${task.name}`)
  lines.push(`status:       ${task.status}`)
  if (task.complexity != null) lines.push(`complexity:   ${task.complexity}`)
  if (task.dependencies && task.dependencies.length > 0) {
    lines.push(`depends on:   ${task.dependencies.join(', ')}`)
  }
  if (task.description) {
    lines.push('description:')
    lines.push(task.description)
  }
  lines.push('')

  // ── Comments ─────────────────────────────────────────────────────────
  const comments = commentsResult?.comments ?? []
  if (comments.length > 0) {
    lines.push(`━━━ Comments (${comments.length}) ━━━`)
    for (const comment of comments) {
      const author = comment.author.name || comment.author.email
      lines.push(`• ${formatRelativeTime(comment.createdAt)} — ${author}:`)
      lines.push(`    ${comment.content.replace(/\n/g, '\n    ')}`)
    }
    lines.push('')
  }

  // ── Task activity ────────────────────────────────────────────────────
  const activityEntries = activityResult?.activities ?? []
  if (activityEntries.length > 0) {
    lines.push(`━━━ Activity (${activityEntries.length}) ━━━`)
    for (const a of activityEntries) {
      const actor = a.actor.name || a.actor.email
      const desc = a.description || a.action
      lines.push(`• ${formatRelativeTime(a.createdAt)} — ${actor}: ${desc}`)
    }
    lines.push('')
  }

  // ── Deep: related knowledge ──────────────────────────────────────────
  const knowledgeEntries = knowledgeResult?.knowledge ?? []
  if (depth === 'deep' && knowledgeEntries.length > 0) {
    lines.push(`━━━ Related Knowledge ━━━━━━━━━━━━`)
    for (const entry of knowledgeEntries) {
      lines.push(`• [${entry.type}] ${entry.title}`)
      lines.push(`    ${entry.content.replace(/\n/g, '\n    ')}`)
    }
    lines.push('')
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(`Next steps:`)
  lines.push(`  • Update status: planflow_task_update(taskId: "${taskId}", status: "...")`)
  lines.push(`  • Comment:       planflow_comment(taskId: "${taskId}", content: "...")`)
  if (depth === 'shallow') {
    lines.push(`  • Deeper:        planflow_recall(taskId: "${taskId}", depth: "deep")`)
  }

  return createSuccessResult(lines.join('\n'))
}
