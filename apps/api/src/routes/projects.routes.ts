import { Hono } from 'hono'
import { and, desc, eq, count, sql, or, ilike, isNull, isNotNull } from 'drizzle-orm'
import {
  CreateProjectRequestSchema,
  UpdateProjectRequestSchema,
  BulkUpdateTasksRequestSchema,
  BulkAssignTasksRequestSchema,
  BulkDeleteTasksRequestSchema,
  BulkStatusUpdateRequestSchema,
} from '@planflow/shared'
import { getDbClient, schema, withTransaction } from '../db/index.js'
import { auth, getAuth, largeBodyLimit, jwtAuth } from '../middleware/index.js'
import { canCreateProject, getProjectLimits } from '../utils/helpers.js'
import { parsePlanTasks } from '../lib/task-parser.js'
import {
  broadcastTaskUpdated,
  broadcastTasksUpdated,
  broadcastTasksSynced,
  broadcastTasksReordered,
  getTaskLock,
} from '../websocket/index.js'
import {
  fetchGitHubIssue,
  createGitHubIssue,
  fetchGitHubPullRequest,
  createGitHubPullRequest,
  getPrState,
  generateBranchName,
  generateBranchNameAuto,
  fetchGitHubRepository,
  checkRepositoryAccess,
  createGitHubWebhook,
  deleteGitHubWebhook,
  getGitHubWebhook,
  generateWebhookSecret,
  type BranchPrefix,
} from '../lib/github.js'

const projectRoutes = new Hono()

// ============================================
// Project Routes
// ============================================

// List all projects for the authenticated user (with pagination, search, and archive filter)
projectRoutes.get('/', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    // Parse pagination params (default: page 1, 20 items per page)
    const pageParam = c.req.query('page')
    const limitParam = c.req.query('limit')
    const searchParam = c.req.query('search')?.trim()
    // Archive filter: 'active' (default), 'archived', or 'all'
    const archiveFilter = c.req.query('archived') || 'active'

    const page = Math.max(1, parseInt(pageParam || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(limitParam || '20', 10) || 20))
    const offset = (page - 1) * limit

    // Build where clause with user, search, and archive filter
    const conditions = [eq(schema.projects.userId, user.id)]

    // Add archive filter condition
    if (archiveFilter === 'active') {
      conditions.push(isNull(schema.projects.archivedAt))
    } else if (archiveFilter === 'archived') {
      conditions.push(isNotNull(schema.projects.archivedAt))
    }
    // 'all' means no archive filter applied

    // Add search condition if provided
    if (searchParam) {
      conditions.push(
        or(
          ilike(schema.projects.name, `%${searchParam}%`),
          ilike(schema.projects.description, `%${searchParam}%`)
        )!
      )
    }

    const whereCondition = and(...conditions)

    // Get total count for pagination metadata
    const countResult = await db
      .select({ totalCount: count() })
      .from(schema.projects)
      .where(whereCondition)
    const totalCount = countResult[0]?.totalCount ?? 0

    // Get paginated projects
    const projects = await db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        description: schema.projects.description,
        plan: schema.projects.plan,
        createdAt: schema.projects.createdAt,
        updatedAt: schema.projects.updatedAt,
        archivedAt: schema.projects.archivedAt,
      })
      .from(schema.projects)
      .where(whereCondition)
      .orderBy(desc(schema.projects.updatedAt))
      .limit(limit)
      .offset(offset)

    // Get project limits for the user
    const limits = await getProjectLimits(user.id)

    // Also get count of archived projects for UI display
    const archivedCountResult = await db
      .select({ count: count() })
      .from(schema.projects)
      .where(and(eq(schema.projects.userId, user.id), isNotNull(schema.projects.archivedAt)))
    const archivedCount = archivedCountResult[0]?.count ?? 0

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit)
    const hasNextPage = page < totalPages
    const hasPrevPage = page > 1

    return c.json({
      success: true,
      data: {
        projects,
        limits,
        archivedCount,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages,
          hasNextPage,
          hasPrevPage,
        },
      },
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
        archivedAt: schema.projects.archivedAt,
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
        archivedAt: schema.projects.archivedAt,
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

// DELETE /projects/:id - Archive a project (soft delete)
// Use ?permanent=true to permanently delete an archived project
projectRoutes.delete('/:id', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const permanent = c.req.query('permanent') === 'true'

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    const db = getDbClient()

    if (permanent) {
      // Permanent delete - only allow for already archived projects
      const [project] = await db
        .select({ id: schema.projects.id, archivedAt: schema.projects.archivedAt })
        .from(schema.projects)
        .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))
        .limit(1)

      if (!project) {
        return c.json({ success: false, error: 'Project not found' }, 404)
      }

      if (!project.archivedAt) {
        return c.json(
          { success: false, error: 'Project must be archived before permanent deletion' },
          400
        )
      }

      await db
        .delete(schema.projects)
        .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

      return c.json({ success: true, data: { message: 'Project permanently deleted' } })
    }

    // Soft delete (archive)
    const [archivedProject] = await db
      .update(schema.projects)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))
      .returning({
        id: schema.projects.id,
        name: schema.projects.name,
        archivedAt: schema.projects.archivedAt,
      })

    if (!archivedProject) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    return c.json({
      success: true,
      data: { message: 'Project archived successfully', project: archivedProject },
    })
  } catch (error) {
    console.error('Archive project error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// POST /projects/:id/restore - Restore an archived project
projectRoutes.post('/:id/restore', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    const db = getDbClient()

    // Check if project exists and is archived
    const [project] = await db
      .select({ id: schema.projects.id, archivedAt: schema.projects.archivedAt })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))
      .limit(1)

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    if (!project.archivedAt) {
      return c.json({ success: false, error: 'Project is not archived' }, 400)
    }

    // Restore the project
    const [restoredProject] = await db
      .update(schema.projects)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))
      .returning({
        id: schema.projects.id,
        name: schema.projects.name,
        description: schema.projects.description,
        plan: schema.projects.plan,
        createdAt: schema.projects.createdAt,
        updatedAt: schema.projects.updatedAt,
        archivedAt: schema.projects.archivedAt,
      })

    return c.json({
      success: true,
      data: { message: 'Project restored successfully', project: restoredProject },
    })
  } catch (error) {
    console.error('Restore project error:', error)
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

// GET /projects/:id/tasks - List all tasks for a project (with search and filters)
projectRoutes.get('/:id/tasks', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Parse query params for search and filters
    const searchParam = c.req.query('search')?.trim()
    const statusParam = c.req.query('status')?.trim() // comma-separated: TODO,IN_PROGRESS,DONE,BLOCKED
    const complexityParam = c.req.query('complexity')?.trim() // comma-separated: Low,Medium,High
    const assigneeParam = c.req.query('assignee')?.trim() // UUID or 'unassigned'
    const sortParam = c.req.query('sort')?.trim() || 'updatedAt' // taskId, name, status, complexity, updatedAt
    const sortDirParam = c.req.query('sortDir')?.trim() || 'desc' // asc, desc

    const db = getDbClient()

    // First verify the project exists and belongs to the user
    const [project] = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Build filter conditions
    const conditions: ReturnType<typeof eq>[] = [eq(schema.tasks.projectId, projectId)]

    // Search filter (taskId, name, description)
    if (searchParam) {
      conditions.push(
        or(
          ilike(schema.tasks.taskId, `%${searchParam}%`),
          ilike(schema.tasks.name, `%${searchParam}%`),
          ilike(schema.tasks.description, `%${searchParam}%`)
        )!
      )
    }

    // Status filter (comma-separated list)
    if (statusParam) {
      const statuses = statusParam.split(',').map(s => s.trim().toUpperCase())
      const validStatuses = statuses.filter((s): s is 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED' =>
        ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'].includes(s)
      )
      if (validStatuses.length > 0) {
        if (validStatuses.length === 1) {
          conditions.push(eq(schema.tasks.status, validStatuses[0]))
        } else {
          conditions.push(
            or(...validStatuses.map(s => eq(schema.tasks.status, s)))!
          )
        }
      }
    }

    // Complexity filter (comma-separated list)
    if (complexityParam) {
      const complexities = complexityParam.split(',').map(c => c.trim())
      const validComplexities = complexities.filter((c): c is 'Low' | 'Medium' | 'High' =>
        ['Low', 'Medium', 'High'].includes(c)
      )
      if (validComplexities.length > 0) {
        if (validComplexities.length === 1) {
          conditions.push(eq(schema.tasks.complexity, validComplexities[0]))
        } else {
          conditions.push(
            or(...validComplexities.map(c => eq(schema.tasks.complexity, c)))!
          )
        }
      }
    }

    // Assignee filter
    if (assigneeParam) {
      if (assigneeParam.toLowerCase() === 'unassigned') {
        conditions.push(sql`${schema.tasks.assigneeId} IS NULL`)
      } else if (uuidRegex.test(assigneeParam)) {
        conditions.push(eq(schema.tasks.assigneeId, assigneeParam))
      }
    }

    // Determine sort order
    type SortField = 'taskId' | 'name' | 'status' | 'complexity' | 'updatedAt' | 'createdAt'
    const validSortFields: SortField[] = ['taskId', 'name', 'status', 'complexity', 'updatedAt', 'createdAt']
    const sortField: SortField = validSortFields.includes(sortParam as SortField)
      ? (sortParam as SortField)
      : 'updatedAt'
    const isAsc = sortDirParam.toLowerCase() === 'asc'

    // Build order clause based on sort field
    const getOrderClause = () => {
      switch (sortField) {
        case 'taskId': return isAsc ? schema.tasks.taskId : desc(schema.tasks.taskId)
        case 'name': return isAsc ? schema.tasks.name : desc(schema.tasks.name)
        case 'status': return isAsc ? schema.tasks.status : desc(schema.tasks.status)
        case 'complexity': return isAsc ? schema.tasks.complexity : desc(schema.tasks.complexity)
        case 'createdAt': return isAsc ? schema.tasks.createdAt : desc(schema.tasks.createdAt)
        case 'updatedAt':
        default: return isAsc ? schema.tasks.updatedAt : desc(schema.tasks.updatedAt)
      }
    }

    // Get filtered tasks
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
        displayOrder: schema.tasks.displayOrder,
        assigneeId: schema.tasks.assigneeId,
        assignedBy: schema.tasks.assignedBy,
        assignedAt: schema.tasks.assignedAt,
        createdAt: schema.tasks.createdAt,
        updatedAt: schema.tasks.updatedAt,
      })
      .from(schema.tasks)
      .where(and(...conditions))
      .orderBy(getOrderClause())

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
        filters: {
          search: searchParam || null,
          status: statusParam || null,
          complexity: complexityParam || null,
          assignee: assigneeParam || null,
          sort: sortParam,
          sortDir: sortDirParam,
        },
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

