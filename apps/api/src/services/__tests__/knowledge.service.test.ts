/**
 * Knowledge Service Unit Tests (T20.3)
 * CRUD validation + project-scope enforcement.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { repoMocks } = vi.hoisted(() => ({
  repoMocks: {
    findByProject: vi.fn(),
    findById: vi.fn(),
    findByIdWithAuthors: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../../repositories/knowledge.repository.js', () => ({
  knowledgeRepository: repoMocks,
}))

import { KnowledgeService } from '../knowledge.service.js'
import { NotFoundError, ValidationError } from '../errors.js'

const PROJECT_ID = 'proj-1'
const USER_ID = 'user-1'

function fakeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'k-1',
    projectId: PROJECT_ID,
    type: 'other',
    source: 'manual',
    title: 'Title',
    content: 'Body',
    tags: null,
    metadata: null,
    createdBy: USER_ID,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('KnowledgeService.list', () => {
  let service: KnowledgeService

  beforeEach(() => {
    service = new KnowledgeService()
    repoMocks.findByProject.mockResolvedValue({ data: [fakeEntry()], total: 1 })
  })

  it('paginates with sane defaults (page=1, limit=20)', async () => {
    await service.list({ projectId: PROJECT_ID })
    expect(repoMocks.findByProject).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT_ID, limit: 20, offset: 0 })
    )
  })

  it('caps limit at 100', async () => {
    await service.list({ projectId: PROJECT_ID, limit: 5000 })
    expect(repoMocks.findByProject).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 })
    )
  })

  it('clamps page to >= 1', async () => {
    await service.list({ projectId: PROJECT_ID, page: 0, limit: 10 })
    expect(repoMocks.findByProject).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 0 })
    )
  })

  it('computes offset from page', async () => {
    await service.list({ projectId: PROJECT_ID, page: 3, limit: 10 })
    expect(repoMocks.findByProject).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 20, limit: 10 })
    )
  })

  it('rejects invalid type', async () => {
    await expect(
      service.list({ projectId: PROJECT_ID, type: 'bogus' })
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects invalid source', async () => {
    await expect(
      service.list({ projectId: PROJECT_ID, source: 'bogus' })
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('passes through search term', async () => {
    await service.list({ projectId: PROJECT_ID, search: 'auth' })
    expect(repoMocks.findByProject).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'auth' })
    )
  })
})

describe('KnowledgeService.getById', () => {
  let service: KnowledgeService

  beforeEach(() => {
    service = new KnowledgeService()
  })

  it('returns the entry when project matches', async () => {
    repoMocks.findByIdWithAuthors.mockResolvedValue(fakeEntry())
    const entry = await service.getById('k-1', PROJECT_ID)
    expect(entry.id).toBe('k-1')
  })

  it('throws NotFoundError when entry missing', async () => {
    repoMocks.findByIdWithAuthors.mockResolvedValue(null)
    await expect(service.getById('missing', PROJECT_ID)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('throws NotFoundError when entry belongs to a different project (no cross-project leak)', async () => {
    repoMocks.findByIdWithAuthors.mockResolvedValue(fakeEntry({ projectId: 'other-proj' }))
    await expect(service.getById('k-1', PROJECT_ID)).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('KnowledgeService.create', () => {
  let service: KnowledgeService

  beforeEach(() => {
    service = new KnowledgeService()
    repoMocks.create.mockImplementation((input) => Promise.resolve(fakeEntry(input)))
  })

  it('requires non-empty title', async () => {
    await expect(
      service.create(PROJECT_ID, USER_ID, { title: '   ', content: 'body' })
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('requires non-empty content', async () => {
    await expect(
      service.create(PROJECT_ID, USER_ID, { title: 'X', content: '' })
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects invalid type', async () => {
    await expect(
      service.create(PROJECT_ID, USER_ID, { title: 'X', content: 'Y', type: 'nope' })
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects invalid source', async () => {
    await expect(
      service.create(PROJECT_ID, USER_ID, { title: 'X', content: 'Y', source: 'nope' })
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('defaults type=other, source=manual; trims whitespace', async () => {
    await service.create(PROJECT_ID, USER_ID, {
      title: '  Hello  ',
      content: '\nWorld\t',
    })
    expect(repoMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PROJECT_ID,
        title: 'Hello',
        content: 'World',
        type: 'other',
        source: 'manual',
        createdBy: USER_ID,
      })
    )
  })

  it('passes through valid type, tags, metadata', async () => {
    await service.create(PROJECT_ID, USER_ID, {
      title: 'A',
      content: 'B',
      type: 'architecture',
      tags: ['x', 'y'],
      metadata: { confidence: 0.9 },
    })
    expect(repoMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'architecture',
        tags: ['x', 'y'],
        metadata: { confidence: 0.9 },
      })
    )
  })
})

describe('KnowledgeService.update', () => {
  let service: KnowledgeService

  beforeEach(() => {
    service = new KnowledgeService()
  })

  it('throws NotFoundError if entry not in project', async () => {
    repoMocks.findById.mockResolvedValue(fakeEntry({ projectId: 'other-proj' }))
    await expect(
      service.update('k-1', PROJECT_ID, USER_ID, { title: 'New' })
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('rejects empty title', async () => {
    repoMocks.findById.mockResolvedValue(fakeEntry())
    await expect(
      service.update('k-1', PROJECT_ID, USER_ID, { title: '   ' })
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects empty content', async () => {
    repoMocks.findById.mockResolvedValue(fakeEntry())
    await expect(
      service.update('k-1', PROJECT_ID, USER_ID, { content: '' })
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('passes only provided fields to repository, plus updatedBy', async () => {
    repoMocks.findById.mockResolvedValue(fakeEntry())
    repoMocks.update.mockResolvedValue(fakeEntry({ title: 'Updated' }))

    await service.update('k-1', PROJECT_ID, USER_ID, { title: '  Updated  ' })

    expect(repoMocks.update).toHaveBeenCalledWith('k-1', {
      updatedBy: USER_ID,
      title: 'Updated',
    })
  })

  it('allows clearing tags and metadata via null', async () => {
    repoMocks.findById.mockResolvedValue(fakeEntry())
    repoMocks.update.mockResolvedValue(fakeEntry())

    await service.update('k-1', PROJECT_ID, USER_ID, { tags: null, metadata: null })

    expect(repoMocks.update).toHaveBeenCalledWith('k-1', {
      updatedBy: USER_ID,
      tags: null,
      metadata: null,
    })
  })
})

describe('KnowledgeService.delete', () => {
  let service: KnowledgeService

  beforeEach(() => {
    service = new KnowledgeService()
  })

  it('throws NotFoundError if entry not in project', async () => {
    repoMocks.findById.mockResolvedValue(fakeEntry({ projectId: 'other-proj' }))
    await expect(service.delete('k-1', PROJECT_ID)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('throws NotFoundError if repo delete returns false', async () => {
    repoMocks.findById.mockResolvedValue(fakeEntry())
    repoMocks.delete.mockResolvedValue(false)
    await expect(service.delete('k-1', PROJECT_ID)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('returns void on success', async () => {
    repoMocks.findById.mockResolvedValue(fakeEntry())
    repoMocks.delete.mockResolvedValue(true)
    await expect(service.delete('k-1', PROJECT_ID)).resolves.toBeUndefined()
  })
})
