/**
 * PlanFlow MCP — planflow_worktree_list
 *
 * Read-only dashboard of every parallel-task workspace tied to the
 * current checkout. Shows task IDs, branches, paths, ports, and which
 * entry the caller is currently inside — answers "what am I working on
 * across this repo right now?" without grepping `git worktree list`
 * (which doesn't know task IDs) or scanning ports manually.
 *
 * Pure read — no side effects, no confirmation needed.
 */

import { z } from 'zod'
import path from 'node:path'
import {
  type ToolDefinition,
  createSuccessResult,
  createErrorResult,
} from './types.js'
import {
  detectCurrentWorktree,
  getMainRepoRoot,
  readState,
} from '../worktree.js'

const WorktreeListInputSchema = z.object({}).strict()

type WorktreeListInput = z.infer<typeof WorktreeListInputSchema>

export const worktreeListTool: ToolDefinition<WorktreeListInput> = {
  name: 'planflow_worktree_list',

  description: `List all PlanFlow task worktrees in the current repo.

What this returns:
  • Every task that has a worktree (or occupies the main checkout)
  • Branch, absolute path, suggested dev-server port
  • A pointer to the entry matching the current cwd (if any)

Use this when:
  ✅ You want to see what's running in parallel
  ✅ "Where am I working on T1.2 again?"
  ✅ Before kicking off a new parallel task — sanity-check what's open

Do NOT use when:
  ❌ You haven't started any tasks yet (the answer will be empty)

Read-only — no confirmation needed. No parameters.

Prerequisites:
  • Must be invoked from inside a git repository.`,

  inputSchema: WorktreeListInputSchema,

  async execute(): Promise<ReturnType<typeof createSuccessResult>> {
    const cwd = process.cwd()
    const mainRepoRoot = await getMainRepoRoot(cwd)

    if (!mainRepoRoot) {
      return createErrorResult(
        '❌ Not inside a git repository.\n\n' +
          'planflow_worktree_list reads .planflow/worktrees.json from the main\n' +
          'checkout and needs git to locate it. Run this from a project folder.'
      )
    }

    const state = await readState(mainRepoRoot)
    const here = detectCurrentWorktree(state, cwd)

    if (state.entries.length === 0) {
      return createSuccessResult(
        `🌿 No active task worktrees in this repo.\n\n` +
          `Main repo: ${mainRepoRoot}\n\n` +
          `Start one with: planflow_task_start(taskId: "T1.1")`
      )
    }

    const lines: string[] = []
    lines.push(`🌿 Active task worktrees (${state.entries.length})`)
    lines.push(`Main repo: ${mainRepoRoot}`)
    lines.push('')

    // Sort: main-repo entry first, then by createdAt ascending so the
    // dashboard reads top-down in the order tasks were started.
    const sorted = [...state.entries].sort((a, b) => {
      if (a.isMainRepo && !b.isMainRepo) return -1
      if (!a.isMainRepo && b.isMainRepo) return 1
      return a.createdAt.localeCompare(b.createdAt)
    })

    for (const entry of sorted) {
      const youAreHere = here && here.taskId === entry.taskId ? '  ← you are here' : ''
      const tag = entry.isMainRepo ? '[main]' : '[worktree]'
      lines.push(`${tag} ${entry.taskId}${youAreHere}`)
      lines.push(`        path:   ${entry.path}`)
      lines.push(`        branch: ${entry.branch}`)
      if (entry.port !== null) lines.push(`        port:   ${entry.port}`)
      const created = formatRelativeTime(entry.createdAt)
      lines.push(`        since:  ${created}`)
      lines.push('')
    }

    if (here) {
      lines.push(
        `Current cwd matches ${here.taskId} (${path.basename(here.path)}).`
      )
    } else {
      lines.push(
        `Current cwd is not a registered worktree. cd to one of the paths above\n` +
          `or start a new task with planflow_task_start.`
      )
    }

    return createSuccessResult(lines.join('\n'))
  },
}

function formatRelativeTime(input: string): string {
  const date = new Date(input)
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