// ============================================
// Task Duplication Route (T14.4)
// ============================================

// POST /projects/:id/tasks/:taskId/duplicate - Duplicate a task
projectRoutes.post('/:id/tasks/:taskId/duplicate', auth, async (c) => {
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

    const body = await c.req.json().catch(() => ({}))
    const customName = body.name as string | undefined

    const db = getDbClient()

    // Verify the project exists and belongs to the user
    const [project] = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Find the original task by taskId
    const [originalTask] = await db
      .select({
        id: schema.tasks.id,
        name: schema.tasks.name,
        description: schema.tasks.description,
        complexity: schema.tasks.complexity,
        estimatedHours: schema.tasks.estimatedHours,
        dependencies: schema.tasks.dependencies,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!originalTask) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found in this project` }, 404)
    }

    // Generate a new unique task ID
    // Extract phase number from original task ID (e.g., "T14.4" -> 14)
    const phaseMatch = taskIdParam.match(/^T(\d+)\.(\d+)$/)
    if (!phaseMatch) {
      return c.json({ success: false, error: 'Could not parse task ID format' }, 400)
    }
    const phaseNumber = parseInt(phaseMatch[1], 10)

    // Find the highest task number in this phase
    const tasksInPhase = await db
      .select({ taskId: schema.tasks.taskId })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.projectId, projectId),
          sql`${schema.tasks.taskId} LIKE ${'T' + phaseNumber + '.%'}`
        )
      )

    let maxTaskNumber = 0
    for (const task of tasksInPhase) {
      const match = task.taskId.match(/^T\d+\.(\d+)$/)
      if (match) {
        const taskNum = parseInt(match[1], 10)
        if (taskNum > maxTaskNumber) {
          maxTaskNumber = taskNum
        }
      }
    }

    const newTaskId = `T${phaseNumber}.${maxTaskNumber + 1}`
    const newTaskName = customName || `${originalTask.name} (copy)`

    // Create the duplicated task
    const [newTask] = await db
      .insert(schema.tasks)
      .values({
        projectId: projectId,
        taskId: newTaskId,
        name: newTaskName,
        description: originalTask.description,
        status: 'TODO', // Reset status to TODO for duplicated tasks
        complexity: originalTask.complexity,
        estimatedHours: originalTask.estimatedHours,
        dependencies: originalTask.dependencies,
        // Do NOT copy assignment fields - let user assign separately
        assigneeId: null,
        assignedBy: null,
        assignedAt: null,
        // Do NOT copy lock fields
        lockedBy: null,
        lockedAt: null,
        lockExpiresAt: null,
        // Do NOT copy GitHub link fields - new task should have its own
        githubIssueNumber: null,
        githubRepository: null,
        githubIssueUrl: null,
        githubIssueTitle: null,
        githubIssueState: null,
        githubLinkedBy: null,
        githubLinkedAt: null,
        githubPrNumber: null,
        githubPrRepository: null,
        githubPrUrl: null,
        githubPrTitle: null,
        githubPrState: null,
        githubPrBranch: null,
        githubPrBaseBranch: null,
        githubPrLinkedBy: null,
        githubPrLinkedAt: null,
      })
      .returning()

    // Update project's updatedAt timestamp
    await db
      .update(schema.projects)
      .set({ updatedAt: new Date() })
      .where(eq(schema.projects.id, projectId))

    // Log activity
    await db.insert(schema.activityLog).values({
      projectId: projectId,
      actorId: user.id,
      action: 'task_duplicated',
      entityType: 'task',
      entityId: newTask.id,
      taskId: newTask.taskId,
      metadata: {
        originalTaskId: originalTask.taskId,
        newTaskName: newTask.name,
      },
    })

    // Get user info for broadcast
    const [creatorUser] = await db
      .select({ email: schema.users.email, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))
      .limit(1)

    // Broadcast new task via WebSocket
    broadcastTaskUpdated(
      projectId,
      {
        id: newTask.id,
        taskId: newTask.taskId,
        name: newTask.name,
        description: newTask.description,
        status: newTask.status,
        complexity: newTask.complexity,
        estimatedHours: newTask.estimatedHours,
        dependencies: newTask.dependencies ?? [],
        assigneeId: newTask.assigneeId,
        assignedBy: newTask.assignedBy,
        assignedAt: newTask.assignedAt,
        createdAt: newTask.createdAt,
        updatedAt: newTask.updatedAt,
      },
      {
        id: user.id,
        email: creatorUser?.email || user.email,
        name: creatorUser?.name || null,
      }
    )

    return c.json({
      success: true,
      data: {
        projectId: project.id,
        projectName: project.name,
        originalTaskId: originalTask.taskId,
        task: {
          id: newTask.id,
          taskId: newTask.taskId,
          name: newTask.name,
          description: newTask.description,
          status: newTask.status,
          complexity: newTask.complexity,
          estimatedHours: newTask.estimatedHours,
          dependencies: newTask.dependencies ?? [],
          assigneeId: null,
          assignedBy: null,
          assignedAt: null,
          assignee: null,
          createdAt: newTask.createdAt,
          updatedAt: newTask.updatedAt,
        },
      },
    })
  } catch (error) {
    console.error('Duplicate task error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// ============================================
// Task Assignment Route
// ============================================

// POST /projects/:id/tasks/:taskId/assign - Assign/unassign a task
projectRoutes.post('/:id/tasks/:taskId/assign', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')

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

    const body = await c.req.json().catch(() => ({}))
    const { assigneeId } = body as { assigneeId?: string | null }

    const db = getDbClient()

    console.log('[Assign] Step 1: Getting project...')
    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id, name: schema.projects.name, userId: schema.projects.userId })
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
    console.log('[Assign] Step 1 done, project:', project?.id)

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Check if user has access (owner only for now)
    if (project.userId !== user.id) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    console.log('[Assign] Step 2: Getting task...')
    // Find the task by taskId
    const [task] = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))
    console.log('[Assign] Step 2 done, task:', task?.id)

    if (!task) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    // If assigneeId is provided, verify the user exists and has access to the project
    let assigneeName: string | null = null
    if (assigneeId) {
      if (!uuidRegex.test(assigneeId)) {
        return c.json({ success: false, error: 'Invalid assignee ID format' }, 400)
      }

      console.log('[Assign] Step 3: Getting assignee...')
      const [assignee] = await db
        .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, assigneeId))
      console.log('[Assign] Step 3 done, assignee:', assignee?.id)

      if (!assignee) {
        return c.json({ success: false, error: 'Assignee not found' }, 404)
      }

      // For now, allow assigning to any valid user
      // TODO: Add proper team membership check when projectMembers table exists

      assigneeName = assignee.name || assignee.email
    }

    console.log('[Assign] Step 4: Updating task...')
    // Update the task assignment
    const [updatedTask] = await db
      .update(schema.tasks)
      .set({
        assigneeId: assigneeId || null,
        assignedBy: assigneeId ? user.id : null,
        assignedAt: assigneeId ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, task.id))
      .returning({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        assigneeId: schema.tasks.assigneeId,
        assignedBy: schema.tasks.assignedBy,
        assignedAt: schema.tasks.assignedAt,
      })
    console.log('[Assign] Step 4 done, updated:', updatedTask?.id)

    console.log('[Assign] Step 5: Logging activity...')
    // Log activity
    await db.insert(schema.activityLog).values({
      projectId,
      actorId: user.id,
      action: assigneeId ? 'task_assigned' : 'task_unassigned',
      entityType: 'task',
      entityId: task.id,
      taskId: task.taskId,
      metadata: {
        taskName: task.name,
        assigneeId: assigneeId || null,
        assigneeName: assigneeName,
      },
    })
    console.log('[Assign] Step 5 done')

    // Get assignee info for response
    let assigneeInfo = null
    if (updatedTask.assigneeId) {
      console.log('[Assign] Step 6: Getting assignee info...')
      const [assigneeUser] = await db
        .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, updatedTask.assigneeId))
      console.log('[Assign] Step 6 done')
      if (assigneeUser) {
        assigneeInfo = {
          id: assigneeUser.id,
          name: assigneeUser.name,
          email: assigneeUser.email,
        }
      }
    }

    return c.json({
      success: true,
      data: {
        task: {
          id: updatedTask.id,
          taskId: updatedTask.taskId,
          name: updatedTask.name,
          assigneeId: updatedTask.assigneeId,
          assignedBy: updatedTask.assignedBy,
          assignedAt: updatedTask.assignedAt,
          assignee: assigneeInfo,
        },
      },
    })
  } catch (error) {
    console.error('Assign task error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// ============================================
// Task Reorder Route (T14.3 - Drag-and-Drop)
// ============================================

// POST /projects/:id/tasks/reorder - Reorder tasks within a status column
projectRoutes.post('/:id/tasks/reorder', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    const body = await c.req.json()

    // Validate request body
    if (!body.tasks || !Array.isArray(body.tasks)) {
      return c.json({ success: false, error: 'Missing or invalid tasks array' }, 400)
    }

    // Each task should have taskId and displayOrder
    const taskUpdates: Array<{ taskId: string; displayOrder: number; status?: string }> = body.tasks
    if (taskUpdates.length === 0) {
      return c.json({ success: false, error: 'Tasks array cannot be empty' }, 400)
    }

    // Validate each task entry
    const taskIdRegex = /^T\d+\.\d+$/
    const validStatuses = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED']
    for (const task of taskUpdates) {
      if (!task.taskId || !taskIdRegex.test(task.taskId)) {
        return c.json({ success: false, error: `Invalid task ID format: ${task.taskId}` }, 400)
      }
      if (typeof task.displayOrder !== 'number') {
        return c.json({ success: false, error: `Missing displayOrder for task ${task.taskId}` }, 400)
      }
      if (task.status && !validStatuses.includes(task.status)) {
        return c.json({ success: false, error: `Invalid status for task ${task.taskId}` }, 400)
      }
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

    // Update each task's displayOrder (and optionally status for cross-column moves)
    const updatedTasks: Array<{ taskId: string; displayOrder: number; status?: string }> = []

    for (const taskUpdate of taskUpdates) {
      const updateData: Record<string, unknown> = {
        displayOrder: taskUpdate.displayOrder,
        updatedAt: new Date(),
      }

      // If status is provided, update it too (for cross-column drag)
      if (taskUpdate.status) {
        updateData['status'] = taskUpdate.status
      }

      const [updated] = await db
        .update(schema.tasks)
        .set(updateData)
        .where(
          and(
            eq(schema.tasks.projectId, projectId),
            eq(schema.tasks.taskId, taskUpdate.taskId)
          )
        )
        .returning({
          taskId: schema.tasks.taskId,
          displayOrder: schema.tasks.displayOrder,
          status: schema.tasks.status,
        })

      if (updated) {
        updatedTasks.push({
          taskId: updated.taskId,
          displayOrder: updated.displayOrder ?? 0,
          status: updated.status,
        })
      }
    }

    // Update project's updatedAt timestamp
    await db
      .update(schema.projects)
      .set({ updatedAt: new Date() })
      .where(eq(schema.projects.id, projectId))

    // Get user info for broadcast
    const [updaterUser] = await db
      .select({ email: schema.users.email, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))
      .limit(1)

    // Broadcast task reorder via WebSocket
    broadcastTasksReordered(
      projectId,
      updatedTasks,
      {
        id: user.id,
        email: updaterUser?.email || user.email,
        name: updaterUser?.name || null,
      }
    )

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
    console.error('Reorder tasks error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// ============================================
// Bulk Task Operations Routes (T14.6)
// ============================================

// POST /projects/:id/tasks/bulk-status - Bulk update task statuses
projectRoutes.post('/:id/tasks/bulk-status', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    const body = await c.req.json()
    const validation = BulkStatusUpdateRequestSchema.safeParse(body)

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

    const { taskIds, status } = validation.data
    const db = getDbClient()

    // Verify the project exists and belongs to the user
    const [project] = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Verify all task IDs belong to this project
    const existingTasks = await db
      .select({ id: schema.tasks.id, taskId: schema.tasks.taskId })
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

    // Bulk update status
    const updatedTasks = await withTransaction(async (tx) => {
      const results = []
      for (const taskId of taskIds) {
        const [updated] = await tx
          .update(schema.tasks)
          .set({ status, updatedAt: new Date() })
          .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.projectId, projectId)))
          .returning({
            id: schema.tasks.id,
            taskId: schema.tasks.taskId,
            name: schema.tasks.name,
            status: schema.tasks.status,
            updatedAt: schema.tasks.updatedAt,
          })
        if (updated) results.push(updated)
      }

      // Update project's updatedAt timestamp
      await tx
        .update(schema.projects)
        .set({ updatedAt: new Date() })
        .where(eq(schema.projects.id, projectId))

      return results
    })

    // Get user info for broadcast
    const [updaterUser] = await db
      .select({ email: schema.users.email, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))
      .limit(1)

    // Broadcast updates via WebSocket
    if (updatedTasks.length > 0) {
      broadcastTasksUpdated(
        projectId,
        updatedTasks.map((t) => ({
          id: t.id,
          taskId: t.taskId,
          name: t.name,
          status: t.status,
          dependencies: [],
          createdAt: new Date(),
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
        status,
        tasks: updatedTasks,
      },
    })
  } catch (error) {
    console.error('Bulk status update error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// POST /projects/:id/tasks/bulk-assign - Bulk assign tasks to a user
projectRoutes.post('/:id/tasks/bulk-assign', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    const body = await c.req.json()
    const validation = BulkAssignTasksRequestSchema.safeParse(body)

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

    const { taskIds, assigneeId } = validation.data
    const db = getDbClient()

    // Verify the project exists and belongs to the user
    const [project] = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // If assigneeId is provided, verify the user exists
    let assignee = null
    if (assigneeId) {
      const [assigneeUser] = await db
        .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
        .from(schema.users)
        .where(eq(schema.users.id, assigneeId))

      if (!assigneeUser) {
        return c.json({ success: false, error: 'Assignee not found' }, 404)
      }
      assignee = assigneeUser
    }

    // Verify all task IDs belong to this project
    const existingTasks = await db
      .select({ id: schema.tasks.id, taskId: schema.tasks.taskId })
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

    // Bulk update assignment
    const updatedTasks = await withTransaction(async (tx) => {
      const results = []
      for (const taskId of taskIds) {
        const [updated] = await tx
          .update(schema.tasks)
          .set({
            assigneeId: assigneeId,
            assignedBy: assigneeId ? user.id : null,
            assignedAt: assigneeId ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.projectId, projectId)))
          .returning({
            id: schema.tasks.id,
            taskId: schema.tasks.taskId,
            name: schema.tasks.name,
            assigneeId: schema.tasks.assigneeId,
            assignedBy: schema.tasks.assignedBy,
            assignedAt: schema.tasks.assignedAt,
            updatedAt: schema.tasks.updatedAt,
          })
        if (updated) results.push(updated)
      }

      // Update project's updatedAt timestamp
      await tx
        .update(schema.projects)
        .set({ updatedAt: new Date() })
        .where(eq(schema.projects.id, projectId))

      return results
    })

    // Get user info for broadcast
    const [updaterUser] = await db
      .select({ email: schema.users.email, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))
      .limit(1)

    // Broadcast updates via WebSocket
    if (updatedTasks.length > 0) {
      broadcastTasksUpdated(
        projectId,
        updatedTasks.map((t) => ({
          id: t.id,
          taskId: t.taskId,
          name: t.name,
          assigneeId: t.assigneeId,
          assignedBy: t.assignedBy,
          assignedAt: t.assignedAt,
          dependencies: [],
          createdAt: new Date(),
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
        assignee: assignee ? { id: assignee.id, email: assignee.email, name: assignee.name } : null,
        tasks: updatedTasks.map((t) => ({
          ...t,
          assignee: assignee ? { id: assignee.id, email: assignee.email, name: assignee.name } : null,
        })),
      },
    })
  } catch (error) {
    console.error('Bulk assign error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// POST /projects/:id/tasks/bulk-delete - Bulk delete tasks
projectRoutes.post('/:id/tasks/bulk-delete', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    const body = await c.req.json()
    const validation = BulkDeleteTasksRequestSchema.safeParse(body)

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

    const { taskIds } = validation.data
    const db = getDbClient()

    // Verify the project exists and belongs to the user
    const [project] = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Get tasks to be deleted (for response and validation)
    const tasksToDelete = await db
      .select({ id: schema.tasks.id, taskId: schema.tasks.taskId, name: schema.tasks.name })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId)))

    const existingTaskIds = new Set(tasksToDelete.map((t) => t.id))
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

    // Get the tasks being deleted for the response
    const deletedTasksInfo = tasksToDelete.filter((t) => taskIds.includes(t.id))

    // Bulk delete tasks
    await withTransaction(async (tx) => {
      // Delete comments associated with these tasks first
      for (const taskId of taskIds) {
        await tx
          .delete(schema.comments)
          .where(eq(schema.comments.taskId, taskId))
      }

      // Delete the tasks
      for (const taskId of taskIds) {
        await tx
          .delete(schema.tasks)
          .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.projectId, projectId)))
      }

      // Update project's updatedAt timestamp
      await tx
        .update(schema.projects)
        .set({ updatedAt: new Date() })
        .where(eq(schema.projects.id, projectId))
    })

    // Log activity
    await db.insert(schema.activityLog).values({
      projectId: projectId,
      actorId: user.id,
      action: 'tasks_bulk_deleted',
      entityType: 'task',
      metadata: {
        deletedCount: deletedTasksInfo.length,
        deletedTaskIds: deletedTasksInfo.map((t) => t.taskId),
      },
    })

    return c.json({
      success: true,
      data: {
        projectId: project.id,
        projectName: project.name,
        deletedCount: deletedTasksInfo.length,
        deletedTasks: deletedTasksInfo,
      },
    })
  } catch (error) {
    console.error('Bulk delete error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// ============================================
// Task GitHub Issue Routes
// ============================================

// GET /:id/tasks/:taskId/github-link - Get task's GitHub issue link status
projectRoutes.get('/:id/tasks/:taskId/github-link', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Get task with GitHub link info
    const [task] = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubIssueNumber: schema.tasks.githubIssueNumber,
        githubRepository: schema.tasks.githubRepository,
        githubIssueUrl: schema.tasks.githubIssueUrl,
        githubIssueTitle: schema.tasks.githubIssueTitle,
        githubIssueState: schema.tasks.githubIssueState,
        githubLinkedBy: schema.tasks.githubLinkedBy,
        githubLinkedAt: schema.tasks.githubLinkedAt,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!task) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    const isLinked = !!task.githubIssueNumber

    return c.json({
      success: true,
      data: {
        linked: isLinked,
        task: {
          id: task.id,
          taskId: task.taskId,
          name: task.name,
        },
        githubLink: isLinked
          ? {
              issueNumber: task.githubIssueNumber,
              repository: task.githubRepository,
              issueUrl: task.githubIssueUrl,
              issueTitle: task.githubIssueTitle,
              issueState: task.githubIssueState,
              linkedAt: task.githubLinkedAt,
            }
          : null,
      },
    })
  } catch (error) {
    console.error('Get task GitHub link error:', error)
    return c.json({ success: false, error: 'Failed to get task GitHub link' }, 500)
  }
})

// POST /:id/tasks/:taskId/link-github - Link task to GitHub issue
projectRoutes.post('/:id/tasks/:taskId/link-github', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    const body = await c.req.json()
    const { issueNumber, repository } = body

    if (!issueNumber || !repository) {
      return c.json({ success: false, error: 'issueNumber and repository are required' }, 400)
    }

    // Validate repository format
    const repoRegex = /^[^/]+\/[^/]+$/
    if (!repoRegex.test(repository)) {
      return c.json({ success: false, error: 'Repository must be in format "owner/repo"' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Find the task
    const [existingTask] = await db
      .select({ id: schema.tasks.id, name: schema.tasks.name })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!existingTask) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    // Get GitHub integration
    const [integration] = await db
      .select({
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'No active GitHub integration found. Please connect GitHub first.' }, 400)
    }

    // Fetch the issue from GitHub to verify it exists and get details
    const [owner = '', repo = ''] = repository.split('/')
    const issue = await fetchGitHubIssue(integration.accessToken, owner, repo, issueNumber)

    if (!issue) {
      return c.json({ success: false, error: `GitHub issue #${issueNumber} not found in ${repository}` }, 404)
    }

    // Update task with GitHub link
    const [updated] = await db
      .update(schema.tasks)
      .set({
        githubIssueNumber: issue.number,
        githubRepository: repository,
        githubIssueUrl: issue.html_url,
        githubIssueTitle: issue.title,
        githubIssueState: issue.state,
        githubLinkedBy: user.id,
        githubLinkedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, existingTask.id))
      .returning({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubIssueNumber: schema.tasks.githubIssueNumber,
        githubRepository: schema.tasks.githubRepository,
        githubIssueUrl: schema.tasks.githubIssueUrl,
        githubIssueTitle: schema.tasks.githubIssueTitle,
        githubIssueState: schema.tasks.githubIssueState,
        githubLinkedAt: schema.tasks.githubLinkedAt,
      })

    return c.json({
      success: true,
      data: {
        task: updated,
        githubIssue: {
          number: issue.number,
          title: issue.title,
          state: issue.state,
          htmlUrl: issue.html_url,
        },
      },
    })
  } catch (error) {
    console.error('Link task to GitHub error:', error)
    return c.json({ success: false, error: 'Failed to link task to GitHub issue' }, 500)
  }
})

