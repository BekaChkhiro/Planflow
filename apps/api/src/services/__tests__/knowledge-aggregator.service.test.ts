/**
 * Knowledge Aggregator Service Tests (T20.8)
 * Verifies the 4-layer fan-out (PG knowledge + LanceDB vector + Redis
 * realtime + activity log) with each layer mockable independently —
 * including the failure-isolation contract (one layer crashing must
 * not collapse the rest).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { repoMocks, ragMock, activeWorkStoreMock, recentChangesStoreMock, dbMock } = vi.hoisted(
  () => ({
    repoMocks: {
      findByProject: vi.fn(),
    },
    ragMock: { search: vi.fn() },
    activeWorkStoreMock: {
      getProjectActiveWork: vi.fn(),
    },
    recentChangesStoreMock: {
      getRecentChanges: vi.fn(),
      getChangeCount: vi.fn(),
    },
    dbMock: { select: vi.fn() },
  })
)

vi.mock('../../repositories/knowledge.repository.js', () => ({
  knowledgeRepository: repoMocks,
}))

vi.mock('../rag.service.js', () => ({
  ragService: ragMock,
}))

vi.mock('../../lib/redis.js', () => ({
  getActiveWorkStore: () => activeWorkStoreMock,
  getRecentChangesStore: () => recentChangesStoreMock,
}))

vi.mock('../../db/index.js', () => ({
  getDbClient: () => ({
    select: (...args: unknown[]) => dbMock.select(...args),
  }),
  schema: {
    activityLog: {
      id: 'id',
      action: 'action',
      entityType: 'entityType',
      entityId: 'entityId',
      taskId: 'taskId',
      description: 'description',
      createdAt: 'createdAt',
      projectId: 'projectId',
      actorId: 'actorId',
    },
    users: { id: 'id', email: 'email', name: 'name' },
  },
}))

import { KnowledgeAggregatorService } from '../knowledge-aggregator.service.js'

const PROJECT = 'proj-1'

const knowledgeEntry = (id: string) => ({
  id,
  projectId: PROJECT,
  type: 'architecture',
  source: 'manual',
  title: `Entry ${id}`,
  content: 'body',
  tags: null,
  metadata: null,
  createdBy: null,
  updatedBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
})

const activeWork = (userId: string) => ({
  taskId: 'T1.1',
  taskUuid: 'uuid',
  taskName: 'X',
  userId,
  userEmail: `${userId}@x.com`,
  userName: null,
  startedAt: new Date().toISOString(),
  lastHeartbeat: new Date().toISOString(),
})

const changeEntry = (id: string) => ({
  id,
  projectId: PROJECT,
  userId: 'u',
  userEmail: 'u@x.com',
  userName: null,
  entityType: 'task' as const,
  entityId: 'T1.1',
  action: 'updated' as const,
  summary: 's',
  timestamp: new Date().toISOString(),
})

/**
 * Builds a chainable Drizzle-like query that yields the supplied
 * activity rows for the first call, and a count value for the second.
 * The aggregator calls db.select() twice — once for entries, once for count.
 */
function mockActivityQueries(entries: unknown[], countValue: number) {
  let call = 0
  dbMock.select.mockImplementation(() => {
    call += 1
    if (call === 1) {
      return {
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => Promise.resolve(entries),
              }),
            }),
          }),
        }),
      }
    }
    return {
      from: () => ({
        where: () => Promise.resolve([{ value: countValue }]),
      }),
    }
  })
}

