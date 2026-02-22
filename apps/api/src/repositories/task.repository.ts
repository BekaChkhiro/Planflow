/**
 * Task Repository
 * Handles all task-related database operations
 */

import { and, desc, eq, inArray } from 'drizzle-orm'
import { schema } from '../db/index.js'
import { BaseRepository, type FindAllOptions } from './base.repository.js'

// Status and complexity enum types
export const TaskStatuses = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'] as const
export const TaskComplexities = ['Low', 'Medium', 'High'] as const

export type TaskStatus = (typeof TaskStatuses)[number]
export type TaskComplexity = (typeof TaskComplexities)[number]

// Types
export interface Task {
  id: string
  projectId: string
  taskId: string
  name: string
  description: string | null
  status: TaskStatus
  complexity: TaskComplexity
  estimatedHours: number | null
  dependencies: string[] | null
  assigneeId: string | null
  assignedBy: string | null
  assignedAt: Date | null
  lockedBy: string | null
  lockedAt: Date | null
  githubIssueNumber: number | null
  githubIssueUrl: string | null
  githubPrNumber: number | null
  githubPrUrl: string | null
  createdAt: Date
  updatedAt: Date
}

export interface TaskSummary {
  id: string
  taskId: string
  name: string
  description: string | null
  status: TaskStatus
  complexity: TaskComplexity
  estimatedHours: number | null
  dependencies: string[] | null
  assigneeId: string | null
  assignedBy: string | null
  assignedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateTaskInput {
  projectId: string
  taskId: string
  name: string
  description?: string | null
  status?: TaskStatus
  complexity?: TaskComplexity
  estimatedHours?: number | null
  dependencies?: string[] | null
}

export interface UpdateTaskInput {
  taskId?: string
  name?: string
  description?: string | null
  status?: TaskStatus
  complexity?: TaskComplexity
  estimatedHours?: number | null
  dependencies?: string[] | null
  assigneeId?: string | null
  assignedBy?: string | null
  assignedAt?: Date | null
  lockedBy?: string | null
  lockedAt?: Date | null
  githubIssueNumber?: number | null
  githubIssueUrl?: string | null
  githubPrNumber?: number | null
  githubPrUrl?: string | null
}

export interface TaskStats {
  total: number
  completed: number
  inProgress: number
  blocked: number
  todo: number
}

/**
 * TaskRepository - Handles task data access
 */
export class TaskRepository extends BaseRepository {
  /**
   * Find task by UUID
   */
  async findById(id: string): Promise<Task | null> {
    const [task] = await this.db
      .select({
        id: schema.tasks.id,
        projectId: schema.tasks.projectId,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        description: schema.tasks.description,
        status: schema.tasks.status,
        complexity: schema.tasks.complexity,
        estimatedHours: schema.tasks.estimatedHours,
        dependencies: schema.tasks.dependencies,
        assigneeId: schema.tasks.assigneeId,
        assignedBy: schema.tasks.assignedBy,
        assignedAt: schema.tasks.assignedAt,
        lockedBy: schema.tasks.lockedBy,
        lockedAt: schema.tasks.lockedAt,
        githubIssueNumber: schema.tasks.githubIssueNumber,
        githubIssueUrl: schema.tasks.githubIssueUrl,
        githubPrNumber: schema.tasks.githubPrNumber,
        githubPrUrl: schema.tasks.githubPrUrl,
        createdAt: schema.tasks.createdAt,
        updatedAt: schema.tasks.updatedAt,
      })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, id))
      .limit(1)