// DELETE /:id/tasks/:taskId/link-github - Unlink task from GitHub issue
projectRoutes.delete('/:id/tasks/:taskId/link-github', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Find the task
    const [existingTask] = await db
      .select({ id: schema.tasks.id, githubIssueNumber: schema.tasks.githubIssueNumber })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!existingTask) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    if (!existingTask.githubIssueNumber) {
      return c.json({ success: false, error: 'Task is not linked to a GitHub issue' }, 400)
    }

    // Remove GitHub link
    const [updated] = await db
      .update(schema.tasks)
      .set({
        githubIssueNumber: null,
        githubRepository: null,
        githubIssueUrl: null,
        githubIssueTitle: null,
        githubIssueState: null,
        githubLinkedBy: null,
        githubLinkedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, existingTask.id))
      .returning({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
      })

    return c.json({
      success: true,
      data: {
        task: updated,
        message: 'GitHub issue unlinked successfully',
      },
    })
  } catch (error) {
    console.error('Unlink task from GitHub error:', error)
    return c.json({ success: false, error: 'Failed to unlink task from GitHub issue' }, 500)
  }
})

// POST /:id/tasks/:taskId/create-github-issue - Create GitHub issue from task
projectRoutes.post('/:id/tasks/:taskId/create-github-issue', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    const body = await c.req.json()
    const { repository, labels, assignees } = body

    if (!repository) {
      return c.json({ success: false, error: 'repository is required' }, 400)
    }

    // Validate repository format
    const repoRegex = /^[^/]+\/[^/]+$/
    if (!repoRegex.test(repository)) {
      return c.json({ success: false, error: 'Repository must be in format "owner/repo"' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Get the task
    const [task] = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        description: schema.tasks.description,
        complexity: schema.tasks.complexity,
        githubIssueNumber: schema.tasks.githubIssueNumber,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!task) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    if (task.githubIssueNumber) {
      return c.json({ success: false, error: 'Task is already linked to a GitHub issue' }, 400)
    }

    // Get GitHub integration
    const [integration] = await db
      .select({
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'No active GitHub integration found. Please connect GitHub first.' }, 400)
    }

    // Create issue body
    const issueBody = `## ${task.taskId}: ${task.name}

${task.description || '_No description provided_'}

---

**Complexity:** ${task.complexity || 'Not specified'}
**Project:** ${project.name}

_This issue was created from [PlanFlow](https://planflow.tools)_`

    // Create the GitHub issue
    const [owner = '', repo = ''] = repository.split('/')
    const issue = await createGitHubIssue(integration.accessToken, owner, repo, {
      title: `[${task.taskId}] ${task.name}`,
      body: issueBody,
      labels,
      assignees,
    })

    if (!issue) {
      return c.json({ success: false, error: 'Failed to create GitHub issue' }, 500)
    }

    // Update task with GitHub link
    const [updated] = await db
      .update(schema.tasks)
      .set({
        githubIssueNumber: issue.number,
        githubRepository: repository,
        githubIssueUrl: issue.html_url,
        githubIssueTitle: issue.title,
        githubIssueState: issue.state,
        githubLinkedBy: user.id,
        githubLinkedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, task.id))
      .returning({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubIssueNumber: schema.tasks.githubIssueNumber,
        githubRepository: schema.tasks.githubRepository,
        githubIssueUrl: schema.tasks.githubIssueUrl,
        githubIssueTitle: schema.tasks.githubIssueTitle,
        githubIssueState: schema.tasks.githubIssueState,
        githubLinkedAt: schema.tasks.githubLinkedAt,
      })

    return c.json({
      success: true,
      data: {
        task: updated,
        githubIssue: {
          number: issue.number,
          title: issue.title,
          state: issue.state,
          htmlUrl: issue.html_url,
        },
      },
    })
  } catch (error) {
    console.error('Create GitHub issue from task error:', error)
    return c.json({ success: false, error: 'Failed to create GitHub issue' }, 500)
  }
})

