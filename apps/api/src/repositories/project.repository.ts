/**
 * Project Repository
 * Handles all project-related database operations
 */

import { and, desc, eq, sql } from 'drizzle-orm'
import { schema } from '../db/index.js'
import { BaseRepository, type FindAllOptions } from './base.repository.js'

// Types
export interface Project {
  id: string
  name: string
  description: string | null
  plan: string | null
  userId: string
  createdAt: Date
  updatedAt: Date
}

export interface ProjectSummary {
  id: string
  name: string
  description: string | null
  plan: string | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateProjectInput {
  name: string
  description?: string | null
  plan?: string | null
  userId: string
}

export interface UpdateProjectInput {
  name?: string
  description?: string | null
  plan?: string | null
}

/**
 * ProjectRepository - Handles project data access
 */
export class ProjectRepository extends BaseRepository {
  /**
   * Find project by ID
   */
  async findById(id: string): Promise<Project | null> {
    const [project] = await this.db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        description: schema.projects.description,
        plan: schema.projects.plan,
        userId: schema.projects.userId,
        createdAt: schema.projects.createdAt,
        updatedAt: schema.projects.updatedAt,
      })
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .limit(1)

    return project ?? null
  }

  /**
   * Find project by ID for a specific user (with ownership check)
   */
  async findByIdForUser(id: string, userId: string): Promise<ProjectSummary | null> {
    const [project] = await this.db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        description: schema.projects.description,
        plan: schema.projects.plan,
        createdAt: schema.projects.createdAt,
        updatedAt: schema.projects.updatedAt,
      })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, id), eq(schema.projects.userId, userId)))
      .limit(1)

    return project ?? null
  }

  /**
   * Find all projects for a user
   */
  async findAllByUserId(userId: string, options?: FindAllOptions): Promise<ProjectSummary[]> {
    const limit = options?.limit ?? 100
    const offset = options?.offset ?? 0

    const projects = await this.db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        description: schema.projects.description,
        plan: schema.projects.plan,
        createdAt: schema.projects.createdAt,
        updatedAt: schema.projects.updatedAt,
      })
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId))
      .orderBy(desc(schema.projects.updatedAt))
      .limit(limit)
      .offset(offset)

    return projects
  }

  /**
   * Count projects for a user
   */
  async countByUserId(userId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId))

    return result?.count ?? 0
  }

  /**
   * Create a new project
   */
  async create(data: CreateProjectInput): Promise<Project> {
    const [newProject] = await this.db
      .insert(schema.projects)
      .values({
        name: data.name,
        description: data.description ?? null,
        plan: data.plan ?? null,
        userId: data.userId,
      })
      .returning({
        id: schema.projects.id,
        name: schema.projects.name,
        description: schema.projects.description,
        plan: schema.projects.plan,
        userId: schema.projects.userId,
        createdAt: schema.projects.createdAt,
        updatedAt: schema.projects.updatedAt,
      })

    if (!newProject) {
      throw new Error('Failed to create project')
    }

    return newProject
  }

  /**
   * Update project by ID
   */
  async update(id: string, data: UpdateProjectInput): Promise<Project | null> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (data.name !== undefined) updateData['name'] = data.name
    if (data.description !== undefined) updateData['description'] = data.description
    if (data.plan !== undefined) updateData['plan'] = data.plan

    const [updated] = await this.db
      .update(schema.projects)
      .set(updateData)
      .where(eq(schema.projects.id, id))
      .returning({
        id: schema.projects.id,
        name: schema.projects.name,
        description: schema.projects.description,
        plan: schema.projects.plan,
        userId: schema.projects.userId,
        createdAt: schema.projects.createdAt,
        updatedAt: schema.projects.updatedAt,
      })

    return updated ?? null
  }

  /**
   * Update project for a specific user (with ownership check)
   */
  async updateForUser(id: string, userId: string, data: UpdateProjectInput): Promise<ProjectSummary | null> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (data.name !== undefined) updateData['name'] = data.name
    if (data.description !== undefined) updateData['description'] = data.description
    if (data.plan !== undefined) updateData['plan'] = data.plan

    const [updated] = await this.db
      .update(schema.projects)
      .set(updateData)
      .where(and(eq(schema.projects.id, id), eq(schema.projects.userId, userId)))
      .returning({
        id: schema.projects.id,
        name: schema.projects.name,
        description: schema.projects.description,
        plan: schema.projects.plan,
        createdAt: schema.projects.createdAt,
        updatedAt: schema.projects.updatedAt,
      })

    return updated ?? null
  }

  /**
   * Update project plan content
   */
  async updatePlan(id: string, plan: string | null): Promise<ProjectSummary | null> {
    const [updated] = await this.db
      .update(schema.projects)
      .set({
        plan,
        updatedAt: new Date(),
      })
      .where(eq(schema.projects.id, id))
      .returning({
        id: schema.projects.id,
        name: schema.projects.name,
        description: schema.projects.description,
        plan: schema.projects.plan,
        createdAt: schema.projects.createdAt,
        updatedAt: schema.projects.updatedAt,
      })

    return updated ?? null
  }

  /**
   * Update project timestamp (for cascading updates)
   */
  async touch(id: string): Promise<void> {
    await this.db
      .update(schema.projects)
      .set({ updatedAt: new Date() })
      .where(eq(schema.projects.id, id))
  }

  /**
   * Delete project by ID
   */
  async delete(id: string): Promise<boolean> {
    const [deleted] = await this.db
      .delete(schema.projects)
      .where(eq(schema.projects.id, id))
      .returning({ id: schema.projects.id })

    return !!deleted
  }

  /**
   * Delete project for a specific user (with ownership check)
   */
  async deleteForUser(id: string, userId: string): Promise<boolean> {
    const [deleted] = await this.db
      .delete(schema.projects)
      .where(and(eq(schema.projects.id, id), eq(schema.projects.userId, userId)))
      .returning({ id: schema.projects.id })

    return !!deleted
  }

  /**
   * Check if user owns the project
   */
  async isOwnedByUser(id: string, userId: string): Promise<boolean> {
    const [project] = await this.db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, id), eq(schema.projects.userId, userId)))
      .limit(1)

    return !!project
  }
}

// Export singleton instance
export const projectRepository = new ProjectRepository()
