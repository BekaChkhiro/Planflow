/**
 * Conflict Detection Manager Unit Tests (T20.9)
 *
 * Backed by a real InMemoryActiveWorkStore so the manager + store are
 * exercised together (light integration test): if two users register
 * overlapping filePaths on the same project, the manager must surface
 * a FileConflict with both users listed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { InMemoryActiveWorkStore } from '../../lib/redis.js'

let sharedStore: InMemoryActiveWorkStore

vi.mock('../../lib/redis.js', async () => {
  const actual: any = await vi.importActual('../../lib/redis.js')
  return {
    ...actual,
    getActiveWorkStore: () => sharedStore,
  }
})

import { ConflictDetectionManager } from '../managers/conflict-detection-manager.js'

const PROJECT = 'proj-1'

const seedActiveWork = async (
  userId: string,
  overrides: Partial<{ taskId: string; taskName: string; userEmail: string; userName: string | null }> = {}
) => {
  await sharedStore.setActiveWork(PROJECT, userId, {
    taskId: 'T1.1',
    taskUuid: 'uuid-' + userId,
    taskName: 'Task',
    userId,
    userEmail: `${userId}@x.com`,
    userName: null,
    ...overrides,
  })
}

describe('ConflictDetectionManager', () => {
  let manager: ConflictDetectionManager

  beforeEach(() => {
    sharedStore = new InMemoryActiveWorkStore()
    manager = new ConflictDetectionManager()
  })

  it('returns no conflicts when only one user has files registered', async () => {
    await seedActiveWork('alice')
    const { conflicts, updatedWork } = await manager.updateFilesAndDetectConflicts(
      PROJECT,
      'alice',
      ['a.ts', 'b.ts']
    )
    expect(updatedWork?.filePaths).toEqual(['a.ts', 'b.ts'])
    expect(conflicts).toEqual([])
  })

  it('detects overlap when two users share a file', async () => {
    await seedActiveWork('alice', { userEmail: 'a@x.com' })
    await seedActiveWork('bob', { userEmail: 'b@x.com', taskId: 'T2.0' })

    await sharedStore.updateFilePaths(PROJECT, 'bob', ['b.ts', 'c.ts'])

    const { conflicts } = await manager.updateFilesAndDetectConflicts(
      PROJECT,
      'alice',
      ['a.ts', 'b.ts']
    )

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].filePath).toBe('b.ts')
    const ids = conflicts[0].users.map((u) => u.userId).sort()
    expect(ids).toEqual(['alice', 'bob'])
  })

  it('lists requesting user first in the conflict users array', async () => {
    await seedActiveWork('alice')
    await seedActiveWork('bob', { taskId: 'T2.0' })
    await sharedStore.updateFilePaths(PROJECT, 'bob', ['shared.ts'])

    const { conflicts } = await manager.updateFilesAndDetectConflicts(
      PROJECT,
      'alice',
      ['shared.ts']
    )
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].users[0].userId).toBe('alice')
    expect(conflicts[0].users[1].userId).toBe('bob')
  })

  it('returns updatedWork=null and no conflicts when user has no active work', async () => {
    const { updatedWork, conflicts } = await manager.updateFilesAndDetectConflicts(
      PROJECT,
      'ghost',
      ['x.ts']
    )
    expect(updatedWork).toBeNull()
    expect(conflicts).toEqual([])
  })

  it('detectConflicts excludes the requesting user from "other users" check', async () => {
    await seedActiveWork('alice')
    await sharedStore.updateFilePaths(PROJECT, 'alice', ['a.ts'])
    // Only alice on a.ts → no other users → no conflict
    const conflicts = await manager.detectConflicts(PROJECT, 'alice', ['a.ts'])
    expect(conflicts).toEqual([])
  })

  it('detectConflicts returns [] for empty filePaths', async () => {
    await seedActiveWork('alice')
    expect(await manager.detectConflicts(PROJECT, 'alice', [])).toEqual([])
  })

  it('getProjectConflicts surfaces every file with 2+ users (regardless of caller)', async () => {
    await seedActiveWork('alice')
    await seedActiveWork('bob', { taskId: 'T2.0' })
    await seedActiveWork('carol', { taskId: 'T3.0' })

    await sharedStore.updateFilePaths(PROJECT, 'alice', ['shared.ts', 'alice-only.ts'])
    await sharedStore.updateFilePaths(PROJECT, 'bob', ['shared.ts'])
    await sharedStore.updateFilePaths(PROJECT, 'carol', ['carol-only.ts'])

    const all = await manager.getProjectConflicts(PROJECT)
    expect(all).toHaveLength(1)
    expect(all[0].filePath).toBe('shared.ts')
    expect(all[0].users.map((u) => u.userId).sort()).toEqual(['alice', 'bob'])
  })

  it('handles users with no filePaths (skips them in conflict detection)', async () => {
    await seedActiveWork('alice')
    await seedActiveWork('bob', { taskId: 'T2.0' })
    // Only alice updates files — bob has no filePaths
    await sharedStore.updateFilePaths(PROJECT, 'alice', ['shared.ts'])

    const conflicts = await manager.detectConflicts(PROJECT, 'alice', ['shared.ts'])
    expect(conflicts).toEqual([])
  })
})