// POST /:id/tasks/:taskId/sync-github-issue - Sync task GitHub issue state
projectRoutes.post('/:id/tasks/:taskId/sync-github-issue', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Get task with GitHub link
    const [task] = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubIssueNumber: schema.tasks.githubIssueNumber,
        githubRepository: schema.tasks.githubRepository,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!task) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    if (!task.githubIssueNumber || !task.githubRepository) {
      return c.json({ success: false, error: 'Task is not linked to a GitHub issue' }, 400)
    }

    // Get GitHub integration
    const [integration] = await db
      .select({
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'No active GitHub integration found' }, 400)
    }

    // Fetch latest issue state
    const [owner = '', repo = ''] = task.githubRepository.split('/')
    const issue = await fetchGitHubIssue(integration.accessToken, owner, repo, task.githubIssueNumber)

    if (!issue) {
      return c.json({ success: false, error: 'GitHub issue not found - it may have been deleted' }, 404)
    }

    // Update task with latest issue info
    const [updated] = await db
      .update(schema.tasks)
      .set({
        githubIssueTitle: issue.title,
        githubIssueState: issue.state,
        githubIssueUrl: issue.html_url,
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, task.id))
      .returning({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubIssueNumber: schema.tasks.githubIssueNumber,
        githubRepository: schema.tasks.githubRepository,
        githubIssueUrl: schema.tasks.githubIssueUrl,
        githubIssueTitle: schema.tasks.githubIssueTitle,
        githubIssueState: schema.tasks.githubIssueState,
      })

    return c.json({
      success: true,
      data: {
        task: updated,
        synced: true,
      },
    })
  } catch (error) {
    console.error('Sync task GitHub issue error:', error)
    return c.json({ success: false, error: 'Failed to sync GitHub issue' }, 500)
  }
})

// ============================================
// Task GitHub PR Routes
// ============================================

