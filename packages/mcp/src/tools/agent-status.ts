/**
 * PlanFlow MCP — planflow_agent_status
 *
 * Poll the completion state of a background autoExecute agent.
 *
 * Three state sources (checked in order):
 *   1. <logDir>/<taskId>.done  — JSON marker written by the agent.
 *      Present → DONE / FAILED / in-progress (with phase).
 *   2. Log file mtime heuristic (cross-machine safe — no kill -0):
 *        mtime < 60s ago  → RUNNING
 *        mtime 1–5 min    → STALE (likely crashed)
 *        mtime > 5 min    → CRASHED
 *   3. No log at all → "no agent dispatched".
 *
 *   The old kill -0 check only worked when dispatcher and agent share a
 *   process table (same machine). Cloud agents run on different hosts, so
 *   kill -0 always returns ESRCH (→ false "CRASHED at 1m 22s").
 *   Mtime-based detection works regardless of process locality.
 */

import fsp from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { getMainRepoRoot } from '../worktree.js'
import { type ToolDefinition, createSuccessResult } from './types.js'

const AgentStatusInputSchema = z.object({
  taskId: z
    .string()
    .min(1)
    .describe('Task ID to check (e.g. "T4.13").'),
  logDir: z
    .string()
    .optional()
    .describe(
      'Directory where agent logs live. Defaults to <main repo root>/.planflow/agents.'
    ),
})

type AgentStatusInput = z.infer<typeof AgentStatusInputSchema>

interface DoneMarker {
  taskId: string
  status: 'done' | 'failed' | 'in-progress'
  phase?: 'implemented' | 'merged' | 'pushed' | 'task-done' | 'complete' | string | null
  prUrl?: string | null
  summary?: string | null
  branch?: string | null
  lastUpdate?: string | null
  finishedAt?: string | null
  duration?: number | null
  cost?: string | null
}

/**
 * Classify agent liveness from log file mtime — works across machines
 * (cloud dispatcher vs cloud worker) where kill -0 would always fail.
 *
 * Returns:
 *   'running'  — mtime within the last 60 seconds
 *   'stale'    — mtime 1–5 minutes ago (likely crashed, not 100% certain)
 *   'crashed'  — mtime > 5 minutes ago (almost certainly dead)
 *   'unknown'  — could not stat the file
 */
async function classifyByMtime(
  logPath: string
): Promise<'running' | 'stale' | 'crashed' | 'unknown'> {
  try {
    const stat = await fsp.stat(logPath)
    const ageMs = Date.now() - stat.mtimeMs
    if (ageMs < 60_000) return 'running'
    if (ageMs < 5 * 60_000) return 'stale'
    return 'crashed'
  } catch {
    return 'unknown'
  }
}

/** Pull the last N non-empty lines from a file (reads tail chunk). */
async function tailLines(logPath: string, n: number): Promise<string[]> {
  try {
    const stat = await fsp.stat(logPath)
    const chunkSize = Math.min(32_768, stat.size)
    const fd = await fsp.open(logPath, 'r')
    const buf = Buffer.alloc(chunkSize)
    await fd.read(buf, 0, chunkSize, stat.size - chunkSize)
    await fd.close()
    const text = buf.toString('utf8')
    return text
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .slice(-n)
  } catch {
    return []
  }
}

/**
 * Extract human-readable tool call descriptions from stream-json log lines.
 * Each line is a JSON object; we look for tool_use blocks.
 */
function extractLastActions(rawLines: string[], limit: number): string[] {
  const actions: string[] = []
  for (const line of rawLines) {
    try {
      const obj = JSON.parse(line.trim())
      // stream-json assistant turns contain content blocks
      const content = obj?.message?.content ?? obj?.content
      if (!Array.isArray(content)) continue
      for (const block of content) {
        if (block?.type === 'tool_use') {
          const name: string = block.name ?? 'unknown'
          // Grab one salient input field to surface in the summary
          const input: Record<string, unknown> = block.input ?? {}
          let detail = ''
          if (input['query']) detail = ` — ${String(input['query']).slice(0, 60)}`
          else if (input['file_path']) detail = ` — ${String(input['file_path']).slice(0, 60)}`
          else if (input['command']) detail = ` — ${String(input['command']).slice(0, 60)}`
          else if (input['taskId']) detail = ` — ${String(input['taskId'])}`
          actions.push(`${name}${detail}`)
        }
      }
    } catch {
      // Non-JSON lines (human-readable progress text) — skip
    }
  }
  return actions.slice(-limit)
}

