/**
 * Recent Changes Store Unit Tests (T20.5)
 * Tests the InMemoryRecentChangesStore — the cap, ordering, filters,
 * and per-project isolation that the Redis store also has to provide.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  InMemoryRecentChangesStore,
  RECENT_CHANGES_MAX_ENTRIES,
  type AddChangeInput,
} from '../redis.js'

const PROJECT = 'proj-1'

const change = (overrides: Partial<AddChangeInput> = {}): AddChangeInput => ({
  projectId: PROJECT,
  userId: 'user-1',
  userEmail: 'a@example.com',
  userName: 'Alice',
  entityType: 'task',
  entityId: 'T1.1',
  action: 'updated',
  summary: 'updated T1.1',
  ...overrides,
})

describe('InMemoryRecentChangesStore', () => {
  let store: InMemoryRecentChangesStore

  beforeEach(() => {
    store = new InMemoryRecentChangesStore()
  })

  it('addChange assigns id + timestamp and returns the entry', async () => {
    const entry = await store.addChange(PROJECT, change())
    expect(entry.id).toBeTruthy()
    expect(entry.timestamp).toBeTruthy()
    expect(entry.entityId).toBe('T1.1')
  })

  it('getRecentChanges returns newest first', async () => {
    await store.addChange(PROJECT, change({ entityId: 'T1.1', summary: 'first' }))
    await store.addChange(PROJECT, change({ entityId: 'T1.2', summary: 'second' }))
    await store.addChange(PROJECT, change({ entityId: 'T1.3', summary: 'third' }))
    const all = await store.getRecentChanges(PROJECT)
    expect(all.map((c) => c.entityId)).toEqual(['T1.3', 'T1.2', 'T1.1'])
  })

  it('default limit is 50, cap at 200', async () => {
    for (let i = 0; i < 60; i++) {
      await store.addChange(PROJECT, change({ entityId: `T${i}` }))
    }
    expect((await store.getRecentChanges(PROJECT)).length).toBe(50)
    expect((await store.getRecentChanges(PROJECT, { limit: 500 })).length).toBeLessThanOrEqual(200)
  })

  it('caps stored entries at RECENT_CHANGES_MAX_ENTRIES (1000)', async () => {
    // Add 1100 — only 1000 most recent should remain
    for (let i = 0; i < RECENT_CHANGES_MAX_ENTRIES + 100; i++) {
      await store.addChange(PROJECT, change({ entityId: `T${i}` }))
    }
    const count = await store.getChangeCount(PROJECT)
    expect(count).toBe(RECENT_CHANGES_MAX_ENTRIES)

    // The first 100 entries (T0..T99) should have been evicted
    const all = await store.getRecentChanges(PROJECT, { limit: 200 })
    expect(all.find((c) => c.entityId === 'T0')).toBeUndefined()
    expect(all[0].entityId).toBe(`T${RECENT_CHANGES_MAX_ENTRIES + 99}`)
  })

  it('filters by entityType', async () => {
    await store.addChange(PROJECT, change({ entityType: 'task', entityId: 'T1.1' }))
    await store.addChange(PROJECT, change({ entityType: 'knowledge', entityId: 'k-1' }))
    await store.addChange(PROJECT, change({ entityType: 'comment', entityId: 'c-1' }))

    const tasks = await store.getRecentChanges(PROJECT, { entityType: 'task' })
    expect(tasks).toHaveLength(1)
    expect(tasks[0].entityId).toBe('T1.1')
  })

  it('filters by userId', async () => {
    await store.addChange(PROJECT, change({ userId: 'user-1' }))
    await store.addChange(PROJECT, change({ userId: 'user-2' }))
    await store.addChange(PROJECT, change({ userId: 'user-1', entityId: 'T2.0' }))

    const u1 = await store.getRecentChanges(PROJECT, { userId: 'user-1' })
    expect(u1).toHaveLength(2)
    expect(u1.every((c) => c.userId === 'user-1')).toBe(true)
  })

  it('filters by since (strictly after)', async () => {
    const first = await store.addChange(PROJECT, change({ entityId: 'old' }))
    // Wait one ms so timestamps differ
    await new Promise((r) => setTimeout(r, 5))
    await store.addChange(PROJECT, change({ entityId: 'newer' }))

    const after = await store.getRecentChanges(PROJECT, { since: first.timestamp })
    expect(after.map((c) => c.entityId)).toEqual(['newer'])
  })

  it('supports offset for pagination', async () => {
    for (let i = 0; i < 10; i++) {
      await store.addChange(PROJECT, change({ entityId: `T${i}` }))
    }
    const page = await store.getRecentChanges(PROJECT, { limit: 3, offset: 3 })
    expect(page.map((c) => c.entityId)).toEqual(['T6', 'T5', 'T4'])
  })

  it('getChangeCount reflects insertions and clearing', async () => {
    expect(await store.getChangeCount(PROJECT)).toBe(0)
    await store.addChange(PROJECT, change())
    await store.addChange(PROJECT, change())
    expect(await store.getChangeCount(PROJECT)).toBe(2)
    await store.clearChanges(PROJECT)
    expect(await store.getChangeCount(PROJECT)).toBe(0)
    expect(await store.getRecentChanges(PROJECT)).toEqual([])
  })

  it('does not leak entries across projects', async () => {
    await store.addChange(PROJECT, change({ entityId: 'A' }))
    await store.addChange('other-proj', change({ projectId: 'other-proj', entityId: 'B' }))

    const left = await store.getRecentChanges(PROJECT)
    const right = await store.getRecentChanges('other-proj')

    expect(left.map((c) => c.entityId)).toEqual(['A'])
    expect(right.map((c) => c.entityId)).toEqual(['B'])
  })
})
