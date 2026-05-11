/**
 * Project Service
 * Handles project CRUD operations and task management
 */

import { and, desc, eq, count, sql, inArray } from 'drizzle-orm'
import { getDbClient, schema, withTransaction } from '../db/index.js'
import { canCreateProject, getProjectLimits } from '../utils/helpers.js'
import { parsePlanTasks } from '../lib/task-parser.js'
import {
  broadcastTaskUpdated,
  broadcastTasksUpdated,
  broadcastTasksSynced,
  getTaskLock,
} from '../websocket/index.js'
import {
  AuthorizationError,
  NotFoundError,
  ServiceError,
  ValidationError,
} from './errors.js'
import type { ProjectLimits } from '@planflow/shared'

// Types
export interface CreateProjectInput {
  name: string
  description?: string | null
  plan?: string | null
  organizationId: string
}

export interface UpdateProjectInput {
  name?: string
  description?: string | null
  plan?: string | null
}

export interface Project {
  id: string
  name: string
  description: string | null
  plan: string | null
  createdAt: Date
  updatedAt: Date
}

export interface ProjectWithLimits {
  project: Project
  limits: ProjectLimits
}

export interface ProjectsListResult {
  projects: Project[]
  limits: ProjectLimits
}

export interface TaskUpdate {
  id: string
  taskId?: string
  name?: string
  description?: string | null
  status?: string
  complexity?: string | null
  estimatedHours?: number | null
  dependencies?: string[]
}

export interface Task {
  id: string
  taskId: string
  name: string
  description: string | null
  status: string
  complexity: string | null
  estimatedHours: number | null
  dependencies: string[] | null
  assigneeId: string | null
  assignedBy: string | null
  assignedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface TaskWithAssignee extends Task {
  assignee: {
    id: string
    email: string
    name: string | null
  } | null
}

export interface PlanUpdateResult {
  projectId: string
  projectName: string
  plan: string | null
  updatedAt: Date
  tasksCount: number
  completedCount: number
  progress: number
}

export interface TaskUpdateContext {
  userId: string
  userEmail: string
  userName: string | null
}

/**
 * ProjectService - Handles project and task operations
 */
export class ProjectService {
  private db = getDbClient()

  /**
   * List all projects for a user
   */
  async listProjects(userId: string): Promise<ProjectsListResult> {
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

    const limits = await getProjectLimits(userId)

    return { projects, limits }
  }

  /**
   * Get a single project by ID
   */
  async getProject(userId: string, projectId: string): Promise<Project> {
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
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
      .limit(1)

    if (!project) {
      throw new NotFoundError('Project', projectId)
    }

    return project
  }

  /**
   * Create a new project
   */
  async createProject(userId: string, input: CreateProjectInput): Promise<ProjectWithLimits> {
    // Check project limits
    const limitCheck = await canCreateProject(userId)
    if (!limitCheck.allowed) {
      throw new AuthorizationError(limitCheck.reason || 'Project limit reached')
    }

    const { name, description, plan, organizationId } = input

    const [newProject] = await this.db
      .insert(schema.projects)
      .values({
        name,
        description: description ?? null,
        plan: plan ?? null,
        userId,
        organizationId,
      })
      .returning({
        id: schema.projects.id,
        name: schema.projects.name,
        description: schema.projects.description,
        plan: schema.projects.plan,
        createdAt: schema.projects.createdAt,
        updatedAt: schema.projects.updatedAt,
      })

    if (!newProject) {
      throw new ServiceError('Failed to create project', 'PROJECT_CREATION_FAILED', 500)
    }

    // Get updated limits
    const limits = await getProjectLimits(userId)

    return { project: newProject, limits }
  }

  /**
   * Update a project
   */
  async updateProject(userId: string, projectId: string, input: UpdateProjectInput): Promise<Project> {
    const { name, description, plan } = input

    // Validate at least one field is provided
    if (name === undefined && description === undefined && plan === undefined) {
      throw new ValidationError('At least one field (name, description, or plan) must be provided')
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }
    if (name !== undefined) updateData['name'] = name
    if (description !== undefined) updateData['description'] = description
    if (plan !== undefined) updateData['plan'] = plan

    const [updatedProject] = await this.db
      .update(schema.projects)
      .set(updateData)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
      .returning({
        id: schema.projects.id,
        name: schema.projects.name,
        description: schema.projects.description,
        plan: schema.projects.plan,
        createdAt: schema.projects.createdAt,
        updatedAt: schema.projects.updatedAt,
      })

    if (!updatedProject) {
      throw new NotFoundError('Project', projectId)
    }

    return updatedProject
  }