function formatElapsed(startMs: number): string {
  const sec = Math.floor((Date.now() - startMs) / 1000)
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

/**
 * Walk up from `startDir` looking for a `.planflow/agents` directory that
 * actually exists on disk.  Stops at the filesystem root.
 *
 * This handles the mismatch between the dispatcher's cwd (Beka's Mac) and
 * the main repo root that the dispatcher used when writing the log — they
 * share the same git repo path structure, so walking upward will find
 * `.planflow/agents` inside the repo even if `process.cwd()` is a
 * sub-directory.
 */
async function findLogDirUpward(startDir: string): Promise<string | null> {
  let dir = startDir
  while (true) {
    const candidate = path.join(dir, '.planflow', 'agents')
    try {
      const st = await fsp.stat(candidate)
      if (st.isDirectory()) return candidate
    } catch {
      // Not found here — keep walking
    }
    const parent = path.dirname(dir)
    if (parent === dir) return null // filesystem root
    dir = parent
  }
}

export const agentStatusTool: ToolDefinition<AgentStatusInput> = {
  name: 'planflow_agent_status',

  description: `Check whether a background autoExecute agent is still running, done, or crashed.

Returns one of four states:
  • DONE    — agent finished (includes PR URL, summary, duration, cost if available)
  • RUNNING — agent process is alive (includes last 5 tool calls, elapsed time)
  • CRASHED — log exists but process died without writing the done marker
  • NONE    — no agent was dispatched for this task

Use this from the DISPATCHING session (the one that called planflow_task_start with
autoExecute:true) to check progress without tailing the log manually.`,

  inputSchema: AgentStatusInputSchema,

  async execute(input: AgentStatusInput): Promise<ReturnType<typeof createSuccessResult>> {
    // Resolve log directory.
    // Priority:
    //   1. Explicit override from caller (input.logDir)
    //   2. Walk upward from cwd looking for .planflow/agents that exists
    //   3. getMainRepoRoot(cwd) + /.planflow/agents  (may not exist yet)
    //   4. cwd + /.planflow/agents  (last resort)
    //
    // The upward walk (step 2) handles the real-world case where the
    // dispatcher calls this from a sub-directory or from a cwd that doesn't
    // perfectly match mainRepoRoot (e.g. macOS dispatcher vs cloud worker).
    let resolvedLogDir = input.logDir
    if (!resolvedLogDir) {
      const walked = await findLogDirUpward(process.cwd())
      if (walked) {
        resolvedLogDir = walked
      } else {
        const mainRoot = await getMainRepoRoot(process.cwd())
        resolvedLogDir = mainRoot
          ? path.join(mainRoot, '.planflow', 'agents')
          : path.join(process.cwd(), '.planflow', 'agents')
      }
    }

    // Find the most recent log file for this taskId.
    // Log names are <taskId>-<epochMs>.log — we pick the largest timestamp.
    let logPath: string | null = null
    let spawnedAtMs = 0
    try {
      const entries = await fsp.readdir(resolvedLogDir)
      const prefix = `${input.taskId}-`
      for (const entry of entries) {
        if (!entry.startsWith(prefix) || !entry.endsWith('.log')) continue
        const tsStr = entry.slice(prefix.length, -4) // strip prefix + ".log"
        const ts = parseInt(tsStr, 10)
        if (!Number.isFinite(ts)) continue
        if (ts > spawnedAtMs) {
          spawnedAtMs = ts
          logPath = path.join(resolvedLogDir, entry)
        }
      }
    } catch {
      // logDir doesn't exist
    }

    if (!logPath) {
      return createSuccessResult(
        `planflow_agent_status: ${input.taskId}\n\n` +
          `state: no agent dispatched for this task (no log found in ${resolvedLogDir})`
      )
    }

    // Check for done marker
    const doneMarkerPath = path.join(resolvedLogDir, `${input.taskId}.done`)
    let doneMarker: DoneMarker | null = null
    try {
      const raw = await fsp.readFile(doneMarkerPath, 'utf8')
      doneMarker = JSON.parse(raw) as DoneMarker
    } catch {
      // Not there yet
    }

    const elapsed = formatElapsed(spawnedAtMs)

    if (doneMarker) {
      // A "done" marker with status=in-progress means the agent wrote a
      // checkpoint but hasn't finished yet (or crashed mid-flight after
      // a checkpoint).  Keep the display useful by showing the phase.
      let stateLabel: string
      if (doneMarker.status === 'done') {
        stateLabel = '✅ DONE'
      } else if (doneMarker.status === 'failed') {
        stateLabel = '❌ FAILED'
      } else {
        // status="in-progress" — agent wrote a checkpoint, may still be running
        const mtimeClass = await classifyByMtime(logPath)
        if (mtimeClass === 'running') {
          stateLabel = `🔄 RUNNING (checkpoint: phase=${doneMarker.phase ?? 'unknown'})`
        } else if (mtimeClass === 'stale') {
          stateLabel = `⚠️  STALE — checkpoint phase=${doneMarker.phase ?? 'unknown'}, log inactive 1-5m`
        } else {
          stateLabel = `❌ CRASHED after checkpoint phase=${doneMarker.phase ?? 'unknown'}`
        }
      }
      const lines: string[] = [
        `planflow_agent_status: ${input.taskId}`,
        ``,
        `━━━ Status ━━━━━━━━━━━━━━━━━━━━`,
        `state:    ${stateLabel}`,
        `elapsed:  ${elapsed}`,
        `log:      ${logPath}`,
        ``,
        `━━━ Checkpoint summary ━━━━━━━━`,
      ]
      if (doneMarker.phase) lines.push(`phase:    ${doneMarker.phase}`)
      if (doneMarker.duration != null) lines.push(`duration: ${doneMarker.duration}s`)
      if (doneMarker.cost) lines.push(`cost:     ${doneMarker.cost}`)
      if (doneMarker.prUrl) lines.push(`PR:       ${doneMarker.prUrl}`)
      if (doneMarker.branch && !doneMarker.prUrl) lines.push(`branch:   ${doneMarker.branch}`)
      if (doneMarker.summary) lines.push(`summary:  ${doneMarker.summary}`)
      if (doneMarker.finishedAt) lines.push(`finished: ${doneMarker.finishedAt}`)
      if (doneMarker.lastUpdate && !doneMarker.finishedAt) lines.push(`updated:  ${doneMarker.lastUpdate}`)
      lines.push(``)
      if (doneMarker.status === 'done') {
        lines.push(
          `Worktree cleanup (if a worktree was created):\n` +
            `  planflow_worktree_remove(taskId: "${input.taskId}")`
        )
      } else if (doneMarker.status !== 'in-progress') {
        lines.push(`Re-dispatch (will resume from last checkpoint):\n` +
          `  planflow_task_start(taskId: "${input.taskId}", autoExecute: true)`)
      }
      return createSuccessResult(lines.join('\n'))
    }

    // No done marker at all — classify by log mtime (cross-machine safe)
    const mtimeClass = await classifyByMtime(logPath)

    // Extract last actions from log tail (useful for all live/stale/crashed states)
    const rawTail = await tailLines(logPath, 200)
    const lastActions = extractLastActions(rawTail, 5)

    if (mtimeClass === 'running') {
      const lines: string[] = [
        `planflow_agent_status: ${input.taskId}`,
        ``,
        `━━━ Status ━━━━━━━━━━━━━━━━━━━━`,
        `state:    🔄 RUNNING`,
        `elapsed:  ${elapsed}`,
        `log:      ${logPath}`,
        ``,
      ]
      if (lastActions.length > 0) {
        lines.push(`━━━ Last actions ━━━━━━━━━━━━━━`)
        lastActions.forEach((a, i) => lines.push(`${i + 1}. ${a}`))
        lines.push(``)
      }
      lines.push(`To stream live output:  tail -f ${logPath}`)
      return createSuccessResult(lines.join('\n'))
    }

    // stale or crashed — no done marker
    const isCrashed = mtimeClass === 'crashed' || mtimeClass === 'unknown'
    const stateLabel = isCrashed ? '❌ CRASHED' : '⚠️  STALE (likely crashed — log inactive 1-5m)'
    const lastLine = rawTail[rawTail.length - 1] ?? '(empty log)'
    const lines: string[] = [
      `planflow_agent_status: ${input.taskId}`,
      ``,
      `━━━ Status ━━━━━━━━━━━━━━━━━━━━`,
      `state:    ${stateLabel}`,
      `elapsed:  ${elapsed}`,
      `log:      ${logPath}`,
      ``,
      `━━━ Last log line ━━━━━━━━━━━━━`,
      lastLine.slice(0, 300),
      ``,
      `The agent process exited without writing a done marker.`,
      `Review the full log, then re-dispatch if needed:`,
      `  planflow_task_start(taskId: "${input.taskId}", autoExecute: true)`,
    ]
    return createSuccessResult(lines.join('\n'))
  },
}
