/**
 * PlanFlow MCP Server — planflow_task_start
 *
 * Compound tool that bootstraps work on a single task in one call.
 *
 * What used to take a session of `task_list` → `recall` → `working_on`
 * → `search` → `listKnowledge` (5+ tool calls, ~30s of stop-and-go) is
 * now a single call that fans out to all of them in parallel and
 * returns a single structured context block:
 *
 *   • The task itself (status, dependencies, description)
 *   • Comments + activity
 *   • Likely-relevant code (auto-searched by task title)
 *   • Knowledge entries that mention task title terms
 *   • A branch-name suggestion derived from the task ID + title
 *
 * Side effect: signals "working on this task" in the same call so
 * teammates see your focus immediately.
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
import {
  createWorktree,
  detectCurrentWorktree,
  getMainRepoRoot,
  getRepoRoot,
  readState,
  registerMainRepoTask,
} from '../worktree.js'

const TaskStartInputSchema = z.object({
  projectId: z
    .string()
    .uuid('Project ID must be a valid UUID')
    .optional()
    .describe('Project ID. Uses current project from planflow_use() if omitted.'),
  taskId: z
    .string()
    .min(1)
    .describe('Task ID to start working on (e.g., "T1.1", "T2.3").'),
  searchQuery: z
    .string()
    .optional()
    .describe(
      'Override the auto-search query (defaults to the task title). Useful when the title is generic and you have a sharper term in mind.'
    ),
  worktreeMode: z
    .enum(['auto', 'force', 'never'])
    .default('auto')
    .describe(
      'How to handle parallel task work via git worktrees:\n' +
        '  • auto (default): create a worktree only when ANOTHER task is already active in this checkout — keeps parallel work isolated.\n' +
        '  • force: always create a fresh worktree for this task.\n' +
        '  • never: stay in the current folder no matter what.'
    ),
})

type TaskStartInput = z.infer<typeof TaskStartInputSchema>

/**
 * Convert a task name like "Add user auth" into a kebab-case slug
 * suitable for a git branch — strips punctuation, lower-cases, joins
 * with hyphens, caps length so it doesn't blow past common branch
 * length limits.
 */
function slugify(name: string, maxLen = 40): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return slug.length > maxLen ? slug.slice(0, maxLen).replace(/-$/, '') : slug
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

// ────────────────────────────────────────────────────────────────────
// Worktree decision helpers
// ────────────────────────────────────────────────────────────────────

type WorktreeOutcome =
  | { kind: 'in-place'; reason: string; mainRepoRoot: string }
  | { kind: 'redirect'; path: string; branch: string; port: number | null; reason: string }
  | { kind: 'created'; path: string; branch: string; port: number | null }
  | { kind: 'not-a-repo' }

interface ResolveOpts {
  cwd: string
  taskId: string
  taskName: string
  projectId: string
  mode: 'auto' | 'force' | 'never'
}

async function resolveWorktree(opts: ResolveOpts): Promise<WorktreeOutcome> {
  // Outside a git repo: nothing to do, run in-place. We don't error
  // here because not every PlanFlow project lives in git (yet).
  const mainRepoRoot = await getMainRepoRoot(opts.cwd)
  if (!mainRepoRoot) {
    return { kind: 'not-a-repo' }
  }

  const cwdRepoRoot = await getRepoRoot(opts.cwd)
  const inLinkedWorktree = !!cwdRepoRoot && cwdRepoRoot !== mainRepoRoot

  const state = await readState(mainRepoRoot)

  // Already in a linked worktree → never create another one. We
  // assume the user opened Claude in this folder for a reason; we
  // just continue. (Future: warn if the worktree's task != new task.)
  if (inLinkedWorktree) {
    const here = detectCurrentWorktree(state, opts.cwd)
    return {
      kind: 'in-place',
      reason: here
        ? `already inside worktree for ${here.taskId} (${here.path})`
        : `already inside a linked worktree (${cwdRepoRoot})`,
      mainRepoRoot,
    }
  }

  // Existing worktree for THIS task → redirect.
  const existingForThisTask = state.entries.find(
    (e) => e.taskId === opts.taskId && !e.isMainRepo
  )
  if (existingForThisTask) {
    return {
      kind: 'redirect',
      path: existingForThisTask.path,
      branch: existingForThisTask.branch,
      port: existingForThisTask.port,
      reason: 'a worktree already exists for this task',
    }
  }

  if (opts.mode === 'never') {
    await registerMainRepoTask(mainRepoRoot, {
      taskId: opts.taskId,
      projectId: opts.projectId,
    }).catch((err) => logger.warn('registerMainRepoTask failed', { error: String(err) }))
    return { kind: 'in-place', reason: 'worktreeMode=never', mainRepoRoot }
  }

  // Decide whether to spawn a new worktree.
  const otherActive = state.entries.filter(
    (e) => e.taskId !== opts.taskId
  )
  const shouldCreate = opts.mode === 'force' || otherActive.length > 0

  if (!shouldCreate) {
    // Solo task in this checkout — run in-place but record the entry
    // so future task_starts know we're occupying the main repo.
    await registerMainRepoTask(mainRepoRoot, {
      taskId: opts.taskId,
      projectId: opts.projectId,
    }).catch((err) => logger.warn('registerMainRepoTask failed', { error: String(err) }))
    return {
      kind: 'in-place',
      reason: 'no other active tasks in this checkout',
      mainRepoRoot,
    }
  }

  // Parallel work — create a worktree.
  try {
    const result = await createWorktree(mainRepoRoot, {
      taskId: opts.taskId,
      taskName: opts.taskName,
      projectId: opts.projectId,
    })
    return {
      kind: 'created',
      path: result.entry.path,
      branch: result.entry.branch,
      port: result.entry.port,
    }
  } catch (err) {
    logger.error('createWorktree failed; falling back to in-place', { error: String(err) })
    // Worktree creation failed — don't block the user. Continue in
    // the current folder and surface the failure in the response.
    return {
      kind: 'in-place',
      reason: `worktree creation failed: ${(err as Error).message}`,
      mainRepoRoot,
    }
  }
}

