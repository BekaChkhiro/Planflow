/**
 * Knowledge Aggregator Routes (T20.8)
 *
 * Unified endpoint that combines PostgreSQL knowledge, Redis real-time state,
 * and activity history into a single response for AI agents.
 *
 * Mounted at /projects/:projectId/context
 */

import { Hono } from 'hono'
import { and, eq, or } from 'drizzle-orm'
import { getDbClient, schema } from '../db/index.js'
import { auth, getAuth } from '../middleware/index.js'
import { knowledgeAggregatorService } from '../services/knowledge-aggregator.service.js'

const knowledgeAggregatorRoutes = new Hono()

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const VALID_LAYERS = ['knowledge', 'vector', 'realtime', 'activity'] as const
type Layer = (typeof VALID_LAYERS)[number]

// Helper: check project access
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

/**
 * GET /projects/:projectId/context
 *
 * Returns aggregated project context from all data layers.
 *
 * Query params:
 *   - query       (string)  Optional semantic search term
 *   - layers      (string)  Comma-separated: knowledge,vector,realtime,activity
 *   - knowledgeLimit  (int) Max knowledge entries (default 50, max 200)
 *   - changesLimit    (int) Max recent changes (default 30, max 200)
 *   - activityLimit   (int) Max activity entries (default 30, max 200)
 *   - knowledgeType   (string) Filter knowledge by type
 */
knowledgeAggregatorRoutes.get('/:projectId/context', auth, async (c) => {
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

    // Parse query params
    const query = c.req.query('query')?.trim() || undefined
    const knowledgeType = c.req.query('knowledgeType')?.trim() || undefined
    const knowledgeLimit = Math.min(parseInt(c.req.query('knowledgeLimit') ?? '50', 10), 200)
    const changesLimit = Math.min(parseInt(c.req.query('changesLimit') ?? '30', 10), 200)
    const activityLimit = Math.min(parseInt(c.req.query('activityLimit') ?? '30', 10), 200)

    // Parse layers
    let layers: Layer[] | undefined
    const layersParam = c.req.query('layers')?.trim()
    if (layersParam) {
      layers = layersParam
        .split(',')
        .map((l) => l.trim() as Layer)
        .filter((l) => VALID_LAYERS.includes(l))

      if (layers.length === 0) {
        return c.json(
          { success: false, error: `Invalid layers. Must be comma-separated: ${VALID_LAYERS.join(', ')}` },
          400
        )
      }
    }

    const result = await knowledgeAggregatorService.aggregate({
      projectId,
      query,
      layers,
      knowledgeLimit,
      changesLimit,
      activityLimit,
      knowledgeType,
    })

    return c.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('Knowledge Aggregator API error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

export { knowledgeAggregatorRoutes }
