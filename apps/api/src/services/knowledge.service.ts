/**
 * Knowledge Service
 * Business logic for project knowledge CRUD operations
 */

import {
  knowledgeRepository,
  type KnowledgeEntry,
  type CreateKnowledgeInput,
  type UpdateKnowledgeInput,
  type KnowledgeListOptions,
} from '../repositories/knowledge.repository.js'
import { NotFoundError, ValidationError } from './errors.js'
import type { PaginatedResult } from '../repositories/base.repository.js'

// Valid knowledge types
const VALID_TYPES = [
  'architecture',
  'pattern',
  'convention',
  'decision',
  'dependency',
  'environment',
  'other',
] as const

// Valid knowledge sources
const VALID_SOURCES = ['manual', 'auto_detected', 'imported'] as const

export interface KnowledgeQuery {
  projectId: string
  type?: string
  source?: string
  search?: string
  page?: number
  limit?: number
}

export class KnowledgeService {
  /**
   * List knowledge entries for a project
   */
  async list(query: KnowledgeQuery): Promise<PaginatedResult<KnowledgeEntry>> {
    const limit = Math.min(query.limit ?? 20, 100)
    const page = Math.max(query.page ?? 1, 1)
    const offset = (page - 1) * limit

    if (query.type && !VALID_TYPES.includes(query.type as any)) {
      throw new ValidationError(`Invalid type. Must be one of: ${VALID_TYPES.join(', ')}`)
    }

    if (query.source && !VALID_SOURCES.includes(query.source as any)) {
      throw new ValidationError(`Invalid source. Must be one of: ${VALID_SOURCES.join(', ')}`)
    }

    return knowledgeRepository.findByProject({
      projectId: query.projectId,
      type: query.type,
      source: query.source,
      search: query.search,
      limit,
      offset,
    })
  }

  /**
   * Get a single knowledge entry by ID
   */
  async getById(id: string, projectId: string): Promise<KnowledgeEntry> {
    const entry = await knowledgeRepository.findByIdWithAuthors(id)

    if (!entry) {
      throw new NotFoundError('Knowledge entry', id)
    }

    // Ensure entry belongs to the project
    if (entry.projectId !== projectId) {
      throw new NotFoundError('Knowledge entry', id)
    }

    return entry
  }

  /**
   * Create a new knowledge entry
   */
  async create(
    projectId: string,
    userId: string,
    input: { title: string; content: string; type?: string; source?: string; tags?: string[]; metadata?: Record<string, unknown> }
  ): Promise<KnowledgeEntry> {
    // Validate required fields
    if (!input.title?.trim()) {
      throw new ValidationError('Title is required')
    }

    if (!input.content?.trim()) {
      throw new ValidationError('Content is required')
    }

    if (input.type && !VALID_TYPES.includes(input.type as any)) {
      throw new ValidationError(`Invalid type. Must be one of: ${VALID_TYPES.join(', ')}`)
    }

    if (input.source && !VALID_SOURCES.includes(input.source as any)) {
      throw new ValidationError(`Invalid source. Must be one of: ${VALID_SOURCES.join(', ')}`)
    }

    return knowledgeRepository.create({
      projectId,
      title: input.title.trim(),
      content: input.content.trim(),
      type: input.type ?? 'other',
      source: input.source ?? 'manual',
      tags: input.tags ?? null,
      metadata: input.metadata ?? null,
      createdBy: userId,
    })
  }

  /**
   * Update a knowledge entry
   */
  async update(
    id: string,
    projectId: string,
    userId: string,
    input: { title?: string; content?: string; type?: string; tags?: string[] | null; metadata?: Record<string, unknown> | null }
  ): Promise<KnowledgeEntry> {
    // Verify entry exists and belongs to project
    const existing = await knowledgeRepository.findById(id)
    if (!existing || existing.projectId !== projectId) {
      throw new NotFoundError('Knowledge entry', id)
    }

    if (input.type && !VALID_TYPES.includes(input.type as any)) {
      throw new ValidationError(`Invalid type. Must be one of: ${VALID_TYPES.join(', ')}`)
    }

    if (input.title !== undefined && !input.title?.trim()) {
      throw new ValidationError('Title cannot be empty')
    }

    if (input.content !== undefined && !input.content?.trim()) {
      throw new ValidationError('Content cannot be empty')
    }

    const updateData: UpdateKnowledgeInput = { updatedBy: userId }

    if (input.title !== undefined) updateData.title = input.title.trim()
    if (input.content !== undefined) updateData.content = input.content.trim()
    if (input.type !== undefined) updateData.type = input.type
    if (input.tags !== undefined) updateData.tags = input.tags
    if (input.metadata !== undefined) updateData.metadata = input.metadata

    const updated = await knowledgeRepository.update(id, updateData)
    if (!updated) {
      throw new NotFoundError('Knowledge entry', id)
    }

    return updated
  }

  /**
   * Delete a knowledge entry
   */
  async delete(id: string, projectId: string): Promise<void> {
    // Verify entry exists and belongs to project
    const existing = await knowledgeRepository.findById(id)
    if (!existing || existing.projectId !== projectId) {
      throw new NotFoundError('Knowledge entry', id)
    }

    const deleted = await knowledgeRepository.delete(id)
    if (!deleted) {
      throw new NotFoundError('Knowledge entry', id)
    }
  }
}

// Export singleton
export const knowledgeService = new KnowledgeService()
