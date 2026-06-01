import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { getDbClient, schema, withTransaction } from '../db/index.js'
import { auth, getAuth } from '../middleware/index.js'

const projectInvitationsRoutes = new Hono()

// GET /project-invitations/:token - Get invitation details (no auth required for preview)
projectInvitationsRoutes.get('/:token', async (c) => {
  try {
    const token = c.req.param('token')
    const db = getDbClient()

    // Find invitation by token with project, organization and inviter details
    const [invitation] = await db
      .select({
        id: schema.projectInvitations.id,
        projectId: schema.projectInvitations.projectId,
        email: schema.projectInvitations.email,
        role: schema.projectInvitations.role,
        expiresAt: schema.projectInvitations.expiresAt,
        acceptedAt: schema.projectInvitations.acceptedAt,
        createdAt: schema.projectInvitations.createdAt,
        projectName: schema.projects.name,
        organizationId: schema.projects.organizationId,
        organizationName: schema.organizations.name,
        inviterName: schema.users.name,
        inviterEmail: schema.users.email,
      })
      .from(schema.projectInvitations)
      .innerJoin(schema.projects, eq(schema.projectInvitations.projectId, schema.projects.id))
      .innerJoin(schema.organizations, eq(schema.projects.organizationId, schema.organizations.id))
      .innerJoin(schema.users, eq(schema.projectInvitations.invitedBy, schema.users.id))
      .where(eq(schema.projectInvitations.token, token))
      .limit(1)

    if (!invitation) {
      return c.json({ success: false, error: 'Invitation not found' }, 404)
    }

    if (invitation.acceptedAt) {
      return c.json({ success: false, error: 'Invitation has already been accepted' }, 410)
    }

    if (new Date() > invitation.expiresAt) {
      return c.json({ success: false, error: 'Invitation has expired' }, 410)
    }

    return c.json({
      success: true,
      data: {
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          expiresAt: invitation.expiresAt,
          createdAt: invitation.createdAt,
          projectName: invitation.projectName,
          organizationName: invitation.organizationName,
          inviterName: invitation.inviterName,
        },
      },
    })
  } catch (error) {
    console.error('Get project invitation error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// POST /project-invitations/:token/accept - Accept invitation (auth required)
projectInvitationsRoutes.post('/:token/accept', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const token = c.req.param('token')
    const db = getDbClient()

    // Find invitation by token (join project to get its organization for the membership check)
    const [invitation] = await db
      .select({
        id: schema.projectInvitations.id,
        projectId: schema.projectInvitations.projectId,
        email: schema.projectInvitations.email,
        role: schema.projectInvitations.role,
        expiresAt: schema.projectInvitations.expiresAt,
        acceptedAt: schema.projectInvitations.acceptedAt,
        invitedBy: schema.projectInvitations.invitedBy,
        organizationId: schema.projects.organizationId,
      })
      .from(schema.projectInvitations)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.projectInvitations.projectId))
      .where(eq(schema.projectInvitations.token, token))
      .limit(1)

    if (!invitation) {
      return c.json({ success: false, error: 'Invitation not found' }, 404)
    }

    if (invitation.acceptedAt) {
      return c.json({ success: false, error: 'Invitation has already been accepted' }, 409)
    }

    if (new Date() > invitation.expiresAt) {
      return c.json({ success: false, error: 'Invitation has expired' }, 410)
    }

    // Check invitee email matches authenticated user
    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      return c.json({ success: false, error: 'This invitation was sent to a different email address' }, 403)
    }

    // The invitee must still be a member of the project's organization. Project
    // membership requires org membership (enforced at invite time); re-verify it
    // here so a user removed from the org after being invited can't slip back in.
    const [orgMembership] = await db
      .select({ id: schema.organizationMembers.id })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, invitation.organizationId),
          eq(schema.organizationMembers.userId, user.id)
        )
      )
      .limit(1)

    if (!orgMembership) {
      return c.json(
        { success: false, error: 'You must be a member of the organization to join this project' },
        403
      )
    }

    // If the user is already a member, return a clean 409 instead of letting the
    // unique(project_id, user_id) constraint surface as a generic 500.
    const [existingMembership] = await db
      .select({ id: schema.projectMembers.id })
      .from(schema.projectMembers)
      .where(
        and(
          eq(schema.projectMembers.projectId, invitation.projectId),
          eq(schema.projectMembers.userId, user.id)
        )
      )
      .limit(1)

    if (existingMembership) {
      // Mark the invitation as accepted so it stops showing as pending.
      await db
        .update(schema.projectInvitations)
        .set({ acceptedAt: new Date() })
        .where(eq(schema.projectInvitations.id, invitation.id))
      return c.json({ success: false, error: 'You are already a member of this project' }, 409)
    }

    // Use transaction for atomic member creation + invitation update
    await withTransaction(async (tx) => {
      // Add user to project_members with invitation's role
      await tx.insert(schema.projectMembers).values({
        projectId: invitation.projectId,
        userId: user.id,
        role: invitation.role,
        invitedBy: invitation.invitedBy,
      })

      // Mark invitation as accepted
      await tx
        .update(schema.projectInvitations)
        .set({ acceptedAt: new Date() })
        .where(eq(schema.projectInvitations.id, invitation.id))
    })

    // Fetch the project data to return (outside transaction - read only)
    const [project] = await db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        description: schema.projects.description,
        organizationId: schema.projects.organizationId,
        createdAt: schema.projects.createdAt,
        updatedAt: schema.projects.updatedAt,
      })
      .from(schema.projects)
      .where(eq(schema.projects.id, invitation.projectId))
      .limit(1)

    return c.json({
      success: true,
      data: { project },
    })
  } catch (error) {
    console.error('Accept project invitation error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// POST /project-invitations/:token/decline - Decline invitation (auth required)
projectInvitationsRoutes.post('/:token/decline', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const token = c.req.param('token')
    const db = getDbClient()

    // Find invitation by token
    const [invitation] = await db
      .select({
        id: schema.projectInvitations.id,
        email: schema.projectInvitations.email,
        acceptedAt: schema.projectInvitations.acceptedAt,
      })
      .from(schema.projectInvitations)
      .where(eq(schema.projectInvitations.token, token))
      .limit(1)

    if (!invitation) {
      return c.json({ success: false, error: 'Invitation not found' }, 404)
    }

    // Check invitee email matches authenticated user
    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      return c.json({ success: false, error: 'This invitation was sent to a different email address' }, 403)
    }

    if (invitation.acceptedAt) {
      return c.json({ success: false, error: 'Invitation has already been accepted' }, 409)
    }

    // Delete the invitation
    await db
      .delete(schema.projectInvitations)
      .where(eq(schema.projectInvitations.id, invitation.id))

    return c.json({
      success: true,
      data: { message: 'Invitation declined successfully' },
    })
  } catch (error) {
    console.error('Decline project invitation error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

export { projectInvitationsRoutes }
