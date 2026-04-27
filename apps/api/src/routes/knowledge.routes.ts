/**
 * Knowledge Routes
 * CRUD endpoints for project knowledge entries
 * Mounted at /projects/:projectId/knowledge
 */

import { Hono } from 'hono'
import { and, eq, or } from 'drizzle-orm'
import { getDbClient, schema } from '../db/index.js'
import { auth, getAuth } from '../middleware/index.js'
import { knowledgeService } from '../services/knowledge.service.js'
import { techStackDetectorService } from '../services/tech-stack-detector.service.js'
import { codingPatternDetectorService } from '../services/coding-pattern-detector.service.js'
import { ServiceError } from '../services/errors.js'

const knowledgeRoutes = new Hono()

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Helper: check project access and return project + role
async function getProjectAccess(
  db: ReturnType<typeof getDbClient>,
  projectId: string,
  userId: string
): Promise<{ role: string } | undefined> {
  // Check project-level membership first
  const [projectMember] = await db
    .select({ role: schema.projectMembers.role })
    .from(schema.projectMembers)
    .where(
      and(
        eq(schema.projectMembers.projectId, projectId),
        eq(schema.projectMembers.userId, userId)
      )
    )
    .limit(1)

  if (projectMember) {
    return { role: projectMember.role }
  }

  // Fall back to org admin override
  const [orgAdmin] = await db
    .select({ role: schema.organizationMembers.role })
    .from(schema.projects)
    .innerJoin(
      schema.organizationMembers,
      and(
        eq(schema.organizationMembers.organizationId, schema.projects.organizationId),
        eq(schema.organizationMembers.userId, userId)
      )
    )
    .where(
      and(
        eq(schema.projects.id, projectId),
        or(
          eq(schema.organizationMembers.role, 'owner'),
          eq(schema.organizationMembers.role, 'admin')
        )
      )
    )
    .limit(1)

  if (orgAdmin) {
    return { role: orgAdmin.role }
  }

  return undefined
}

function canEdit(role: string): boolean {
  return role === 'owner' || role === 'admin' || role === 'editor'
}

function handleError(c: any, error: unknown) {
  if (error instanceof ServiceError) {
    return c.json(
      { success: false, error: error.message, code: error.code },
      error.statusCode as any
    )
  }
  console.error('Knowledge API error:', error)
  return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
}

// GET /projects/:projectId/knowledge - List knowledge entries
knowledgeRoutes.get('/:projectId/knowledge', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('projectId')
    const db = getDbClient()

    if (!UUID_REGEX.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    const access = await getProjectAccess(db, projectId, user.id)
    if (!access) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    const type = c.req.query('type')
    const source = c.req.query('source')
    const search = c.req.query('search')?.trim()
    const page = parseInt(c.req.query('page') ?? '1', 10)
    const limit = parseInt(c.req.query('limit') ?? '20', 10)

    const result = await knowledgeService.list({
      projectId,
      type: type || undefined,
      source: source || undefined,
      search: search || undefined,
      page,
      limit,
    })

    return c.json({
      success: true,
      data: {
        knowledge: result.data,
        pagination: {
          total: result.total,
          page,
          limit: result.limit,
          hasMore: result.hasMore,
        },
      },
    })
  } catch (error) {
    return handleError(c, error)
  }
})

// GET /projects/:projectId/knowledge/:id - Get a single knowledge entry
knowledgeRoutes.get('/:projectId/knowledge/:id', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const db = getDbClient()

    if (!UUID_REGEX.test(projectId) || !UUID_REGEX.test(id)) {
      return c.json({ success: false, error: 'Invalid ID format' }, 400)
    }

    const access = await getProjectAccess(db, projectId, user.id)
    if (!access) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    const entry = await knowledgeService.getById(id, projectId)

    return c.json({ success: true, data: { knowledge: entry } })
  } catch (error) {
    return handleError(c, error)
  }
})