function renderWorktreeRedirect(
  taskId: string,
  taskName: string,
  outcome: Extract<WorktreeOutcome, { kind: 'redirect' | 'created' }>
): string {
  const verb = outcome.kind === 'created' ? 'Created' : 'Resuming'
  const lines: string[] = []
  lines.push(`🌿 ${verb} worktree for ${taskId} — "${taskName}"`)
  lines.push('')
  lines.push(`━━━ Worktree ━━━━━━━━━━━━━━━━━━━━`)
  lines.push(`path:    ${outcome.path}`)
  lines.push(`branch:  ${outcome.branch}`)
  if (outcome.port !== null) lines.push(`port:    ${outcome.port}  (suggested for dev server)`)
  if (outcome.kind === 'redirect') lines.push(`reason:  ${outcome.reason}`)
  lines.push('')
  lines.push(`━━━ Next steps ━━━━━━━━━━━━━━━━━━`)
  lines.push(`  1. Open a new terminal in that folder:`)
  lines.push(`     cd ${outcome.path}`)
  lines.push(`     claude`)
  lines.push(``)
  lines.push(`  2. In the new Claude session, full task context loads on first prompt.`)
  lines.push(`     (PlanFlow detects the worktree from .planflow/worktrees.json.)`)
  lines.push(``)
  lines.push(`  3. Install deps if needed (first time only — pnpm uses hardlinks, ~30s):`)
  lines.push(`     pnpm install`)
  if (outcome.port !== null) {
    lines.push(``)
    lines.push(`  4. Use port ${outcome.port} for any dev server in this worktree to`)
    lines.push(`     avoid clashing with the main checkout.`)
  }
  lines.push('')
  lines.push(`This Claude session keeps its current task — switch terminals to work on ${taskId}.`)
  return lines.join('\n')
}