describe('KnowledgeAggregatorService', () => {
  let svc: KnowledgeAggregatorService

  beforeEach(() => {
    svc = new KnowledgeAggregatorService()
    repoMocks.findByProject.mockResolvedValue({
      data: [knowledgeEntry('k1'), knowledgeEntry('k2')],
      total: 2,
    })
    activeWorkStoreMock.getProjectActiveWork.mockResolvedValue([activeWork('u1')])
    recentChangesStoreMock.getRecentChanges.mockResolvedValue([changeEntry('c1')])
    recentChangesStoreMock.getChangeCount.mockResolvedValue(1)
    ragMock.search.mockResolvedValue([])
    mockActivityQueries([], 0)
  })

  it('aggregates default layers (knowledge + realtime + activity), skips vector when no query', async () => {
    mockActivityQueries(
      [{ id: 'a1', action: 'created', entityType: 'task', entityId: 'T1.1', taskId: 'T1.1', description: null, actorEmail: null, actorName: null, createdAt: new Date() }],
      1,
    )
    const ctx = await svc.aggregate({ projectId: PROJECT })

    expect(ctx.projectId).toBe(PROJECT)
    expect(ctx.layers.knowledge?.total).toBe(2)
    expect(ctx.layers.vector).toBeNull()
    expect(ctx.layers.realtime?.activeWork).toHaveLength(1)
    expect(ctx.layers.realtime?.recentChanges).toHaveLength(1)
    expect(ctx.layers.activity?.total).toBe(1)

    expect(ctx.summary.layersLoaded.sort()).toEqual(['activity', 'knowledge', 'realtime'])
    expect(ctx.summary.layerErrors).toEqual([])
    expect(ctx.summary.knowledgeCount).toBe(2)
    expect(ctx.summary.activeWorkers).toBe(1)
    expect(ctx.summary.recentChangesCount).toBe(1)
  })

  it('includes vector layer only when query is provided AND vector layer requested', async () => {
    ragMock.search.mockResolvedValue([
      { id: 'v1', filePath: 'a.ts', startLine: 1, endLine: 10, score: 0.9, kind: 'function', name: 'foo', language: 'typescript', content: 'x' } as any,
    ])

    const ctx = await svc.aggregate({
      projectId: PROJECT,
      query: 'auth flow',
      layers: ['knowledge', 'vector'],
    })

    expect(ragMock.search).toHaveBeenCalledWith(PROJECT, { query: 'auth flow', limit: 10 })
    expect(ctx.layers.vector?.total).toBe(1)
    expect(ctx.layers.vector?.query).toBe('auth flow')
    expect(ctx.layers.realtime).toBeNull()
    expect(ctx.layers.activity).toBeNull()
    expect(ctx.summary.layersLoaded).toContain('vector')
  })

  it('skips vector layer when requested but no query supplied', async () => {
    const ctx = await svc.aggregate({ projectId: PROJECT, layers: ['knowledge', 'vector'] })
    expect(ctx.layers.vector).toBeNull()
    expect(ragMock.search).not.toHaveBeenCalled()
  })

  it('isolates layer failures: a crashing knowledge layer does not break the rest', async () => {
    repoMocks.findByProject.mockRejectedValue(new Error('PG down'))

    const ctx = await svc.aggregate({ projectId: PROJECT })

    expect(ctx.layers.knowledge).toBeNull()
    expect(ctx.summary.layerErrors).toContain('knowledge')
    expect(ctx.summary.layersLoaded).not.toContain('knowledge')
    // Realtime + activity still load
    expect(ctx.layers.realtime).not.toBeNull()
    expect(ctx.summary.layersLoaded).toContain('realtime')
  })

  it('isolates realtime failure', async () => {
    activeWorkStoreMock.getProjectActiveWork.mockRejectedValue(new Error('Redis down'))

    const ctx = await svc.aggregate({ projectId: PROJECT })

    expect(ctx.layers.realtime).toBeNull()
    expect(ctx.summary.layerErrors).toContain('realtime')
    expect(ctx.layers.knowledge).not.toBeNull()
  })

  it('passes knowledge type filter and custom limits through', async () => {
    await svc.aggregate({
      projectId: PROJECT,
      knowledgeLimit: 5,
      knowledgeType: 'architecture',
      changesLimit: 7,
    })

    expect(repoMocks.findByProject).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT, type: 'architecture', limit: 5, offset: 0 })
    )
    expect(recentChangesStoreMock.getRecentChanges).toHaveBeenCalledWith(
      PROJECT,
      expect.objectContaining({ limit: 7 })
    )
  })
})
