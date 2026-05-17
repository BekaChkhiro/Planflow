/**
 * PlanFlow MCP Server — planflow_task_start
 *
 * Compound tool that bootstraps work on a single task in one call.
 *
 * What used to take a session of `task_list` → `recall` → `working_on`
 * → `search` → `listKnowledge` (5+ tool calls, ~30s of stop-and-go) is
 * now a single call that fans out to all of them in parallel and
 * returns a single structured context block:
 *
 *   • The task itself (status, dependencies, description)
 *   • Comments + activity
 *   • Likely-relevant code (auto-searched by task title)
 *   • Knowledge entries that mention task title terms
 *   • A branch-name suggestion derived from the task ID + title
 *
 * Side effect: signals "working on this task" in the same call so
 * teammates see your focus immediately.
 */

import path from 'node:path'
import { z } from 'zod'
import { getApiClient } from '../api-client.js'
import { isAuthenticated } from '../config.js'
import { AuthError, ApiError } from '../errors.js'
import { logger } from '../logger.js'
import {
  type ToolDefinition,
  createSuccessResult,
  createErrorResult,
} from './types.js'
import { getCurrentProjectId } from './use.js'
import {
  createWorktree,
  detectCurrentWorktree,
  getMainRepoRoot,
  getRepoRoot,
  readState,
  registerMainRepoTask,
} from '../worktree.js'
import { spawnHeadlessAgent } from '../agent-spawn.js'
import { coerceBoolean } from './_coerce.js'

const TaskStartInputSchema = z.object({
  projectId: z
    .string()
    .uuid('Project ID must be a valid UUID')
    .optional()
    .describe('Project ID. Uses current project from planflow_use() if omitted.'),
  taskId: z
    .string()
    .min(1)
    .describe('Task ID to start working on (e.g., "T1.1", "T2.3").'),
  searchQuery: z
    .string()
    .optional()
    .describe(
      'Override the auto-search query (defaults to the task title). Useful when the title is generic and you have a sharper term in mind.'
    ),
  worktreeMode: z
    .enum(['auto', 'force', 'never'])
    .default('auto')
    .describe(
      'How to handle parallel task work via git worktrees:\n' +
        '  • auto (default): create a worktree only when ANOTHER task is already active in this checkout — keeps parallel work isolated.\n' +
        '  • force: always create a fresh worktree for this task.\n' +
        '  • never: stay in the current folder no matter what.'
    ),
  autoExecute: coerceBoolean()
    .optional()
    .describe(
      'When true, dispatch a headless Claude agent in the worktree to autonomously complete the task end-to-end (implement → test → commit → push → cleanup). MCP returns immediately with the log path. Default: false. Requires `claude` CLI on PATH.'
    ),
  mergeStrategy: z
    .enum(['pr', 'merge-master', 'none'])
    .optional()
    .default('pr')
    .describe(
      'How the autonomous agent finishes the task. `pr` opens a pull request (safe default). `merge-master` merges directly to the main branch and pushes (destructive). `none` leaves the branch unmerged. Only used when autoExecute=true.'
    ),
})

type TaskStartInput = z.infer<typeof TaskStartInputSchema>

/**
 * Convert a task name like "Add user auth" into a kebab-case slug
 * suitable for a git branch — strips punctuation, lower-cases, joins
 * with hyphens, caps length so it doesn't blow past common branch
 * length limits.
 */
function slugify(name: string, maxLen = 40): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return slug.length > maxLen ? slug.slice(0, maxLen).replace(/-$/, '') : slug
}

function formatRelativeTime(input: string | Date | null | undefined): string {
  if (!input) return 'unknown'
  const date = typeof input === 'string' ? new Date(input) : input
  const ms = Date.now() - date.getTime()
  const minutes = Math.floor(ms / 60_000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 30) return `${days}d ago`
  return date.toLocaleDateString()
}

// ────────────────────────────────────────────────────────────────────
// Worktree decision helpers
// ────────────────────────────────────────────────────────────────────

type WorktreeOutcome =
  | { kind: 'in-place'; reason: string; mainRepoRoot: string }
  | { kind: 'redirect'; path: string; branch: string; port: number | null; reason: string }
  | { kind: 'created'; path: string; branch: string; port: number | null }
  | { kind: 'not-a-repo' }

