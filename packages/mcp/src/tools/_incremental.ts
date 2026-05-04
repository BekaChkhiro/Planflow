/**
 * PlanFlow MCP — Incremental planning
 *
 * Decides which scanned files are actually new/changed since the last index
 * pass and which paths the backend should drop. Pure: no API calls, no state
 * writes — the caller decides whether to act on the plan or just preview it
 * (`planflow_index_diff` uses this for preview, `planflow_index` uses it to
 * drive the upload).
 *
 * Two strategies, tried in order:
 *
 *   1. Git diff — fast and accurate, used when the project is a git repo
 *      AND we have a state file from a previous index pass AND that state's
 *      commit still exists locally. Picks up committed changes plus
 *      working-tree edits (so a developer who hasn't committed the changes
 *      they're about to index isn't told "nothing to do").
 *   2. Backend hash compare — works on any project. Asks the backend for
 *      the {path → contentHash} map of what's currently indexed and
 *      filters scanned files to those whose local hash differs.
 *
 * The result is a *plan*; act on it (or don't) at the call site.
 */

import { createHash } from 'node:crypto'
import { getApiClient } from '../api-client.js'
import { logger } from '../logger.js'
import {
  isGitRepo,
  getHeadCommit,
  getChangedFilesBetween,
  getWorkingTreeChanges,
  type GitFileChange,
} from './_git-diff.js'
import { readIndexState, type IndexState } from './_index-state.js'
import type { ScannedFile } from './_scanner.js'

export type IncrementalMode = 'git' | 'hash' | 'full'

export interface IncrementalPlan {
  mode: IncrementalMode
  /** Files we'd send to the backend. */
  workingFiles: ScannedFile[]
  /** Paths the backend should remove (deletes + rename old paths). */
  removedFiles: string[]
  /** Count of files we'd skip because content matches what's indexed. */
  unchangedLocally: number
  /** Resolved HEAD commit, when git was usable at all. */
  headCommit: string | null
  /** State file from the previous run, when one was found. */
  previousState: IndexState | null
}

export interface PlanOptions {
  rootDir: string
  projectId: string
  scannedFiles: ScannedFile[]
  /** When false, every scanned file is considered "to index". */
  incremental: boolean
  /**
   * When true (and we're not on the git path), ask the backend for a
   * file-hash map purely so we can compute deletes — ignore the diff side.
   * Mirrors the existing `removeMissing` behaviour from `planflow_index`.
   */
  removeMissing: boolean
}

/**
 * Build an incremental plan for `scannedFiles`. Read-only — never mutates
 * server state. Always returns a plan, even when the scanner is empty
 * (`workingFiles: []`) so the caller can rely on shape.
 */
