/**
 * Sequential task pipeline orchestrator (server-side).
 *
 * A pipeline runs a project's tasks one at a time, in order. For each task it
 * fires the project's Claude Code routine (a cloud session), which implements
 * the task, opens & merges a PR, and marks it done. The pipeline only advances
 * to the next task once the current one is DONE (PR merged). Because this runs
 * on the server (node-cron worker), it keeps going even if the user's laptop is
 * off. State is in-memory (the routine token is never persisted); a server
 * restart clears active pipelines, which the user simply re-starts.
 */
import cron from 'node-cron'
import { eq } from 'drizzle-orm'
import { getDbClient, schema } from '../db/index.js'
import { loggers } from '../lib/logger.js'
import { encryptSecret, decryptSecret } from '../lib/crypto.js'

const log = loggers.server

const ROUTINE_BETA = 'experimental-cc-routine-2026-04-01'
const REFIRE_COOLDOWN_MS = 30 * 60 * 1000 // don't re-fire the same task within 30 min
const STALL_TIMEOUT_MS = 60 * 60 * 1000 // an IN_PROGRESS task with no PR after 60 min is stalled

export type PipelineStatus = 'running' | 'paused' | 'completed' | 'error'

interface Pipeline {
  projectId: string
  fireUrl: string
  token: string // in-memory only, never persisted
  status: PipelineStatus
  currentTaskId?: string
  sessionUrl?: string
  lastFiredTaskId?: string
  lastFiredAt?: number
  startedAt: number
  message?: string
}

const pipelines = new Map<string, Pipeline>()

// Public state (token stripped) for API responses.
export interface PipelineState {
  projectId: string
  status: PipelineStatus
  currentTaskId?: string
  sessionUrl?: string
  message?: string
  startedAt: number
}

function publicState(p: Pipeline): PipelineState {
  return {
    projectId: p.projectId,
    status: p.status,
    currentTaskId: p.currentTaskId,
    sessionUrl: p.sessionUrl,
    message: p.message,
    startedAt: p.startedAt,
  }
}

export function startPipeline(projectId: string, fireUrl: string, token: string): PipelineState {
  const p: Pipeline = {
    projectId,
    fireUrl,
    token,
    status: 'running',
    startedAt: Date.now(),
    message: 'Starting…',
  }
  pipelines.set(projectId, p)
  void persist(p)
  void tickOne(projectId)
  return publicState(p)
}

export function pausePipeline(projectId: string): PipelineState | null {
  const p = pipelines.get(projectId)
  if (!p) return null
  p.status = 'paused'
  p.message = 'Paused'
  void persist(p)
  return publicState(p)
}

export function resumePipeline(projectId: string): PipelineState | null {
  const p = pipelines.get(projectId)
  if (!p) return null
  p.status = 'running'
  p.message = 'Resuming…'
  void persist(p)
  void tickOne(projectId)
  return publicState(p)
}

export function stopPipeline(projectId: string): boolean {
  void removeFromDb(projectId)
  return pipelines.delete(projectId)
}

// MARK: - Durable persistence (survives API restarts)

async function persist(p: Pipeline): Promise<void> {
  const row = {
    projectId: p.projectId,
    status: p.status,
    fireUrl: p.fireUrl,
    tokenEncrypted: encryptSecret(p.token),
    currentTaskId: p.currentTaskId ?? null,
    sessionUrl: p.sessionUrl ?? null,
    lastFiredTaskId: p.lastFiredTaskId ?? null,
    lastFiredAt: p.lastFiredAt ? new Date(p.lastFiredAt) : null,
    message: p.message ?? null,
    startedAt: new Date(p.startedAt),
    updatedAt: new Date(),
  }
  try {
    const db = getDbClient()
    await db
      .insert(schema.taskPipelines)
      .values(row)
      .onConflictDoUpdate({ target: schema.taskPipelines.projectId, set: row })
  } catch (e) {
    log.warn({ err: e }, 'pipeline persist failed (run db:push to create task_pipelines?)')
  }
}

async function removeFromDb(projectId: string): Promise<void> {
  try {
    await getDbClient().delete(schema.taskPipelines).where(eq(schema.taskPipelines.projectId, projectId))
  } catch {
    /* best effort */
  }
}