interface ResolveOpts {
  cwd: string
  taskId: string
  taskName: string
  projectId: string
  mode: 'auto' | 'force' | 'never'
}

async function resolveWorktree(opts: ResolveOpts): Promise<WorktreeOutcome> {
  // Outside a git repo: nothing to do, run in-place. We don't error
  // here because not every PlanFlow project lives in git (yet).
  const mainRepoRoot = await getMainRepoRoot(opts.cwd)
  if (!mainRepoRoot) {
    return { kind: 'not-a-repo' }
  }

  const cwdRepoRoot = await getRepoRoot(opts.cwd)
  const inLinkedWorktree = !!cwdRepoRoot && cwdRepoRoot !== mainRepoRoot

  const state = await readState(mainRepoRoot)

  // Already in a linked worktree → never create another one. We
  // assume the user opened Claude in this folder for a reason; we
  // just continue. (Future: warn if the worktree's task != new task.)
  if (inLinkedWorktree) {
    const here = detectCurrentWorktree(state, opts.cwd)
    return {
      kind: 'in-place',
      reason: here
        ? `already inside worktree for ${here.taskId} (${here.path})`
        : `already inside a linked worktree (${cwdRepoRoot})`,
      mainRepoRoot,
    }
  }

  // Existing worktree for THIS task → redirect.
  const existingForThisTask = state.entries.find(
    (e) => e.taskId === opts.taskId && !e.isMainRepo
  )
  if (existingForThisTask) {
    return {
      kind: 'redirect',
      path: existingForThisTask.path,
      branch: existingForThisTask.branch,
      port: existingForThisTask.port,
      reason: 'a worktree already exists for this task',
    }
  }

  if (opts.mode === 'never') {
    await registerMainRepoTask(mainRepoRoot, {
      taskId: opts.taskId,
      projectId: opts.projectId,
    }).catch((err) => logger.warn('registerMainRepoTask failed', { error: String(err) }))
    return { kind: 'in-place', reason: 'worktreeMode=never', mainRepoRoot }
  }

  // Decide whether to spawn a new worktree.
  const otherActive = state.entries.filter(
    (e) => e.taskId !== opts.taskId
  )
  const shouldCreate = opts.mode === 'force' || otherActive.length > 0

  if (!shouldCreate) {
    // Solo task in this checkout — run in-place but record the entry
    // so future task_starts know we're occupying the main repo.
    await registerMainRepoTask(mainRepoRoot, {
      taskId: opts.taskId,
      projectId: opts.projectId,
    }).catch((err) => logger.warn('registerMainRepoTask failed', { error: String(err) }))
    return {
      kind: 'in-place',
      reason: 'no other active tasks in this checkout',
      mainRepoRoot,
    }
  }

  // Parallel work — create a worktree.
  try {
    const result = await createWorktree(mainRepoRoot, {
      taskId: opts.taskId,
      taskName: opts.taskName,
      projectId: opts.projectId,
    })
    return {
      kind: 'created',
      path: result.entry.path,
      branch: result.entry.branch,
      port: result.entry.port,
    }
  } catch (err) {
    logger.error('createWorktree failed; falling back to in-place', { error: String(err) })
    // Worktree creation failed — don't block the user. Continue in
    // the current folder and surface the failure in the response.
    return {
      kind: 'in-place',
      reason: `worktree creation failed: ${(err as Error).message}`,
      mainRepoRoot,
    }
  }
}

