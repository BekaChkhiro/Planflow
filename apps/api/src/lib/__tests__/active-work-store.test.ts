/**
 * Active Work Store Unit Tests (T20.4)
 * Tests the InMemoryActiveWorkStore implementation — exercises the
 * heartbeat/TTL/file-paths contract that the Redis store also implements.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { InMemoryActiveWorkStore, ACTIVE_WORK_TTL_MS } from '../redis.js'

const PROJECT = 'proj-1'
const USER = 'user-1'
const OTHER_USER = 'user-2'

const sampleWork = (overrides: Partial<{
  taskId: string
  taskUuid: string
  taskName: string
  userId: string
  userEmail: string
  userName: string | null
  filePaths?: string[]
}> = {}) => ({
  taskId: 'T1.1',
  taskUuid: 'uuid-1',
  taskName: 'Build login',
  userId: USER,
  userEmail: 'a@example.com',
  userName: 'Alice',
  ...overrides,
})

describe('InMemoryActiveWorkStore', () => {
  let store: InMemoryActiveWorkStore

  beforeEach(() => {
    vi.useFakeTimers()
    store = new InMemoryActiveWorkStore()
  })

  afterEach(() => {
    store.clearAllTimers()
    vi.useRealTimers()
  })

  it('setActiveWork stores entry with startedAt and lastHeartbeat', async () => {
    const work = await store.setActiveWork(PROJECT, USER, sampleWork())
    expect(work.taskId).toBe('T1.1')
    expect(work.startedAt).toBeTruthy()
    expect(work.lastHeartbeat).toBe(work.startedAt)
    expect(await store.getActiveWork(PROJECT, USER)).toEqual(work)
  })

  it('setActiveWork overwrites previous entry for same user', async () => {
    await store.setActiveWork(PROJECT, USER, sampleWork({ taskId: 'T1.1' }))
    await store.setActiveWork(PROJECT, USER, sampleWork({ taskId: 'T2.2', taskUuid: 'uuid-2' }))
    const current = await store.getActiveWork(PROJECT, USER)
    expect(current?.taskId).toBe('T2.2')
  })

  it('getProjectActiveWork returns all users', async () => {
    await store.setActiveWork(PROJECT, USER, sampleWork({ userId: USER }))
    await store.setActiveWork(PROJECT, OTHER_USER, sampleWork({ userId: OTHER_USER, taskId: 'T3.3' }))
    const all = await store.getProjectActiveWork(PROJECT)
    expect(all.map((w) => w.userId).sort()).toEqual([USER, OTHER_USER].sort())
  })

  it('clearActiveWork removes the entry and returns true', async () => {
    await store.setActiveWork(PROJECT, USER, sampleWork())
    expect(await store.clearActiveWork(PROJECT, USER)).toBe(true)
    expect(await store.getActiveWork(PROJECT, USER)).toBeNull()
  })

  it('clearActiveWork returns false when no entry exists', async () => {
    expect(await store.clearActiveWork(PROJECT, USER)).toBe(false)
  })

  it('heartbeat updates lastHeartbeat without losing other fields', async () => {
    const created = await store.setActiveWork(PROJECT, USER, sampleWork())
    vi.advanceTimersByTime(1000)
    const ok = await store.heartbeat(PROJECT, USER)
    expect(ok).toBe(true)
    const after = await store.getActiveWork(PROJECT, USER)
    expect(after).not.toBeNull()
    expect(after!.taskId).toBe(created.taskId)
    expect(new Date(after!.lastHeartbeat).getTime()).toBeGreaterThanOrEqual(
      new Date(created.lastHeartbeat).getTime()
    )
  })

  it('heartbeat returns false when no active work', async () => {
    expect(await store.heartbeat(PROJECT, USER)).toBe(false)
  })

  it('entry expires after TTL when no heartbeats are sent', async () => {
    await store.setActiveWork(PROJECT, USER, sampleWork())
    vi.advanceTimersByTime(ACTIVE_WORK_TTL_MS + 1)
    await vi.runOnlyPendingTimersAsync()
    expect(await store.getActiveWork(PROJECT, USER)).toBeNull()
  })

  it('heartbeat keeps entry alive past initial TTL', async () => {
    await store.setActiveWork(PROJECT, USER, sampleWork())

    // Heartbeat halfway through the TTL window — resets the timer to a fresh TTL.
    vi.advanceTimersByTime(ACTIVE_WORK_TTL_MS / 2)
    await store.heartbeat(PROJECT, USER)

    // Advance past the point the *original* timer would have fired (TTL).
    // The reset timer fires at TTL/2 + TTL, so at TTL+100ms the entry is alive.
    vi.advanceTimersByTime(ACTIVE_WORK_TTL_MS / 2 + 100)
    expect(await store.getActiveWork(PROJECT, USER)).not.toBeNull()
  })

  it('updateFilePaths returns null when no active work exists', async () => {
    expect(await store.updateFilePaths(PROJECT, USER, ['a.ts'])).toBeNull()
  })

  it('updateFilePaths replaces the file list and refreshes heartbeat', async () => {
    const created = await store.setActiveWork(PROJECT, USER, sampleWork())
    vi.advanceTimersByTime(500)
    const updated = await store.updateFilePaths(PROJECT, USER, ['a.ts', 'b.ts'])
    expect(updated?.filePaths).toEqual(['a.ts', 'b.ts'])
    expect(new Date(updated!.lastHeartbeat).getTime()).toBeGreaterThanOrEqual(
      new Date(created.lastHeartbeat).getTime()
    )
  })

  it('clearUserActiveWork is equivalent to clearActiveWork', async () => {
    await store.setActiveWork(PROJECT, USER, sampleWork())
    expect(await store.clearUserActiveWork(PROJECT, USER)).toBe(true)
    expect(await store.getActiveWork(PROJECT, USER)).toBeNull()
  })

  it('getProjectActiveWork returns empty array for unknown project', async () => {
    expect(await store.getProjectActiveWork('nope')).toEqual([])
  })

  it('does not leak state across projects', async () => {
    await store.setActiveWork(PROJECT, USER, sampleWork())
    await store.setActiveWork('other-proj', USER, sampleWork({ taskId: 'T9.9' }))
    const left = await store.getProjectActiveWork(PROJECT)
    const right = await store.getProjectActiveWork('other-proj')
    expect(left).toHaveLength(1)
    expect(right).toHaveLength(1)
    expect(left[0].taskId).toBe('T1.1')
    expect(right[0].taskId).toBe('T9.9')
  })
})