// GET /:id/tasks/:taskId/github-pr - Get task's GitHub PR link status
projectRoutes.get('/:id/tasks/:taskId/github-pr', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Get task with GitHub PR link info
    const [task] = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubPrNumber: schema.tasks.githubPrNumber,
        githubPrRepository: schema.tasks.githubPrRepository,
        githubPrUrl: schema.tasks.githubPrUrl,
        githubPrTitle: schema.tasks.githubPrTitle,
        githubPrState: schema.tasks.githubPrState,
        githubPrBranch: schema.tasks.githubPrBranch,
        githubPrBaseBranch: schema.tasks.githubPrBaseBranch,
        githubPrLinkedBy: schema.tasks.githubPrLinkedBy,
        githubPrLinkedAt: schema.tasks.githubPrLinkedAt,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!task) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    const isLinked = !!task.githubPrNumber

    return c.json({
      success: true,
      data: {
        linked: isLinked,
        task: {
          id: task.id,
          taskId: task.taskId,
          name: task.name,
        },
        githubPr: isLinked
          ? {
              prNumber: task.githubPrNumber,
              repository: task.githubPrRepository,
              prUrl: task.githubPrUrl,
              prTitle: task.githubPrTitle,
              prState: task.githubPrState,
              headBranch: task.githubPrBranch,
              baseBranch: task.githubPrBaseBranch,
              linkedAt: task.githubPrLinkedAt,
            }
          : null,
      },
    })
  } catch (error) {
    console.error('Get task GitHub PR error:', error)
    return c.json({ success: false, error: 'Failed to get task GitHub PR' }, 500)
  }
})

// POST /:id/tasks/:taskId/link-github-pr - Link task to GitHub PR
projectRoutes.post('/:id/tasks/:taskId/link-github-pr', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    const body = await c.req.json()
    const { prNumber, repository } = body

    if (!prNumber || typeof prNumber !== 'number') {
      return c.json({ success: false, error: 'prNumber is required and must be a number' }, 400)
    }

    if (!repository) {
      return c.json({ success: false, error: 'repository is required' }, 400)
    }

    // Validate repository format
    const repoRegex = /^[^/]+\/[^/]+$/
    if (!repoRegex.test(repository)) {
      return c.json({ success: false, error: 'Repository must be in format "owner/repo"' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Find the task
    const [existingTask] = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubPrNumber: schema.tasks.githubPrNumber,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!existingTask) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    if (existingTask.githubPrNumber) {
      return c.json({
        success: false,
        error: `Task is already linked to PR #${existingTask.githubPrNumber}. Unlink first to link a different PR.`,
      }, 400)
    }

    // Get GitHub integration
    const [integration] = await db
      .select({
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'No active GitHub integration found. Please connect GitHub first.' }, 400)
    }

    // Fetch the PR from GitHub to verify it exists and get details
    const [owner = '', repo = ''] = repository.split('/')
    const pr = await fetchGitHubPullRequest(integration.accessToken, owner, repo, prNumber)

    if (!pr) {
      return c.json({ success: false, error: `Pull request #${prNumber} not found in ${repository}` }, 404)
    }

    // Determine PR state
    const prState = getPrState(pr)

    // Update task with PR link
    const [updated] = await db
      .update(schema.tasks)
      .set({
        githubPrNumber: pr.number,
        githubPrRepository: repository,
        githubPrUrl: pr.html_url,
        githubPrTitle: pr.title,
        githubPrState: prState,
        githubPrBranch: pr.head.ref,
        githubPrBaseBranch: pr.base.ref,
        githubPrLinkedBy: user.id,
        githubPrLinkedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, existingTask.id))
      .returning({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubPrNumber: schema.tasks.githubPrNumber,
        githubPrRepository: schema.tasks.githubPrRepository,
        githubPrUrl: schema.tasks.githubPrUrl,
        githubPrTitle: schema.tasks.githubPrTitle,
        githubPrState: schema.tasks.githubPrState,
        githubPrBranch: schema.tasks.githubPrBranch,
        githubPrBaseBranch: schema.tasks.githubPrBaseBranch,
        githubPrLinkedAt: schema.tasks.githubPrLinkedAt,
      })

    return c.json({
      success: true,
      data: {
        task: updated,
        githubPr: {
          number: pr.number,
          title: pr.title,
          state: prState,
          htmlUrl: pr.html_url,
          headBranch: pr.head.ref,
          baseBranch: pr.base.ref,
          draft: pr.draft,
        },
      },
    })
  } catch (error) {
    console.error('Link task to GitHub PR error:', error)
    return c.json({ success: false, error: 'Failed to link task to GitHub PR' }, 500)
  }
})

// DELETE /:id/tasks/:taskId/link-github-pr - Unlink task from GitHub PR
projectRoutes.delete('/:id/tasks/:taskId/link-github-pr', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Find the task
    const [existingTask] = await db
      .select({ id: schema.tasks.id, githubPrNumber: schema.tasks.githubPrNumber })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!existingTask) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    if (!existingTask.githubPrNumber) {
      return c.json({ success: false, error: 'Task is not linked to a GitHub PR' }, 400)
    }

    // Remove GitHub PR link
    const [updated] = await db
      .update(schema.tasks)
      .set({
        githubPrNumber: null,
        githubPrRepository: null,
        githubPrUrl: null,
        githubPrTitle: null,
        githubPrState: null,
        githubPrBranch: null,
        githubPrBaseBranch: null,
        githubPrLinkedBy: null,
        githubPrLinkedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, existingTask.id))
      .returning({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
      })

    return c.json({
      success: true,
      data: {
        task: updated,
        message: 'GitHub PR unlinked successfully',
      },
    })
  } catch (error) {
    console.error('Unlink task from GitHub PR error:', error)
    return c.json({ success: false, error: 'Failed to unlink task from GitHub PR' }, 500)
  }
})

// POST /:id/tasks/:taskId/sync-github-pr - Sync task GitHub PR state
projectRoutes.post('/:id/tasks/:taskId/sync-github-pr', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Get task with GitHub PR link
    const [task] = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubPrNumber: schema.tasks.githubPrNumber,
        githubPrRepository: schema.tasks.githubPrRepository,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!task) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    if (!task.githubPrNumber || !task.githubPrRepository) {
      return c.json({ success: false, error: 'Task is not linked to a GitHub PR' }, 400)
    }

    // Get GitHub integration
    const [integration] = await db
      .select({
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'No active GitHub integration found' }, 400)
    }

    // Fetch latest PR state
    const [owner = '', repo = ''] = task.githubPrRepository.split('/')
    const pr = await fetchGitHubPullRequest(integration.accessToken, owner, repo, task.githubPrNumber)

    if (!pr) {
      return c.json({ success: false, error: 'GitHub PR not found - it may have been deleted' }, 404)
    }

    // Determine PR state
    const prState = getPrState(pr)

    // Update task with latest PR info
    const [updated] = await db
      .update(schema.tasks)
      .set({
        githubPrTitle: pr.title,
        githubPrState: prState,
        githubPrUrl: pr.html_url,
        githubPrBranch: pr.head.ref,
        githubPrBaseBranch: pr.base.ref,
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, task.id))
      .returning({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubPrNumber: schema.tasks.githubPrNumber,
        githubPrRepository: schema.tasks.githubPrRepository,
        githubPrUrl: schema.tasks.githubPrUrl,
        githubPrTitle: schema.tasks.githubPrTitle,
        githubPrState: schema.tasks.githubPrState,
        githubPrBranch: schema.tasks.githubPrBranch,
        githubPrBaseBranch: schema.tasks.githubPrBaseBranch,
      })

    return c.json({
      success: true,
      data: {
        task: updated,
        synced: true,
        prState,
      },
    })
  } catch (error) {
    console.error('Sync task GitHub PR error:', error)
    return c.json({ success: false, error: 'Failed to sync GitHub PR' }, 500)
  }
})

