/**
 * PlanFlow MCP — Local Index State
 *
 * Persists the "what was the repo at the time we last indexed" snapshot to
 * `.planflow/index-state.json` inside the project. This is what unlocks
 * git-diff-based incremental indexing — next time we re-index, we read the
 * commit hash here and ask git for the changed files since then.
 *
 * Why a file inside the repo (not a global config blob in ~/.config)?
 *   • It's intrinsically per-repo state, like `.git/HEAD`.
 *   • Multiple developers can each track their own commit hash without
 *     stepping on each other in a shared config.
 *   • Goes through git like the existing `.planflow/project.json` link, so
 *     git clean / fresh clone reset the state cleanly (a blanket re-index
 *     happens automatically on first MCP call after the wipe — exactly
 *     what you'd want).
 *
 * Schema is versioned so we can migrate later without breaking older
 * readers. Anything we don't recognise gets treated as "no state" and we
 * fall back to a full re-scan.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { logger } from '../logger.js'

const STATE_DIR = '.planflow'
const STATE_FILENAME = 'index-state.json'

const IndexStateSchema = z.object({
  /** Bumped whenever the on-disk schema changes in a non-additive way. */
  version: z.literal(1).default(1),
  /** PlanFlow project this state belongs to — guards against stale state
   *  after a `planflow_use` switch. */
  projectId: z.string().uuid(),
  /** Full git HEAD commit at the time of indexing. Null when the repo
   *  isn't a git repo (we still write state so the file-hash fallback
   *  has something to reason about). */
  lastCommitHash: z.string().nullable(),
  /** ISO timestamp — informational, surfaced in `planflow_index_status`. */
  lastIndexedAt: z.string(),
  /** File count at last index — useful for "diff vs current scan" deltas. */
  totalFiles: z.number().int().nonnegative(),
})

export type IndexState = z.infer<typeof IndexStateSchema>

function getStatePath(rootDir: string): string {
  return join(rootDir, STATE_DIR, STATE_FILENAME)
}

/**
 * Read state for `rootDir`, or null when:
 *   • file missing
 *   • file unreadable / malformed
 *   • file's projectId doesn't match the active project (stale state from
 *     a previous `planflow_use`).
 *
 * The projectId guard is the load-bearing one — if a user runs `planflow_use`
 * to switch projects, the state file from the old project would otherwise
 * point at a commit hash for the wrong index. Better to bail and full-scan.
 */
export function readIndexState(rootDir: string, expectedProjectId: string): IndexState | null {
  const path = getStatePath(rootDir)
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    const state = IndexStateSchema.parse(parsed)
    if (state.projectId !== expectedProjectId) {
      logger.debug('Index state belongs to a different project — ignoring', {
        path,
        stateProject: state.projectId,
        currentProject: expectedProjectId,
      })
      return null
    }
    return state
  } catch (err) {
    logger.warn('Could not read index state — proceeding without it', {
      path,
      error: String(err),
    })
    return null
  }
}

/**
 * Persist state for `rootDir`. Creates `.planflow/` if needed. Failures are
 * non-fatal — the worst case is we re-scan everything next time, which is
 * exactly what would have happened without git-diff incremental anyway.
 */
export function writeIndexState(rootDir: string, state: Omit<IndexState, 'version'>): void {
  const path = getStatePath(rootDir)
  try {
    mkdirSync(dirname(path), { recursive: true })
    const toWrite: IndexState = {
      version: 1,
      ...state,
    }
    writeFileSync(path, JSON.stringify(toWrite, null, 2) + '\n', 'utf-8')
    logger.debug('Index state written', { path })
  } catch (err) {
    logger.warn('Could not write index state — next run will fall back to full scan', {
      path,
      error: String(err),
    })
  }
}

/**
 * Delete state. Used by `planflow_index purge=true` so the next index pass
 * can't accidentally short-circuit to "nothing changed" when the backend
 * has actually been wiped.
 */
export function clearIndexState(rootDir: string): boolean {
  const path = getStatePath(rootDir)
  if (!existsSync(path)) return false
  try {
    unlinkSync(path)
    logger.debug('Index state cleared', { path })
    return true
  } catch (err) {
    logger.warn('Could not clear index state', { path, error: String(err) })
    return false
  }
}
