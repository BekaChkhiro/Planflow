/**
 * PlanFlow MCP — planflow_post_merge_cleanup
 *
 * Closes the post-merge gap left by autoExecute + mergeStrategy:"auto-merge".
 *
 * When an autoExecute agent finishes with auto-merge, the actual merge
 * happens REMOTELY and ASYNCHRONOUSLY on GitHub (after CI passes), long
 * after the agent process has exited. So the dispatching session is left
 * stale:
 *   • local default branch (master/main) never sees the squash commit
 *   • the local task branch lingers — and because the merge was a SQUASH,
 *     `git branch -d` reports "not fully merged" and refuses (needs -D)
 *   • the worktree (if one was created) is still on disk
 *
 * This tool runs from the dispatching session and reconciles all of that
 * in one safe call: fast-forward the local default branch to origin,
 * remove the task's worktree, force-delete the local branch, and
 * (optionally) delete the now-merged remote branch.
 *
 * Safety: by default it refuses unless the agent's done-marker says the
 * task actually finished (status=done / phase=merged). Pass force:true to
 * clean up regardless (e.g. you merged the PR manually).
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import {
  type ToolDefinition,
  createSuccessResult,
  createErrorResult,
} from './types.js'
import {
  getMainRepoRoot,
  getRemoteDefaultBranch,
  readState,
  removeWorktree,
} from '../worktree.js'

const exec = promisify(execFile)

const PostMergeCleanupInputSchema = z.object({
  taskId: z
    .string()
    .min(1)
    .describe('Task ID whose auto-merged work should be cleaned up locally (e.g. "T14.4").'),
  branch: z
    .string()
    .optional()
    .describe(
      'Task branch to delete. Optional — resolved from the worktree state / agent done-marker when omitted.'
    ),
  deleteRemoteBranch: z
    .boolean()
    .default(false)
    .describe(
      'Also delete the remote branch on origin (git push origin --delete). Off by default — GitHub usually auto-deletes the head branch after a squash merge.'
    ),
  force: z
    .boolean()
    .default(false)
    .describe(
      'Clean up even when the agent done-marker does not confirm a merge (e.g. you merged the PR by hand). Skips the merged-state safety check.'
    ),
  logDir: z
    .string()
    .optional()
    .describe('Override the agent log directory. Defaults to <main repo>/.planflow/agents.'),
})

type PostMergeCleanupInput = z.infer<typeof PostMergeCleanupInputSchema>

interface DoneMarker {
  status?: 'done' | 'failed' | 'in-progress'
  phase?: string | null
  branch?: string | null
  prUrl?: string | null
}

/** Walk up from startDir for an existing .planflow/agents directory. */
async function findLogDirUpward(startDir: string): Promise<string | null> {
  let dir = startDir
  while (true) {
    const candidate = path.join(dir, '.planflow', 'agents')
    try {
      const st = await fsp.stat(candidate)
      if (st.isDirectory()) return candidate
    } catch {
      /* keep walking */
    }
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/** Read the most recent <taskId>.done marker, if present. */
async function readDoneMarker(
  logDir: string,
  taskId: string
): Promise<DoneMarker | null> {
  try {
    const raw = await fsp.readFile(path.join(logDir, `${taskId}.done`), 'utf8')
    return JSON.parse(raw) as DoneMarker
  } catch {
    return null
  }
}

/** Current branch name at cwd, or null if detached/unavailable. */
async function currentBranch(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await exec('git', ['symbolic-ref', '--short', 'HEAD'], { cwd })
    return stdout.trim() || null
  } catch {
    return null
  }
}

async function localBranchExists(cwd: string, branch: string): Promise<boolean> {
  try {
    await exec('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { cwd })
    return true
  } catch {
    return false
  }
}

async function revParse(cwd: string, ref: string): Promise<string | null> {
  try {
    const { stdout } = await exec('git', ['rev-parse', '--short', ref], { cwd })
    return stdout.trim() || null
  } catch {
    return null
  }
}

const MERGED_PHASES = new Set(['merged', 'complete', 'task-done'])

export const postMergeCleanupTool: ToolDefinition<PostMergeCleanupInput> = {
  name: 'planflow_post_merge_cleanup',

  description: `Reconcile the dispatching session after an autoExecute auto-merge.

auto-merge completes the merge on GitHub asynchronously (after CI), AFTER the
agent has exited — so the local checkout is left behind: the default branch
never sees the squash commit, and the task branch lingers (and won't \`git
branch -d\` because a squash merge looks "not fully merged"). This fixes all of
it in one call from the DISPATCHING session:

  1. git fetch origin <default>
  2. fast-forward the local default branch (master/main) to origin
  3. remove the task's worktree (if one was created)
  4. force-delete the local task branch (-D — required after a squash merge)
  5. optionally delete the remote branch (deleteRemoteBranch:true)

Run this after planflow_agent_status shows the task DONE/merged. Branch + worktree
are resolved automatically from PlanFlow state.

Safety:
  • Refuses unless the agent done-marker confirms a merge (status=done / phase=merged),
    so you don't force-delete unmerged work. Pass force:true to override (e.g. you
    merged the PR by hand, or there is no agent marker).
  • Run it from the main checkout, not from inside the task's worktree.

Usage:
  planflow_post_merge_cleanup(taskId: "T14.4")
  planflow_post_merge_cleanup(taskId: "T14.4", deleteRemoteBranch: true)
  planflow_post_merge_cleanup(taskId: "T14.4", force: true)`,

  inputSchema: PostMergeCleanupInputSchema,

  async execute(input: PostMergeCleanupInput): Promise<ReturnType<typeof createSuccessResult>> {
    const cwd = process.cwd()
    const mainRepoRoot = await getMainRepoRoot(cwd)
    if (!mainRepoRoot) {
      return createErrorResult(
        '❌ Not inside a git repository.\n\n' +
          'Run this from the main checkout (where the dispatching session lives).'
      )
    }

    // ── Resolve the task branch + done-marker ───────────────────────
    const logDir =
      input.logDir ??
      (await findLogDirUpward(cwd)) ??
      path.join(mainRepoRoot, '.planflow', 'agents')
    const marker = await readDoneMarker(logDir, input.taskId)

    const state = await readState(mainRepoRoot)
    const wtEntry = state.entries.find((e) => e.taskId === input.taskId && !e.isMainRepo)

    const branch =
      input.branch ?? wtEntry?.branch ?? marker?.branch ?? null
    if (!branch) {
      return createErrorResult(
        `❌ Could not resolve the branch for ${input.taskId}.\n\n` +
          `No worktree entry and no agent done-marker recorded a branch.\n` +
          `Pass it explicitly: planflow_post_merge_cleanup(taskId: "${input.taskId}", branch: "task/${input.taskId}-...")`
      )
    }

    // ── Safety: confirm the work actually merged ────────────────────
    const mergedByMarker =
      marker?.status === 'done' &&
      (marker.phase == null || MERGED_PHASES.has(String(marker.phase)))
    if (!mergedByMarker && !input.force) {
      const phaseInfo = marker
        ? `agent marker: status=${marker.status ?? '?'}, phase=${marker.phase ?? '?'}`
        : 'no agent done-marker found'
      return createErrorResult(
        `❌ Refusing to clean up ${input.taskId} — merge not confirmed.\n\n` +
          `${phaseInfo}\n\n` +
          `Force-deleting the branch now could discard unmerged work. Either:\n` +
          `  • wait until planflow_agent_status shows DONE (phase=merged), or\n` +
          `  • if you merged the PR manually, re-run with force:true:\n` +
          `      planflow_post_merge_cleanup(taskId: "${input.taskId}", force: true)`
      )
    }

    // Refuse to delete the branch we're standing on.
    const onBranch = await currentBranch(mainRepoRoot)
    if (onBranch === branch) {
      return createErrorResult(
        `❌ You are currently on the task branch "${branch}".\n\n` +
          `Switch to the default branch first, then re-run:\n` +
          `   git checkout $(git remote show origin | sed -n 's/.*HEAD branch: //p')`
      )
    }

    const steps: string[] = []
    const warnings: string[] = []

    // ── 1. Resolve default branch + fetch ───────────────────────────
    const defaultBranch = (await getRemoteDefaultBranch(mainRepoRoot)) ?? 'main'
    try {
      await exec('git', ['fetch', 'origin', defaultBranch], { cwd: mainRepoRoot })
      steps.push(`✓ fetched origin/${defaultBranch}`)
    } catch (err) {
      warnings.push(`fetch origin/${defaultBranch} failed: ${(err as Error).message}`)
    }

    // ── 2. Fast-forward the local default branch to origin ──────────
    const beforeRef = await revParse(mainRepoRoot, defaultBranch)
    try {
      if (onBranch === defaultBranch) {
        // We're on it — fast-forward the working tree.
        await exec('git', ['merge', '--ff-only', `origin/${defaultBranch}`], { cwd: mainRepoRoot })
      } else {
        // Not checked out — update the ref directly (no checkout needed).
        await exec('git', ['fetch', 'origin', `${defaultBranch}:${defaultBranch}`], {
          cwd: mainRepoRoot,
        })
      }
      const afterRef = await revParse(mainRepoRoot, defaultBranch)
      if (beforeRef && afterRef && beforeRef !== afterRef) {
        steps.push(`✓ ${defaultBranch}: ${beforeRef} → ${afterRef} (fast-forwarded)`)
      } else {
        steps.push(`✓ ${defaultBranch} already up to date (${afterRef ?? 'unknown'})`)
      }
    } catch (err) {
      warnings.push(
        `could not fast-forward ${defaultBranch} (diverged?): ${(err as Error).message}`
      )
    }

    // ── 3. Remove the worktree (if any) ─────────────────────────────
    if (wtEntry) {
      if (cwd === wtEntry.path || cwd.startsWith(wtEntry.path + path.sep)) {
        return createErrorResult(
          `❌ You are inside the task worktree (${wtEntry.path}).\n\n` +
            `cd to the main checkout first:\n   cd ${mainRepoRoot}\n` +
            `Then re-run planflow_post_merge_cleanup(taskId: "${input.taskId}").`
        )
      }
      try {
        // Squash-merged work looks unmerged to git → force + deleteBranch.
        await removeWorktree(mainRepoRoot, input.taskId, { force: true, deleteBranch: true })
        steps.push(`✓ removed worktree ${wtEntry.path}`)
        steps.push(`✓ deleted local branch ${branch} (-D)`)
        if (wtEntry.port !== null) steps.push(`✓ freed port ${wtEntry.port}`)
      } catch (err) {
        warnings.push(`worktree removal failed: ${(err as Error).message}`)
      }
    } else if (await localBranchExists(mainRepoRoot, branch)) {
      // No worktree — just force-delete the local branch.
      try {
        await exec('git', ['branch', '-D', branch], { cwd: mainRepoRoot })
        steps.push(`✓ deleted local branch ${branch} (-D)`)
      } catch (err) {
        warnings.push(`git branch -D ${branch} failed: ${(err as Error).message}`)
      }
    } else {
      steps.push(`• no local branch "${branch}" to delete (already gone)`)
    }

    // ── 4. Optionally delete the remote branch ──────────────────────
    if (input.deleteRemoteBranch) {
      try {
        await exec('git', ['push', 'origin', '--delete', branch], { cwd: mainRepoRoot })
        steps.push(`✓ deleted remote branch origin/${branch}`)
      } catch (err) {
        warnings.push(
          `remote branch delete failed (may already be auto-deleted): ${(err as Error).message}`
        )
      }
    }

    // ── Report ──────────────────────────────────────────────────────
    const lines: string[] = [
      `🧹 Post-merge cleanup: ${input.taskId}`,
      ``,
      ...steps.map((s) => `  ${s}`),
    ]
    if (warnings.length > 0) {
      lines.push('')
      lines.push('⚠️  Warnings:')
      for (const w of warnings) lines.push(`  • ${w}`)
    }
    lines.push('')
    lines.push(
      warnings.length === 0
        ? `✅ Local checkout reconciled with the merged ${defaultBranch}.`
        : `Cleanup finished with warnings — review above.`
    )
    if (!input.deleteRemoteBranch) {
      lines.push(
        `(GitHub usually auto-deletes the merged branch; pass deleteRemoteBranch:true if it didn't.)`
      )
    }

    return createSuccessResult(lines.join('\n'))
  },
}