function renderWorktreeRedirect(
  taskId: string,
  taskName: string,
  outcome: Extract<WorktreeOutcome, { kind: 'redirect' | 'created' }>
): string {
  const verb = outcome.kind === 'created' ? 'Created' : 'Resuming'
  const lines: string[] = []
  lines.push(`🌿 ${verb} worktree for ${taskId} — "${taskName}"`)
  lines.push('')
  lines.push(`━━━ Worktree ━━━━━━━━━━━━━━━━━━━━`)
  lines.push(`path:    ${outcome.path}`)
  lines.push(`branch:  ${outcome.branch}`)
  if (outcome.port !== null) lines.push(`port:    ${outcome.port}  (suggested for dev server)`)
  if (outcome.kind === 'redirect') lines.push(`reason:  ${outcome.reason}`)
  lines.push('')
  lines.push(`━━━ Next steps ━━━━━━━━━━━━━━━━━━`)
  lines.push(`  1. Open a new terminal in that folder:`)
  lines.push(`     cd ${outcome.path}`)
  lines.push(`     claude`)
  lines.push(``)
  lines.push(`  2. In the new Claude session, full task context loads on first prompt.`)
  lines.push(`     (PlanFlow detects the worktree from .planflow/worktrees.json.)`)
  lines.push(``)
  lines.push(`  3. Install deps if needed (first time only — pnpm uses hardlinks, ~30s):`)
  lines.push(`     pnpm install`)
  if (outcome.port !== null) {
    lines.push(``)
    lines.push(`  4. Use port ${outcome.port} for any dev server in this worktree to`)
    lines.push(`     avoid clashing with the main checkout.`)
  }
  lines.push('')
  lines.push(`This Claude session keeps its current task — switch terminals to work on ${taskId}.`)
  return lines.join('\n')
}

// ────────────────────────────────────────────────────────────────────
// autoExecute: headless agent dispatch
// ────────────────────────────────────────────────────────────────────

interface DispatchOpts {
  // Record<string, any> because the Task type from @planflow/shared uses
  // an index-signature shape that makes dotted access a TS4111 error.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  task: Record<string, any>
  projectId: string
  worktreeOutcome: WorktreeOutcome
  mergeStrategy: 'pr' | 'merge-master' | 'none'
}

