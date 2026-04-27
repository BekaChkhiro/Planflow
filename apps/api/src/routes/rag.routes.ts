/**
 * RAG Routes (T21.2 — API Routes for RAG)
 *
 * Endpoints:
 *   POST /projects/:projectId/index        — index file contents into LanceDB
 *   POST /projects/:projectId/search       — hybrid search (vector + keyword)
 *   GET  /projects/:projectId/index-status — check if project is indexed
 *
 * Mounted at /projects
 */

import { Hono } from 'hono'
import { and, eq, or } from 'drizzle-orm'
import { getDbClient, schema } from '../db/index.js'
import { auth, getAuth } from '../middleware/index.js'
import { ragService } from '../services/rag.service.js'
import { loggers } from '../lib/logger.js'

const log = loggers.server
const ragRoutes = new Hono()

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Max files per index request */
const MAX_FILES = 500
/** Max content length per file (1 MB) */
const MAX_CONTENT_LENGTH = 1024 * 1024

// ---------------------------------------------------------------------------
// Helper: project access check
// ---------------------------------------------------------------------------

async function getProjectAccess(
  db: ReturnType<typeof getDbClient>,
  projectId: string,
  userId: string
): Promise<{ role: string } | undefined> {
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

  if (projectMember) return { role: projectMember.role }

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

  if (orgAdmin) return { role: orgAdmin.role }

  return undefined
}

// ---------------------------------------------------------------------------
// POST /projects/:projectId/index
// ---------------------------------------------------------------------------

ragRoutes.post('/:projectId/index', auth, async (c) => {
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

    const body = await c.req.json()

    // Validate files array
    if (!body.files || !Array.isArray(body.files) || body.files.length === 0) {
      return c.json({ success: false, error: 'Request body must include a non-empty "files" array' }, 400)
    }

    if (body.files.length > MAX_FILES) {
      return c.json(
        { success: false, error: `Maximum ${MAX_FILES} files per request. Use multiple requests for larger codebases.` },
        400
      )
    }

    const files: Array<{ path: string; content: string; language?: string }> = []

    for (let i = 0; i < body.files.length; i++) {
      const f = body.files[i]

      if (!f || typeof f !== 'object') {
        return c.json({ success: false, error: `files[${i}] must be an object` }, 400)
      }

      if (typeof f.path !== 'string' || f.path.length === 0) {
        return c.json({ success: false, error: `files[${i}].path is required and must be a non-empty string` }, 400)
      }

      if (typeof f.content !== 'string') {
        return c.json({ success: false, error: `files[${i}].content is required and must be a string` }, 400)
      }

      if (f.content.length > MAX_CONTENT_LENGTH) {
        return c.json(
          { success: false, error: `files[${i}].content exceeds maximum length of ${MAX_CONTENT_LENGTH} bytes` },
          400
        )
      }

      files.push({
        path: f.path,
        content: f.content,
        language: typeof f.language === 'string' ? f.language : undefined,
      })
    }

    const result = await ragService.index(projectId, files)

    return c.json({
      success: true,
      data: result,
    })
  } catch (error) {
    log.error({ error, route: 'POST /:projectId/index' }, 'RAG index error')

    if (error instanceof Error && error.message.includes('VOYAGE_API_KEY')) {
      return c.json({ success: false, error: 'Embedding service is not configured' }, 503)
    }

    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// ---------------------------------------------------------------------------
// POST /projects/:projectId/search
// ---------------------------------------------------------------------------

ragRoutes.post('/:projectId/search', auth, async (c) => {
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

    const body = await c.req.json()

    if (typeof body.query !== 'string' || body.query.trim().length === 0) {
      return c.json({ success: false, error: 'Request body must include a non-empty "query" string' }, 400)
    }

    const limit = Math.min(
      typeof body.limit === 'number' && body.limit > 0 ? body.limit : 10,
      50
    )

    const results = await ragService.search(projectId, {
      query: body.query.trim(),
      limit,
      language: typeof body.language === 'string' ? body.language : undefined,
      kind: typeof body.kind === 'string' ? body.kind : undefined,
      source: ['code', 'docs', 'all'].includes(body.source) ? body.source : 'all',
    })

    return c.json({
      success: true,
      data: {
        query: body.query.trim(),
        results,
        total: results.length,
      },
    })
  } catch (error) {
    log.error({ error, route: 'POST /:projectId/search' }, 'RAG search error')

    if (error instanceof Error && error.message.includes('VOYAGE_API_KEY')) {
      return c.json({ success: false, error: 'Embedding service is not configured' }, 503)
    }

    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// ---------------------------------------------------------------------------
// GET /projects/:projectId/index-status
// ---------------------------------------------------------------------------

ragRoutes.get('/:projectId/index-status', auth, async (c) => {
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

    const status = await ragService.getIndexStatus(projectId)

    return c.json({
      success: true,
      data: status,
    })
  } catch (error) {
    log.error({ error, route: 'GET /:projectId/index-status' }, 'RAG status error')
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

export { ragRoutes }
