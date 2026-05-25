/**
 * PlanFlow MCP — planflow_worktree_remove
 *
 * Tear down a parallel-task worktree once the work is merged. Wraps
 * `git worktree remove` and clears the entry from
 * `.planflow/worktrees.json` so the port frees up for the next task.
 *
 * Confirmation policy: ALWAYS surface the path + branch in the
 * response so the user/Claude can verify before re-running with
 * force=true if there are uncommitted changes.
 */

import { z } from 'zod'
import {
  type ToolDefinition,
  createSuccessResult,
  createErrorResult,
} from './types.js'
import { getMainRepoRoot, readState, removeWorktree } from '../worktree.js'

const WorktreeRemoveInputSchema = z.object({
  taskId: z
    .string()
    .min(1)
    .describe('Task ID whose worktree should be removed (e.g. "T1.1").'),
  force: z
    .boolean()
    .default(false)
    .describe(
      'Force removal even if the worktree has uncommitted changes (passes --force to git worktree remove).'
    ),
  deleteBranch: z
    .boolean()
    .default(false)
    .describe(
      'Also delete the underlying branch (git branch -D). Off by default — branch may have unpushed commits.'
    ),
})

type WorktreeRemoveInput = z.infer<typeof WorktreeRemoveInputSchema>

export const worktreeRemoveTool: ToolDefinition<WorktreeRemoveInput> = {
  name: 'planflow_worktree_remove',

  description: `Remove a PlanFlow task worktree and free its port.

What this does:
  • Runs git worktree remove for the registered path
  • Drops the entry from .planflow/worktrees.json
  • Optionally deletes the underlying branch

Use this when:
  ✅ A parallel task is fully merged and you want to clean up
  ✅ Recovering from an aborted parallel session

Do NOT use when:
  ❌ You haven't merged the work yet — pass force:true intentionally
  ❌ You're inside the worktree being removed — cd to the main repo first

Confirmation policy:
  • State changes the filesystem and git refs — ASK the user before
    running, especially if the worktree has uncommitted changes.`,

  inputSchema: WorktreeRemoveInputSchema,

  async execute(input: WorktreeRemoveInput): Promise<ReturnType<typeof createSuccessResult>> {
    const cwd = process.cwd()
    const mainRepoRoot = await getMainRepoRoot(cwd)

    if (!mainRepoRoot) {
      return createErrorResult(
        '❌ Not inside a git repository.\n\n' +
          'Run this from any folder inside the repo (main checkout or a worktree).'
      )
    }

    const stateBefore = await readState(mainRepoRoot)
    const target = stateBefore.entries.find(
      (e) => e.taskId === input.taskId && !e.isMainRepo
    )

    if (!target) {
      return createErrorResult(
        `❌ No worktree registered for task ${input.taskId}.\n\n` +
          `Use planflow_worktree_list() to see active worktrees.`
      )
    }

    // Refuse to remove the worktree we're currently inside — git
    // would fail anyway, but we want to give a clearer message.
    if (cwd === target.path || cwd.startsWith(target.path + '/')) {
      return createErrorResult(
        `❌ Cannot remove the worktree you are currently inside.\n\n` +
          `cd to the main checkout first:\n` +
          `   cd ${mainRepoRoot}\n\n` +
          `Then re-run: planflow_worktree_remove(taskId: "${input.taskId}")`
      )
    }

    try {
      const result = await removeWorktree(mainRepoRoot, input.taskId, {
        force: input.force,
        deleteBranch: input.deleteBranch,
      })

      const lines: string[] = []
      lines.push(`✅ Worktree removed for ${input.taskId}`)
      lines.push('')
      lines.push(`path:   ${target.path}`)
      lines.push(`branch: ${result.branch ?? target.branch}`)
      if (target.port !== null) lines.push(`port:   ${target.port} (freed)`)
      if (input.deleteBranch) lines.push(`branch deleted: yes`)
      lines.push('')
      lines.push(`Next: planflow_task_next() to pick up another task.`)

      return createSuccessResult(lines.join('\n'))
    } catch (err) {
      const message = (err as Error).message
      const hint = /uncommitted|locked/i.test(message)
        ? `\n\nIf the changes are intentional, retry with force:true:\n   planflow_worktree_remove(taskId: "${input.taskId}", force: true)`
        : ''
      return createErrorResult(`❌ Worktree removal failed: ${message}${hint}`)
    }
  },
}
