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
//
// When the calling tool was given a `sendProgress` callback by the MCP
// server (i.e. the client included a progressToken in the request), we
// fan every update through it so Claude can render a live status line.
// ---------------------------------------------------------------------------

type SendProgress = (progress: number, total?: number, message?: string) => Promise<void>

let active: ProgressFile | null = null
let activeNotifier: SendProgress | null = null

export function start(
  tool: string,
  label: string,
  total?: number,
  sendProgress?: SendProgress
): void {
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
  activeNotifier = sendProgress ?? null
  writeFile(active)
  // Fire an initial 0% notification so the client gets an immediate
  // "running" hint instead of staring at a blank spinner until the
  // first update().
  if (activeNotifier) {
    void activeNotifier(0, total, label)
  }
  logger.debug('Progress started', { tool, label, total, hasNotifier: !!sendProgress })
}

export function update(
  patch: Partial<Pick<ProgressFile, 'label' | 'current' | 'total' | 'etaSeconds'>>
): void {
  if (!active) return
  Object.assign(active, patch)
  active.lastUpdateAt = new Date().toISOString()
  writeFile(active)

  // Mirror to the MCP client. We swallow errors so a transport blip
  // doesn't take down the actual indexing run.
  if (activeNotifier) {
    void activeNotifier(active.current ?? 0, active.total, active.label)
  }
}

export function complete(summary?: string): void {
  if (!active) return
  active.status = 'done'
  active.summary = summary
  active.finishedAt = new Date().toISOString()
  active.lastUpdateAt = active.finishedAt
  writeFile(active)
  // Final 100% notification — gives Claude a clean "Done" frame.
  if (activeNotifier && active.total !== undefined) {
    void activeNotifier(active.total, active.total, summary ?? 'Done')
  }
  // Clear the in-memory handle but keep the file for a short post-mortem
  // window — `planflow-mcp progress` still surfaces "done" results so the
  // user can verify the run succeeded.
  active = null
  activeNotifier = null
}

export function fail(error: string): void {
  if (!active) return
  active.status = 'failed'
  active.error = error
  active.finishedAt = new Date().toISOString()
  active.lastUpdateAt = active.finishedAt
  writeFile(active)
  if (activeNotifier) {
    void activeNotifier(active.current ?? 0, active.total, `Failed: ${error}`)
  }
  active = null
  activeNotifier = null
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
