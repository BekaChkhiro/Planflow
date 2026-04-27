/**
 * Knowledge Repository
 * Handles all project_knowledge database operations
 */

import { and, desc, eq, ilike, or, sql, count } from 'drizzle-orm'
import { schema } from '../db/index.js'
import { BaseRepository, type PaginatedResult } from './base.repository.js'

// Types
export interface KnowledgeEntry {
  id: string
  projectId: string
  type: string
  source: string
  title: string
  content: string
  tags: string[] | null
  metadata: Record<string, unknown> | null
  createdBy: string | null
  updatedBy: string | null
  createdAt: Date
  updatedAt: Date
}

export interface KnowledgeEntryWithAuthor extends KnowledgeEntry {
  creator: { id: string; email: string; name: string | null } | null
  updater: { id: string; email: string; name: string | null } | null
}

export interface CreateKnowledgeInput {
  projectId: string
  type?: string
  source?: string
  title: string
  content: string
  tags?: string[] | null
  metadata?: Record<string, unknown> | null
  createdBy?: string | null
}

export interface UpdateKnowledgeInput {
  type?: string
  title?: string
  content?: string
  tags?: string[] | null
  metadata?: Record<string, unknown> | null
  updatedBy?: string | null
}

export interface KnowledgeListOptions {
  projectId: string
  type?: string
  source?: string
  search?: string
  limit?: number
  offset?: number
}

/**
 * KnowledgeRepository - Handles project knowledge data access
 */
export class KnowledgeRepository extends BaseRepository {
  /**
   * Find knowledge entry by ID
   */
  async findById(id: string): Promise<KnowledgeEntry | null> {
    const [entry] = await this.db
      .select({
        id: schema.projectKnowledge.id,
        projectId: schema.projectKnowledge.projectId,
        type: schema.projectKnowledge.type,
        source: schema.projectKnowledge.source,
        title: schema.projectKnowledge.title,
        content: schema.projectKnowledge.content,
        tags: schema.projectKnowledge.tags,
        metadata: schema.projectKnowledge.metadata,
        createdBy: schema.projectKnowledge.createdBy,
        updatedBy: schema.projectKnowledge.updatedBy,
        createdAt: schema.projectKnowledge.createdAt,
        updatedAt: schema.projectKnowledge.updatedAt,
      })
      .from(schema.projectKnowledge)
      .where(eq(schema.projectKnowledge.id, id))
      .limit(1)

    return (entry as KnowledgeEntry) ?? null
  }

  /**
   * Find knowledge entry by ID with author info
   */
  async findByIdWithAuthors(id: string): Promise<KnowledgeEntryWithAuthor | null> {
    const creatorAlias = schema.users
    const updaterAlias = schema.users

    // Use raw SQL for the second join alias since Drizzle doesn't support table aliases easily
    const [entry] = await this.db
      .select({
        id: schema.projectKnowledge.id,
        projectId: schema.projectKnowledge.projectId,
        type: schema.projectKnowledge.type,
        source: schema.projectKnowledge.source,
        title: schema.projectKnowledge.title,
        content: schema.projectKnowledge.content,
        tags: schema.projectKnowledge.tags,
        metadata: schema.projectKnowledge.metadata,
        createdBy: schema.projectKnowledge.createdBy,
        updatedBy: schema.projectKnowledge.updatedBy,
        createdAt: schema.projectKnowledge.createdAt,
        updatedAt: schema.projectKnowledge.updatedAt,
        creatorEmail: creatorAlias.email,
        creatorName: creatorAlias.name,
      })
      .from(schema.projectKnowledge)
      .leftJoin(
        creatorAlias,
        eq(creatorAlias.id, schema.projectKnowledge.createdBy)
      )
      .where(eq(schema.projectKnowledge.id, id))
      .limit(1)

    if (!entry) return null

    return {
      id: entry.id,
      projectId: entry.projectId,
      type: entry.type,
      source: entry.source,
      title: entry.title,
      content: entry.content,
      tags: entry.tags,
      metadata: entry.metadata as Record<string, unknown> | null,
      createdBy: entry.createdBy,
      updatedBy: entry.updatedBy,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      creator: entry.createdBy
        ? { id: entry.createdBy, email: entry.creatorEmail, name: entry.creatorName }
        : null,
      updater: null, // Simplified - updater lookup would need a second join alias
    } as KnowledgeEntryWithAuthor
  }