  /**
   * Delete a project
   */
  async deleteProject(userId: string, projectId: string): Promise<void> {
    const [deletedProject] = await this.db
      .delete(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
      .returning({ id: schema.projects.id })

    if (!deletedProject) {
      throw new NotFoundError('Project', projectId)
    }
  }

  /**
   * Get project plan content
   */
  async getProjectPlan(userId: string, projectId: string): Promise<{
    projectId: string
    projectName: string
    plan: string | null
    updatedAt: Date
  }> {
    const [project] = await this.db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        plan: schema.projects.plan,
        updatedAt: schema.projects.updatedAt,
      })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))

    if (!project) {
      throw new NotFoundError('Project', projectId)
    }

    return {
      projectId: project.id,
      projectName: project.name,
      plan: project.plan,
      updatedAt: project.updatedAt,
    }
  }

  /**
   * Update project plan and sync tasks.
   *
   * Sync semantics — UPSERT, not delete-and-reinsert.
   *   • Existing tasks are updated in place. Only the fields the
   *     parser explicitly found in the markdown are written; columns
   *     the markdown doesn't speak about (assignee, GitHub links,
   *     displayOrder, lock state, createdAt, status when omitted, …)
   *     are preserved exactly as they are.
   *   • New tasks are inserted with DB-level defaults applied here.
   *   • Tasks present in the DB but not in the markdown are LEFT
   *     UNTOUCHED in 'merge' mode (the default). Pass 'replace' to
   *     delete those orphans — useful for cleaning up renames.
   *
   * Counts are recomputed from the post-sync DB state so progress
   * reflects every task in the project, not just the markdown slice.
   */
  async updateProjectPlan(
    userId: string,
    projectId: string,
    plan: string | null,
    syncMode: 'merge' | 'replace' = 'merge'
  ): Promise<PlanUpdateResult> {
    // Parse tasks from plan content first
    let parsedTasks: ReturnType<typeof parsePlanTasks> = []

    if (plan) {
      try {
        parsedTasks = parsePlanTasks(plan)
      } catch (parseError) {
        console.error('Task parsing error (non-fatal):', parseError)
      }
    }

    // Use transaction for atomic update. We catch outside the chain
    // (instead of `.catch(...)`) so TypeScript narrows the result type
    // correctly — the catch handler always throws, but TS can't see
    // that through a Promise#catch.
    let txResult: {
      project: {
        id: string
        name: string
        plan: string | null
        updatedAt: Date
      }
      tasksCount: number
      completedCount: number
    }
    try {
      txResult = await withTransaction(async (tx) => {
      // Update project plan
      const [project] = await tx
        .update(schema.projects)
        .set({
          plan,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
        .returning({
          id: schema.projects.id,
          name: schema.projects.name,
          plan: schema.projects.plan,
          updatedAt: schema.projects.updatedAt,
        })

      if (!project) {
        throw new Error('PROJECT_NOT_FOUND')
      }

      // Read existing rows so we can update in place and preserve
      // every column the parser doesn't know about.
      const existingTasks = await tx
        .select({ id: schema.tasks.id, taskId: schema.tasks.taskId })
        .from(schema.tasks)
        .where(eq(schema.tasks.projectId, projectId))

      const existingByTaskId = new Map(existingTasks.map((t) => [t.taskId, t]))
      const parsedTaskIds = new Set(parsedTasks.map((t) => t.taskId))

      const tasksToInsert: Array<typeof schema.tasks.$inferInsert> = []

      for (const task of parsedTasks) {
        const existing = existingByTaskId.get(task.taskId)

        if (existing) {
          const updateData: Partial<typeof schema.tasks.$inferInsert> & {
            updatedAt: Date
          } = { updatedAt: new Date() }
          if (task.name !== undefined) updateData.name = task.name
          if (task.description !== undefined) updateData.description = task.description
          if (task.status !== undefined) updateData.status = task.status
          if (task.complexity !== undefined) updateData.complexity = task.complexity
          if (task.estimatedHours !== undefined) updateData.estimatedHours = task.estimatedHours
          if (task.dependencies !== undefined) updateData.dependencies = task.dependencies

          if (Object.keys(updateData).length > 1) {
            await tx
              .update(schema.tasks)
              .set(updateData)
              .where(eq(schema.tasks.id, existing.id))
          }
        } else {
          tasksToInsert.push({
            projectId,
            taskId: task.taskId,
            name: task.name,
            description: task.description ?? null,
            status: task.status ?? 'TODO',
            complexity: task.complexity ?? 'Medium',
            estimatedHours: task.estimatedHours ?? null,
            dependencies: task.dependencies ?? [],
          })
        }
      }

      if (tasksToInsert.length > 0) {
        await tx.insert(schema.tasks).values(tasksToInsert)
      }

      if (syncMode === 'replace' && existingTasks.length > 0) {
        const orphanIds = existingTasks
          .filter((t) => !parsedTaskIds.has(t.taskId))
          .map((t) => t.id)
        if (orphanIds.length > 0) {
          await tx.delete(schema.tasks).where(inArray(schema.tasks.id, orphanIds))
        }
      }

      const countRows = await tx
        .select({
          totalCount: count(),
          doneCount: count(sql`CASE WHEN ${schema.tasks.status} = 'DONE' THEN 1 END`),
        })
        .from(schema.tasks)
        .where(eq(schema.tasks.projectId, projectId))

      const totals = countRows[0] ?? { totalCount: 0, doneCount: 0 }

      return {
        project,
        tasksCount: Number(totals.totalCount),
        completedCount: Number(totals.doneCount),
      }
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
        throw new NotFoundError('Project', projectId)
      }
      throw error
    }

    const { project: updatedProject, tasksCount, completedCount } = txResult
    const progress = tasksCount > 0 ? Math.round((completedCount / tasksCount) * 100) : 0

    if (tasksCount > 0) {
      broadcastTasksSynced(projectId, {
        tasksCount,
        completedCount,
        progress,
      })
    }

    return {
      projectId: updatedProject.id,
      projectName: updatedProject.name,
      plan: updatedProject.plan,
      updatedAt: updatedProject.updatedAt,
      tasksCount,
      completedCount,
      progress,
    }
  }

  /**
   * List tasks for a project
   */
  async listTasks(userId: string, projectId: string): Promise<{
    projectId: string
    projectName: string
    tasks: TaskWithAssignee[]
  }> {
    // Verify project access
    const [project] = await this.db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))

    if (!project) {
      throw new NotFoundError('Project', projectId)
    }

    // Get tasks
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

    // Get assignee info
    const assigneeIds = [...new Set(tasks.filter((t) => t.assigneeId).map((t) => t.assigneeId!))]
    const userMap: Record<string, { id: string; email: string; name: string | null }> = {}

    for (const uid of assigneeIds) {
      const [u] = await this.db
        .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
        .from(schema.users)
        .where(eq(schema.users.id, uid))
      if (u) userMap[u.id] = u
    }

    // Map tasks with assignees
    const tasksWithAssignees: TaskWithAssignee[] = tasks.map((task) => {
      const assigneeUser = task.assigneeId ? userMap[task.assigneeId] : null
      return {
        ...task,
        assignee: assigneeUser ? {
          id: assigneeUser.id,
          email: assigneeUser.email,
          name: assigneeUser.name,
        } : null,
      }
    })

    return {
      projectId: project.id,
      projectName: project.name,
      tasks: tasksWithAssignees,
    }
  }

  /**
   * Bulk update tasks
   */
  async bulkUpdateTasks(
    userId: string,
    projectId: string,
    taskUpdates: TaskUpdate[],
    context: TaskUpdateContext
  ): Promise<{
    projectId: string
    projectName: string
    updatedCount: number
    tasks: Task[]
  }> {
    // Verify project access
    const [project] = await this.db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))

    if (!project) {
      throw new NotFoundError('Project', projectId)
    }

    // Verify task IDs
    const taskIds = taskUpdates.map((t) => t.id)
    const existingTasks = await this.db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(eq(schema.tasks.projectId, projectId))

    const existingTaskIds = new Set(existingTasks.map((t) => t.id))
    const invalidTaskIds = taskIds.filter((id) => !existingTaskIds.has(id))

    if (invalidTaskIds.length > 0) {
      throw new ValidationError('Some tasks do not exist or do not belong to this project', { invalidTaskIds })
    }

    // Update tasks in transaction
    const updatedTasks = await withTransaction(async (tx) => {
      const results: Task[] = []

      for (const taskUpdate of taskUpdates) {
        const { id, ...updateFields } = taskUpdate

        const updateData: Record<string, unknown> = {
          updatedAt: new Date(),
        }
        if (updateFields.taskId !== undefined) updateData['taskId'] = updateFields.taskId
        if (updateFields.name !== undefined) updateData['name'] = updateFields.name
        if (updateFields.description !== undefined) updateData['description'] = updateFields.description
        if (updateFields.status !== undefined) updateData['status'] = updateFields.status
        if (updateFields.complexity !== undefined) updateData['complexity'] = updateFields.complexity
        if (updateFields.estimatedHours !== undefined) updateData['estimatedHours'] = updateFields.estimatedHours
        if (updateFields.dependencies !== undefined) updateData['dependencies'] = updateFields.dependencies

        const [updated] = await tx
          .update(schema.tasks)
          .set(updateData)
          .where(and(eq(schema.tasks.id, id), eq(schema.tasks.projectId, projectId)))
          .returning({
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

        if (updated) {
          results.push(updated)
        }
      }

      // Update project timestamp
      await tx
        .update(schema.projects)
        .set({ updatedAt: new Date() })
        .where(eq(schema.projects.id, projectId))

      return results
    })

    // Broadcast updates
    if (updatedTasks.length > 0) {
      broadcastTasksUpdated(
        projectId,
        updatedTasks.map((t) => ({
          id: t.id,
          taskId: t.taskId,
          name: t.name,
          description: t.description,
          status: t.status,
          complexity: t.complexity,
          estimatedHours: t.estimatedHours,
          dependencies: t.dependencies ?? [],
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        })),
        {
          id: context.userId,
          email: context.userEmail,
          name: context.userName,
        }
      )
    }

    return {
      projectId: project.id,
      projectName: project.name,
      updatedCount: updatedTasks.length,
      tasks: updatedTasks,
    }
  }

  /**
   * Update a single task by taskId (e.g., T1.1)
   */
  async updateTaskByTaskId(
    userId: string,
    projectId: string,
    taskId: string,
    updates: Partial<Omit<TaskUpdate, 'id'>>,
    context: TaskUpdateContext
  ): Promise<TaskWithAssignee> {
    // Verify project access
    const [project] = await this.db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))

    if (!project) {
      throw new NotFoundError('Project', projectId)
    }

    // Find task
    const [existingTask] = await this.db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskId)))

    if (!existingTask) {
      throw new NotFoundError('Task', taskId)
    }

    // Check for lock
    const lock = await getTaskLock(projectId, taskId)
    if (lock && lock.lockedBy.userId !== context.userId) {
      throw new ServiceError(
        `Task ${taskId} is currently being edited by ${lock.lockedBy.name || lock.lockedBy.email}`,
        'TASK_LOCKED',
        423,
        { lock }
      )
    }

    // Build update data
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }
    if (updates.name !== undefined) updateData['name'] = updates.name
    if (updates.description !== undefined) updateData['description'] = updates.description
    if (updates.status !== undefined) updateData['status'] = updates.status
    if (updates.complexity !== undefined) updateData['complexity'] = updates.complexity
    if (updates.estimatedHours !== undefined) updateData['estimatedHours'] = updates.estimatedHours
    if (updates.dependencies !== undefined) updateData['dependencies'] = updates.dependencies

    // Update task
    const [updated] = await this.db
      .update(schema.tasks)
      .set(updateData)
      .where(eq(schema.tasks.id, existingTask.id))
      .returning({
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

    // Update project timestamp
    await this.db
      .update(schema.projects)
      .set({ updatedAt: new Date() })
      .where(eq(schema.projects.id, projectId))

    if (!updated) {
      throw new ServiceError('Failed to update task', 'TASK_UPDATE_FAILED', 500)
    }

    // Broadcast
    broadcastTaskUpdated(
      projectId,
      {
        id: updated.id,
        taskId: updated.taskId,
        name: updated.name,
        description: updated.description,
        status: updated.status,
        complexity: updated.complexity,
        estimatedHours: updated.estimatedHours,
        dependencies: updated.dependencies ?? [],
        assigneeId: updated.assigneeId,
        assignedBy: updated.assignedBy,
        assignedAt: updated.assignedAt,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
      {
        id: context.userId,
        email: context.userEmail,
        name: context.userName,
      }
    )

    // Get assignee info
    let assignee = null
    if (updated.assigneeId) {
      const [assigneeUser] = await this.db
        .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
        .from(schema.users)
        .where(eq(schema.users.id, updated.assigneeId))
      assignee = assigneeUser || null
    }

    return {
      ...updated,
      assignee,
    }
  }
}

// Export singleton instance
export const projectService = new ProjectService()