// POST /:id/tasks/:taskId/create-github-pr - Create GitHub PR from task
projectRoutes.post('/:id/tasks/:taskId/create-github-pr', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    const body = await c.req.json()
    const { repository, title, body: prBody, head, base, draft } = body

    // Validate required fields
    if (!repository) {
      return c.json({ success: false, error: 'repository is required' }, 400)
    }
    if (!title) {
      return c.json({ success: false, error: 'title is required' }, 400)
    }
    if (!head) {
      return c.json({ success: false, error: 'head branch is required' }, 400)
    }
    if (!base) {
      return c.json({ success: false, error: 'base branch is required' }, 400)
    }

    // Validate repository format
    const repoRegex = /^[^/]+\/[^/]+$/
    if (!repoRegex.test(repository)) {
      return c.json({ success: false, error: 'Repository must be in format "owner/repo"' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Get task
    const [task] = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        description: schema.tasks.description,
        githubPrNumber: schema.tasks.githubPrNumber,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!task) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    // Check if task already has a PR linked
    if (task.githubPrNumber) {
      return c.json({ success: false, error: 'Task already has a PR linked. Unlink it first to create a new PR.' }, 400)
    }

    // Get GitHub integration
    const [integration] = await db
      .select({
        accessToken: schema.githubIntegrations.accessToken,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )
      .limit(1)

    if (!integration) {
      return c.json({ success: false, error: 'No active GitHub integration found. Connect GitHub first.' }, 400)
    }

    // Create the PR on GitHub
    const [owner = '', repo = ''] = repository.split('/')
    const createdPr = await createGitHubPullRequest(integration.accessToken, owner, repo, {
      title,
      body: prBody || `This PR implements ${task.taskId}: ${task.name}\n\n${task.description || ''}`.trim(),
      head,
      base,
      draft: draft || false,
    })

    if (!createdPr) {
      return c.json({
        success: false,
        error: 'Failed to create PR on GitHub. Make sure the branch exists and there are commits to merge.'
      }, 400)
    }

    // Determine PR state
    const prState = getPrState(createdPr)

    // Update task with the PR link
    const [updated] = await db
      .update(schema.tasks)
      .set({
        githubPrNumber: createdPr.number,
        githubPrRepository: repository,
        githubPrUrl: createdPr.html_url,
        githubPrTitle: createdPr.title,
        githubPrState: prState,
        githubPrBranch: createdPr.head.ref,
        githubPrBaseBranch: createdPr.base.ref,
        githubPrLinkedBy: user.id,
        githubPrLinkedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, task.id))
      .returning({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubPrNumber: schema.tasks.githubPrNumber,
        githubPrRepository: schema.tasks.githubPrRepository,
        githubPrUrl: schema.tasks.githubPrUrl,
        githubPrTitle: schema.tasks.githubPrTitle,
        githubPrState: schema.tasks.githubPrState,
        githubPrBranch: schema.tasks.githubPrBranch,
        githubPrBaseBranch: schema.tasks.githubPrBaseBranch,
        githubPrLinkedAt: schema.tasks.githubPrLinkedAt,
      })

    return c.json({
      success: true,
      data: {
        task: updated,
        githubPr: {
          number: createdPr.number,
          title: createdPr.title,
          state: prState,
          htmlUrl: createdPr.html_url,
          headBranch: createdPr.head.ref,
          baseBranch: createdPr.base.ref,
          draft: createdPr.draft,
        },
      },
    })
  } catch (error) {
    console.error('Create GitHub PR from task error:', error)
    return c.json({ success: false, error: 'Failed to create GitHub PR' }, 500)
  }
})

// ============================================
// Project Activity
// ============================================

// GET /:id/activity - Get project activity with pagination
projectRoutes.get('/:id/activity', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Parse query params
    const limit = Math.min(parseInt(c.req.query('limit') || '25', 10), 100)
    const offset = parseInt(c.req.query('offset') || '0', 10)
    const action = c.req.query('action')
    const entityType = c.req.query('entityType')
    const taskId = c.req.query('taskId')

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Build where conditions
    const conditions = [eq(schema.activityLog.projectId, projectId)]
    if (action) {
      conditions.push(eq(schema.activityLog.action, action as typeof schema.activityLog.action.enumValues[number]))
    }
    if (entityType) {
      conditions.push(eq(schema.activityLog.entityType, entityType as typeof schema.activityLog.entityType.enumValues[number]))
    }
    if (taskId) {
      conditions.push(eq(schema.activityLog.taskId, taskId))
    }

    // Get total count
    const countResult = await db
      .select({ count: schema.activityLog.id })
      .from(schema.activityLog)
      .where(and(...conditions))

    const total = countResult.length

    // Get activities with actor info
    const activities = await db
      .select({
        id: schema.activityLog.id,
        action: schema.activityLog.action,
        entityType: schema.activityLog.entityType,
        entityId: schema.activityLog.entityId,
        taskId: schema.activityLog.taskId,
        taskUuid: schema.activityLog.taskUuid,
        organizationId: schema.activityLog.organizationId,
        projectId: schema.activityLog.projectId,
        metadata: schema.activityLog.metadata,
        description: schema.activityLog.description,
        createdAt: schema.activityLog.createdAt,
        actorId: schema.activityLog.actorId,
        actorEmail: schema.users.email,
        actorName: schema.users.name,
      })
      .from(schema.activityLog)
      .leftJoin(schema.users, eq(schema.activityLog.actorId, schema.users.id))
      .where(and(...conditions))
      .orderBy(desc(schema.activityLog.createdAt))
      .limit(limit)
      .offset(offset)

    // Format response
    const formattedActivities = activities.map((a) => ({
      id: a.id,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      taskId: a.taskId,
      taskUuid: a.taskUuid,
      organizationId: a.organizationId,
      projectId: a.projectId,
      metadata: a.metadata,
      description: a.description,
      createdAt: a.createdAt,
      actor: {
        id: a.actorId,
        email: a.actorEmail || '',
        name: a.actorName,
      },
    }))

    return c.json({
      success: true,
      data: {
        activities: formattedActivities,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      },
    })
  } catch (error) {
    console.error('Get project activity error:', error)
    return c.json({ success: false, error: 'Failed to get project activity' }, 500)
  }
})

// GET /:id/tasks/:taskId/activity - Get task-specific activity
projectRoutes.get('/:id/tasks/:taskId/activity', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Get activities for this task
    const activities = await db
      .select({
        id: schema.activityLog.id,
        action: schema.activityLog.action,
        entityType: schema.activityLog.entityType,
        entityId: schema.activityLog.entityId,
        taskId: schema.activityLog.taskId,
        taskUuid: schema.activityLog.taskUuid,
        organizationId: schema.activityLog.organizationId,
        projectId: schema.activityLog.projectId,
        metadata: schema.activityLog.metadata,
        description: schema.activityLog.description,
        createdAt: schema.activityLog.createdAt,
        actorId: schema.activityLog.actorId,
        actorEmail: schema.users.email,
        actorName: schema.users.name,
      })
      .from(schema.activityLog)
      .leftJoin(schema.users, eq(schema.activityLog.actorId, schema.users.id))
      .where(
        and(
          eq(schema.activityLog.projectId, projectId),
          eq(schema.activityLog.taskId, taskIdParam)
        )
      )
      .orderBy(desc(schema.activityLog.createdAt))
      .limit(50)

    // Format response
    const formattedActivities = activities.map((a) => ({
      id: a.id,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      taskId: a.taskId,
      taskUuid: a.taskUuid,
      organizationId: a.organizationId,
      projectId: a.projectId,
      metadata: a.metadata,
      description: a.description,
      createdAt: a.createdAt,
      actor: {
        id: a.actorId,
        email: a.actorEmail || '',
        name: a.actorName,
      },
    }))

    return c.json({
      success: true,
      data: {
        activities: formattedActivities,
        pagination: {
          total: activities.length,
          limit: 50,
          offset: 0,
          hasMore: false,
        },
      },
    })
  } catch (error) {
    console.error('Get task activity error:', error)
    return c.json({ success: false, error: 'Failed to get task activity' }, 500)
  }
})

// ============================================
// Task Comments
// ============================================

// GET /:id/tasks/:taskId/comments - Get comments for a task
projectRoutes.get('/:id/tasks/:taskId/comments', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Find the task - taskIdParam could be UUID or T1.1 format
    let taskUuid: string
    if (uuidRegex.test(taskIdParam)) {
      taskUuid = taskIdParam
    } else {
      // Find task by taskId (T1.1 format)
      const [task] = await db
        .select({ id: schema.tasks.id })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

      if (!task) {
        return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
      }
      taskUuid = task.id
    }

    // Get comments with author info
    const comments = await db
      .select({
        id: schema.comments.id,
        taskId: schema.comments.taskId,
        content: schema.comments.content,
        parentId: schema.comments.parentId,
        mentions: schema.comments.mentions,
        createdAt: schema.comments.createdAt,
        updatedAt: schema.comments.updatedAt,
        authorId: schema.comments.authorId,
        authorEmail: schema.users.email,
        authorName: schema.users.name,
      })
      .from(schema.comments)
      .leftJoin(schema.users, eq(schema.comments.authorId, schema.users.id))
      .where(eq(schema.comments.taskId, taskUuid))
      .orderBy(schema.comments.createdAt)

    // Format response with nested replies
    const formattedComments = comments.map((c) => ({
      id: c.id,
      taskId: c.taskId,
      content: c.content,
      parentId: c.parentId,
      mentions: c.mentions || [],
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      author: {
        id: c.authorId,
        email: c.authorEmail || '',
        name: c.authorName,
      },
    }))

    return c.json({
      success: true,
      data: {
        taskId: taskUuid,
        comments: formattedComments,
        totalCount: formattedComments.length,
      },
    })
  } catch (error) {
    console.error('Get task comments error:', error)
    return c.json({ success: false, error: 'Failed to get comments' }, 500)
  }
})

// POST /:id/tasks/:taskId/comments - Create a comment
projectRoutes.post('/:id/tasks/:taskId/comments', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    const body = await c.req.json()
    const { content, parentId, mentions } = body

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return c.json({ success: false, error: 'Content is required' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Find the task
    let taskUuid: string
    if (uuidRegex.test(taskIdParam)) {
      taskUuid = taskIdParam
    } else {
      const [task] = await db
        .select({ id: schema.tasks.id })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

      if (!task) {
        return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
      }
      taskUuid = task.id
    }

    // Create comment
    const [newComment] = await db
      .insert(schema.comments)
      .values({
        taskId: taskUuid,
        authorId: user.id,
        content: content.trim(),
        parentId: parentId || null,
        mentions: mentions || null,
      })
      .returning()

    if (!newComment) {
      return c.json({ success: false, error: 'Failed to create comment' }, 500)
    }

    // Get author info
    const [author] = await db
      .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))

    return c.json({
      success: true,
      data: {
        comment: {
          id: newComment.id,
          taskId: newComment.taskId,
          content: newComment.content,
          parentId: newComment.parentId,
          mentions: newComment.mentions || [],
          createdAt: newComment.createdAt,
          updatedAt: newComment.updatedAt,
          author: {
            id: author?.id || user.id,
            email: author?.email || user.email,
            name: author?.name || null,
          },
        },
      },
    }, 201)
  } catch (error) {
    console.error('Create comment error:', error)
    return c.json({ success: false, error: 'Failed to create comment' }, 500)
  }
})

