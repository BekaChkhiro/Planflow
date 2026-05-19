/**
 * PlanFlow MCP — Worktree helper
 *
 * Manages git worktrees so the user (and Claude) can work on multiple
 * PlanFlow tasks in parallel from one checkout. The shape of the world
 * we want:
 *
 *   Desktop/
 *   ├── my-app/              ← main checkout, T17.6 happens here
 *   ├── my-app-T17.7/        ← worktree, branch task/T17.7-…
 *   └── my-app-T17.8/        ← worktree, branch task/T17.8-…
 *
 * The state file at `<mainRepo>/.planflow/worktrees.json` is the
 * single source of truth that ties git worktrees to PlanFlow task IDs
 * and dev-server port assignments. It lives ONLY in the main checkout
 * (we read the common dir and resolve back to it from any worktree).
 *
 * Conventions we commit to:
 *   • Worktree directory:  <parent>/<repoBasename>-<taskId>
 *   • Branch name:         task/<taskId>-<slug>
 *   • Port allocation:     starts at 3000, monotonic per state file
 *
 * Pure helpers — no side-effecting singletons, no module-level state.
 * Callers (tools) decide what to surface and what to confirm.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import { logger } from './logger.js'

const exec = promisify(execFile)

const STATE_DIR = '.planflow'
const STATE_FILE = 'worktrees.json'
const STATE_FILE_VERSION = 1
const DEFAULT_PORT_BASE = 3000

export interface WorktreeEntry {
  /** PlanFlow task ID (e.g. "T17.7") */
  taskId: string
  /** Git branch backing this worktree */
  branch: string
  /** Absolute path to the worktree directory */
  path: string
  /** Allocated dev-server port (null if none assigned yet) */
  port: number | null
  /** ISO timestamp when this entry was created */
  createdAt: string
  /** PlanFlow project UUID, if known at creation time */
  projectId?: string
  /**
   * True when this entry refers to the MAIN checkout (not a real
   * worktree). We track this so the dashboard can show "where" each
   * task is being worked on, and so we don't try to `git worktree
   * remove` the main repo when finalizing.
   */
  isMainRepo?: boolean
}

export interface WorktreeState {
  version: typeof STATE_FILE_VERSION
  entries: WorktreeEntry[]
}

/** Empty state — used as a default when the file doesn't exist yet. */
function emptyState(): WorktreeState {
  return { version: STATE_FILE_VERSION, entries: [] }
}

/**
 * Run `git rev-parse --show-toplevel` from the given cwd. Returns the
 * working tree's top-level directory (a worktree returns its OWN root,
 * not the main repo's). Returns null if cwd isn't inside a git repo.
 */
export async function getRepoRoot(cwd: string = process.cwd()): Promise<string | null> {
  try {
    const { stdout } = await exec('git', ['rev-parse', '--show-toplevel'], { cwd })
    return stdout.trim() || null
  } catch {
    return null
  }
}

/**
 * Resolve the remote's default branch (usually "main" or "master"). Used
 * when creating a worktree so its base is always the up-to-date remote
 * branch, never a stale local checkout. Returns null when there is no
 * `origin` remote (offline / not pushed yet / multiple remotes).
 *
 * Strategy:
 *   1. Prefer `refs/remotes/origin/HEAD` — set by `git clone` and `git remote set-head`.
 *   2. Fall back to `git ls-remote --symref origin HEAD` (works over the
 *      wire if local doesn't have the symref).
 *   3. If both fail, return null and the caller decides.
 */