  /**
   * List knowledge entries for a project with filtering and pagination
   */
  async findByProject(options: KnowledgeListOptions): Promise<PaginatedResult<KnowledgeEntry>> {
    const { projectId, type, source, search, limit = 20, offset = 0 } = options

    // Build conditions
    const conditions = [eq(schema.projectKnowledge.projectId, projectId)]

    if (type) {
      conditions.push(eq(schema.projectKnowledge.type, type as any))
    }

    if (source) {
      conditions.push(eq(schema.projectKnowledge.source, source as any))
    }

    if (search) {
      conditions.push(
        or(
          ilike(schema.projectKnowledge.title, `%${search}%`),
          ilike(schema.projectKnowledge.content, `%${search}%`)
        )!
      )
    }

    const whereClause = and(...conditions)

    // Get total count
    const countResult = await this.db
      .select({ totalCount: count() })
      .from(schema.projectKnowledge)
      .where(whereClause)
    const totalCount = countResult[0]?.totalCount ?? 0

    // Get paginated entries
    const entries = await this.db
      .select({
        id: schema.projectKnowledge.id,
        projectId: schema.projectKnowledge.projectId,
        type: schema.projectKnowledge.type,
        source: schema.projectKnowledge.source,
        title: schema.projectKnowledge.title,
        content: schema.projectKnowledge.content,
        tags: schema.projectKnowledge.tags,
        metadata: schema.projectKnowledge.metadata,
        createdBy: schema.projectKnowledge.createdBy,
        updatedBy: schema.projectKnowledge.updatedBy,
        createdAt: schema.projectKnowledge.createdAt,
        updatedAt: schema.projectKnowledge.updatedAt,
      })
      .from(schema.projectKnowledge)
      .where(whereClause)
      .orderBy(desc(schema.projectKnowledge.updatedAt))
      .limit(limit)
      .offset(offset)

    return {
      data: entries as KnowledgeEntry[],
      total: totalCount,
      limit,
      offset,
      hasMore: offset + limit < totalCount,
    }
  }

  /**
   * Create a new knowledge entry
   */
  async create(data: CreateKnowledgeInput): Promise<KnowledgeEntry> {
    const [entry] = await this.db
      .insert(schema.projectKnowledge)
      .values({
        projectId: data.projectId,
        type: (data.type as any) ?? 'other',
        source: (data.source as any) ?? 'manual',
        title: data.title,
        content: data.content,
        tags: data.tags ?? null,
        metadata: data.metadata ?? null,
        createdBy: data.createdBy ?? null,
        updatedBy: data.createdBy ?? null,
      })
      .returning({
        id: schema.projectKnowledge.id,
        projectId: schema.projectKnowledge.projectId,
        type: schema.projectKnowledge.type,
        source: schema.projectKnowledge.source,
        title: schema.projectKnowledge.title,
        content: schema.projectKnowledge.content,
        tags: schema.projectKnowledge.tags,
        metadata: schema.projectKnowledge.metadata,
        createdBy: schema.projectKnowledge.createdBy,
        updatedBy: schema.projectKnowledge.updatedBy,
        createdAt: schema.projectKnowledge.createdAt,
        updatedAt: schema.projectKnowledge.updatedAt,
      })

    if (!entry) {
      throw new Error('Failed to create knowledge entry')
    }

    return entry as KnowledgeEntry
  }

  /**
   * Update a knowledge entry
   */
  async update(id: string, data: UpdateKnowledgeInput): Promise<KnowledgeEntry | null> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (data.type !== undefined) updateData['type'] = data.type
    if (data.title !== undefined) updateData['title'] = data.title
    if (data.content !== undefined) updateData['content'] = data.content
    if (data.tags !== undefined) updateData['tags'] = data.tags
    if (data.metadata !== undefined) updateData['metadata'] = data.metadata
    if (data.updatedBy !== undefined) updateData['updatedBy'] = data.updatedBy

    const [updated] = await this.db
      .update(schema.projectKnowledge)
      .set(updateData)
      .where(eq(schema.projectKnowledge.id, id))
      .returning({
        id: schema.projectKnowledge.id,
        projectId: schema.projectKnowledge.projectId,
        type: schema.projectKnowledge.type,
        source: schema.projectKnowledge.source,
        title: schema.projectKnowledge.title,
        content: schema.projectKnowledge.content,
        tags: schema.projectKnowledge.tags,
        metadata: schema.projectKnowledge.metadata,
        createdBy: schema.projectKnowledge.createdBy,
        updatedBy: schema.projectKnowledge.updatedBy,
        createdAt: schema.projectKnowledge.createdAt,
        updatedAt: schema.projectKnowledge.updatedAt,
      })

    return (updated as KnowledgeEntry) ?? null
  }

  /**
   * Delete a knowledge entry
   */
  async delete(id: string): Promise<boolean> {
    const [deleted] = await this.db
      .delete(schema.projectKnowledge)
      .where(eq(schema.projectKnowledge.id, id))
      .returning({ id: schema.projectKnowledge.id })

    return !!deleted
  }
}

// Export singleton
export const knowledgeRepository = new KnowledgeRepository()
