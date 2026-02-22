import { Hono } from 'hono'
import { and, desc, eq } from 'drizzle-orm'
import {
  CreateProjectRequestSchema,
  UpdateProjectRequestSchema,
  BulkUpdateTasksRequestSchema,
} from '@planflow/shared'
import { getDbClient, schema, withTransaction } from '../db/index.js'
import { auth, getAuth, largeBodyLimit } from '../middleware/index.js'
import { canCreateProject, getProjectLimits } from '../utils/helpers.js'
import { parsePlanTasks } from '../lib/task-parser.js'
import {
  broadcastTaskUpdated,
  broadcastTasksUpdated,
  broadcastTasksSynced,
  getTaskLock,
} from '../websocket/index.js'

const projectRoutes = new Hono()

// ============================================
// Project Routes
// ============================================

// List all projects for the authenticated user
projectRoutes.get('/', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    const projects = await db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        description: schema.projects.description,
        plan: schema.projects.plan,
        createdAt: schema.projects.createdAt,
        updatedAt: schema.projects.updatedAt,
      })
      .from(schema.projects)
      .where(eq(schema.projects.userId, user.id))
      .orderBy(desc(schema.projects.updatedAt))

    // Get project limits for the user
    const limits = await getProjectLimits(user.id)

    return c.json({
      success: true,
      data: { projects, limits },
    })
  } catch (error) {
    console.error('List projects error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// Create a new project
projectRoutes.post('/', auth, async (c) => {
  try {
    const { user } = getAuth(c)

    const body = await c.req.json()
    const validation = CreateProjectRequestSchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
        },
        400
      )
    }

    // Check project limits before creating
    const limitCheck = await canCreateProject(user.id)

    if (!limitCheck.allowed) {
      return c.json(
        {
          success: false,
          error: limitCheck.reason,
          code: 'PROJECT_LIMIT_REACHED',
          details: {
            currentCount: limitCheck.currentCount,
            maxProjects: limitCheck.maxProjects,
            tier: limitCheck.tier,
            status: limitCheck.status,
          },
        },
        403
      )
    }

    const { name, description, plan } = validation.data
    const db = getDbClient()

    const [newProject] = await db
      .insert(schema.projects)
      .values({
        name,
        description: description ?? null,
        plan: plan ?? null,
        userId: user.id,
      })
      .returning({
        id: schema.projects.id,
        name: schema.projects.name,
        description: schema.projects.description,
        plan: schema.projects.plan,
        createdAt: schema.projects.createdAt,
        updatedAt: schema.projects.updatedAt,
      })

    // Get updated limits after creation
    const limits = await getProjectLimits(user.id)

    return c.json({ success: true, data: { project: newProject, limits } }, 201)
  } catch (error) {
    console.error('Create project error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /projects/:id - Get a single project
projectRoutes.get('/:id', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    const db = getDbClient()

    // Check if project exists and belongs to user
    const [project] = await db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        description: schema.projects.description,
        plan: schema.projects.plan,
        createdAt: schema.projects.createdAt,
        updatedAt: schema.projects.updatedAt,
      })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))
      .limit(1)

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    return c.json({ success: true, data: { project } })
  } catch (error) {
    console.error('Get project error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// PUT /projects/:id - Update a project
projectRoutes.put('/:id', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    const body = await c.req.json()
    const validation = UpdateProjectRequestSchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
        },
        400
      )
    }

    const { name, description, plan } = validation.data

    // Check if at least one field is provided
    if (name === undefined && description === undefined && plan === undefined) {
      return c.json(
        {
          success: false,
          error: 'At least one field (name, description, or plan) must be provided',
        },
        400
      )
    }

    const db = getDbClient()

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }
    if (name !== undefined) updateData['name'] = name
    if (description !== undefined) updateData['description'] = description
    if (plan !== undefined) updateData['plan'] = plan

    const [updatedProject] = await db
      .update(schema.projects)
      .set(updateData)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))
      .returning({
        id: schema.projects.id,
        name: schema.projects.name,
        description: schema.projects.description,
        plan: schema.projects.plan,
        createdAt: schema.projects.createdAt,
        updatedAt: schema.projects.updatedAt,
      })

    if (!updatedProject) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    return c.json({ success: true, data: { project: updatedProject } })
  } catch (error) {
    console.error('Update project error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// DELETE /projects/:id - Delete a project
projectRoutes.delete('/:id', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    const db = getDbClient()

    const [deletedProject] = await db
      .delete(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))
      .returning({ id: schema.projects.id })

    if (!deletedProject) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    return c.json({ success: true, data: { message: 'Project deleted successfully' } })
  } catch (error) {
    console.error('Delete project error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /projects/:id/plan - Get project plan content
projectRoutes.get('/:id/plan', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    const db = getDbClient()

    const [project] = await db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        plan: schema.projects.plan,
        updatedAt: schema.projects.updatedAt,
      })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    return c.json({
      success: true,
      data: {
        projectId: project.id,
        projectName: project.name,
        plan: project.plan,
        updatedAt: project.updatedAt,
      },
    })
  } catch (error) {
    console.error('Get project plan error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// PUT /projects/:id/plan - Update project plan content
// Uses larger body limit for plan content (up to 5MB)
projectRoutes.put('/:id/plan', largeBodyLimit, auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    const body = await c.req.json()

    // Validate request body - plan field is required
    if (typeof body.plan !== 'string' && body.plan !== null) {
      return c.json(
        {
          success: false,
          error: 'Validation failed',
          details: { plan: ['Plan must be a string or null'] },
        },
        400
      )
    }

    const db = getDbClient()

    // Parse tasks from plan content first (before any DB operations)
    let parsedTasks: ReturnType<typeof parsePlanTasks> = []
    let tasksCount = 0
    let completedCount = 0

    if (body.plan) {
      try {
        parsedTasks = parsePlanTasks(body.plan)
        tasksCount = parsedTasks.length
        completedCount = parsedTasks.filter((t) => t.status === 'DONE').length
      } catch (parseError) {
        console.error('Task parsing error (non-fatal):', parseError)
        // Continue even if parsing fails - plan will still be saved
      }
    }

    // Use transaction for atomic project update + task sync
    const updatedProject = await withTransaction(async (tx) => {
      // Update project plan
      const [project] = await tx
        .update(schema.projects)
        .set({
          plan: body.plan,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))
        .returning({
          id: schema.projects.id,
          name: schema.projects.name,
          plan: schema.projects.plan,
          updatedAt: schema.projects.updatedAt,
        })

      if (!project) {
        throw new Error('PROJECT_NOT_FOUND')
      }

      // Sync tasks within same transaction
      if (parsedTasks.length > 0) {
        // Delete existing tasks for this project
        await tx.delete(schema.tasks).where(eq(schema.tasks.projectId, projectId))

        // Insert new tasks
        const tasksToInsert = parsedTasks.map((task) => ({
          projectId,
          taskId: task.taskId,
          name: task.name,
          description: task.description,
          status: task.status,
          complexity: task.complexity,
          estimatedHours: task.estimatedHours,
          dependencies: task.dependencies,
        }))

        await tx.insert(schema.tasks).values(tasksToInsert)
      }

      return project
    }).catch((error) => {
      if (error.message === 'PROJECT_NOT_FOUND') {
        return null
      }
      throw error
    })

    if (!updatedProject) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    const progress = tasksCount > 0 ? Math.round((completedCount / tasksCount) * 100) : 0

    // Broadcast tasks synced via WebSocket
    // Don't exclude sender - HTTP API clients (like CLI) aren't on WebSocket,
    // so the same user on web should receive the update
    if (tasksCount > 0) {
      broadcastTasksSynced(projectId, {
        tasksCount,
        completedCount,
        progress,
      })
    }

    return c.json({
      success: true,
      data: {
        projectId: updatedProject.id,
        projectName: updatedProject.name,
        plan: updatedProject.plan,
        updatedAt: updatedProject.updatedAt,
        tasksCount,
        completedCount,
        progress,
      },
    })
  } catch (error) {
    console.error('Update project plan error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /projects/:id/tasks - List all tasks for a project
projectRoutes.get('/:id/tasks', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    const db = getDbClient()

    // First verify the project exists and belongs to the user
    const [project] = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Get all tasks for the project, sorted by updatedAt DESC (most recently updated first)
    const tasks = await db
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

    // Get assignee info for tasks that have assignees
    const assigneeIds = [...new Set(tasks.filter((t) => t.assigneeId).map((t) => t.assigneeId!))]
    let userMap: Record<string, { id: string; email: string; name: string | null }> = {}

    if (assigneeIds.length > 0) {
      for (const userId of assigneeIds) {
        const [u] = await db
          .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
          .from(schema.users)
          .where(eq(schema.users.id, userId))
        if (u) userMap[u.id] = u
      }
    }

    // Map tasks with assignee info
    const tasksWithAssignees = tasks.map((task) => {
      const assigneeUser = task.assigneeId ? userMap[task.assigneeId] : null
      return {
        ...task,
        assignee: assigneeUser
          ? {
              id: assigneeUser.id,
              email: assigneeUser.email,
              name: assigneeUser.name,
            }
          : null,
      }
    })

    return c.json({
      success: true,
      data: {
        projectId: project.id,
        projectName: project.name,
        tasks: tasksWithAssignees,
      },
    })
  } catch (error) {
    console.error('List project tasks error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// PUT /projects/:id/tasks - Bulk update tasks for a project
projectRoutes.put('/:id/tasks', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    const body = await c.req.json()
    const validation = BulkUpdateTasksRequestSchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
        },
        400
      )
    }

    const { tasks: taskUpdates } = validation.data
    const db = getDbClient()

    // First verify the project exists and belongs to the user
    const [project] = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Verify all task IDs belong to this project
    const taskIds = taskUpdates.map((t) => t.id)
    const existingTasks = await db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId)))

    const existingTaskIds = new Set(existingTasks.map((t) => t.id))
    const invalidTaskIds = taskIds.filter((id) => !existingTaskIds.has(id))

    if (invalidTaskIds.length > 0) {
      return c.json(
        {
          success: false,
          error: 'Some tasks do not exist or do not belong to this project',
          details: { invalidTaskIds },
        },
        400
      )
    }

    // Use transaction for atomic bulk task updates
    const updatedTasks = await withTransaction(async (tx) => {
      const results = []

      for (const taskUpdate of taskUpdates) {
        const { id, ...updateFields } = taskUpdate

        // Build update object with only provided fields
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
            createdAt: schema.tasks.createdAt,
            updatedAt: schema.tasks.updatedAt,
          })

        if (updated) {
          results.push(updated)
        }
      }

      // Update project's updatedAt timestamp (within same transaction)
      await tx
        .update(schema.projects)
        .set({ updatedAt: new Date() })
        .where(eq(schema.projects.id, projectId))

      return results
    })

    // Get user info for broadcast (T6.4)
    const [updaterUser] = await db
      .select({ email: schema.users.email, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))
      .limit(1)

    // Broadcast all task updates via WebSocket (T6.4 - enhanced with updatedBy)
    // Don't exclude sender - HTTP API clients aren't on WebSocket
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
          id: user.id,
          email: updaterUser?.email || user.email,
          name: updaterUser?.name || null,
        }
      )
    }

    return c.json({
      success: true,
      data: {
        projectId: project.id,
        projectName: project.name,
        updatedCount: updatedTasks.length,
        tasks: updatedTasks,
      },
    })
  } catch (error) {
    console.error('Update project tasks error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// PATCH /projects/:id/tasks/:taskId - Update a single task by taskId (e.g., T1.1)
projectRoutes.patch('/:id/tasks/:taskId', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId') // e.g., "T1.1"

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format (e.g., T1.1, T2.10)
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    const body = await c.req.json()

    // Validate status if provided
    const validStatuses = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED']
    if (body.status && !validStatuses.includes(body.status)) {
      return c.json(
        { success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        400
      )
    }

    const db = getDbClient()

    // Verify the project exists and belongs to the user
    const [project] = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Find the task by taskId (e.g., T1.1)
    const [existingTask] = await db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!existingTask) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found in this project` }, 404)
    }

    // Check if task is locked by another user (T6.6)
    const lock = await getTaskLock(projectId, taskIdParam)
    if (lock && lock.lockedBy.userId !== user.id) {
      return c.json({
        success: false,
        error: `Task ${taskIdParam} is currently being edited by ${lock.lockedBy.name || lock.lockedBy.email}`,
        code: 'TASK_LOCKED',
        lock: {
          taskId: lock.taskId,
          lockedBy: lock.lockedBy,
          lockedAt: lock.lockedAt,
          expiresAt: lock.expiresAt,
        },
      }, 423) // 423 Locked
    }

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }
    if (body.name !== undefined) updateData['name'] = body.name
    if (body.description !== undefined) updateData['description'] = body.description
    if (body.status !== undefined) updateData['status'] = body.status
    if (body.complexity !== undefined) updateData['complexity'] = body.complexity
    if (body.estimatedHours !== undefined) updateData['estimatedHours'] = body.estimatedHours
    if (body.dependencies !== undefined) updateData['dependencies'] = body.dependencies

    // Update the task
    const [updated] = await db
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

    // Update project's updatedAt timestamp
    await db
      .update(schema.projects)
      .set({ updatedAt: new Date() })
      .where(eq(schema.projects.id, projectId))

    if (!updated) {
      return c.json({ success: false, error: 'Failed to update task' }, 500)
    }

    // Get user info for broadcast (T6.4)
    const [updaterUser] = await db
      .select({ email: schema.users.email, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))
      .limit(1)

    // Broadcast task update via WebSocket (T6.4 - enhanced with updatedBy)
    // Don't exclude sender - HTTP API clients aren't on WebSocket
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
        id: user.id,
        email: updaterUser?.email || user.email,
        name: updaterUser?.name || null,
      }
    )

    // Get assignee info if task is assigned
    let assignee = null
    if (updated.assigneeId) {
      const [assigneeUser] = await db
        .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
        .from(schema.users)
        .where(eq(schema.users.id, updated.assigneeId))
      assignee = assigneeUser || null
    }

    return c.json({
      success: true,
      data: {
        projectId: project.id,
        projectName: project.name,
        task: {
          ...updated,
          assignee,
        },
      },
    })
  } catch (error) {
    console.error('Update task error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

export { projectRoutes }