/** Reloads active pipelines from the DB on boot so they resume after a restart. */
export async function loadPipelinesFromDb(): Promise<void> {
  try {
    const rows = await getDbClient().select().from(schema.taskPipelines)
    for (const r of rows) {
      if (r.status === 'completed') continue
      pipelines.set(r.projectId, {
        projectId: r.projectId,
        fireUrl: r.fireUrl,
        token: decryptSecret(r.tokenEncrypted),
        status: r.status as PipelineStatus,
        currentTaskId: r.currentTaskId ?? undefined,
        sessionUrl: r.sessionUrl ?? undefined,
        lastFiredTaskId: r.lastFiredTaskId ?? undefined,
        lastFiredAt: r.lastFiredAt ? r.lastFiredAt.getTime() : undefined,
        message: r.message ?? undefined,
        startedAt: r.startedAt.getTime(),
      })
    }
    if (pipelines.size > 0) log.info({ count: pipelines.size }, 'resumed pipelines from db')
  } catch (e) {
    log.warn({ err: e }, 'pipeline load failed (run db:push to create task_pipelines?)')
  }
}

export function getPipeline(projectId: string): PipelineState | null {
  const p = pipelines.get(projectId)
  return p ? publicState(p) : null
}

// MARK: - Core tick

type TaskRow = typeof schema.tasks.$inferSelect

async function fetchOrderedTasks(projectId: string): Promise<TaskRow[]> {
  const db = getDbClient()
  const rows = await db.select().from(schema.tasks).where(eq(schema.tasks.projectId, projectId))
  return rows.sort(
    (a, b) =>
      (a.displayOrder ?? 0) - (b.displayOrder ?? 0) ||
      String(a.taskId).localeCompare(String(b.taskId), undefined, { numeric: true })
  )
}

async function tickOne(projectId: string): Promise<void> {
  const p = pipelines.get(projectId)
  if (!p || p.status !== 'running') return

  let tasks: TaskRow[]
  try {
    tasks = await fetchOrderedTasks(projectId)
  } catch (e) {
    p.status = 'error'
    p.message = `Failed to read tasks: ${e instanceof Error ? e.message : String(e)}`
    return
  }

  const current = tasks.find((t) => t.status !== 'DONE')
  if (!current) {
    p.status = 'completed'
    p.currentTaskId = undefined
    p.message = 'All tasks complete 🎉'
    return
  }
  p.currentTaskId = current.taskId

  // A merged PR means the task is finished even if the agent didn't flip the
  // status — mark it DONE ourselves and immediately re-evaluate for the next.
  if (current.status === 'IN_PROGRESS' && current.githubPrState === 'merged') {
    try {
      const db = getDbClient()
      await db.update(schema.tasks).set({ status: 'DONE' }).where(eq(schema.tasks.id, current.id))
    } catch {
      /* best effort */
    }
    return void tickOne(projectId)
  }

  if (current.status === 'IN_PROGRESS') {
    const hasPR = !!current.githubPrState
    const firedAgo = p.lastFiredAt ? Date.now() - p.lastFiredAt : Number.POSITIVE_INFINITY
    // Stalled: we started this task, but no PR ever appeared. The session likely
    // failed to make progress — mark it blocked and pause rather than leave it
    // stuck "active" forever.
    if (!hasPR && p.lastFiredTaskId === current.taskId && firedAgo > STALL_TIMEOUT_MS) {
      await setTaskStatus(current.id, 'BLOCKED')
      p.sessionUrl = undefined
      p.status = 'paused'
      p.message = `Task ${current.taskId} made no progress (no PR after ${Math.round(
        STALL_TIMEOUT_MS / 60000
      )} min) — marked blocked, pipeline paused. Check the session, then resume.`
      return
    }
    p.message = hasPR
      ? `${current.taskId}: PR open — waiting for it to merge`
      : `Working on ${current.taskId}…`
    return // gate: do not advance until merged
  }

  if (current.status === 'BLOCKED') {
    p.status = 'paused'
    p.message = `Task ${current.taskId} is BLOCKED — paused. Resolve it, then resume.`
    return
  }

  // current is TODO — fire it, unless we fired it recently and it hasn't started.
  const now = Date.now()
  if (p.lastFiredTaskId === current.taskId && p.lastFiredAt && now - p.lastFiredAt < REFIRE_COOLDOWN_MS) {
    p.message = `Started ${current.taskId} — waiting for the cloud session to begin`
    return
  }
  await fireTask(p, current)
}