    return task ?? null
  }

  /**
   * Find task by taskId (e.g., T1.1) within a project
   */
  async findByTaskId(projectId: string, taskId: string): Promise<Task | null> {
    const [task] = await this.db
      .select({
        id: schema.tasks.id,
        projectId: schema.tasks.projectId,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        description: schema.tasks.description,
        status: schema.tasks.status,
        complexity: schema.tasks.complexity,
        estimatedHours: schema.tasks.estimatedHours,
        dependencies: schema.tasks.dependencies,
        assigneeId: schema.tasks.assigneeId,
        assignedBy: schema.tasks.assignedBy,
        assignedAt: schema.tasks.assignedAt,
        lockedBy: schema.tasks.lockedBy,
        lockedAt: schema.tasks.lockedAt,
        githubIssueNumber: schema.tasks.githubIssueNumber,
        githubIssueUrl: schema.tasks.githubIssueUrl,
        githubPrNumber: schema.tasks.githubPrNumber,
        githubPrUrl: schema.tasks.githubPrUrl,
        createdAt: schema.tasks.createdAt,
        updatedAt: schema.tasks.updatedAt,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskId)))
      .limit(1)

    return task ?? null
  }

  /**
   * Find all tasks for a project
   */
  async findAllByProjectId(projectId: string, options?: FindAllOptions): Promise<TaskSummary[]> {
    const limit = options?.limit ?? 500
    const offset = options?.offset ?? 0

    const tasks = await this.db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        description: schema.tasks.description,
        status: schema.tasks.status,
        complexity: schema.tasks.complexity,
        estimatedHours: schema.tasks.estimatedHours,
        dependencies: schema.tasks.dependencies,
        assigneeId: schema.tasks.assigneeId,
        assignedBy: schema.tasks.assignedBy,
        assignedAt: schema.tasks.assignedAt,
        createdAt: schema.tasks.createdAt,
        updatedAt: schema.tasks.updatedAt,
      })
      .from(schema.tasks)
      .where(eq(schema.tasks.projectId, projectId))
      .orderBy(desc(schema.tasks.updatedAt))
      .limit(limit)
      .offset(offset)

    return tasks
  }

  /**
   * Find tasks by multiple IDs
   */
  async findByIds(ids: string[]): Promise<Task[]> {
    if (ids.length === 0) return []

    const tasks = await this.db
      .select({
        id: schema.tasks.id,
        projectId: schema.tasks.projectId,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        description: schema.tasks.description,
        status: schema.tasks.status,
        complexity: schema.tasks.complexity,
        estimatedHours: schema.tasks.estimatedHours,
        dependencies: schema.tasks.dependencies,
        assigneeId: schema.tasks.assigneeId,
        assignedBy: schema.tasks.assignedBy,
        assignedAt: schema.tasks.assignedAt,
        lockedBy: schema.tasks.lockedBy,
        lockedAt: schema.tasks.lockedAt,
        githubIssueNumber: schema.tasks.githubIssueNumber,
        githubIssueUrl: schema.tasks.githubIssueUrl,
        githubPrNumber: schema.tasks.githubPrNumber,
        githubPrUrl: schema.tasks.githubPrUrl,
        createdAt: schema.tasks.createdAt,
        updatedAt: schema.tasks.updatedAt,
      })
      .from(schema.tasks)
      .where(inArray(schema.tasks.id, ids))

    return tasks
  }

  /**
   * Find tasks assigned to a user
   */
  async findByAssigneeId(assigneeId: string, options?: FindAllOptions): Promise<TaskSummary[]> {
    const limit = options?.limit ?? 100
    const offset = options?.offset ?? 0

    const tasks = await this.db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        description: schema.tasks.description,
        status: schema.tasks.status,
        complexity: schema.tasks.complexity,
        estimatedHours: schema.tasks.estimatedHours,
        dependencies: schema.tasks.dependencies,
        assigneeId: schema.tasks.assigneeId,
        assignedBy: schema.tasks.assignedBy,
        assignedAt: schema.tasks.assignedAt,
        createdAt: schema.tasks.createdAt,
        updatedAt: schema.tasks.updatedAt,
      })
      .from(schema.tasks)
      .where(eq(schema.tasks.assigneeId, assigneeId))
      .orderBy(desc(schema.tasks.updatedAt))
      .limit(limit)
      .offset(offset)

    return tasks
  }

  /**
   * Get task IDs for a project (for validation)
   */
  async getTaskIdsForProject(projectId: string): Promise<Set<string>> {
    const tasks = await this.db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(eq(schema.tasks.projectId, projectId))

    return new Set(tasks.map((t) => t.id))
  }

  /**
   * Get task statistics for a project
   */
  async getStatsForProject(projectId: string): Promise<TaskStats> {
    const tasks = await this.db
      .select({ status: schema.tasks.status })
      .from(schema.tasks)
      .where(eq(schema.tasks.projectId, projectId))

    const stats: TaskStats = {
      total: tasks.length,
      completed: 0,
      inProgress: 0,
      blocked: 0,
      todo: 0,
    }

    for (const task of tasks) {
      switch (task.status) {
        case 'DONE':
          stats.completed++
          break
        case 'IN_PROGRESS':
          stats.inProgress++
          break
        case 'BLOCKED':
          stats.blocked++
          break
        default:
          stats.todo++
      }
    }

    return stats
  }

  /**
   * Create a new task
   */
  async create(data: CreateTaskInput): Promise<Task> {
    const [newTask] = await this.db
      .insert(schema.tasks)
      .values({
        projectId: data.projectId,
        taskId: data.taskId,
        name: data.name,
        description: data.description ?? null,
        status: data.status,
        complexity: data.complexity,
        estimatedHours: data.estimatedHours ?? null,
        dependencies: data.dependencies ?? null,
      })
      .returning({
        id: schema.tasks.id,
        projectId: schema.tasks.projectId,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        description: schema.tasks.description,
        status: schema.tasks.status,
        complexity: schema.tasks.complexity,
        estimatedHours: schema.tasks.estimatedHours,
        dependencies: schema.tasks.dependencies,
        assigneeId: schema.tasks.assigneeId,
        assignedBy: schema.tasks.assignedBy,
        assignedAt: schema.tasks.assignedAt,
        lockedBy: schema.tasks.lockedBy,
        lockedAt: schema.tasks.lockedAt,
        githubIssueNumber: schema.tasks.githubIssueNumber,
        githubIssueUrl: schema.tasks.githubIssueUrl,
        githubPrNumber: schema.tasks.githubPrNumber,
        githubPrUrl: schema.tasks.githubPrUrl,
        createdAt: schema.tasks.createdAt,
        updatedAt: schema.tasks.updatedAt,
      })

    if (!newTask) {
      throw new Error('Failed to create task')
    }

    return newTask
  }

  /**
   * Create multiple tasks (bulk insert)
   */
  async createMany(tasks: CreateTaskInput[]): Promise<number> {
    if (tasks.length === 0) return 0

    const values = tasks.map((t) => ({
      projectId: t.projectId,
      taskId: t.taskId,
      name: t.name,
      description: t.description ?? null,
      status: t.status,
      complexity: t.complexity,
      estimatedHours: t.estimatedHours ?? null,
      dependencies: t.dependencies ?? null,
    }))

    const result = await this.db.insert(schema.tasks).values(values)

    return tasks.length
  }

  /**
   * Update task by UUID
   */
  async update(id: string, data: UpdateTaskInput): Promise<Task | null> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (data.taskId !== undefined) updateData['taskId'] = data.taskId
    if (data.name !== undefined) updateData['name'] = data.name
    if (data.description !== undefined) updateData['description'] = data.description
    if (data.status !== undefined) updateData['status'] = data.status
    if (data.complexity !== undefined) updateData['complexity'] = data.complexity
    if (data.estimatedHours !== undefined) updateData['estimatedHours'] = data.estimatedHours
    if (data.dependencies !== undefined) updateData['dependencies'] = data.dependencies
    if (data.assigneeId !== undefined) updateData['assigneeId'] = data.assigneeId
    if (data.assignedBy !== undefined) updateData['assignedBy'] = data.assignedBy
    if (data.assignedAt !== undefined) updateData['assignedAt'] = data.assignedAt
    if (data.lockedBy !== undefined) updateData['lockedBy'] = data.lockedBy
    if (data.lockedAt !== undefined) updateData['lockedAt'] = data.lockedAt
    if (data.githubIssueNumber !== undefined) updateData['githubIssueNumber'] = data.githubIssueNumber
    if (data.githubIssueUrl !== undefined) updateData['githubIssueUrl'] = data.githubIssueUrl
    if (data.githubPrNumber !== undefined) updateData['githubPrNumber'] = data.githubPrNumber
    if (data.githubPrUrl !== undefined) updateData['githubPrUrl'] = data.githubPrUrl

    const [updated] = await this.db
      .update(schema.tasks)
      .set(updateData)
      .where(eq(schema.tasks.id, id))
      .returning({
        id: schema.tasks.id,
        projectId: schema.tasks.projectId,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        description: schema.tasks.description,
        status: schema.tasks.status,
        complexity: schema.tasks.complexity,
        estimatedHours: schema.tasks.estimatedHours,
        dependencies: schema.tasks.dependencies,
        assigneeId: schema.tasks.assigneeId,
        assignedBy: schema.tasks.assignedBy,
        assignedAt: schema.tasks.assignedAt,
        lockedBy: schema.tasks.lockedBy,
        lockedAt: schema.tasks.lockedAt,
        githubIssueNumber: schema.tasks.githubIssueNumber,
        githubIssueUrl: schema.tasks.githubIssueUrl,
        githubPrNumber: schema.tasks.githubPrNumber,
        githubPrUrl: schema.tasks.githubPrUrl,
        createdAt: schema.tasks.createdAt,
        updatedAt: schema.tasks.updatedAt,
      })

    return updated ?? null
  }

  /**
   * Update task status by taskId (e.g., T1.1)
   */
  async updateStatusByTaskId(projectId: string, taskId: string, status: TaskStatus): Promise<Task | null> {
    const [updated] = await this.db
      .update(schema.tasks)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskId)))
      .returning({
        id: schema.tasks.id,
        projectId: schema.tasks.projectId,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        description: schema.tasks.description,
        status: schema.tasks.status,
        complexity: schema.tasks.complexity,
        estimatedHours: schema.tasks.estimatedHours,
        dependencies: schema.tasks.dependencies,
        assigneeId: schema.tasks.assigneeId,
        assignedBy: schema.tasks.assignedBy,
        assignedAt: schema.tasks.assignedAt,
        lockedBy: schema.tasks.lockedBy,
        lockedAt: schema.tasks.lockedAt,
        githubIssueNumber: schema.tasks.githubIssueNumber,
        githubIssueUrl: schema.tasks.githubIssueUrl,
        githubPrNumber: schema.tasks.githubPrNumber,
        githubPrUrl: schema.tasks.githubPrUrl,
        createdAt: schema.tasks.createdAt,
        updatedAt: schema.tasks.updatedAt,
      })

    return updated ?? null
  }

  /**
   * Assign task to a user
   */
  async assignTask(id: string, assigneeId: string, assignedBy: string): Promise<Task | null> {
    return this.update(id, {
      assigneeId,
      assignedBy,
      assignedAt: new Date(),
    })
  }

  /**
   * Unassign task
   */
  async unassignTask(id: string): Promise<Task | null> {
    return this.update(id, {
      assigneeId: null,
      assignedBy: null,
      assignedAt: null,
    })
  }

  /**
   * Lock task for editing
   */
  async lockTask(id: string, lockedBy: string): Promise<Task | null> {
    return this.update(id, {
      lockedBy,
      lockedAt: new Date(),
    })
  }

  /**
   * Unlock task
   */
  async unlockTask(id: string): Promise<Task | null> {
    return this.update(id, {
      lockedBy: null,
      lockedAt: null,
    })
  }

  /**
   * Delete task by UUID
   */
  async delete(id: string): Promise<boolean> {
    const [deleted] = await this.db
      .delete(schema.tasks)
      .where(eq(schema.tasks.id, id))
      .returning({ id: schema.tasks.id })

    return !!deleted
  }

  /**
   * Delete all tasks for a project
   */
  async deleteAllByProjectId(projectId: string): Promise<number> {
    const deleted = await this.db
      .delete(schema.tasks)
      .where(eq(schema.tasks.projectId, projectId))
      .returning({ id: schema.tasks.id })

    return deleted.length
  }

  /**
   * Check if task belongs to project
   */
  async belongsToProject(taskId: string, projectId: string): Promise<boolean> {
    const [task] = await this.db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.projectId, projectId)))
      .limit(1)

    return !!task
  }
}

// Export singleton instance
export const taskRepository = new TaskRepository()