// POST /projects/:projectId/knowledge - Create a knowledge entry
knowledgeRoutes.post('/:projectId/knowledge', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('projectId')
    const db = getDbClient()

    if (!UUID_REGEX.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    const access = await getProjectAccess(db, projectId, user.id)
    if (!access) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    if (!canEdit(access.role)) {
      return c.json({ success: false, error: 'Viewers have read-only access' }, 403)
    }

    const body = await c.req.json()

    const entry = await knowledgeService.create(projectId, user.id, {
      title: body.title,
      content: body.content,
      type: body.type,
      source: body.source,
      tags: body.tags,
      metadata: body.metadata,
    })

    return c.json(
      { success: true, data: { knowledge: entry }, message: 'Knowledge entry created' },
      201
    )
  } catch (error) {
    return handleError(c, error)
  }
})

// PUT /projects/:projectId/knowledge/:id - Update a knowledge entry
knowledgeRoutes.put('/:projectId/knowledge/:id', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const db = getDbClient()

    if (!UUID_REGEX.test(projectId) || !UUID_REGEX.test(id)) {
      return c.json({ success: false, error: 'Invalid ID format' }, 400)
    }

    const access = await getProjectAccess(db, projectId, user.id)
    if (!access) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    if (!canEdit(access.role)) {
      return c.json({ success: false, error: 'Viewers have read-only access' }, 403)
    }

    const body = await c.req.json()

    const entry = await knowledgeService.update(id, projectId, user.id, {
      title: body.title,
      content: body.content,
      type: body.type,
      tags: body.tags,
      metadata: body.metadata,
    })

    return c.json({ success: true, data: { knowledge: entry }, message: 'Knowledge entry updated' })
  } catch (error) {
    return handleError(c, error)
  }
})

// POST /projects/:projectId/knowledge/auto-detect - Auto-detect tech stack (T20.6)
knowledgeRoutes.post('/:projectId/knowledge/auto-detect', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('projectId')
    const db = getDbClient()

    if (!UUID_REGEX.test(projectId)) {
      return c.json({ success: false, error: 'Invalid project ID format' }, 400)
    }

    const access = await getProjectAccess(db, projectId, user.id)
    if (!access) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    if (!canEdit(access.role)) {
      return c.json({ success: false, error: 'Viewers have read-only access' }, 403)
    }

    const body = await c.req.json()

    if (!body.files || typeof body.files !== 'object' || Object.keys(body.files).length === 0) {
      return c.json(
        { success: false, error: 'Request body must include a "files" object with at least one file' },
        400
      )
    }

    // Run both detectors in parallel
    const [techResult, patternResult] = await Promise.all([
      techStackDetectorService.detect(projectId, user.id, {
        files: body.files,
      }),
      body.paths && Array.isArray(body.paths) && body.paths.length > 0
        ? codingPatternDetectorService.detect(projectId, user.id, {
            paths: body.paths,
          })
        : Promise.resolve({
            entries: [],
            summary: {
              pathsAnalyzed: 0,
              totalDetections: 0,
              created: 0,
              updated: 0,
              categories: {},
            },
          }),
    ])

    const totalDetections = techResult.summary.totalDetections + patternResult.summary.totalDetections
    const totalCreated = techResult.summary.created + patternResult.summary.created
    const totalUpdated = techResult.summary.updated + patternResult.summary.updated

    return c.json({
      success: true,
      data: {
        techStack: techResult,
        patterns: patternResult,
      },
      message:
        `Detected ${totalDetections} items: ${techResult.summary.totalDetections} tech stack + ${patternResult.summary.totalDetections} patterns/conventions. ` +
        `Created ${totalCreated}, updated ${totalUpdated}.`,
    })
  } catch (error) {
    return handleError(c, error)
  }
})

// DELETE /projects/:projectId/knowledge/:id - Delete a knowledge entry
knowledgeRoutes.delete('/:projectId/knowledge/:id', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const db = getDbClient()

    if (!UUID_REGEX.test(projectId) || !UUID_REGEX.test(id)) {
      return c.json({ success: false, error: 'Invalid ID format' }, 400)
    }

    const access = await getProjectAccess(db, projectId, user.id)
    if (!access) {
      return c.json({ success: false, error: 'Project not found' }, 404)
    }

    if (!canEdit(access.role)) {
      return c.json({ success: false, error: 'Viewers have read-only access' }, 403)
    }

    await knowledgeService.delete(id, projectId)

    return c.json({ success: true, data: { message: 'Knowledge entry deleted' } })
  } catch (error) {
    return handleError(c, error)
  }
})

export { knowledgeRoutes }
