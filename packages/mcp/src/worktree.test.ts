/**
 * Tests for the worktree helper. Uses real git in temp directories so
 * we exercise the full create/list/remove cycle without mocking — the
 * library is small enough that mocks would mostly re-encode the
 * implementation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  createWorktree,
  detectCurrentWorktree,
  getMainRepoRoot,
  getRepoRoot,
  pickPort,
  readState,
  registerMainRepoTask,
  removeWorktree,
  slugify,
  writeState,
} from './worktree.js'

let workspace: string
let repoRoot: string

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' })
}

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-worktree-'))
  repoRoot = path.join(workspace, 'main-repo')
  await fs.mkdir(repoRoot, { recursive: true })
  git(repoRoot, 'init', '-b', 'main')
  // git requires a non-empty author + commit before worktree add will work
  git(repoRoot, 'config', 'user.email', 'test@example.com')
  git(repoRoot, 'config', 'user.name', 'Test')
  await fs.writeFile(path.join(repoRoot, 'README.md'), '# test\n', 'utf8')
  git(repoRoot, 'add', 'README.md')
  git(repoRoot, 'commit', '-m', 'init')
})

afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true })
})

describe('slugify', () => {
  it('lowercases, strips punctuation, collapses spaces', () => {
    expect(slugify('Add User Auth!')).toBe('add-user-auth')
  })

  it('caps length and trims trailing dashes', () => {
    expect(slugify('a'.repeat(60), 10)).toBe('aaaaaaaaaa')
  })

  it('returns empty string for noise-only input', () => {
    expect(slugify('!!!')).toBe('')
  })
})

describe('pickPort', () => {
  it('returns the base when nothing is allocated', () => {
    expect(pickPort({ version: 1, entries: [] })).toBe(3000)
  })

  it('skips used ports', () => {
    const state = {
      version: 1 as const,
      entries: [
        { taskId: 'T1.1', branch: 'task/T1.1', path: '/a', port: 3000, createdAt: '' },
        { taskId: 'T1.2', branch: 'task/T1.2', path: '/b', port: 3001, createdAt: '' },
      ],
    }
    expect(pickPort(state)).toBe(3002)
  })

  it('respects custom base', () => {
    expect(pickPort({ version: 1, entries: [] }, 5000)).toBe(5000)
  })
})

describe('readState / writeState', () => {
  it('returns empty state when the file is missing', async () => {
    const state = await readState(repoRoot)
    expect(state.entries).toEqual([])
  })

  it('round-trips entries', async () => {
    await writeState(repoRoot, {
      version: 1,
      entries: [
        {
          taskId: 'T2.5',
          branch: 'task/T2.5-foo',
          path: '/x',
          port: 3000,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    const round = await readState(repoRoot)
    expect(round.entries).toHaveLength(1)
    expect(round.entries[0]?.taskId).toBe('T2.5')
  })

  it('treats schema mismatches as empty without throwing', async () => {
    const file = path.join(repoRoot, '.planflow', 'worktrees.json')
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, JSON.stringify({ version: 99, entries: 'wrong' }), 'utf8')
    const state = await readState(repoRoot)
    expect(state.entries).toEqual([])
  })
})

describe('getMainRepoRoot', () => {
  // macOS resolves /var → /private/var via symlink in `git rev-parse`
  // but Node's fs.mkdtemp gives the un-resolved form. Compare via
  // realpath on both sides so the assertion isn't OS-quirk sensitive.
  it('returns the toplevel for a plain repo', async () => {
    const got = await getMainRepoRoot(repoRoot)
    expect(got).not.toBeNull()
    expect(await fs.realpath(got!)).toBe(await fs.realpath(repoRoot))
  })

  it('returns null outside a git repo', async () => {
    expect(await getMainRepoRoot(workspace)).toBeNull()
  })

  it('resolves the main repo from inside a worktree', async () => {
    const { entry } = await createWorktree(repoRoot, {
      taskId: 'T9.1',
      taskName: 'Test branch',
    })
    const main = await getMainRepoRoot(entry.path)
    expect(main).not.toBeNull()
    expect(await fs.realpath(main!)).toBe(await fs.realpath(repoRoot))
  })
})

describe('createWorktree', () => {
  it('creates the directory and a feature branch', async () => {
    const { entry, reused } = await createWorktree(repoRoot, {
      taskId: 'T1.1',
      taskName: 'Add login',
      projectId: '00000000-0000-0000-0000-000000000001',
    })
    expect(reused).toBe(false)
    expect(entry.taskId).toBe('T1.1')
    expect(entry.branch).toBe('task/T1.1-add-login')
    expect(entry.port).toBe(3000)

    const stat = await fs.stat(entry.path)
    expect(stat.isDirectory()).toBe(true)

    // worktree's own toplevel == its path
    const sub = await getRepoRoot(entry.path)
    expect(sub).toBe(await fs.realpath(entry.path))
  })

  it('is idempotent — repeated calls return the same entry', async () => {
    const first = await createWorktree(repoRoot, { taskId: 'T1.1', taskName: 'X' })
    const second = await createWorktree(repoRoot, { taskId: 'T1.1', taskName: 'X' })
    expect(second.reused).toBe(true)
    expect(second.entry.path).toBe(first.entry.path)
  })

  it('allocates monotonically increasing ports for parallel tasks', async () => {
    const a = await createWorktree(repoRoot, { taskId: 'T1.1', taskName: 'A' })
    const b = await createWorktree(repoRoot, { taskId: 'T1.2', taskName: 'B' })
    const c = await createWorktree(repoRoot, { taskId: 'T1.3', taskName: 'C' })
    expect([a.entry.port, b.entry.port, c.entry.port]).toEqual([3000, 3001, 3002])
  })

  it('refuses to overwrite a stray directory at the worktree path', async () => {
    const target = path.join(path.dirname(repoRoot), 'main-repo-T1.1')
    await fs.mkdir(target, { recursive: true })
    await expect(
      createWorktree(repoRoot, { taskId: 'T1.1', taskName: 'X' })
    ).rejects.toThrow(/already exists on disk/)
  })
})

describe('removeWorktree', () => {
  it('removes the worktree dir and clears the entry', async () => {
    const { entry } = await createWorktree(repoRoot, {
      taskId: 'T1.1',
      taskName: 'X',
    })

    const result = await removeWorktree(repoRoot, 'T1.1')
    expect(result.removed).toBe(true)
    expect(result.branch).toBe(entry.branch)

    await expect(fs.stat(entry.path)).rejects.toThrow()
    const state = await readState(repoRoot)
    expect(state.entries.find((e) => e.taskId === 'T1.1')).toBeUndefined()
  })

  it('returns removed:false when no entry matches', async () => {
    const result = await removeWorktree(repoRoot, 'TX.X')
    expect(result.removed).toBe(false)
  })

  it('frees the port for re-use', async () => {
    const first = await createWorktree(repoRoot, { taskId: 'T1.1', taskName: 'X' })
    expect(first.entry.port).toBe(3000)

    await removeWorktree(repoRoot, 'T1.1')
    const second = await createWorktree(repoRoot, { taskId: 'T1.2', taskName: 'Y' })
    expect(second.entry.port).toBe(3000)
  })
})

describe('detectCurrentWorktree', () => {
  it('matches when cwd equals the worktree path', async () => {
    const { entry } = await createWorktree(repoRoot, {
      taskId: 'T1.1',
      taskName: 'X',
    })
    const state = await readState(repoRoot)
    expect(detectCurrentWorktree(state, entry.path)?.taskId).toBe('T1.1')
  })

  it('matches when cwd is a subdir of the worktree', async () => {
    const { entry } = await createWorktree(repoRoot, {
      taskId: 'T1.1',
      taskName: 'X',
    })
    const subdir = path.join(entry.path, 'src')
    await fs.mkdir(subdir, { recursive: true })
    const state = await readState(repoRoot)
    expect(detectCurrentWorktree(state, subdir)?.taskId).toBe('T1.1')
  })

  it('returns null when cwd is unrelated', async () => {
    await createWorktree(repoRoot, { taskId: 'T1.1', taskName: 'X' })
    const state = await readState(repoRoot)
    expect(detectCurrentWorktree(state, '/tmp/elsewhere')).toBeNull()
  })
})

describe('registerMainRepoTask', () => {
  it('records the main repo as hosting a task', async () => {
    const entry = await registerMainRepoTask(repoRoot, { taskId: 'T1.1' })
    expect(entry.isMainRepo).toBe(true)
    expect(entry.path).toBe(repoRoot)

    const state = await readState(repoRoot)
    const main = state.entries.find((e) => e.isMainRepo)
    expect(main?.taskId).toBe('T1.1')
  })

  it('replaces the prior main-repo entry (only one task in main at a time)', async () => {
    await registerMainRepoTask(repoRoot, { taskId: 'T1.1' })
    await registerMainRepoTask(repoRoot, { taskId: 'T1.2' })
    const state = await readState(repoRoot)
    const mainEntries = state.entries.filter((e) => e.isMainRepo)
    expect(mainEntries).toHaveLength(1)
    expect(mainEntries[0]?.taskId).toBe('T1.2')
  })
})
