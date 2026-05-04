/**
 * PlanFlow MCP — Git diff utilities
 *
 * The smart way to do incremental indexing in a git project: ask git which
 * files actually changed since the last index. Two big wins over the
 * previous file-by-file SHA-256 approach:
 *
 *   1. Cost: we don't have to read 2,000 files off disk just to discover
 *      that 3 changed. `git diff --name-status` runs in milliseconds against
 *      git's index, no userland file IO.
 *   2. Accuracy: git tracks renames, deletes, and copies. A file rename
 *      under the old approach showed up as "delete + add" with a fresh hash;
 *      git tells us "R old.ts new.ts" so we can preserve the embedded chunks
 *      under the new path instead of re-embedding.
 *
 * This module wraps the git CLI behind a small typed surface. We use
 * `execFile` (not `exec`) so user-controlled paths can't trigger shell
 * injection, and we cap stdout at 16 MB which is generous for any sane
 * `git diff` output.
 */

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { logger } from '../logger.js'

const execFileAsync = promisify(execFile)

const GIT_TIMEOUT_MS = 15_000
const GIT_MAX_BUFFER = 16 * 1024 * 1024

export type GitChangeStatus = 'A' | 'M' | 'D' | 'R' | 'C' | 'T'

export interface GitFileChange {
  status: GitChangeStatus
  path: string
  /** Populated for renames/copies — the previous path. */
  oldPath?: string
}

/** True when the directory is the working tree of a git repo. */
export function isGitRepo(rootDir: string): boolean {
  // .git can be either a directory (normal repo) or a file (worktree
  // pointer / submodule). existsSync handles both.
  return existsSync(join(rootDir, '.git'))
}

/**
 * Resolve `HEAD` to a full commit hash. Returns null when:
 *   • not a git repo
 *   • repo has zero commits (fresh `git init`)
 *   • git CLI is missing or errors out
 *
 * We swallow errors deliberately: callers always have a non-git fallback,
 * and surfacing every "is it a git repo" probe failure to the user would
 * be noise.
 */
export async function getHeadCommit(rootDir: string): Promise<string | null> {
  if (!isGitRepo(rootDir)) return null
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: rootDir,
      timeout: GIT_TIMEOUT_MS,
    })
    const hash = stdout.trim()
    return hash || null
  } catch (err) {
    logger.debug('git rev-parse HEAD failed', { rootDir, error: String(err) })
    return null
  }
}

/**
 * List files that changed between two commits. Uses `--name-status -M` so we
 * get rename detection for free.
 *
 * Returned paths are relative to the repo root, with forward slashes
 * (matching what the scanner produces).
 */
export async function getChangedFilesBetween(
  rootDir: string,
  fromCommit: string,
  toCommit: string
): Promise<GitFileChange[]> {
  if (fromCommit === toCommit) return []

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['diff', '--name-status', '-M', fromCommit, toCommit],
      {
        cwd: rootDir,
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: GIT_MAX_BUFFER,
      }
    )
    return parseDiffOutput(stdout)
  } catch (err) {
    // The most common reason a diff fails is that fromCommit no longer
    // exists in the local repo (rebase, force-push, shallow clone). We
    // signal the caller by throwing so they can fall back to a full scan.
    logger.warn('git diff failed', {
      rootDir,
      fromCommit,
      toCommit,
      error: String(err),
    })
    throw err
  }
}

/**
 * List files that have changed in the working tree on top of HEAD —
 * uncommitted edits, both staged and unstaged. Pairs with
 * `getChangedFilesBetween` to capture "everything that's different from
 * the last indexed commit", whether or not the user has committed yet.
 *
 * Without this, a developer who hasn't committed since the last index would
 * see "nothing changed" reports, which is the most surprising bug we could
 * ship.
 */
export async function getWorkingTreeChanges(rootDir: string): Promise<GitFileChange[]> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['status', '--porcelain=v1', '-uall'],
      {
        cwd: rootDir,
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: GIT_MAX_BUFFER,
      }
    )
    return parsePorcelainOutput(stdout)
  } catch (err) {
    logger.warn('git status failed', { rootDir, error: String(err) })
    return []
  }
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function parseDiffOutput(stdout: string): GitFileChange[] {
  const changes: GitFileChange[] = []
  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    const parts = line.split('\t')
    const statusCol = parts[0]
    if (!statusCol) continue
    const status = statusCol.charAt(0) as GitChangeStatus

    if (status === 'R' || status === 'C') {
      // Rename / Copy: status\told_path\tnew_path
      changes.push({
        status,
        path: normalizePath(parts[2] ?? parts[1] ?? ''),
        oldPath: parts[1] ? normalizePath(parts[1]) : undefined,
      })
    } else {
      // A/M/D/T: status\tpath
      const path = parts[1]
      if (!path) continue
      changes.push({ status, path: normalizePath(path) })
    }
  }
  return changes
}

function parsePorcelainOutput(stdout: string): GitFileChange[] {
  // git status --porcelain=v1 lines are of the form `XY path` where X and Y
  // are single-char status codes (X for the index, Y for the worktree).
  // Renames are `R  old -> new`. We map the first non-space char in XY into
  // our normalised status.
  const changes: GitFileChange[] = []
  for (const rawLine of stdout.split('\n')) {
    if (!rawLine) continue
    if (rawLine.length < 4) continue
    const x = rawLine[0]
    const y = rawLine[1]
    const rest = rawLine.slice(3)
    if (!x || !y) continue

    const status = mapPorcelainStatus(x, y)
    if (!status) continue

    if (status === 'R') {
      // "old -> new" — split on the arrow.
      const arrowIdx = rest.indexOf(' -> ')
      if (arrowIdx === -1) {
        changes.push({ status: 'M', path: normalizePath(rest) })
      } else {
        const oldPath = normalizePath(rest.slice(0, arrowIdx))
        const newPath = normalizePath(rest.slice(arrowIdx + 4))
        changes.push({ status: 'R', path: newPath, oldPath })
      }
    } else {
      changes.push({ status, path: normalizePath(rest) })
    }
  }
  return changes
}

function mapPorcelainStatus(x: string, y: string): GitChangeStatus | null {
  // Untracked files
  if (x === '?' && y === '?') return 'A'
  // Deletions in either index or worktree
  if (x === 'D' || y === 'D') return 'D'
  // Renames
  if (x === 'R' || y === 'R') return 'R'
  // Additions
  if (x === 'A' || y === 'A') return 'A'
  // Type changes
  if (x === 'T' || y === 'T') return 'T'
  // Modifications
  if (x === 'M' || y === 'M') return 'M'
  // Anything else — treat as modification rather than dropping silently
  return 'M'
}

function normalizePath(path: string): string {
  return path.replace(/^"|"$/g, '').split('\\').join('/')
}
