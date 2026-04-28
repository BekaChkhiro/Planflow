/**
 * Cross-tool progress tracking.
 *
 * Long-running MCP tool calls (especially `planflow_index` in directory
 * mode) used to be black boxes — Claude shows a spinner but the user
 * has no way to tell whether anything is actually happening, whether
 * the network's stalled, or how much time is left.
 *
 * This module is the shared "mailbox" any tool can write to so that:
 *   - the CLI subcommand `planflow-mcp progress` can read live state,
 *   - a separate Claude session can poll via `planflow_progress`,
 *   - and we can detect stalls (no update in N seconds → likely hung).
 *
 * Single in-flight operation per machine — that's the realistic case
 * for a developer running one Claude session at a time. Concurrent
 * runs would clobber each other but produce diagnostic output rather
 * than corruption (each call writes the whole file).
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { logger } from './logger.js'

const STALL_THRESHOLD_MS = 60_000

function getProgressPath(): string {
  return join(homedir(), '.config', 'planflow', 'progress.json')
}

function ensureDir(): void {
  const dir = join(homedir(), '.config', 'planflow')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProgressStatus = 'running' | 'done' | 'failed' | 'stalled'

export interface ProgressFile {
  /** Schema version for forward compatibility. */
  version: 1
  /** Tool that emitted the progress, e.g. "planflow_index". */
  tool: string
  /** Status as of lastUpdateAt; "stalled" is computed at read time, never written. */
  status: ProgressStatus
  /** Human-readable label of what's happening right now. */
  label: string
  /** Optional discrete progress counter (e.g. files indexed). */
  current?: number
  /** Optional total for percentage calculations. */
  total?: number
  /** Wall-time ETA in seconds, computed by the writer. */
  etaSeconds?: number
  /** ISO timestamps. */
  startedAt: string
  lastUpdateAt: string
  finishedAt?: string
  /** Failure detail when status === 'failed'. */
  error?: string
  /** Final summary line shown after completion. */
  summary?: string
}

// ---------------------------------------------------------------------------
// Writer API
//
// Tools call start() → update() (any number of times) → complete() / fail().
// The file is rewritten in full on each call; partial writes are safe because
// JSON.stringify produces a complete document or throws.
// ---------------------------------------------------------------------------

let active: ProgressFile | null = null

export function start(tool: string, label: string, total?: number): void {
  ensureDir()
  const now = new Date().toISOString()
  active = {
    version: 1,
    tool,
    status: 'running',
    label,
    total,
    current: 0,
    startedAt: now,
    lastUpdateAt: now,
  }
  writeFile(active)
  logger.debug('Progress started', { tool, label, total })
}

export function update(
  patch: Partial<Pick<ProgressFile, 'label' | 'current' | 'total' | 'etaSeconds'>>
): void {
  if (!active) return
  Object.assign(active, patch)
  active.lastUpdateAt = new Date().toISOString()
  writeFile(active)
}

export function complete(summary?: string): void {
  if (!active) return
  active.status = 'done'
  active.summary = summary
  active.finishedAt = new Date().toISOString()
  active.lastUpdateAt = active.finishedAt
  writeFile(active)
  // Clear the in-memory handle but keep the file for a short post-mortem
  // window — `planflow-mcp progress` still surfaces "done" results so the
  // user can verify the run succeeded.
  active = null
}

export function fail(error: string): void {
  if (!active) return
  active.status = 'failed'
  active.error = error
  active.finishedAt = new Date().toISOString()
  active.lastUpdateAt = active.finishedAt
  writeFile(active)
  active = null
}

function writeFile(state: ProgressFile): void {
  try {
    writeFileSync(getProgressPath(), JSON.stringify(state, null, 2) + '\n', 'utf-8')
  } catch (err) {
    // Progress is observability — never let it block the actual work.
    logger.warn('Failed to write progress file', { error: String(err) })
  }
}

// ---------------------------------------------------------------------------
// Reader API
// ---------------------------------------------------------------------------

/**
 * Read the current progress file. Returns null if no operation has run
 * yet; otherwise returns a snapshot. If the operation is `running` but
 * the last update is older than the stall threshold, the snapshot's
 * status is rewritten to `stalled` (the writer never sets it — only
 * readers detect this).
 */
export function read(): ProgressFile | null {
  const path = getProgressPath()
  if (!existsSync(path)) return null
  try {
    const content = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(content) as ProgressFile
    if (parsed.status === 'running') {
      const ageMs = Date.now() - new Date(parsed.lastUpdateAt).getTime()
      if (ageMs > STALL_THRESHOLD_MS) {
        return { ...parsed, status: 'stalled' }
      }
    }
    return parsed
  } catch (err) {
    logger.debug('Failed to read progress file', { error: String(err) })
    return null
  }
}

/** Remove the progress file entirely (for tests / cleanups). */
export function clear(): void {
  const path = getProgressPath()
  if (existsSync(path)) {
    try {
      unlinkSync(path)
    } catch (err) {
      logger.debug('Failed to clear progress file', { error: String(err) })
    }
  }
  active = null
}