export async function getRemoteDefaultBranch(
  cwd: string = process.cwd()
): Promise<string | null> {
  try {
    const { stdout } = await exec(
      'git',
      ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
      { cwd }
    )
    const ref = stdout.trim()
    if (ref.startsWith('origin/')) return ref.slice('origin/'.length)
    return ref || null
  } catch {
    // Local symref isn't set — ask the remote directly.
  }
  try {
    const { stdout } = await exec('git', ['ls-remote', '--symref', 'origin', 'HEAD'], { cwd })
    // Output looks like: "ref: refs/heads/main\tHEAD\n<sha>\tHEAD"
    const match = stdout.match(/ref:\s+refs\/heads\/(\S+)\s+HEAD/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

/**
 * Directories that are NEVER a valid main repo root. If `git rev-parse`
 * walks up and resolves to one of these, the user almost certainly has
 * a stray `.git` directory sitting in a shared/home location (e.g. they
 * accidentally ran `git init` in ~/Desktop). Treating that as the repo
 * root is catastrophic — worktrees get created as siblings of unrelated
 * project folders, tasks branch off the wrong history, and untracked
 * files multiply.
 *
 * We refuse rather than silently misbehaving.
 */
export function isForbiddenRepoRoot(
  repoRoot: string,
  homedir: string = os.homedir()
): boolean {
  const normalized = path.resolve(repoRoot)
  const home = path.resolve(homedir)

  // The home directory itself.
  if (normalized === home) return true

  // Common shared user dirs that should never be a git repo.
  const forbiddenChildren = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Movies', 'Music']
  for (const child of forbiddenChildren) {
    if (normalized === path.join(home, child)) return true
  }

  // Filesystem root or single-segment path is also suspicious.
  if (normalized === path.parse(normalized).root) return true

  return false
}

/**
 * Resolve the MAIN repo root even when cwd is inside a linked worktree.
 *
 * `git rev-parse --git-common-dir` returns the path to the main `.git`
 * directory shared across all worktrees. The main repo root is its
 * parent (when --git-common-dir is `.git`, we fall back to toplevel).
 *
 * Refuses to return a "forbidden" root (e.g. ~/Desktop, ~, ~/Documents)
 * — a stray `.git` in those locations is a setup bug, never a real repo.
 */
export async function getMainRepoRoot(cwd: string = process.cwd()): Promise<string | null> {
  try {
    const { stdout: commonDirRaw } = await exec(
      'git',
      ['rev-parse', '--git-common-dir'],
      { cwd }
    )
    const commonDir = commonDirRaw.trim()
    if (!commonDir) return null

    // commonDir may be relative ("./.git") or absolute. Resolve against cwd.
    const absoluteCommonDir = path.isAbsolute(commonDir)
      ? commonDir
      : path.resolve(cwd, commonDir)

    // The main repo is the parent of the common .git directory. When
    // the common dir already names a directory (not just `.git`),
    // dirname still works because git puts shared metadata under
    // `<mainRepo>/.git`.
    const repoRoot = path.dirname(absoluteCommonDir)

    if (isForbiddenRepoRoot(repoRoot)) {
      logger.warn(
        'Refusing to use a forbidden directory as repo root. A stray .git was found in a shared/home directory — this is almost always a setup mistake, not a real repository.',
        { repoRoot, cwd }
      )
      return null
    }

    return repoRoot
  } catch {
    return null
  }
}

export function getStateFilePath(mainRepoRoot: string): string {
  return path.join(mainRepoRoot, STATE_DIR, STATE_FILE)
}

export async function readState(mainRepoRoot: string): Promise<WorktreeState> {
  const file = getStateFilePath(mainRepoRoot)
  try {
    const raw = await fs.readFile(file, 'utf8')
    const parsed = JSON.parse(raw) as Partial<WorktreeState>
    if (parsed.version !== STATE_FILE_VERSION || !Array.isArray(parsed.entries)) {
      logger.warn('worktrees.json schema mismatch; treating as empty', {
        path: file,
        version: parsed.version,
      })
      return emptyState()
    }
    return { version: STATE_FILE_VERSION, entries: parsed.entries }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyState()
    logger.warn('Failed to read worktrees.json; treating as empty', {
      path: file,
      error: String(err),
    })
    return emptyState()
  }
}

export async function writeState(
  mainRepoRoot: string,
  state: WorktreeState
): Promise<void> {
  const dir = path.join(mainRepoRoot, STATE_DIR)
  await fs.mkdir(dir, { recursive: true })
  const file = getStateFilePath(mainRepoRoot)
  await fs.writeFile(file, JSON.stringify(state, null, 2) + '\n', 'utf8')

  // Best-effort gitignore. We don't fail if .gitignore doesn't exist
  // or the line is already there — this is a convenience for the user.
  await ensureGitignored(mainRepoRoot, `${STATE_DIR}/${STATE_FILE}`).catch(() => {
    /* non-fatal */
  })
}

async function ensureGitignored(repoRoot: string, line: string): Promise<void> {
  const gitignore = path.join(repoRoot, '.gitignore')
  let content = ''
  try {
    content = await fs.readFile(gitignore, 'utf8')
  } catch {
    // No .gitignore — not our place to create one. Skip.
    return
  }
  const lines = content.split('\n').map((l) => l.trim())
  if (lines.includes(line) || lines.includes(`/${line}`)) return
  const updated = content.endsWith('\n') ? content + line + '\n' : content + '\n' + line + '\n'
  await fs.writeFile(gitignore, updated, 'utf8')
}

/**
 * Pick the next free dev port. We keep allocations monotonic and
 * never reuse a port that's currently held by an entry — this avoids
 * the surprise of port 3001 belonging to two different tasks across
 * a finalize/start cycle if their lifecycles overlap.
 */
export function pickPort(state: WorktreeState, base: number = DEFAULT_PORT_BASE): number {
  const used = new Set(
    state.entries
      .map((e) => e.port)
      .filter((p): p is number => typeof p === 'number')
  )
  let candidate = base
  while (used.has(candidate)) candidate++
  return candidate
}

/** Return the entry matching `cwd` (one of its ancestors equal to `entry.path`), or null. */
export function detectCurrentWorktree(
  state: WorktreeState,
  cwd: string
): WorktreeEntry | null {
  const normalized = path.resolve(cwd)
  for (const entry of state.entries) {
    const entryPath = path.resolve(entry.path)
    if (normalized === entryPath || normalized.startsWith(entryPath + path.sep)) {
      return entry
    }
  }
  return null
}

/** Strip noisy chars + collapse to kebab-case for branch names. */
export function slugify(name: string, maxLen = 40): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return slug.length > maxLen ? slug.slice(0, maxLen).replace(/-$/, '') : slug
}

export interface CreateWorktreeOpts {
  taskId: string
  taskName: string
  /** PlanFlow project UUID — recorded in state for cross-referencing. */
  projectId?: string
  /** Branch to base the new worktree on (default: current HEAD). */
  baseBranch?: string
  /** Override the default sibling-folder convention. */
  worktreeDir?: string
  /** Override the default port-allocation base (default 3000). */
  portBase?: number
}

export interface CreateWorktreeResult {
  entry: WorktreeEntry
  /** True when an existing entry/dir was reused instead of created. */
  reused: boolean
}

/**
 * Create a new git worktree for a task. Idempotent — if an entry for
 * `taskId` already exists in state AND the path still resolves, we
 * return it unchanged with `reused: true`. Stale entries (path gone
 * from disk OR not registered with `git worktree list`) are pruned
 * and recreated.
 *
 * Caller responsibilities:
 *   • Confirm with the user before running this when the project has
 *     other dirty/uncommitted state — we only check `git status` for
 *     the worktree-add step itself.
 *   • Run `pnpm install` (or the project's equivalent) afterwards if
 *     they want a working dev server. We deliberately don't auto-
 *     install: too many package managers, too easy to surprise.
 */
export async function createWorktree(
  mainRepoRoot: string,
  opts: CreateWorktreeOpts
): Promise<CreateWorktreeResult> {
  const state = await readState(mainRepoRoot)

  // Reuse path: same task, dir still exists, branch still tracked.
  const existing = state.entries.find((e) => e.taskId === opts.taskId && !e.isMainRepo)
  if (existing) {
    const stillThere = await pathExists(existing.path)
    if (stillThere) {
      return { entry: existing, reused: true }
    }
    // Stale entry — drop it and recreate.
    state.entries = state.entries.filter((e) => e !== existing)
  }

  const slug = slugify(opts.taskName)
  const branch = `task/${opts.taskId}${slug ? `-${slug}` : ''}`
  const repoBasename = path.basename(mainRepoRoot)
  const worktreePath =
    opts.worktreeDir ?? path.join(path.dirname(mainRepoRoot), `${repoBasename}-${opts.taskId}`)

  // Don't blow away an existing directory — fail loudly so the user
  // can decide. (User might have manually created a folder with the
  // same name for unrelated reasons.)
  if (await pathExists(worktreePath)) {
    throw new Error(
      `Worktree path already exists on disk but is not registered: ${worktreePath}\n` +
        `Either remove it manually or pass a different worktreeDir.`
    )
  }

  // Decide the base. If the caller didn't specify, branch from the
  // freshly-fetched remote default branch — otherwise the worktree
  // inherits whatever was last checked out locally (which is often
  // stale: e.g. main was advanced via a merged PR but the local
  // checkout never pulled). Worktrees that start from stale base
  // create cascading conflicts when the agent later pushes.
  let base = opts.baseBranch
  if (!base) {
    const remoteDefault = await getRemoteDefaultBranch(mainRepoRoot)
    if (remoteDefault) {
      // Best-effort fetch so origin/<default> is current. Failure here
      // (offline, no remote configured) is OK — we fall back to HEAD.
      await exec('git', ['fetch', 'origin', remoteDefault], { cwd: mainRepoRoot }).catch(() => {
        /* fetch fail is non-fatal */
      })
      base = `origin/${remoteDefault}`
    } else {
      base = 'HEAD'
    }
  }

  // If the branch already exists locally we attach to it; otherwise
  // we create it. `git worktree add -b` fails if the branch exists,
  // so we branch our own logic.
  const branchExists = await checkBranchExists(mainRepoRoot, branch)
  const args = branchExists
    ? ['worktree', 'add', worktreePath, branch]
    : ['worktree', 'add', '-b', branch, worktreePath, base]

  try {
    await exec('git', args, { cwd: mainRepoRoot })
  } catch (err) {
    throw new Error(
      `git worktree add failed: ${(err as Error).message}\n` +
        `Args: ${args.join(' ')}`
    )
  }

  const port = pickPort(state, opts.portBase)
  const entry: WorktreeEntry = {
    taskId: opts.taskId,
    branch,
    path: worktreePath,
    port,
    createdAt: new Date().toISOString(),
    ...(opts.projectId ? { projectId: opts.projectId } : {}),
  }
  state.entries.push(entry)
  await writeState(mainRepoRoot, state)

  return { entry, reused: false }
}

export interface RemoveWorktreeOpts {
  /** Force removal even if the worktree has uncommitted changes. */
  force?: boolean
  /**
   * Also delete the underlying branch after removal. Off by default —
   * the branch may have unmerged commits the user still wants.
   */
  deleteBranch?: boolean
}

/**
 * Remove a worktree by task ID. Cleans up the state-file entry too.
 * Safe to call on stale entries (where the directory is already gone).
 */
export async function removeWorktree(
  mainRepoRoot: string,
  taskId: string,
  opts: RemoveWorktreeOpts = {}
): Promise<{ removed: boolean; branch: string | null }> {
  const state = await readState(mainRepoRoot)
  const idx = state.entries.findIndex((e) => e.taskId === taskId && !e.isMainRepo)
  if (idx === -1) return { removed: false, branch: null }

  const entry = state.entries[idx]!

  const exists = await pathExists(entry.path)
  if (exists) {
    const args = ['worktree', 'remove', entry.path]
    if (opts.force) args.push('--force')
    try {
      await exec('git', args, { cwd: mainRepoRoot })
    } catch (err) {
      throw new Error(
        `git worktree remove failed: ${(err as Error).message}\n` +
          `Path: ${entry.path}\n` +
          `Pass force:true to discard uncommitted changes.`
      )
    }
  } else {
    // Worktree dir missing — git keeps a stale reference. Prune it.
    await exec('git', ['worktree', 'prune'], { cwd: mainRepoRoot }).catch(() => {
      /* non-fatal */
    })
  }

  if (opts.deleteBranch) {
    await exec('git', ['branch', '-D', entry.branch], { cwd: mainRepoRoot }).catch((err) => {
      logger.warn('Failed to delete branch after worktree removal', {
        branch: entry.branch,
        error: String(err),
      })
    })
  }

  state.entries.splice(idx, 1)
  await writeState(mainRepoRoot, state)
  return { removed: true, branch: entry.branch }
}

/**
 * Mark the main repo as actively hosting a task. We need this entry
 * so the dashboard answers "where is T1.1 happening" consistently —
 * the answer "in the main checkout" should look the same as "in a
 * worktree" to readers of the state file.
 */
export async function registerMainRepoTask(
  mainRepoRoot: string,
  opts: { taskId: string; projectId?: string }
): Promise<WorktreeEntry> {
  const state = await readState(mainRepoRoot)
  // Drop any prior main-repo entry (only one task at a time per checkout).
  state.entries = state.entries.filter((e) => !e.isMainRepo)
  const entry: WorktreeEntry = {
    taskId: opts.taskId,
    branch: await getCurrentBranch(mainRepoRoot).catch(() => 'HEAD'),
    path: mainRepoRoot,
    port: null,
    createdAt: new Date().toISOString(),
    isMainRepo: true,
    ...(opts.projectId ? { projectId: opts.projectId } : {}),
  }
  state.entries.push(entry)
  await writeState(mainRepoRoot, state)
  return entry
}

/** Drop the main-repo entry (called when finalizing the in-place task). */
export async function clearMainRepoTask(mainRepoRoot: string): Promise<void> {
  const state = await readState(mainRepoRoot)
  const before = state.entries.length
  state.entries = state.entries.filter((e) => !e.isMainRepo)
  if (state.entries.length !== before) await writeState(mainRepoRoot, state)
}

async function getCurrentBranch(cwd: string): Promise<string> {
  const { stdout } = await exec('git', ['symbolic-ref', '--short', 'HEAD'], { cwd })
  return stdout.trim()
}

async function checkBranchExists(cwd: string, branch: string): Promise<boolean> {
  try {
    await exec('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { cwd })
    return true
  } catch {
    return false
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}