export const taskStartTool: ToolDefinition<TaskStartInput> = {
  name: 'planflow_task_start',

  description: `Start working on a PlanFlow task — fans out to multiple tools in a single call.

What this does in one shot:
  • Looks up the task by ID
  • Pulls comments and activity history
  • Signals "working on" status so teammates see your focus
  • Runs a semantic search using the task title (or your override)
  • Surfaces related knowledge entries
  • Suggests a git branch name derived from the task ID + title

Use this when:
  ✅ You're about to start (or resume) work on a specific task
  ✅ You want full context — task description, history, likely files —
     in one response instead of 5+ tool calls

Do NOT use when:
  ❌ You don't yet know which task to work on → planflow_task_next first
  ❌ You only need the task list → planflow_task_list

Parameters:
  - projectId (optional): Project UUID. Uses current project if omitted.
  - taskId (required): Task ID to start (e.g., "T1.1")
  - searchQuery (optional): Override the auto-search query

Prerequisites:
  • Logged in via planflow_login()
  • Project indexed via planflow_index() (for the auto-search step)`,

  inputSchema: TaskStartInputSchema,

  async execute(input: TaskStartInput): Promise<ReturnType<typeof createSuccessResult>> {
    const projectId = input.projectId || getCurrentProjectId()

    if (!projectId) {
      return createErrorResult(
        '❌ No project ID provided and no current project set.\n\n' +
          'Either:\n' +
          '  1. Pass projectId: planflow_task_start(projectId: "uuid", taskId: "T1.1")\n' +
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

    logger.info('Task start tool called', { projectId, taskId: input.taskId })

    try {
      const client = getApiClient()

      // We need the task itself to know its title (for auto-search) and
      // metadata. List once, find by taskId — same approach as recall.
      const tasksResult = await client.listTasks(projectId)
      const task = tasksResult.tasks.find((t) => t.taskId === input.taskId)

      if (!task) {
        return createErrorResult(
          `❌ Task not found: ${input.taskId}\n\n` +
            `Use planflow_task_list(projectId: "${projectId}") to see available tasks.`
        )
      }

      const searchQuery = input.searchQuery ?? task.name

      // ── Worktree decision ─────────────────────────────────────────
      // We resolve the parallel-work story BEFORE any state writes.
      // Three outcomes feed back into `worktreeNotice` (rendered in
      // the response) and `bailEarly` (return immediately when the
      // user must switch folders before context fetch makes sense):
      //   1. "in-place"   — work continues in the current cwd.
      //   2. "redirect"   — a worktree for this task already exists;
      //                     instruct the user to cd into it. Bail.
      //   3. "created"    — a fresh worktree was created for this
      //                     task. Instruct the user to cd into it.
      //                     Bail (they need a Claude session there).
      //
      // We don't auto-spawn dev servers or run installs here — those
      // are project-specific and easy to surprise users with. The
      // response prints the next commands so the user can run them.
      const worktreeOutcome = await resolveWorktree({
        cwd: process.cwd(),
        taskId: task.taskId,
        taskName: task.name,
        projectId,
        mode: input.worktreeMode ?? 'auto',
      })

      if (worktreeOutcome.kind === 'redirect' || worktreeOutcome.kind === 'created') {
        return createSuccessResult(
          renderWorktreeRedirect(task.taskId, task.name, worktreeOutcome)
        )
      }

      // Promote the task into IN_PROGRESS only when it's still TODO.
      // We don't auto-revive DONE tasks (that's a different intent —
      // user should explicitly reopen) and we don't trample BLOCKED
      // (the block flag carries information we shouldn't silently drop).
      const shouldPromoteStatus = task.status === 'TODO'

      // Fan out the rest in parallel — none of them depend on each
      // other. startWorkingOn + status promotion are side-effecting
      // writes but the reads should still surface even if a write
      // fails (e.g. permission). Order in the destructure mirrors the
      // Promise.all order.
      const [
        commentsResult,
        activityResult,
        searchResult,
        knowledgeResult,
        workingOnResult,
        statusPromotionResult,
      ] = await Promise.all([
        client.listComments(projectId, input.taskId).catch((err) => {
          logger.warn('listComments failed in task_start', { error: String(err) })
          return null
        }),
        client.getTaskActivity(projectId, input.taskId, { limit: 10 }).catch((err) => {
          logger.warn('getTaskActivity failed in task_start', { error: String(err) })
          return null
        }),
        client.searchProject(projectId, searchQuery, { limit: 5 }).catch((err) => {
          logger.warn('searchProject failed in task_start', { error: String(err) })
          return null
        }),
        client.listKnowledge(projectId, { search: searchQuery, limit: 5 }).catch((err) => {
          logger.warn('listKnowledge failed in task_start', { error: String(err) })
          return null
        }),
        client.startWorkingOn(projectId, input.taskId).catch((err) => {
          logger.warn('startWorkingOn failed in task_start', { error: String(err) })
          return null
        }),
        shouldPromoteStatus
          ? client
              .updateTaskStatus(projectId, input.taskId, 'IN_PROGRESS')
              .catch((err) => {
                logger.warn('updateTaskStatus failed in task_start', { error: String(err) })
                return null
              })
          : Promise.resolve(null),
      ])

      const lines: string[] = []
      lines.push(`🎯 Starting task ${task.taskId} — "${task.name}"`)
      lines.push('')

      // ── Worktree status ──────────────────────────────────────────
      if (worktreeOutcome.kind === 'in-place') {
        lines.push(`🌿 Worktree: in-place (${worktreeOutcome.reason})`)
        lines.push('')
      } else if (worktreeOutcome.kind === 'not-a-repo') {
        lines.push(`🌿 Worktree: skipped (not a git repository)`)
        lines.push('')
      }

      // ── Task summary ─────────────────────────────────────────────
      lines.push(`━━━ Task ━━━━━━━━━━━━━━━━━━━━━━━━`)
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

      // ── Status promotion ────────────────────────────────────────
      if (shouldPromoteStatus) {
        if (statusPromotionResult) {
          lines.push(`🏷️  Status: TODO → IN_PROGRESS`)
        } else {
          lines.push(
            `⚠️  Status promotion failed (still TODO) — non-fatal, can fix with planflow_task_update`
          )
        }
      }

      // ── Working-on signal ────────────────────────────────────────
      if (workingOnResult) {
        lines.push(`🟢 Working signal: active — teammates can see your focus`)
      } else {
        lines.push(`⚠️  Working signal failed (non-fatal — proceeded with context fetch)`)
      }
      lines.push('')

      // ── Comments ─────────────────────────────────────────────────
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

      // ── Activity ─────────────────────────────────────────────────
      const activityEntries = activityResult?.activities ?? []
      if (activityEntries.length > 0) {
        lines.push(`━━━ Activity ━━━━━━━━━━━━━━━━━━━━`)
        for (const a of activityEntries.slice(0, 5)) {
          const actor = a.actor.name || a.actor.email
          const desc = a.description || a.action
          lines.push(`• ${formatRelativeTime(a.createdAt)} — ${actor}: ${desc}`)
        }
        if (activityEntries.length > 5) {
          lines.push(`... and ${activityEntries.length - 5} more`)
        }
        lines.push('')
      }

      // ── Related knowledge ───────────────────────────────────────
      const knowledge = knowledgeResult?.knowledge ?? []
      if (knowledge.length > 0) {
        lines.push(`━━━ Related Knowledge (${knowledge.length}) ━━━`)
        for (const entry of knowledge) {
          lines.push(`• [${entry.type}] ${entry.title}`)
          // Keep content snippets short here — recall() exists for full read.
          const preview =
            entry.content.length > 200 ? entry.content.slice(0, 200) + '...' : entry.content
          lines.push(`    ${preview.replace(/\n/g, '\n    ')}`)
        }
        lines.push('')
      }

      // ── Likely-relevant code (auto-search) ──────────────────────
      const searchResults = searchResult?.results ?? []
      if (searchResults.length > 0) {
        lines.push(`━━━ Likely-Relevant Code (search: "${searchQuery}") ━━━`)
        for (let i = 0; i < searchResults.length; i++) {
          const r = searchResults[i]!
          const chunk = r.chunk
          const isCode = 'filePath' in chunk
          const score = r.score.toFixed(3)
          if (isCode) {
            lines.push(
              `#${i + 1} ${chunk.filePath}:${chunk.startLine}-${chunk.endLine}  (${chunk.kind} ${chunk.name}, score ${score})`
            )
          } else {
            lines.push(`#${i + 1} 📄 ${(chunk as { source: string }).source} (score ${score})`)
          }
        }
        lines.push('')
      } else if (searchResult !== null) {
        lines.push(
          `(no semantic search results for "${searchQuery}" — project may not be indexed yet; run planflow_index_status to check)`
        )
        lines.push('')
      }

      // ── Suggested branch ────────────────────────────────────────
      const slug = slugify(task.name)
      const branchSuggestion = `task/${task.taskId}-${slug}`
      lines.push(`━━━ Suggestions ━━━━━━━━━━━━━━━━━`)
      lines.push(`💡 Git branch: ${branchSuggestion}`)
      lines.push('')

      // ── Next steps ──────────────────────────────────────────────
      lines.push(`Next steps:`)
      lines.push(`  • Read full chunks:   planflow_chunk(chunkId: "...")`)
      lines.push(`  • Log progress:       planflow_task_progress(taskId: "${task.taskId}", note: "...")`)
      lines.push(`  • Mark done:          planflow_task_done(taskId: "${task.taskId}")`)
      lines.push('')
      lines.push(`While implementing — keep using PlanFlow search tools, not grep:`)
      lines.push(`  • new question opens up    → planflow_search(query: "...")`)
      lines.push(`  • full body of a hit       → planflow_chunk(chunkId: "...")`)
      lines.push(`  • everything tied to file  → planflow_recall(filePath: "...")`)
      lines.push(`  • brand-new area mid-task  → planflow_explore(intent: "...")`)
      lines.push(`  Falling back to grep mid-task drops the ranked semantic context`)
      lines.push(`  the Intelligence Layer is built to surface (related knowledge,`)
      lines.push(`  recent activity, likely files).`)

      return createSuccessResult(lines.join('\n'))
    } catch (error) {
      logger.error('Task start failed', { error: String(error) })

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
      return createErrorResult(`❌ Task start failed: ${message}`)
    }
  },
}