async function dispatchAgent(opts: DispatchOpts): Promise<ReturnType<typeof createSuccessResult>> {
  const { task, projectId, worktreeOutcome, mergeStrategy } = opts

  const taskId = task['taskId'] as string
  const taskName = task['name'] as string
  const taskDescription = (task['description'] as string | null | undefined) ?? null

  // Determine where the agent runs. For in-place / not-a-repo we use
  // process.cwd() because there is no separate worktree directory.
  let agentCwd: string
  let branchName: string
  let mainRepoRoot: string

  const slug = slugify(taskName)
  const defaultBranch = `task/${taskId}-${slug}`

  switch (worktreeOutcome.kind) {
    case 'created':
    case 'redirect':
      agentCwd = worktreeOutcome.path
      branchName = worktreeOutcome.branch
      // Worktree dirs sit adjacent to the main repo; derive root from
      // the state-file path rather than the worktree path itself.
      mainRepoRoot = path.dirname(agentCwd)
      break
    case 'in-place':
      agentCwd = process.cwd()
      branchName = defaultBranch
      mainRepoRoot = worktreeOutcome.mainRepoRoot
      break
    case 'not-a-repo':
      agentCwd = process.cwd()
      branchName = defaultBranch
      mainRepoRoot = process.cwd()
      break
  }

  const logDir = path.join(mainRepoRoot, '.planflow', 'agents')

  // ── Build the directive prompt ──────────────────────────────────
  // Each section is self-contained and maps to one execution step.
  // The agent reads this top-to-bottom and executes in order.
  const mergeInstructions =
    mergeStrategy === 'pr'
      ? `## 8. Push & open PR
- Push the branch:
    git push -u origin ${branchName}
- Open a pull request (no Co-Authored-By in the body):
    gh pr create --title "feat: ${taskId} — ${taskName}" --fill
  If gh is not available, log a clear message and skip.`
      : mergeStrategy === 'merge-master'
        ? `## 8. Merge to master and push
- Checkout master, pull latest, merge:
    git checkout master && git pull origin master
    git merge --no-ff ${branchName} -m "feat: ${taskId} — ${taskName}"
    git push origin master`
        : `## 8. No merge
- Do NOT push or open a PR. Leave the branch committed locally.`

  // agentCwd path used in the worktree-removal note
  const agentCwdDisplay = agentCwd === process.cwd() ? 'in-place (main checkout)' : agentCwd

  const directivePrompt = `
# PlanFlow Autonomous Agent — ${taskId}: ${taskName}

You are a headless agent. Complete this task end-to-end using PlanFlow's
intelligence tools — NOT grep/Read as your first move. The codebase is
fully indexed; use it.

## Task
- ID:          ${taskId}
- Project ID:  ${projectId}
- Title:       ${taskName}
- Branch:      ${branchName}
- Worktree:    ${agentCwdDisplay}
- Description:
${taskDescription ? taskDescription.trim() : '(no description — infer from title and codebase context)'}

## 1. Context load — MUST use PlanFlow tools, not grep
First call (loads comments, knowledge, activity, ranked code chunks):
    planflow_task_start(taskId: "${taskId}", projectId: "${projectId}", autoExecute: false)
Do NOT pass autoExecute: true — that spawns another agent.

Then keep exploring as questions arise during the task:
  • planflow_recall(filePath: "...")   — everything tied to a file
  • planflow_search(query: "...")     — sharp keyword lookup
  • planflow_chunk(chunkId: "...")    — full body of any search hit
  • planflow_explore(intent: "...")   — when a new sub-area opens up
  • planflow_activity(...)            — what was touched recently

Use Bash grep / Read ONLY when you already know the exact path or string.
Reverting to grep mid-task drops the ranked semantic context (related
knowledge, recent activity, likely files) the Intelligence Layer surfaces.
This is non-negotiable for this workflow.

## 2. Journal progress
After each meaningful milestone call:
    planflow_task_progress(taskId: "${taskId}", note: "<what you just did or decided>")
This shows up in the PlanFlow activity feed so the human has visibility.
Aim for 3-6 notes across the task — not 30, not 0.

## 3. Capture non-obvious decisions
When you make a non-obvious architectural or convention choice, save it:
    planflow_remember(title: "...", content: "...", type: "decision")
Save: hidden constraints, surprising tradeoffs, "chose X because Y" facts.
Skip: trivial choices, things already clear from the diff.

## 4. Implement the task
- Follow existing code style, patterns, conventions.
- Update or add tests when the project has a test suite.
- No Co-Authored-By trailers in commits.

## 5. Validate
Detect package manager (pnpm-lock.yaml → pnpm; else npm).
Run in order, skip missing scripts, fix and re-run on failure:
    pnpm typecheck | pnpm test | pnpm lint
If typecheck shows errors, run:
    git stash && pnpm typecheck
to confirm they are pre-existing (don't fix unrelated issues — scope discipline).
Then git stash pop and continue.

## 6. Re-index
After editing files, ALWAYS refresh embeddings (incremental, near-free):
    planflow_index
Without this, future planflow_search results miss your changes.

## 7. Commit
Stage specific files by path — never git add -A.
Commit on branch ${branchName}. Message format:
    feat(<scope>): ${taskId} — ${taskName}
No Co-Authored-By trailer.

${mergeInstructions}

## 9. Mark task done
    planflow_task_done(taskId: "${taskId}", projectId: "${projectId}", summary: "<one-line outcome>")

## 10. Do NOT remove the worktree from inside it
You are running inside the worktree at ${agentCwdDisplay}.
Calling planflow_worktree_remove from here fails — git refuses to remove a
worktree you are currently inside.
Your job ends after step 9. Mention in your final summary that the dispatcher
can clean up with:
    cd ${mainRepoRoot}
    planflow_worktree_remove(taskId: "${taskId}")

## 11. Write done marker and notify
Write a JSON done marker so the dispatcher can check status:
    cat > ${logDir}/${taskId}.done <<'DONE_MARKER'
    {
      "taskId": "${taskId}",
      "status": "done",
      "prUrl": "<PR URL or null>",
      "summary": "<one-line outcome>",
      "branch": "${branchName}",
      "finishedAt": "<ISO timestamp>"
    }
    DONE_MARKER

If any step failed and you are aborting, write status: "failed" instead.

Then send a macOS notification (fall back silently if osascript is absent):
    osascript -e 'display notification "${taskId} done" with title "PlanFlow" subtitle "${taskName}"'

## STOP
After step 11, stop. Do not poll, do not ask questions, do not open new
tasks. Your job ends when the done marker is written.
`.trim()

  // ── Spawn ────────────────────────────────────────────────────────
  let spawnResult: { pid: number; logPath: string }
  try {
    spawnResult = await spawnHeadlessAgent({
      cwd: agentCwd,
      prompt: directivePrompt,
      taskId,
      logDir,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error('autoExecute spawn failed', { taskId, error: msg })

    if (msg.includes('not found on PATH') || msg.includes('ENOENT')) {
      return createErrorResult(
        `Failed to dispatch autonomous agent for ${taskId}.\n\n` +
          `The \`claude\` CLI was not found on PATH.\n` +
          `Install Claude Code CLI: https://claude.ai/download\n\n` +
          `Task status was NOT changed — re-run planflow_task_start once the CLI is installed.`
      )
    }

    return createErrorResult(
      `Failed to dispatch autonomous agent for ${taskId}: ${msg}\n\n` +
        `Task status was NOT changed.`
    )
  }

  // ── Build response ───────────────────────────────────────────────
  const mergeLabel =
    mergeStrategy === 'pr'
      ? 'Push & open PR'
      : mergeStrategy === 'merge-master'
        ? 'Merge to master & push'
        : 'Skip merge (leave branch local)'

  const lines: string[] = [
    `🤖 Autonomous agent dispatched for ${taskId} — "${taskName}"`,
    ``,
  ]

  if (mergeStrategy === 'merge-master') {
    lines.push(
      `⚠️  merge-master strategy will push directly to the main branch. Make sure CI passes before this runs.`
    )
    lines.push(``)
  }

  if (worktreeOutcome.kind === 'not-a-repo') {
    lines.push(`⚠️  Project is not inside a git repository — git operations in the agent will fail.`)
    lines.push(``)
  }

  lines.push(
    `━━━ Agent ━━━━━━━━━━━━━━━━━━━━━━━━`,
    `pid:      ${spawnResult.pid}`,
    `cwd:      ${agentCwd}`,
    `branch:   ${branchName}`,
    `strategy: ${mergeStrategy}`,
    `log:      ${spawnResult.logPath}`,
    ``,
    `━━━ Watch progress ━━━━━━━━━━━━━━━`,
    `  tail -f ${spawnResult.logPath}`,
    ``,
    `The agent will:`,
    `  1. Load context via PlanFlow tools (not grep)`,
    `  2. Journal progress in the activity feed`,
    `  3. Implement the task`,
    `  4. Validate (typecheck / test / lint)`,
    `  5. Re-index changed files`,
    `  6. Commit on branch ${branchName}`,
    `  7. ${mergeLabel}`,
    `  8. Mark task DONE in PlanFlow`,
    `  9. Write done marker + macOS notification`,
    ``,
    `Check status anytime:  planflow_agent_status(taskId: "${taskId}")`,
    `You can keep working in this session — the agent runs independently.`,
    ``,
    `After the agent finishes, clean up worktree (if created) from THIS session:`,
    `  planflow_worktree_remove(taskId: "${taskId}")`
  )

  return createSuccessResult(lines.join('\n'))
}

export const taskStartTool: ToolDefinition<TaskStartInput> = {
  name: 'planflow_task_start',

  description: `Start working on a PlanFlow task — fans out to multiple tools in a single call.

What this does in one shot:
  • Looks up the task by ID
  • Pulls comments and activity history
  • Signals "working on" status so teammates see your focus
  • Runs a semantic search using the task title (or your override)
  • Surfaces related knowledge entries
  • Suggests a git branch name derived from the task ID + title

Use this when:
  ✅ You're about to start (or resume) work on a specific task
  ✅ You want full context — task description, history, likely files —
     in one response instead of 5+ tool calls

Do NOT use when:
  ❌ You don't yet know which task to work on → planflow_task_next first
  ❌ You only need the task list → planflow_task_list

Parameters:
  - projectId (optional): Project UUID. Uses current project if omitted.
  - taskId (required): Task ID to start (e.g., "T1.1")
  - searchQuery (optional): Override the auto-search query
  - autoExecute (optional): Dispatch a headless Claude agent to complete the task autonomously
  - mergeStrategy (optional): pr | merge-master | none (only used with autoExecute)

Prerequisites:
  • Logged in via planflow_login()
  • Project indexed via planflow_index() (for the auto-search step)`,

  inputSchema: TaskStartInputSchema,

  async execute(input: TaskStartInput): Promise<ReturnType<typeof createSuccessResult>> {
    const projectId = input.projectId || getCurrentProjectId()

    if (!projectId) {
      return createErrorResult(
        '❌ No project ID provided and no current project set.\n\n' +
          'Either:\n' +
          '  1. Pass projectId: planflow_task_start(projectId: "uuid", taskId: "T1.1")\n' +
          '  2. Set current project: planflow_use(projectId: "uuid")'
      )
    }

    if (!isAuthenticated()) {
      return createErrorResult(
        '❌ Not logged in.\n\n' +
          'Please authenticate first using:\n' +
          '  planflow_login(token: "your-api-token")'
      )
    }

    logger.info('Task start tool called', { projectId, taskId: input.taskId })

    try {
      const client = getApiClient()

      // We need the task itself to know its title (for auto-search) and
      // metadata. List once, find by taskId — same approach as recall.
      const tasksResult = await client.listTasks(projectId)
      const task = tasksResult.tasks.find((t) => t['taskId'] === input.taskId)

      if (!task) {
        // Task not in the current project — search all accessible projects
        // before surfacing an error. Common when the user hasn't called
        // planflow_use() to switch to the right project.
        const foundInMultiple: Array<{ id: string; name: string }> = []

        try {
          const allProjects = await client.listProjects()
          const otherProjects = allProjects.filter((p) => p.id !== projectId)
          await Promise.all(
            otherProjects.map(async (p) => {
              try {
                const res = await client.listTasks(p.id)
                if (res.tasks.find((t) => t['taskId'] === input.taskId)) {
                  foundInMultiple.push({ id: p.id, name: p.name })
                }
              } catch {
                // Skip projects we can't read (permissions etc.)
              }
            })
          )
        } catch {
          // listProjects failed — fall through to the standard not-found error
        }

        if (foundInMultiple.length === 1) {
          // Exactly one match — retry with the correct projectId.
          const found = foundInMultiple[0]!
          logger.info('Task found in different project, switching', {
            taskId: input.taskId,
            foundProjectId: found.id,
          })
          return taskStartTool.execute({ ...input, projectId: found.id })
        } else if (foundInMultiple.length > 1) {
          return createErrorResult(
            `❌ Task ${input.taskId} exists in multiple projects — pass projectId explicitly:\n` +
              foundInMultiple.map((p) => `  • ${p.name} (${p.id})`).join('\n') +
              `\n\nExample:\n  planflow_task_start(taskId: "${input.taskId}", projectId: "${foundInMultiple[0]!.id}")`
          )
        }

        return createErrorResult(
          `❌ Task not found: ${input.taskId}\n\n` +
            `Use planflow_task_list(projectId: "${projectId}") to see available tasks.`
        )
      }

      const searchQuery = input.searchQuery ?? task['name']

      // ── Worktree decision ─────────────────────────────────────────
      // We resolve the parallel-work story BEFORE any state writes.
      // Three outcomes feed back into `worktreeNotice` (rendered in
      // the response) and `bailEarly` (return immediately when the
      // user must switch folders before context fetch makes sense):
      //   1. "in-place"   — work continues in the current cwd.
      //   2. "redirect"   — a worktree for this task already exists;
      //                     instruct the user to cd into it. Bail.
      //   3. "created"    — a fresh worktree was created for this
      //                     task. Instruct the user to cd into it.
      //                     Bail (they need a Claude session there).
      //
      // We don't auto-spawn dev servers or run installs here — those
      // are project-specific and easy to surprise users with. The
      // response prints the next commands so the user can run them.
      const worktreeOutcome = await resolveWorktree({
        cwd: process.cwd(),
        taskId: task['taskId'],
        taskName: task['name'],
        projectId,
        mode: input.worktreeMode ?? 'auto',
      })

      if (worktreeOutcome.kind === 'redirect' || worktreeOutcome.kind === 'created') {
        // autoExecute intercepts the normal "go open a terminal" redirect —
        // the agent runs in the worktree autonomously, no human redirect needed.
        if (!input.autoExecute) {
          return createSuccessResult(
            renderWorktreeRedirect(task['taskId'], task['name'], worktreeOutcome)
          )
        }
      }

      // ── autoExecute dispatch ───────────────────────────────────────
      // When enabled, fork a headless agent in the resolved worktree
      // and return immediately. The normal context-fetch flow is skipped
      // because the agent calls planflow_task_start(autoExecute: false)
      // itself to get full context (avoids infinite recursion by design).
      if (input.autoExecute) {
        return dispatchAgent({
          task,
          projectId,
          worktreeOutcome,
          mergeStrategy: input.mergeStrategy ?? 'pr',
        })
      }

      // Promote the task into IN_PROGRESS only when it's still TODO.
      // We don't auto-revive DONE tasks (that's a different intent —
      // user should explicitly reopen) and we don't trample BLOCKED
      // (the block flag carries information we shouldn't silently drop).
      const shouldPromoteStatus = task['status'] === 'TODO'

      // Fan out the rest in parallel — none of them depend on each
      // other. startWorkingOn + status promotion are side-effecting
      // writes but the reads should still surface even if a write
      // fails (e.g. permission). Order in the destructure mirrors the
      // Promise.all order.
      const [
        commentsResult,
        activityResult,
        searchResult,
        knowledgeResult,
        workingOnResult,
        statusPromotionResult,
      ] = await Promise.all([
        client.listComments(projectId, input.taskId).catch((err) => {
          logger.warn('listComments failed in task_start', { error: String(err) })
          return null
        }),
        client.getTaskActivity(projectId, input.taskId, { limit: 10 }).catch((err) => {
          logger.warn('getTaskActivity failed in task_start', { error: String(err) })
          return null
        }),
        client.searchProject(projectId, searchQuery, { limit: 5 }).catch((err) => {
          logger.warn('searchProject failed in task_start', { error: String(err) })
          return null
        }),
        client.listKnowledge(projectId, { search: searchQuery, limit: 5 }).catch((err) => {
          logger.warn('listKnowledge failed in task_start', { error: String(err) })
          return null
        }),
        client.startWorkingOn(projectId, input.taskId).catch((err) => {
          logger.warn('startWorkingOn failed in task_start', { error: String(err) })
          return null
        }),
        shouldPromoteStatus
          ? client
              .updateTaskStatus(projectId, input.taskId, 'IN_PROGRESS')
              .catch((err) => {
                logger.warn('updateTaskStatus failed in task_start', { error: String(err) })
                return null
              })
          : Promise.resolve(null),
      ])

      const lines: string[] = []
      lines.push(`🎯 Starting task ${task['taskId']} — "${task['name']}"`)
      lines.push('')

      // ── Worktree status ──────────────────────────────────────────
      if (worktreeOutcome.kind === 'in-place') {
        lines.push(`🌿 Worktree: in-place (${worktreeOutcome.reason})`)
        lines.push('')
      } else if (worktreeOutcome.kind === 'not-a-repo') {
        lines.push(`🌿 Worktree: skipped (not a git repository)`)
        lines.push('')
      }

      // ── Task summary ─────────────────────────────────────────────
      lines.push(`━━━ Task ━━━━━━━━━━━━━━━━━━━━━━━━`)
      lines.push(`status:       ${task['status']}`)
      if (task['complexity'] != null) lines.push(`complexity:   ${task['complexity']}`)
      if (task['dependencies'] && task['dependencies'].length > 0) {
        lines.push(`depends on:   ${task['dependencies'].join(', ')}`)
      }
      if (task['description']) {
        lines.push('description:')
        lines.push(task['description'])
      }
      lines.push('')

      // ── Status promotion ────────────────────────────────────────
      if (shouldPromoteStatus) {
        if (statusPromotionResult) {
          lines.push(`🏷️  Status: TODO → IN_PROGRESS`)
        } else {
          lines.push(
            `⚠️  Status promotion failed (still TODO) — non-fatal, can fix with planflow_task_update`
          )
        }
      }

      // ── Working-on signal ────────────────────────────────────────
      if (workingOnResult) {
        lines.push(`🟢 Working signal: active — teammates can see your focus`)
      } else {
        lines.push(`⚠️  Working signal failed (non-fatal — proceeded with context fetch)`)
      }
      lines.push('')

      // ── Comments ─────────────────────────────────────────────────
      const comments = commentsResult?.comments ?? []
      if (comments.length > 0) {
        lines.push(`━━━ Comments (${comments.length}) ━━━`)
        for (const comment of comments) {
          const author = comment.author.name || comment.author.email
          lines.push(`• ${formatRelativeTime(comment.createdAt)} — ${author}:`)
          lines.push(`    ${comment.content.replace(/\n/g, '\n    ')}`)
        }
        lines.push('')
      }

      // ── Activity ─────────────────────────────────────────────────
      const activityEntries = activityResult?.activities ?? []
      if (activityEntries.length > 0) {
        lines.push(`━━━ Activity ━━━━━━━━━━━━━━━━━━━━`)
        for (const a of activityEntries.slice(0, 5)) {
          const actor = a.actor.name || a.actor.email
          const desc = a.description || a.action
          lines.push(`• ${formatRelativeTime(a.createdAt)} — ${actor}: ${desc}`)
        }
        if (activityEntries.length > 5) {
          lines.push(`... and ${activityEntries.length - 5} more`)
        }
        lines.push('')
      }

      // ── Related knowledge ───────────────────────────────────────
      const knowledge = knowledgeResult?.knowledge ?? []
      if (knowledge.length > 0) {
        lines.push(`━━━ Related Knowledge (${knowledge.length}) ━━━`)
        for (const entry of knowledge) {
          lines.push(`• [${entry.type}] ${entry.title}`)
          // Keep content snippets short here — recall() exists for full read.
          const preview =
            entry.content.length > 200 ? entry.content.slice(0, 200) + '...' : entry.content
          lines.push(`    ${preview.replace(/\n/g, '\n    ')}`)
        }
        lines.push('')
      }

      // ── Likely-relevant code (auto-search) ──────────────────────
      const searchResults = searchResult?.results ?? []
      if (searchResults.length > 0) {
        lines.push(`━━━ Likely-Relevant Code (search: "${searchQuery}") ━━━`)
        for (let i = 0; i < searchResults.length; i++) {
          const r = searchResults[i]!
          const chunk = r.chunk
          const isCode = 'filePath' in chunk
          const score = r.score.toFixed(3)
          if (isCode) {
            lines.push(
              `#${i + 1} ${chunk.filePath}:${chunk.startLine}-${chunk.endLine}  (${chunk.kind} ${chunk.name}, score ${score})`
            )
          } else {
            lines.push(`#${i + 1} 📄 ${(chunk as { source: string }).source} (score ${score})`)
          }
        }
        lines.push('')
      } else if (searchResult !== null) {
        lines.push(
          `(no semantic search results for "${searchQuery}" — project may not be indexed yet; run planflow_index_status to check)`
        )
        lines.push('')
      }

      // ── Suggested branch ────────────────────────────────────────
      const slug = slugify(task['name'])
      const branchSuggestion = `task/${task['taskId']}-${slug}`
      lines.push(`━━━ Suggestions ━━━━━━━━━━━━━━━━━`)
      lines.push(`💡 Git branch: ${branchSuggestion}`)
      lines.push('')

      // ── Next steps ──────────────────────────────────────────────
      lines.push(`Next steps:`)
      lines.push(`  • Read full chunks:   planflow_chunk(chunkId: "...")`)
      lines.push(`  • Log progress:       planflow_task_progress(taskId: "${task['taskId']}", note: "...")`)
      lines.push(`  • Mark done:          planflow_task_done(taskId: "${task['taskId']}")`)
      lines.push('')
      lines.push(`While implementing — keep using PlanFlow search tools, not grep:`)
      lines.push(`  • new question opens up    → planflow_search(query: "...")`)
      lines.push(`  • full body of a hit       → planflow_chunk(chunkId: "...")`)
      lines.push(`  • everything tied to file  → planflow_recall(filePath: "...")`)
      lines.push(`  • brand-new area mid-task  → planflow_explore(intent: "...")`)
      lines.push(`  Falling back to grep mid-task drops the ranked semantic context`)
      lines.push(`  the Intelligence Layer is built to surface (related knowledge,`)
      lines.push(`  recent activity, likely files).`)

      return createSuccessResult(lines.join('\n'))
    } catch (error) {
      logger.error('Task start failed', { error: String(error) })

      if (error instanceof AuthError) {
        return createErrorResult(
          '❌ Authentication error. Please log out and log in again.\n' +
            '  planflow_logout()\n' +
            '  planflow_login(token: "your-new-token")'
        )
      }

      if (error instanceof ApiError) {
        if (error.statusCode === 404) {
          return createErrorResult(
            `❌ Project not found: ${projectId}\n\n` +
              'Use planflow_projects() to list your available projects.'
          )
        }
        return createErrorResult(`❌ API error: ${error.message}`)
      }

      const message = error instanceof Error ? error.message : String(error)
      return createErrorResult(`❌ Task start failed: ${message}`)
    }
  },
}