async function fireTask(p: Pipeline, task: TaskRow): Promise<void> {
  const text = buildTaskPrompt(p.projectId, task)
  try {
    const res = await fetch(p.fireUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${p.token}`,
        'anthropic-beta': ROUTINE_BETA,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    })
    if (res.ok) {
      const data = (await res.json().catch(() => null)) as { claude_code_session_url?: string } | null
      p.lastFiredTaskId = task.taskId
      p.lastFiredAt = Date.now()
      p.sessionUrl = data?.claude_code_session_url ?? p.sessionUrl
      p.message = `Started ${task.taskId}: ${task.name}`
      // Mark the task active immediately — a session is now working on it.
      await setTaskStatus(task.id, 'IN_PROGRESS')
      void persist(p)
      log.info({ projectId: p.projectId, taskId: task.taskId, session: p.sessionUrl }, 'pipeline fired task')
    } else {
      const body = await res.text()
      // The session did not start — do not leave the task marked active.
      await setTaskStatus(task.id, 'TODO')
      p.status = 'error'
      p.message = `Failed to start ${task.taskId} (HTTP ${res.status}). Check the routine URL/token.`
      log.error({ status: res.status, body }, 'pipeline fire failed')
    }
  } catch (e) {
    await setTaskStatus(task.id, 'TODO')
    p.status = 'error'
    p.message = `Error starting ${task.taskId}: ${e instanceof Error ? e.message : String(e)}`
  }
}

async function setTaskStatus(taskDbId: string, status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'): Promise<void> {
  try {
    await getDbClient().update(schema.tasks).set({ status }).where(eq(schema.tasks.id, taskDbId))
  } catch {
    /* best effort */
  }
}

function buildTaskPrompt(projectId: string, task: TaskRow): string {
  const lines: string[] = [
    `Execute EXACTLY this PlanFlow task and NOTHING else: ${task.taskId}.`,
    '',
    'TASK CONTEXT:',
    `- PlanFlow project ID: ${projectId}`,
    `- Task ID: ${task.taskId}`,
    `- Title: ${task.name}`,
  ]
  if (task.description) lines.push(`- Description: ${task.description}`)
  if (task.complexity) lines.push(`- Complexity: ${task.complexity}`)
  if (task.estimatedHours) lines.push(`- Estimated hours: ${task.estimatedHours}`)
  if (task.dependencies && task.dependencies.length > 0) {
    lines.push(`- Depends on: ${task.dependencies.join(', ')} (these should already be done)`)
  }

  lines.push(
    '',
    'GATHER FULL CONTEXT before writing any code:',
    `1. Call planflow_project_plan(projectId: "${projectId}") and read the section for ${task.taskId} — the plan holds the detailed spec and acceptance criteria.`,
    `2. Call planflow_comments(projectId: "${projectId}", taskId: "${task.taskId}") to read any notes or decisions on this task.`,
    `3. Use planflow_search / planflow_explore to find the relevant existing code, and read CLAUDE.md and neighbouring files to match the repo's conventions.`,
    '',
    'STRICT RULES:',
    `- Work on task ${task.taskId} ONLY. Do NOT call planflow_task_next. Do NOT choose, start, or implement any other task.`,
    `- The taskId for every planflow tool is exactly "${task.taskId}". Never substitute a different taskId.`,
    `- If task ${task.taskId} is already DONE, or genuinely does not apply to this repository, STOP immediately and do nothing — do NOT pick another task.`,
    '',
    'STEPS:',
    `1. planflow_task_start(projectId: "${projectId}", taskId: "${task.taskId}").`,
    `2. Implement task ${task.taskId} fully on a \`claude/task-${task.taskId}\` branch, honouring the plan's acceptance criteria. Run the build and tests until they pass.`,
    '3. Open a pull request. Resolve any conflicts so it is mergeable, then MERGE the PR into the default branch yourself.',
    `4. Only after the PR is merged, planflow_task_done(projectId: "${projectId}", taskId: "${task.taskId}") with a short summary of what shipped.`
  )
  return lines.join('\n')
}

// MARK: - Worker

let worker: cron.ScheduledTask | null = null

export function initPipelineWorker(): void {
  if (worker) return
  void loadPipelinesFromDb()
  worker = cron.schedule('*/3 * * * *', async () => {
    for (const projectId of pipelines.keys()) {
      try {
        await tickOne(projectId)
        const p = pipelines.get(projectId)
        if (p) void persist(p)
      } catch (e) {
        log.error({ projectId, err: e }, 'pipeline tick error')
      }
    }
  })
  log.info('Pipeline worker started (every 3 min)')
}