export async function planIncrementalChanges(opts: PlanOptions): Promise<IncrementalPlan> {
  const { rootDir, projectId, scannedFiles, incremental, removeMissing } = opts

  const headCommit = isGitRepo(rootDir) ? await getHeadCommit(rootDir) : null
  const previousState = readIndexState(rootDir, projectId)

  // Try git path first — cheapest and most accurate when applicable.
  if (
    incremental &&
    headCommit &&
    previousState &&
    previousState.lastCommitHash &&
    isGitRepo(rootDir)
  ) {
    const gitPlan = await tryGitDiff({
      rootDir,
      previousState,
      headCommit,
      scannedFiles,
    })
    if (gitPlan) {
      return {
        mode: 'git',
        workingFiles: gitPlan.workingFiles,
        removedFiles: gitPlan.removedFiles,
        unchangedLocally: scannedFiles.length - gitPlan.workingFiles.length,
        headCommit,
        previousState,
      }
    }
  }

  // Hash-compare fallback (covers non-git, missing state, broken diff).
  if (incremental || removeMissing) {
    const hashPlan = await tryHashCompare({ projectId, scannedFiles, incremental, removeMissing })
    if (hashPlan.applied) {
      return {
        mode: 'hash',
        workingFiles: hashPlan.workingFiles,
        removedFiles: hashPlan.removedFiles,
        unchangedLocally: hashPlan.unchanged,
        headCommit,
        previousState,
      }
    }
    // Even when hash mode doesn't apply (eg. nothing on the backend yet),
    // it may still produce a removal list when removeMissing is set; pass
    // those through.
    return {
      mode: 'full',
      workingFiles: scannedFiles,
      removedFiles: hashPlan.removedFiles,
      unchangedLocally: 0,
      headCommit,
      previousState,
    }
  }

  return {
    mode: 'full',
    workingFiles: scannedFiles,
    removedFiles: [],
    unchangedLocally: 0,
    headCommit,
    previousState,
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface GitDiffPlan {
  workingFiles: ScannedFile[]
  removedFiles: string[]
}

async function tryGitDiff(args: {
  rootDir: string
  previousState: IndexState
  headCommit: string
  scannedFiles: ScannedFile[]
}): Promise<GitDiffPlan | null> {
  const { rootDir, previousState, headCommit, scannedFiles } = args
  if (!previousState.lastCommitHash) return null

  let committedChanges: GitFileChange[]
  try {
    committedChanges =
      previousState.lastCommitHash === headCommit
        ? []
        : await getChangedFilesBetween(rootDir, previousState.lastCommitHash, headCommit)
  } catch {
    logger.info('Git diff failed — falling back to hash compare', {
      from: previousState.lastCommitHash,
      to: headCommit,
    })
    return null
  }

  const workingTreeChanges = await getWorkingTreeChanges(rootDir)

  // Working-tree state is authoritative when both layers touch the same
  // path (the user might have committed a change and then edited again).
  const mergedByPath = new Map<string, GitFileChange>()
  for (const change of committedChanges) mergedByPath.set(change.path, change)
  for (const change of workingTreeChanges) mergedByPath.set(change.path, change)

  const scannedByPath = new Map(scannedFiles.map((f) => [f.path, f]))
  const workingFiles: ScannedFile[] = []
  const removedFiles: string[] = []
  const seen = new Set<string>()

  for (const change of mergedByPath.values()) {
    if (change.status === 'D') {
      removedFiles.push(change.path)
      continue
    }
    if (change.status === 'R' && change.oldPath) {
      removedFiles.push(change.oldPath)
    }

    const file = scannedByPath.get(change.path)
    if (!file) {
      // The diff mentions a path the scanner skipped (now gitignored,
      // binary, oversized, etc.). Nothing to send.
      continue
    }
    if (!seen.has(file.path)) {
      workingFiles.push(file)
      seen.add(file.path)
    }
  }

  logger.debug('Git-diff plan', {
    fromCommit: previousState.lastCommitHash.slice(0, 7),
    toCommit: headCommit.slice(0, 7),
    committed: committedChanges.length,
    workingTree: workingTreeChanges.length,
    willIndex: workingFiles.length,
    willRemove: removedFiles.length,
  })

  return { workingFiles, removedFiles }
}

interface HashPlan {
  workingFiles: ScannedFile[]
  removedFiles: string[]
  unchanged: number
  applied: boolean
}

async function tryHashCompare(args: {
  projectId: string
  scannedFiles: ScannedFile[]
  incremental: boolean
  removeMissing: boolean
}): Promise<HashPlan> {
  const { projectId, scannedFiles, incremental, removeMissing } = args

  const client = getApiClient()
  let indexedHashes: Record<string, string> = {}
  try {
    const result = await client.getFileHashes(projectId)
    indexedHashes = result.hashes
  } catch (err) {
    logger.debug('No file hashes from backend (likely first index)', {
      error: String(err),
    })
    return { workingFiles: scannedFiles, removedFiles: [], unchanged: 0, applied: false }
  }

  const indexedKeys = Object.keys(indexedHashes)
  let workingFiles: ScannedFile[] = scannedFiles
  let removedFiles: string[] = []
  let unchanged = 0
  let applied = false

  if (incremental && indexedKeys.length > 0) {
    workingFiles = []
    for (const file of scannedFiles) {
      const localHash = createHash('sha256').update(file.content).digest('hex')
      if (indexedHashes[file.path] && indexedHashes[file.path] === localHash) {
        unchanged++
      } else {
        workingFiles.push(file)
      }
    }
    applied = true
  }

  if (removeMissing && indexedKeys.length > 0) {
    const localPaths = new Set(scannedFiles.map((f) => f.path))
    removedFiles = indexedKeys.filter((p) => !localPaths.has(p))
  }

  return { workingFiles, removedFiles, unchanged, applied }
}
