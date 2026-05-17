/**
 * PlanFlow MCP — planflow_agent_status
 *
 * Poll the completion state of a background autoExecute agent.
 *
 * Three state sources (checked in order):
 *   1. <logDir>/<taskId>.done  — JSON marker written by the agent at the end.
 *      Present → DONE (or FAILED if agent wrote status: "failed").
 *   2. PID from the first line of the log + `kill -0 <pid>` → RUNNING.
 *   3. Log exists but PID is dead and no .done → CRASHED.
 *   4. No log at all → "no agent dispatched".
 */

import fs from 'node:fs'
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
  status: 'done' | 'failed'
  prUrl?: string | null
  summary?: string | null
  branch?: string | null
  finishedAt?: string | null
  duration?: number | null
  cost?: string | null
}

/** Parse "PID: <n>" from the first JSON line of the log (stream-json format). */
function parsePidFromLog(logPath: string): number | null {
  try {
    const fd = fs.openSync(logPath, 'r')
    // Read the very first line without loading the whole file.
    const buf = Buffer.alloc(4096)
    const bytesRead = fs.readSync(fd, buf, 0, 4096, 0)
    fs.closeSync(fd)
    const firstLines = buf.subarray(0, bytesRead).toString('utf8').split('\n')
    for (const line of firstLines.slice(0, 3)) {
      // The first line we write is: {"pid":<n>,"taskId":"...","spawnedAt":"..."}
      try {
        const obj = JSON.parse(line.trim())
        if (typeof obj?.pid === 'number') return obj.pid as number
      } catch {
        // Not JSON — skip
      }
    }
  } catch {
    // Unreadable
  }
  return null
}

/** True if a process with this PID is still alive in the current OS session. */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
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

export const agentStatusTool: ToolDefinition<AgentStatusInput> = {
  name: 'planflow_agent_status',

  description: `Check whether a background autoExecute agent is still running, done, or crashed.

Returns one of four states:
  • DONE    — agent finished (includes PR URL, summary, duration, cost if available)
  • RUNNING — agent process is alive (includes last 5 tool calls, elapsed time)
  • CRASHED — log exists but process died without writing the done marker
  • NONE    — no agent was dispatched for this task

Use this from the DISPATCHING session (the one that called planflow_task_start with
autoExecute:true) to check progress without tailing the log manually.

Parameters:
  - taskId (required): Task ID that was dispatched (e.g. "T4.13")
  - logDir (optional): Override the agents log directory`,

  inputSchema: AgentStatusInputSchema,

  async execute(input: AgentStatusInput): Promise<ReturnType<typeof createSuccessResult>> {
    // Resolve log directory — default to <main repo root>/.planflow/agents
    let resolvedLogDir = input.logDir
    if (!resolvedLogDir) {
      const mainRoot = await getMainRepoRoot(process.cwd())
      resolvedLogDir = mainRoot
        ? path.join(mainRoot, '.planflow', 'agents')
        : path.join(process.cwd(), '.planflow', 'agents')
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
      const status = doneMarker.status === 'failed' ? '❌ FAILED' : '✅ DONE'
      const lines: string[] = [
        `planflow_agent_status: ${input.taskId}`,
        ``,
        `━━━ Status ━━━━━━━━━━━━━━━━━━━━`,
        `state:    ${status}`,
        `elapsed:  ${elapsed}`,
        `log:      ${logPath}`,
        ``,
        `━━━ Done summary ━━━━━━━━━━━━━━`,
      ]
      if (doneMarker.duration != null) lines.push(`duration: ${doneMarker.duration}s`)
      if (doneMarker.cost) lines.push(`cost:     ${doneMarker.cost}`)
      if (doneMarker.prUrl) lines.push(`PR:       ${doneMarker.prUrl}`)
      if (doneMarker.branch && !doneMarker.prUrl) lines.push(`branch:   ${doneMarker.branch}`)
      if (doneMarker.summary) lines.push(`summary:  ${doneMarker.summary}`)
      if (doneMarker.finishedAt) lines.push(`finished: ${doneMarker.finishedAt}`)
      lines.push(``)
      lines.push(
        `Worktree cleanup (if a worktree was created):\n` +
          `  planflow_worktree_remove(taskId: "${input.taskId}")`
      )
      return createSuccessResult(lines.join('\n'))
    }

    // No done marker — check if process is alive
    const pid = parsePidFromLog(logPath)
    const alive = pid !== null && isProcessAlive(pid)

    // Extract last actions from log tail
    const rawTail = await tailLines(logPath, 200)
    const lastActions = extractLastActions(rawTail, 5)

    if (alive) {
      const lines: string[] = [
        `planflow_agent_status: ${input.taskId}`,
        ``,
        `━━━ Status ━━━━━━━━━━━━━━━━━━━━`,
        `state:    🔄 RUNNING`,
        `pid:      ${pid}`,
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

    // Log exists, no done marker, process dead → CRASHED
    const lastLine = rawTail[rawTail.length - 1] ?? '(empty log)'
    const lines: string[] = [
      `planflow_agent_status: ${input.taskId}`,
      ``,
      `━━━ Status ━━━━━━━━━━━━━━━━━━━━`,
      `state:    ❌ CRASHED`,
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
