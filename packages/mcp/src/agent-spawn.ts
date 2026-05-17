/**
 * PlanFlow MCP — Headless Claude agent spawner
 *
 * Forks a detached `claude` CLI process so it outlives the MCP session.
 * The child writes everything to a file-backed log; callers can `tail -f`
 * that path to watch progress without polling the MCP server.
 *
 * Key design choices:
 *   • `detached: true` + `.unref()` — the MCP process can exit without
 *     waiting for the agent. The OS gives the child its own process group.
 *   • We open the log fd in the parent, pass it as stdio, then close it
 *     immediately — the child holds its own file-descriptor reference and
 *     the parent doesn't accumulate open handles.
 *   • stdin is 'ignore' so the headless agent never blocks waiting for input.
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { logger } from './logger.js'

export interface SpawnOpts {
  /** Working directory for the claude CLI (worktree root or main repo root). */
  cwd: string
  /** Full directive prompt — the agent's marching orders. */
  prompt: string
  /** PlanFlow task ID, used to name the log file. */
  taskId: string
  /** Directory where log files are written (created if missing). */
  logDir: string
}

export interface SpawnResult {
  pid: number
  logPath: string
}

/**
 * Spawn a headless Claude agent that runs autonomously in `cwd`.
 *
 * Returns immediately with `{ pid, logPath }` — the agent keeps running
 * in the background. Throws if the `claude` binary is not on PATH (ENOENT)
 * or if stdio setup fails.
 */
export async function spawnHeadlessAgent(opts: SpawnOpts): Promise<SpawnResult> {
  const { cwd, prompt, taskId, logDir } = opts

  await fsp.mkdir(logDir, { recursive: true })

  const logPath = path.join(logDir, `${taskId}-${Date.now()}.log`)

  // Open synchronously so we can pass the raw fd to spawn's stdio array.
  // 'a' (append) means a pre-existing log from a previous run is not truncated.
  const logFd = fs.openSync(logPath, 'a')

  let child: ReturnType<typeof spawn>
  try {
    child = spawn(
      'claude',
      [
        '-p', prompt,
        '--dangerously-skip-permissions',
        '--output-format', 'stream-json',
        '--verbose',
      ],
      {
        cwd,
        detached: true,
        // stdin = ignore, stdout + stderr → log file fd
        stdio: ['ignore', logFd, logFd],
      }
    )
  } catch (err) {
    fs.closeSync(logFd)
    const msg = err instanceof Error ? err.message : String(err)
    // ENOENT from spawn means the binary wasn't found on PATH.
    const hint = msg.includes('ENOENT')
      ? ' — `claude` CLI not found on PATH. Install Claude Code: https://claude.ai/download'
      : ''
    throw new Error(`Failed to spawn claude agent: ${msg}${hint}`)
  }

  // Parent releases the fd; the child process holds its own reference.
  fs.closeSync(logFd)

  if (!child.pid) {
    throw new Error('claude agent spawned but has no PID — spawn may have failed silently')
  }

  // Detach so our process exit doesn't kill the agent.
  child.unref()

  logger.info('Headless agent spawned', { taskId, pid: child.pid, cwd, logPath })

  child.on('error', (err) => {
    // This fires for ENOENT when detached is true — log it so it appears
    // in MCP server logs even though the caller already returned.
    logger.error('Headless agent process error', { taskId, error: String(err) })
  })

  return { pid: child.pid, logPath }
}
