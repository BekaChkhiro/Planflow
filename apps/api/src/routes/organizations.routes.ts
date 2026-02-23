import { Hono } from 'hono'
import { and, count, desc, eq, gt, isNull, ne, sql } from 'drizzle-orm'
import crypto from 'crypto'
import {
  CreateOrganizationRequestSchema,
  UpdateOrganizationRequestSchema,
  CreateInvitationRequestSchema,
  UpdateMemberRoleRequestSchema,
  ActivityLogQuerySchema,
} from '@planflow/shared'
import { getDbClient, schema, withTransaction } from '../db/index.js'
import { auth, getAuth } from '../middleware/index.js'
import { generateSlug } from '../utils/helpers.js'
import { sendTeamInvitationEmail } from '../lib/email.js'

const organizationsRoutes = new Hono()

// UUID validation regex
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /organizations - Create a new organization
organizationsRoutes.post('/', auth, async (c) => {
  try {
    const { user } = getAuth(c)

    const body = await c.req.json()
    const validation = CreateOrganizationRequestSchema.safeParse(body)

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

    const { name, slug: providedSlug, description } = validation.data
    const slug = providedSlug || generateSlug(name)
    const db = getDbClient()

    // Check if slug is already taken
    const [existingOrg] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.slug, slug))
      .limit(1)

    if (existingOrg) {
      return c.json(
        {
          success: false,
          error: 'An organization with this slug already exists',
        },
        409
      )
    }

    // Use transaction for atomic organization + member creation
    const newOrg = await withTransaction(async (tx) => {
      // Insert organization
      const [org] = await tx
        .insert(schema.organizations)
        .values({
          name,
          slug,
          description: description ?? null,
          createdBy: user.id,
        })
        .returning({
          id: schema.organizations.id,
          name: schema.organizations.name,
          slug: schema.organizations.slug,
          description: schema.organizations.description,
          createdBy: schema.organizations.createdBy,
          createdAt: schema.organizations.createdAt,
          updatedAt: schema.organizations.updatedAt,
        })

      if (!org) {
        throw new Error('Failed to create organization')
      }

      // Add creator as owner member (within same transaction)
      await tx.insert(schema.organizationMembers).values({
        organizationId: org.id,
        userId: user.id,
        role: 'owner',
      })

      return org
    })

    return c.json(
      {
        success: true,
        data: { organization: newOrg },
      },
      201
    )
  } catch (error) {
    console.error('Create organization error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /organizations - List user's organizations
organizationsRoutes.get('/', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const db = getDbClient()

    const orgs = await db
      .select({
        id: schema.organizations.id,
        name: schema.organizations.name,
        slug: schema.organizations.slug,
        description: schema.organizations.description,
        createdBy: schema.organizations.createdBy,
        createdAt: schema.organizations.createdAt,
        updatedAt: schema.organizations.updatedAt,
        role: schema.organizationMembers.role,
      })
      .from(schema.organizationMembers)
      .innerJoin(
        schema.organizations,
        eq(schema.organizationMembers.organizationId, schema.organizations.id)
      )
      .where(eq(schema.organizationMembers.userId, user.id))
      .orderBy(desc(schema.organizations.updatedAt))

    return c.json({
      success: true,
      data: { organizations: orgs },
    })
  } catch (error) {
    console.error('List organizations error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /organizations/:id - Get organization details
organizationsRoutes.get('/:id', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')

    // Validate UUID format
    if (!uuidRegex.test(orgId)) {
      return c.json({ success: false, error: 'Invalid organization ID format' }, 400)
    }

    const db = getDbClient()

    // Get org + user's membership in a single query
    const [result] = await db
      .select({
        id: schema.organizations.id,
        name: schema.organizations.name,
        slug: schema.organizations.slug,
        description: schema.organizations.description,
        createdBy: schema.organizations.createdBy,
        createdAt: schema.organizations.createdAt,
        updatedAt: schema.organizations.updatedAt,
        role: schema.organizationMembers.role,
      })
      .from(schema.organizationMembers)
      .innerJoin(
        schema.organizations,
        eq(schema.organizationMembers.organizationId, schema.organizations.id)
      )
      .where(
        and(
          eq(schema.organizationMembers.userId, user.id),
          eq(schema.organizations.id, orgId)
        )
      )
      .limit(1)

    if (!result) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    return c.json({
      success: true,
      data: { organization: result },
    })
  } catch (error) {
    console.error('Get organization error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// PUT /organizations/:id - Update organization
organizationsRoutes.put('/:id', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')

    // Validate UUID format
    if (!uuidRegex.test(orgId)) {
      return c.json({ success: false, error: 'Invalid organization ID format' }, 400)
    }

    const body = await c.req.json()
    const validation = UpdateOrganizationRequestSchema.safeParse(body)

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

    const { name, slug, description } = validation.data

    // Check if at least one field is provided
    if (name === undefined && slug === undefined && description === undefined) {
      return c.json(
        {
          success: false,
          error: 'At least one field (name, slug, or description) must be provided',
        },
        400
      )
    }

    const db = getDbClient()

    // Check membership and role (must be owner or admin)
    const [membership] = await db
      .select({ role: schema.organizationMembers.role })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, orgId),
          eq(schema.organizationMembers.userId, user.id)
        )
      )
      .limit(1)

    if (!membership) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    if (membership.role !== 'owner' && membership.role !== 'admin') {
      return c.json({ success: false, error: 'Only owners and admins can update the organization' }, 403)
    }

    // If slug is being changed, check uniqueness
    if (slug) {
      const [existingOrg] = await db
        .select({ id: schema.organizations.id })
        .from(schema.organizations)
        .where(
          and(
            eq(schema.organizations.slug, slug),
            ne(schema.organizations.id, orgId)
          )
        )
        .limit(1)

      if (existingOrg) {
        return c.json(
          {
            success: false,
            error: 'An organization with this slug already exists',
          },
          409
        )
      }
    }

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }
    if (name !== undefined) updateData['name'] = name
    if (slug !== undefined) updateData['slug'] = slug
    if (description !== undefined) updateData['description'] = description

    const [updatedOrg] = await db
      .update(schema.organizations)
      .set(updateData)
      .where(eq(schema.organizations.id, orgId))
      .returning({
        id: schema.organizations.id,
        name: schema.organizations.name,
        slug: schema.organizations.slug,
        description: schema.organizations.description,
        createdBy: schema.organizations.createdBy,
        createdAt: schema.organizations.createdAt,
        updatedAt: schema.organizations.updatedAt,
      })

    if (!updatedOrg) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    return c.json({ success: true, data: { organization: updatedOrg } })
  } catch (error) {
    console.error('Update organization error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// DELETE /organizations/:id - Delete organization
organizationsRoutes.delete('/:id', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')

    // Validate UUID format
    if (!uuidRegex.test(orgId)) {
      return c.json({ success: false, error: 'Invalid organization ID format' }, 400)
    }

    const db = getDbClient()

    // Check membership and role (must be owner)
    const [membership] = await db
      .select({ role: schema.organizationMembers.role })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, orgId),
          eq(schema.organizationMembers.userId, user.id)
        )
      )
      .limit(1)

    if (!membership) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    if (membership.role !== 'owner') {
      return c.json({ success: false, error: 'Only the owner can delete the organization' }, 403)
    }

    const [deletedOrg] = await db
      .delete(schema.organizations)
      .where(eq(schema.organizations.id, orgId))
      .returning({ id: schema.organizations.id })

    if (!deletedOrg) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    return c.json({ success: true, data: { message: 'Organization deleted successfully' } })
  } catch (error) {
    console.error('Delete organization error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /organizations/:id/members - List organization members with pagination
organizationsRoutes.get('/:id/members', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')

    // Validate UUID format
    if (!uuidRegex.test(orgId)) {
      return c.json({ success: false, error: 'Invalid organization ID format' }, 400)
    }

    // Parse pagination parameters
    const pageParam = c.req.query('page')
    const limitParam = c.req.query('limit')
    const page = Math.max(1, parseInt(pageParam || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(limitParam || '20', 10) || 20))
    const offset = (page - 1) * limit

    const db = getDbClient()

    // Check if user is a member of this organization
    const [membership] = await db
      .select({ role: schema.organizationMembers.role })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, orgId),
          eq(schema.organizationMembers.userId, user.id)
        )
      )
      .limit(1)

    if (!membership) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.organizationMembers)
      .where(eq(schema.organizationMembers.organizationId, orgId))
    const totalCount = countResult[0]?.count ?? 0

    // Get paginated members with user info
    const members = await db
      .select({
        id: schema.organizationMembers.id,
        organizationId: schema.organizationMembers.organizationId,
        userId: schema.organizationMembers.userId,
        role: schema.organizationMembers.role,
        createdAt: schema.organizationMembers.createdAt,
        updatedAt: schema.organizationMembers.updatedAt,
        userName: schema.users.name,
        userEmail: schema.users.email,
      })
      .from(schema.organizationMembers)
      .innerJoin(schema.users, eq(schema.organizationMembers.userId, schema.users.id))
      .where(eq(schema.organizationMembers.organizationId, orgId))
      .orderBy(schema.organizationMembers.createdAt)
      .limit(limit)
      .offset(offset)

    const totalPages = Math.ceil(totalCount / limit)

    return c.json({
      success: true,
      data: {
        members,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    })
  } catch (error) {
    console.error('List organization members error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// PATCH /organizations/:id/members/:memberId - Update member role
organizationsRoutes.patch('/:id/members/:memberId', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')
    const memberId = c.req.param('memberId')

    // Validate UUID format
    if (!uuidRegex.test(orgId) || !uuidRegex.test(memberId)) {
      return c.json({ success: false, error: 'Invalid ID format' }, 400)
    }

    const body = await c.req.json()
    const validation = UpdateMemberRoleRequestSchema.safeParse(body)

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

    const { role: newRole } = validation.data
    const db = getDbClient()

    // Check if requester is a member and get their role
    const [requesterMembership] = await db
      .select({ role: schema.organizationMembers.role })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, orgId),
          eq(schema.organizationMembers.userId, user.id)
        )
      )
      .limit(1)

    if (!requesterMembership) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    // Only owner can change roles
    if (requesterMembership.role !== 'owner') {
      return c.json({ success: false, error: 'Only the owner can change member roles' }, 403)
    }

    // Get target member's current info
    const [targetMember] = await db
      .select({
        id: schema.organizationMembers.id,
        userId: schema.organizationMembers.userId,
        role: schema.organizationMembers.role,
      })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.id, memberId),
          eq(schema.organizationMembers.organizationId, orgId)
        )
      )
      .limit(1)

    if (!targetMember) {
      return c.json({ success: false, error: 'Member not found' }, 404)
    }

    // Cannot change the owner's role (ownership transfer not supported yet)
    if (targetMember.role === 'owner') {
      return c.json({ success: false, error: 'Cannot change the owner\'s role. Transfer ownership is not yet supported.' }, 403)
    }

    // Update member role
    const [updatedMember] = await db
      .update(schema.organizationMembers)
      .set({
        role: newRole,
        updatedAt: new Date(),
      })
      .where(eq(schema.organizationMembers.id, memberId))
      .returning({
        id: schema.organizationMembers.id,
        organizationId: schema.organizationMembers.organizationId,
        userId: schema.organizationMembers.userId,
        role: schema.organizationMembers.role,
        createdAt: schema.organizationMembers.createdAt,
        updatedAt: schema.organizationMembers.updatedAt,
      })

    // Get user info for the response
    const [userInfo] = await db
      .select({
        name: schema.users.name,
        email: schema.users.email,
      })
      .from(schema.users)
      .where(eq(schema.users.id, targetMember.userId))
      .limit(1)

    return c.json({
      success: true,
      data: {
        member: {
          ...updatedMember,
          userName: userInfo?.name,
          userEmail: userInfo?.email,
        },
      },
    })
  } catch (error) {
    console.error('Update member role error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// DELETE /organizations/:id/members/:memberId - Remove member from organization
organizationsRoutes.delete('/:id/members/:memberId', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')
    const memberId = c.req.param('memberId')

    // Validate UUID format
    if (!uuidRegex.test(orgId) || !uuidRegex.test(memberId)) {
      return c.json({ success: false, error: 'Invalid ID format' }, 400)
    }

    const db = getDbClient()

    // Check if requester is a member and get their role
    const [requesterMembership] = await db
      .select({
        id: schema.organizationMembers.id,
        role: schema.organizationMembers.role,
      })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, orgId),
          eq(schema.organizationMembers.userId, user.id)
        )
      )
      .limit(1)

    if (!requesterMembership) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    // Get target member's info
    const [targetMember] = await db
      .select({
        id: schema.organizationMembers.id,
        userId: schema.organizationMembers.userId,
        role: schema.organizationMembers.role,
      })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.id, memberId),
          eq(schema.organizationMembers.organizationId, orgId)
        )
      )
      .limit(1)

    if (!targetMember) {
      return c.json({ success: false, error: 'Member not found' }, 404)
    }

    // Check if user is trying to remove themselves
    const isSelfRemoval = targetMember.userId === user.id

    if (isSelfRemoval) {
      // Users can leave an organization, but owner cannot leave
      if (targetMember.role === 'owner') {
        return c.json({
          success: false,
          error: 'Owner cannot leave the organization. Transfer ownership first or delete the organization.',
        }, 403)
      }
    } else {
      // Removing another member - check permissions
      if (requesterMembership.role !== 'owner' && requesterMembership.role !== 'admin') {
        return c.json({ success: false, error: 'Only owners and admins can remove members' }, 403)
      }

      // Admins cannot remove owners or other admins
      if (requesterMembership.role === 'admin') {
        if (targetMember.role === 'owner' || targetMember.role === 'admin') {
          return c.json({ success: false, error: 'Admins cannot remove owners or other admins' }, 403)
        }
      }

      // Cannot remove the owner
      if (targetMember.role === 'owner') {
        return c.json({ success: false, error: 'Cannot remove the organization owner' }, 403)
      }
    }

    // Delete the membership
    const [deleted] = await db
      .delete(schema.organizationMembers)
      .where(eq(schema.organizationMembers.id, memberId))
      .returning({ id: schema.organizationMembers.id })

    if (!deleted) {
      return c.json({ success: false, error: 'Failed to remove member' }, 500)
    }

    return c.json({
      success: true,
      data: {
        message: isSelfRemoval
          ? 'You have left the organization'
          : 'Member removed successfully',
      },
    })
  } catch (error) {
    console.error('Remove member error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// POST /organizations/:id/invitations - Create invitation
organizationsRoutes.post('/:id/invitations', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')

    // Validate UUID format
    if (!uuidRegex.test(orgId)) {
      return c.json({ success: false, error: 'Invalid organization ID format' }, 400)
    }

    const body = await c.req.json()
    const validation = CreateInvitationRequestSchema.safeParse(body)

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

    const { email, role } = validation.data
    const db = getDbClient()

    // Check membership and role (must be owner or admin)
    const [membership] = await db
      .select({ role: schema.organizationMembers.role })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, orgId),
          eq(schema.organizationMembers.userId, user.id)
        )
      )
      .limit(1)

    if (!membership) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    if (membership.role !== 'owner' && membership.role !== 'admin') {
      return c.json({ success: false, error: 'Only owners and admins can invite members' }, 403)
    }

    // Check if the email is already an org member
    const [existingMember] = await db
      .select({ id: schema.organizationMembers.id })
      .from(schema.organizationMembers)
      .innerJoin(schema.users, eq(schema.organizationMembers.userId, schema.users.id))
      .where(
        and(
          eq(schema.organizationMembers.organizationId, orgId),
          eq(schema.users.email, email)
        )
      )
      .limit(1)

    if (existingMember) {
      return c.json({ success: false, error: 'User is already a member of this organization' }, 409)
    }

    // Check for duplicate pending invitation (same org + email + not accepted)
    const [existingInvitation] = await db
      .select({ id: schema.teamInvitations.id })
      .from(schema.teamInvitations)
      .where(
        and(
          eq(schema.teamInvitations.organizationId, orgId),
          eq(schema.teamInvitations.email, email),
          isNull(schema.teamInvitations.acceptedAt),
          gt(schema.teamInvitations.expiresAt, new Date())
        )
      )
      .limit(1)

    if (existingInvitation) {
      return c.json({ success: false, error: 'A pending invitation already exists for this email' }, 409)
    }

    // Generate secure token and set expiry (7 days)
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    // Get organization name for the email
    const [organization] = await db
      .select({ name: schema.organizations.name })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, orgId))
      .limit(1)

    const [invitation] = await db
      .insert(schema.teamInvitations)
      .values({
        organizationId: orgId,
        email,
        role,
        invitedBy: user.id,
        token,
        expiresAt,
      })
      .returning({
        id: schema.teamInvitations.id,
        organizationId: schema.teamInvitations.organizationId,
        email: schema.teamInvitations.email,
        role: schema.teamInvitations.role,
        invitedBy: schema.teamInvitations.invitedBy,
        token: schema.teamInvitations.token,
        expiresAt: schema.teamInvitations.expiresAt,
        acceptedAt: schema.teamInvitations.acceptedAt,
        createdAt: schema.teamInvitations.createdAt,
      })

    if (!invitation) {
      return c.json({ success: false, error: 'Failed to create invitation' }, 500)
    }

    // Send invitation email (non-blocking)
    const appUrl = process.env['APP_URL'] || 'https://planflow.tools'
    const inviteLink = `${appUrl}/invitations/${token}`

    sendTeamInvitationEmail({
      to: email,
      inviterName: user.name || user.email,
      organizationName: organization?.name || 'your team',
      role,
      inviteLink,
      expiresAt,
    }).catch((error) => {
      console.error('Failed to send invitation email:', error)
    })

    return c.json(
      {
        success: true,
        data: { invitation },
      },
      201
    )
  } catch (error) {
    console.error('Create invitation error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /organizations/:id/invitations - List pending invitations
organizationsRoutes.get('/:id/invitations', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')

    // Validate UUID format
    if (!uuidRegex.test(orgId)) {
      return c.json({ success: false, error: 'Invalid organization ID format' }, 400)
    }

    const db = getDbClient()

    // Check if user is a member of this organization
    const [membership] = await db
      .select({ role: schema.organizationMembers.role })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, orgId),
          eq(schema.organizationMembers.userId, user.id)
        )
      )
      .limit(1)

    if (!membership) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    // Get pending invitations (not accepted, not expired) with inviter info
    const invitations = await db
      .select({
        id: schema.teamInvitations.id,
        organizationId: schema.teamInvitations.organizationId,
        email: schema.teamInvitations.email,
        role: schema.teamInvitations.role,
        invitedBy: schema.teamInvitations.invitedBy,
        token: schema.teamInvitations.token,
        expiresAt: schema.teamInvitations.expiresAt,
        acceptedAt: schema.teamInvitations.acceptedAt,
        createdAt: schema.teamInvitations.createdAt,
        inviterName: schema.users.name,
      })
      .from(schema.teamInvitations)
      .innerJoin(schema.users, eq(schema.teamInvitations.invitedBy, schema.users.id))
      .where(
        and(
          eq(schema.teamInvitations.organizationId, orgId),
          isNull(schema.teamInvitations.acceptedAt),
          gt(schema.teamInvitations.expiresAt, new Date())
        )
      )
      .orderBy(desc(schema.teamInvitations.createdAt))

    return c.json({
      success: true,
      data: { invitations },
    })
  } catch (error) {
    console.error('List invitations error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// DELETE /organizations/:id/invitations/:invitationId - Revoke invitation
organizationsRoutes.delete('/:id/invitations/:invitationId', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')
    const invitationId = c.req.param('invitationId')

    // Validate UUID format
    if (!uuidRegex.test(orgId) || !uuidRegex.test(invitationId)) {
      return c.json({ success: false, error: 'Invalid ID format' }, 400)
    }

    const db = getDbClient()

    // Check membership and role (must be owner or admin)
    const [membership] = await db
      .select({ role: schema.organizationMembers.role })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, orgId),
          eq(schema.organizationMembers.userId, user.id)
        )
      )
      .limit(1)

    if (!membership) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    if (membership.role !== 'owner' && membership.role !== 'admin') {
      return c.json({ success: false, error: 'Only owners and admins can revoke invitations' }, 403)
    }

    // Delete the invitation (only if not yet accepted)
    const [deleted] = await db
      .delete(schema.teamInvitations)
      .where(
        and(
          eq(schema.teamInvitations.id, invitationId),
          eq(schema.teamInvitations.organizationId, orgId),
          isNull(schema.teamInvitations.acceptedAt)
        )
      )
      .returning({ id: schema.teamInvitations.id })

    if (!deleted) {
      return c.json({ success: false, error: 'Invitation not found or already accepted' }, 404)
    }

    return c.json({ success: true, data: { message: 'Invitation revoked successfully' } })
  } catch (error) {
    console.error('Revoke invitation error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// GET /organizations/:id/activity - Get activity log for an organization
organizationsRoutes.get('/:id/activity', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const orgId = c.req.param('id')

    // Validate UUID format
    if (!uuidRegex.test(orgId)) {
      return c.json({ success: false, error: 'Invalid organization ID format' }, 400)
    }

    const db = getDbClient()

    // Check user is a member of the organization
    const [membership] = await db
      .select({ role: schema.organizationMembers.role })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, orgId),
          eq(schema.organizationMembers.userId, user.id)
        )
      )
      .limit(1)

    if (!membership) {
      return c.json({ success: false, error: 'Organization not found' }, 404)
    }

    // Parse query parameters
    const queryParams = {
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
      action: c.req.query('action'),
      entityType: c.req.query('entityType'),
      actorId: c.req.query('actorId'),
    }

    const validation = ActivityLogQuerySchema.safeParse(queryParams)
    if (!validation.success) {
      return c.json({
        success: false,
        error: 'Invalid query parameters',
        details: validation.error.flatten().fieldErrors,
      }, 400)
    }

    const { limit, offset, action, entityType, actorId } = validation.data

    // Build query conditions
    const conditions = [eq(schema.activityLog.organizationId, orgId)]

    if (action) {
      conditions.push(eq(schema.activityLog.action, action))
    }
    if (entityType) {
      conditions.push(eq(schema.activityLog.entityType, entityType))
    }
    if (actorId) {
      conditions.push(eq(schema.activityLog.actorId, actorId))
    }

    // Get activities with actor info
    const activities = await db
      .select({
        id: schema.activityLog.id,
        action: schema.activityLog.action,
        entityType: schema.activityLog.entityType,
        entityId: schema.activityLog.entityId,
        taskId: schema.activityLog.taskId,
        actorId: schema.activityLog.actorId,
        organizationId: schema.activityLog.organizationId,
        projectId: schema.activityLog.projectId,
        taskUuid: schema.activityLog.taskUuid,
        metadata: schema.activityLog.metadata,
        description: schema.activityLog.description,
        createdAt: schema.activityLog.createdAt,
        actorEmail: schema.users.email,
        actorName: schema.users.name,
      })
      .from(schema.activityLog)
      .innerJoin(schema.users, eq(schema.activityLog.actorId, schema.users.id))
      .where(and(...conditions))
      .orderBy(desc(schema.activityLog.createdAt))
      .limit(limit)
      .offset(offset)

    // Get total count for pagination
    const [countResult] = await db
      .select({ count: count() })
      .from(schema.activityLog)
      .where(and(...conditions))

    // Format response
    const formattedActivities = activities.map((a) => ({
      id: a.id,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      taskId: a.taskId,
      organizationId: a.organizationId,
      projectId: a.projectId,
      taskUuid: a.taskUuid,
      metadata: a.metadata,
      description: a.description,
      createdAt: a.createdAt,
      actor: {
        id: a.actorId,
        email: a.actorEmail,
        name: a.actorName,
      },
    }))

    return c.json({
      success: true,
      data: {
        activities: formattedActivities,
        pagination: {
          total: countResult?.count ?? 0,
          limit,
          offset,
          hasMore: offset + activities.length < (countResult?.count ?? 0),
        },
      },
    })
  } catch (error) {
    console.error('Get organization activity error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

export { organizationsRoutes }

// Invitation routes (top-level, not under /organizations)
const invitationsRoutes = new Hono()

// POST /invitations/:token/accept - Accept invitation
invitationsRoutes.post('/:token/accept', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const token = c.req.param('token')
    const db = getDbClient()

    // Find invitation by token
    const [invitation] = await db
      .select({
        id: schema.teamInvitations.id,
        organizationId: schema.teamInvitations.organizationId,
        email: schema.teamInvitations.email,
        role: schema.teamInvitations.role,
        expiresAt: schema.teamInvitations.expiresAt,
        acceptedAt: schema.teamInvitations.acceptedAt,
      })
      .from(schema.teamInvitations)
      .where(eq(schema.teamInvitations.token, token))
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
    if (invitation.email !== user.email) {
      return c.json({ success: false, error: 'This invitation was sent to a different email address' }, 403)
    }

    // Use transaction for atomic member creation + invitation update
    await withTransaction(async (tx) => {
      // Add user to org_members with invitation's role
      await tx.insert(schema.organizationMembers).values({
        organizationId: invitation.organizationId,
        userId: user.id,
        role: invitation.role,
      })

      // Mark invitation as accepted
      await tx
        .update(schema.teamInvitations)
        .set({ acceptedAt: new Date() })
        .where(eq(schema.teamInvitations.id, invitation.id))
    })

    // Fetch the organization data to return (outside transaction - read only)
    const [org] = await db
      .select({
        id: schema.organizations.id,
        name: schema.organizations.name,
        slug: schema.organizations.slug,
        description: schema.organizations.description,
        createdBy: schema.organizations.createdBy,
        createdAt: schema.organizations.createdAt,
        updatedAt: schema.organizations.updatedAt,
      })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, invitation.organizationId))
      .limit(1)

    return c.json({
      success: true,
      data: { organization: org },
    })
  } catch (error) {
    console.error('Accept invitation error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

// POST /invitations/:token/decline - Decline invitation
invitationsRoutes.post('/:token/decline', auth, async (c) => {
  try {
    const { user } = getAuth(c)
    const token = c.req.param('token')
    const db = getDbClient()

    // Find invitation by token
    const [invitation] = await db
      .select({
        id: schema.teamInvitations.id,
        email: schema.teamInvitations.email,
      })
      .from(schema.teamInvitations)
      .where(eq(schema.teamInvitations.token, token))
      .limit(1)

    if (!invitation) {
      return c.json({ success: false, error: 'Invitation not found' }, 404)
    }

    // Check email matches user
    if (invitation.email !== user.email) {
      return c.json({ success: false, error: 'This invitation was sent to a different email address' }, 403)
    }

    // Delete the invitation
    await db
      .delete(schema.teamInvitations)
      .where(eq(schema.teamInvitations.id, invitation.id))

    return c.json({ success: true, data: { message: 'Invitation declined successfully' } })
  } catch (error) {
    console.error('Decline invitation error:', error)
    return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
  }
})

export { invitationsRoutes }
