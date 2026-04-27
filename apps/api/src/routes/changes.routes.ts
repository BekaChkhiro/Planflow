/**
 * Recent Changes Routes (T20.5)
 * Endpoints for querying the recent changes stream.
 * Mounted at /projects/:projectId/changes
 */

import { Hono } from 'hono'
import { and, eq, or } from 'drizzle-orm'
import { getDbClient, schema } from '../db/index.js'
import { auth, getAuth } from '../middleware/index.js'
import { getRecentChangesStore } from '../lib/redis.js'

const changesRoutes = new Hono()

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

// GET /projects/:projectId/changes - List recent changes
changesRoutes.get('/:projectId/changes', auth, async (c) => {
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

    const entityType = c.req.query('entityType') as 'task' | 'knowledge' | 'comment' | 'project' | undefined
    const userId = c.req.query('userId')
    const since = c.req.query('since')
    const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 200)
    const offset = parseInt(c.req.query('offset') ?? '0', 10)

    const store = getRecentChangesStore()
    const changes = await store.getRecentChanges(projectId, {
      entityType: entityType || undefined,
      userId: userId || undefined,
      since: since || undefined,
      limit,
      offset,
    })

    const totalCount = await store.getChangeCount(projectId)

    return c.json({
      success: true,
      data: {
        changes,
        total: totalCount,
        limit,
        offset,
      },
    })
  } catch (error) {
    console.error('Changes API error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

export { changesRoutes }