// PATCH /:id/tasks/:taskId/comments/:commentId - Update a comment
projectRoutes.patch('/:id/tasks/:taskId/comments/:commentId', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const commentId = c.req.param('commentId')
    const db = getDbClient()

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId) || !uuidRegex.test(commentId)) {
      return c.json({ success: false, error: 'Invalid ID format' }, 400)
    }

    const body = await c.req.json()
    const { content, mentions } = body

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Get comment and verify ownership
    const [existingComment] = await db
      .select({
        id: schema.comments.id,
        authorId: schema.comments.authorId,
      })
      .from(schema.comments)
      .where(eq(schema.comments.id, commentId))

    if (!existingComment) {
      return c.json({ success: false, error: 'Comment not found' }, 404)
    }

    if (existingComment.authorId !== user.id) {
      return c.json({ success: false, error: 'You can only edit your own comments' }, 403)
    }

    // Build update object
    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    if (content !== undefined) updateData['content'] = content.trim()
    if (mentions !== undefined) updateData['mentions'] = mentions

    // Update comment
    const [updated] = await db
      .update(schema.comments)
      .set(updateData)
      .where(eq(schema.comments.id, commentId))
      .returning()

    if (!updated) {
      return c.json({ success: false, error: 'Failed to update comment' }, 500)
    }

    // Get author info
    const [author] = await db
      .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))

    return c.json({
      success: true,
      data: {
        comment: {
          id: updated.id,
          taskId: updated.taskId,
          content: updated.content,
          parentId: updated.parentId,
          mentions: updated.mentions || [],
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
          author: {
            id: author?.id || user.id,
            email: author?.email || user.email,
            name: author?.name || null,
          },
        },
      },
    })
  } catch (error) {
    console.error('Update comment error:', error)
    return c.json({ success: false, error: 'Failed to update comment' }, 500)
  }
})

// DELETE /:id/tasks/:taskId/comments/:commentId - Delete a comment
projectRoutes.delete('/:id/tasks/:taskId/comments/:commentId', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const commentId = c.req.param('commentId')
    const db = getDbClient()

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId) || !uuidRegex.test(commentId)) {
      return c.json({ success: false, error: 'Invalid ID format' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Get comment and verify ownership
    const [existingComment] = await db
      .select({
        id: schema.comments.id,
        authorId: schema.comments.authorId,
      })
      .from(schema.comments)
      .where(eq(schema.comments.id, commentId))

    if (!existingComment) {
      return c.json({ success: false, error: 'Comment not found' }, 404)
    }

    if (existingComment.authorId !== user.id) {
      return c.json({ success: false, error: 'You can only delete your own comments' }, 403)
    }

    // Delete comment
    await db
      .delete(schema.comments)
      .where(eq(schema.comments.id, commentId))

    return c.json({
      success: true,
      data: {
        message: 'Comment deleted successfully',
      },
    })
  } catch (error) {
    console.error('Delete comment error:', error)
    return c.json({ success: false, error: 'Failed to delete comment' }, 500)
  }
})

// ============================================
// Branch Name Generation
// ============================================

// GET /:id/tasks/:taskId/branch-name - Generate branch name for a task
projectRoutes.get('/:id/tasks/:taskId/branch-name', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const taskIdParam = c.req.param('taskId')
    const db = getDbClient()

    // Get optional prefix from query params
    const prefixParam = c.req.query('prefix') as BranchPrefix | undefined
    const autoDetect = c.req.query('auto') !== 'false' // Default to auto-detect

    // Validate UUID format for project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Validate taskId format
    const taskIdRegex = /^T\d+\.\d+$/
    if (!taskIdRegex.test(taskIdParam)) {
      return c.json({ success: false, error: 'Invalid task ID format. Expected format: T1.1' }, 400)
    }

    // Verify the project exists and user has access
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Get the task
    const [task] = await db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.taskId, taskIdParam)))

    if (!task) {
      return c.json({ success: false, error: `Task ${taskIdParam} not found` }, 404)
    }

    // Generate branch name
    let branchName: string
    let detectedPrefix: BranchPrefix

    if (prefixParam) {
      // Use provided prefix
      branchName = generateBranchName(task.taskId, task.name, { prefix: prefixParam })
      detectedPrefix = prefixParam
    } else if (autoDetect) {
      // Auto-detect prefix based on task name
      const result = generateBranchNameAuto(task.taskId, task.name)
      branchName = result.branchName
      detectedPrefix = result.detectedPrefix
    } else {
      // Default to 'feature' prefix
      branchName = generateBranchName(task.taskId, task.name, { prefix: 'feature' })
      detectedPrefix = 'feature'
    }

    // Generate all prefix variants for the UI
    const variants: Record<BranchPrefix, string> = {
      feature: generateBranchName(task.taskId, task.name, { prefix: 'feature' }),
      fix: generateBranchName(task.taskId, task.name, { prefix: 'fix' }),
      hotfix: generateBranchName(task.taskId, task.name, { prefix: 'hotfix' }),
      chore: generateBranchName(task.taskId, task.name, { prefix: 'chore' }),
      docs: generateBranchName(task.taskId, task.name, { prefix: 'docs' }),
      refactor: generateBranchName(task.taskId, task.name, { prefix: 'refactor' }),
      test: generateBranchName(task.taskId, task.name, { prefix: 'test' }),
    }

    // Generate git command for convenience
    const gitCommand = `git checkout -b ${branchName}`

    return c.json({
      success: true,
      data: {
        task: {
          id: task.id,
          taskId: task.taskId,
          name: task.name,
        },
        branchName,
        detectedPrefix,
        variants,
        gitCommand,
      },
    })
  } catch (error) {
    console.error('Generate branch name error:', error)
    return c.json({ success: false, error: 'Failed to generate branch name' }, 500)
  }
})

// ============================================
// Project GitHub Repository Integration
// ============================================

// GET /:id/github - Get project's GitHub integration status
projectRoutes.get('/:id/github', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const db = getDbClient()

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Get project with GitHub fields
    const [project] = await db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        githubRepository: schema.projects.githubRepository,
        githubOwner: schema.projects.githubOwner,
        githubRepoName: schema.projects.githubRepoName,
        githubDefaultBranch: schema.projects.githubDefaultBranch,
        githubRepoUrl: schema.projects.githubRepoUrl,
        githubRepoPrivate: schema.projects.githubRepoPrivate,
        githubWebhookId: schema.projects.githubWebhookId,
        githubLinkedAt: schema.projects.githubLinkedAt,
        githubLinkedBy: schema.projects.githubLinkedBy,
        userId: schema.projects.userId,
      })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // If not linked, return simple response
    if (!project.githubRepository) {
      return c.json({
        success: true,
        data: {
          linked: false,
          repository: null,
        },
      })
    }

    // Get linkedBy user info if available
    let linkedByUser = null
    if (project.githubLinkedBy) {
      const [linkedUser] = await db
        .select({
          id: schema.users.id,
          name: schema.users.name,
          email: schema.users.email,
        })
        .from(schema.users)
        .where(eq(schema.users.id, project.githubLinkedBy))

      linkedByUser = linkedUser || null
    }

    return c.json({
      success: true,
      data: {
        linked: true,
        repository: project.githubRepository,
        owner: project.githubOwner,
        repoName: project.githubRepoName,
        defaultBranch: project.githubDefaultBranch,
        repoUrl: project.githubRepoUrl,
        private: project.githubRepoPrivate,
        linkedAt: project.githubLinkedAt,
        linkedBy: linkedByUser,
        webhook: {
          configured: !!project.githubWebhookId,
        },
      },
    })
  } catch (error) {
    console.error('Get project GitHub status error:', error)
    return c.json({ success: false, error: 'Failed to get GitHub status' }, 500)
  }
})

