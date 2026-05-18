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
 *   • A minimal MCP config (planflow-mcp only) is written to logDir and
 *     passed via --mcp-config --strict-mcp-config, saving ~15k tokens/turn
 *     by excluding all other user-configured MCP servers.
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
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
  /** Model alias to pass via --model. e.g. 'sonnet' or 'opus'. */
  model?: string
}

export interface SpawnResult {
  pid: number
  logPath: string
  /** Path to minimal MCP config written for this spawn, or null if not written. */
  mcpConfigPath: string | null
  /** Model actually used for this spawn. */
  model: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimal MCP config helpers
// ─────────────────────────────────────────────────────────────────────────────

interface McpServerEntry {
  type?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  [key: string]: unknown
}

interface McpConfig {
  mcpServers?: Record<string, McpServerEntry>
  [key: string]: unknown
}

/**
 * Try to read a JSON file; returns null on any error (missing, parse fail, etc.).
 */
async function tryReadJson(filePath: string): Promise<unknown> {
  try {
    const text = await fsp.readFile(filePath, 'utf8')
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Find the planflow-mcp entry from the user's Claude config.
 * Searches in priority order:
 *   1. $CLAUDE_CONFIG_DIR/mcp_servers.json
 *   2. ~/.claude.json  (Claude Code CLI)
 *   3. ~/Library/Application Support/Claude/claude_desktop_config.json  (Claude Desktop)
 *
 * Returns null if not found or on any read/parse error.
 */
async function findPlanflowMcpEntry(): Promise<McpServerEntry | null> {
  const home = os.homedir()

  const candidates: string[] = []

  const claudeConfigDir = process.env['CLAUDE_CONFIG_DIR']
  if (claudeConfigDir) {
    candidates.push(path.join(claudeConfigDir, 'mcp_servers.json'))
  }
  candidates.push(path.join(home, '.claude.json'))
  candidates.push(path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'))

  for (const filePath of candidates) {
    const data = await tryReadJson(filePath)
    if (!data || typeof data !== 'object') continue

    const config = data as McpConfig
    const servers = config['mcpServers']
    if (!servers || typeof servers !== 'object') continue

    // Handle both hyphen and underscore naming conventions.
    const entry = servers['planflow-mcp'] ?? servers['planflow_mcp']
    if (entry && typeof entry === 'object') {
      logger.info('Found planflow-mcp entry in config', { source: filePath })
      return entry as McpServerEntry
    }
  }

  return null
}

/**
 * Write a minimal MCP config file containing only planflow-mcp.
 * Returns the path to the written file, or null if writing failed.
 */
async function writeMinimalMcpConfig(
  logDir: string,
  taskId: string,
  entry: McpServerEntry
): Promise<string | null> {
  const configPath = path.join(logDir, `${taskId}-mcp.json`)
  const config: McpConfig = {
    mcpServers: {
      'planflow-mcp': entry,
    },
  }
  try {
    await fsp.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8')
    return configPath
  } catch (err) {
    logger.warn('Failed to write minimal MCP config', { error: String(err), configPath })
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Spawn
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Spawn a headless Claude agent that runs autonomously in `cwd`.
 *
 * Returns immediately with `{ pid, logPath, mcpConfigPath, model }` — the
 * agent keeps running in the background. Throws if the `claude` binary is
 * not on PATH (ENOENT) or if stdio setup fails.
 */
export async function spawnHeadlessAgent(opts: SpawnOpts): Promise<SpawnResult> {
  const { cwd, prompt, taskId, logDir, model = 'sonnet' } = opts

  await fsp.mkdir(logDir, { recursive: true })

  const logPath = path.join(logDir, `${taskId}-${Date.now()}.log`)

  // ── Minimal MCP config ──────────────────────────────────────────────────
  // Extract the planflow-mcp entry and write a stripped-down config so the
  // spawned agent loads only that server — saves ~15k tokens of tool
  // descriptions per turn from other MCP servers the user has installed.
  let mcpConfigPath: string | null = null
  const planflowEntry = await findPlanflowMcpEntry()
  if (planflowEntry) {
    mcpConfigPath = await writeMinimalMcpConfig(logDir, taskId, planflowEntry)
    if (mcpConfigPath) {
      console.log(`[PlanFlow] Minimal MCP config: ${mcpConfigPath}  (planflow-mcp only, saves ~15k tokens/turn)`)
    }
  } else {
    logger.warn('planflow-mcp not found in any Claude config — agent will use default MCP config', { taskId })
  }

  // ── Build spawn args ────────────────────────────────────────────────────
  const spawnArgs: string[] = [
    '-p', prompt,
    '--dangerously-skip-permissions',
    '--output-format', 'stream-json',
    '--verbose',
    '--model', model,
  ]

  if (mcpConfigPath) {
    // --mcp-config supplies the minimal config; --strict-mcp-config ensures
    // no other servers from the user's global config are loaded alongside it.
    spawnArgs.push('--mcp-config', mcpConfigPath, '--strict-mcp-config')
  }

  // 'w' (truncate) so every new dispatch starts a clean log — we don't
  // want PID from a previous run bleeding into the new session.
  const logFd = fs.openSync(logPath, 'w')

  let child: ReturnType<typeof spawn>
  try {
    child = spawn(
      'claude',
      spawnArgs,
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

  // Write a PID header as the first line of the log so planflow_agent_status
  // can read the PID without scanning the whole file.
  const header = JSON.stringify({ pid: child.pid, taskId, spawnedAt: new Date().toISOString(), model })
  const headerFd = fs.openSync(logPath, 'r+')
  fs.writeSync(headerFd, header + '\n', 0)
  fs.closeSync(headerFd)

  logger.info('Headless agent spawned', { taskId, pid: child.pid, cwd, logPath, model, mcpConfigPath })

  child.on('error', (err) => {
    // This fires for ENOENT when detached is true — log it so it appears
    // in MCP server logs even though the caller already returned.
    logger.error('Headless agent process error', { taskId, error: String(err) })
  })

  return { pid: child.pid, logPath, mcpConfigPath, model }
}