// POST /:id/github/link - Link repository to project
projectRoutes.post('/:id/github/link', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const db = getDbClient()

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Parse request body
    const body = await c.req.json()
    const { repository } = body as { repository?: string }

    if (!repository) {
      return c.json({ success: false, error: 'Repository is required (format: owner/repo)' }, 400)
    }

    // Parse owner/repo format
    const repoParts = repository.split('/')
    if (repoParts.length !== 2 || !repoParts[0] || !repoParts[1]) {
      return c.json({ success: false, error: 'Invalid repository format. Expected: owner/repo' }, 400)
    }
    const [owner, repoName] = repoParts

    // Check if project exists and user has access
    const [project] = await db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        userId: schema.projects.userId,
        githubRepository: schema.projects.githubRepository,
        githubWebhookId: schema.projects.githubWebhookId,
      })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    // Check if user has GitHub connection
    const [githubIntegration] = await db
      .select({
        id: schema.githubIntegrations.id,
        accessToken: schema.githubIntegrations.accessToken,
        githubUsername: schema.githubIntegrations.githubUsername,
        isConnected: schema.githubIntegrations.isConnected,
        grantedScopes: schema.githubIntegrations.grantedScopes,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )

    if (!githubIntegration) {
      return c.json({
        success: false,
        error: 'GitHub account not connected. Please connect your GitHub account first.',
        code: 'GITHUB_NOT_CONNECTED',
      }, 400)
    }

    // Check if user has admin:repo_hook scope
    const grantedScopes = githubIntegration.grantedScopes || []
    const hasWebhookScope = grantedScopes.some(
      (scope) => scope === 'admin:repo_hook' || scope === 'write:repo_hook'
    )

    if (!hasWebhookScope) {
      return c.json({
        success: false,
        error: 'Missing webhook permissions. Please reconnect GitHub with admin:repo_hook scope.',
        code: 'MISSING_WEBHOOK_SCOPE',
      }, 403)
    }

    // Check user has access to the repository
    const accessCheck = await checkRepositoryAccess(
      githubIntegration.accessToken,
      owner,
      repoName
    )

    if (!accessCheck.hasAccess) {
      return c.json({
        success: false,
        error: accessCheck.error || 'Repository not found or no access',
        code: 'REPO_ACCESS_DENIED',
      }, 404)
    }

    if (!accessCheck.canAdmin) {
      return c.json({
        success: false,
        error: 'Admin access required to manage webhooks for this repository',
        code: 'ADMIN_ACCESS_REQUIRED',
      }, 403)
    }

    // Fetch repository details
    const repoDetails = await fetchGitHubRepository(
      githubIntegration.accessToken,
      owner,
      repoName
    )

    if (!repoDetails) {
      return c.json({ success: false, error: 'Failed to fetch repository details' }, 500)
    }

    // If project already has a different repo linked, cleanup old webhook first
    if (project.githubRepository && project.githubWebhookId && project.githubRepository !== repository) {
      const [oldOwner, oldRepo] = project.githubRepository.split('/')
      if (oldOwner && oldRepo) {
        await deleteGitHubWebhook(
          githubIntegration.accessToken,
          oldOwner,
          oldRepo,
          project.githubWebhookId
        ).catch(() => {
          // Ignore errors - webhook might already be deleted
        })
      }
    }

    // Generate webhook secret and create webhook
    const webhookSecret = generateWebhookSecret()
    const webhookUrl = `${process.env['API_BASE_URL'] || 'http://localhost:3000'}/webhooks/github/project/${projectId}`

    const webhook = await createGitHubWebhook(
      githubIntegration.accessToken,
      owner,
      repoName,
      webhookUrl,
      webhookSecret,
      ['pull_request', 'issues', 'push']
    )

    if (!webhook) {
      return c.json({
        success: false,
        error: 'Failed to create webhook on GitHub. Please check your permissions.',
        code: 'WEBHOOK_CREATION_FAILED',
      }, 500)
    }

    // Update project with GitHub info
    const [updatedProject] = await db
      .update(schema.projects)
      .set({
        githubRepository: repository,
        githubOwner: owner,
        githubRepoName: repoName,
        githubDefaultBranch: repoDetails.default_branch,
        githubRepoUrl: repoDetails.html_url,
        githubRepoPrivate: repoDetails.private,
        githubWebhookId: String(webhook.id),
        githubWebhookSecret: webhookSecret,
        githubLinkedAt: new Date(),
        githubLinkedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(schema.projects.id, projectId))
      .returning({
        id: schema.projects.id,
        name: schema.projects.name,
        githubRepository: schema.projects.githubRepository,
        githubOwner: schema.projects.githubOwner,
        githubRepoName: schema.projects.githubRepoName,
        githubDefaultBranch: schema.projects.githubDefaultBranch,
        githubRepoUrl: schema.projects.githubRepoUrl,
        githubRepoPrivate: schema.projects.githubRepoPrivate,
        githubLinkedAt: schema.projects.githubLinkedAt,
      })

    // Log activity
    await db.insert(schema.activityLog).values({
      action: 'github_repo_linked',
      entityType: 'project',
      entityId: projectId,
      actorId: user.id,
      projectId,
      description: `Linked GitHub repository ${repository}`,
      metadata: {
        repository,
        owner,
        repoName,
        defaultBranch: repoDetails.default_branch,
        webhookId: webhook.id,
      },
    })

    return c.json({
      success: true,
      data: {
        project: {
          id: updatedProject?.id,
          name: updatedProject?.name,
          githubRepository: updatedProject?.githubRepository,
          githubOwner: updatedProject?.githubOwner,
          githubRepoName: updatedProject?.githubRepoName,
          githubDefaultBranch: updatedProject?.githubDefaultBranch,
          githubRepoUrl: updatedProject?.githubRepoUrl,
          githubLinkedAt: updatedProject?.githubLinkedAt,
          webhookConfigured: true,
        },
      },
    })
  } catch (error) {
    console.error('Link GitHub repository error:', error)
    return c.json({ success: false, error: 'Failed to link GitHub repository' }, 500)
  }
})

// DELETE /:id/github/link - Unlink repository from project
projectRoutes.delete('/:id/github/link', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const db = getDbClient()

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Get project
    const [project] = await db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        userId: schema.projects.userId,
        githubRepository: schema.projects.githubRepository,
        githubOwner: schema.projects.githubOwner,
        githubRepoName: schema.projects.githubRepoName,
        githubWebhookId: schema.projects.githubWebhookId,
      })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    if (!project.githubRepository) {
      return c.json({ success: false, error: 'No GitHub repository linked to this project' }, 400)
    }

    // Try to delete webhook from GitHub (best effort)
    if (project.githubWebhookId && project.githubOwner && project.githubRepoName) {
      // Get user's GitHub integration for access token
      const [githubIntegration] = await db
        .select({
          accessToken: schema.githubIntegrations.accessToken,
          isConnected: schema.githubIntegrations.isConnected,
        })
        .from(schema.githubIntegrations)
        .where(
          and(
            eq(schema.githubIntegrations.userId, user.id),
            eq(schema.githubIntegrations.isConnected, true)
          )
        )

      if (githubIntegration) {
        await deleteGitHubWebhook(
          githubIntegration.accessToken,
          project.githubOwner,
          project.githubRepoName,
          project.githubWebhookId
        ).catch(() => {
          // Ignore errors - webhook might already be deleted
        })
      }
    }

    const previousRepo = project.githubRepository

    // Clear GitHub fields from project
    await db
      .update(schema.projects)
      .set({
        githubRepository: null,
        githubOwner: null,
        githubRepoName: null,
        githubDefaultBranch: null,
        githubRepoUrl: null,
        githubRepoPrivate: null,
        githubWebhookId: null,
        githubWebhookSecret: null,
        githubLinkedAt: null,
        githubLinkedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.projects.id, projectId))

    // Log activity
    await db.insert(schema.activityLog).values({
      action: 'github_repo_unlinked',
      entityType: 'project',
      entityId: projectId,
      actorId: user.id,
      projectId,
      description: `Unlinked GitHub repository ${previousRepo}`,
      metadata: {
        previousRepository: previousRepo,
      },
    })

    return c.json({
      success: true,
      message: `GitHub repository ${previousRepo} has been unlinked from the project`,
    })
  } catch (error) {
    console.error('Unlink GitHub repository error:', error)
    return c.json({ success: false, error: 'Failed to unlink GitHub repository' }, 500)
  }
})

// POST /:id/github/webhook/sync - Re-sync webhook (if deleted on GitHub)
projectRoutes.post('/:id/github/webhook/sync', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('id')
    const db = getDbClient()

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    // Get project
    const [project] = await db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        userId: schema.projects.userId,
        githubRepository: schema.projects.githubRepository,
        githubOwner: schema.projects.githubOwner,
        githubRepoName: schema.projects.githubRepoName,
        githubWebhookId: schema.projects.githubWebhookId,
        githubWebhookSecret: schema.projects.githubWebhookSecret,
      })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, user.id)))

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    if (!project.githubRepository || !project.githubOwner || !project.githubRepoName) {
      return c.json({ success: false, error: 'No GitHub repository linked to this project' }, 400)
    }

    // Get user's GitHub integration
    const [githubIntegration] = await db
      .select({
        accessToken: schema.githubIntegrations.accessToken,
        isConnected: schema.githubIntegrations.isConnected,
      })
      .from(schema.githubIntegrations)
      .where(
        and(
          eq(schema.githubIntegrations.userId, user.id),
          eq(schema.githubIntegrations.isConnected, true)
        )
      )

    if (!githubIntegration) {
      return c.json({
        success: false,
        error: 'GitHub account not connected',
        code: 'GITHUB_NOT_CONNECTED',
      }, 400)
    }

    // Check if webhook exists on GitHub
    let webhookExists = false
    if (project.githubWebhookId) {
      const existingWebhook = await getGitHubWebhook(
        githubIntegration.accessToken,
        project.githubOwner,
        project.githubRepoName,
        project.githubWebhookId
      )
      webhookExists = !!existingWebhook
    }

    if (webhookExists) {
      return c.json({
        success: true,
        message: 'Webhook is already configured and active',
        data: {
          webhookId: project.githubWebhookId,
          status: 'active',
        },
      })
    }

    // Re-create webhook
    const webhookSecret = project.githubWebhookSecret || generateWebhookSecret()
    const webhookUrl = `${process.env['API_BASE_URL'] || 'http://localhost:3000'}/webhooks/github/project/${projectId}`

    const webhook = await createGitHubWebhook(
      githubIntegration.accessToken,
      project.githubOwner,
      project.githubRepoName,
      webhookUrl,
      webhookSecret,
      ['pull_request', 'issues', 'push']
    )

    if (!webhook) {
      return c.json({
        success: false,
        error: 'Failed to create webhook on GitHub',
        code: 'WEBHOOK_CREATION_FAILED',
      }, 500)
    }

    // Update project with new webhook ID
    await db
      .update(schema.projects)
      .set({
        githubWebhookId: String(webhook.id),
        githubWebhookSecret: webhookSecret,
        updatedAt: new Date(),
      })
      .where(eq(schema.projects.id, projectId))

    return c.json({
      success: true,
      message: 'Webhook has been re-created',
      data: {
        webhookId: webhook.id,
        status: 'active',
      },
    })
  } catch (error) {
    console.error('Sync GitHub webhook error:', error)
    return c.json({ success: false, error: 'Failed to sync webhook' }, 500)
  }
})

export { projectRoutes }
