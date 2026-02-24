/**
 * Organization Service
 * Handles organization management, members, and invitations
 */

import { and, count, desc, eq, gt, isNull, ne } from 'drizzle-orm'
import crypto from 'crypto'
import { getDbClient, schema, withTransaction } from '../db/index.js'
import { generateSlug } from '../utils/helpers.js'
import { sendTeamInvitationEmail } from '../lib/email.js'
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ServiceError,
  ValidationError,
} from './errors.js'
import type { OrganizationRole } from '@planflow/shared'

// Constants
const INVITATION_EXPIRY_DAYS = 7

// Types
export interface CreateOrganizationInput {
  name: string
  slug?: string
  description?: string | null
}

export interface UpdateOrganizationInput {
  name?: string
  slug?: string
  description?: string | null
}

export interface Organization {
  id: string
  name: string
  slug: string
  description: string | null
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export interface OrganizationWithRole extends Organization {
  role: OrganizationRole
}

export interface OrganizationMember {
  id: string
  organizationId: string
  userId: string
  role: OrganizationRole
  createdAt: Date
  updatedAt: Date
  userName: string | null
  userEmail: string
}

export interface TeamInvitation {
  id: string
  organizationId: string
  email: string
  role: OrganizationRole
  invitedBy: string
  token: string
  expiresAt: Date
  acceptedAt: Date | null
  createdAt: Date
  inviterName?: string | null
}

export interface CreateInvitationInput {
  email: string
  role: OrganizationRole
  inviterName?: string
  inviterEmail?: string
}

export interface ActivityLog {
  id: string
  action: string
  entityType: string
  entityId: string | null
  taskId: string | null
  organizationId: string
  projectId: string | null
  taskUuid: string | null
  metadata: Record<string, unknown> | null
  description: string | null
  createdAt: Date
  actor: {
    id: string
    email: string
    name: string | null
  }
}

export interface ActivityLogQuery {
  limit?: number
  offset?: number
  action?: string
  entityType?: string
  actorId?: string
}

/**
 * OrganizationService - Handles organization operations
 */
export class OrganizationService {
  private db = getDbClient()

  /**
   * Create a new organization
   */
  async createOrganization(userId: string, input: CreateOrganizationInput): Promise<Organization> {
    const { name, slug: providedSlug, description } = input
    const slug = providedSlug || generateSlug(name)

    // Check slug uniqueness
    const [existingOrg] = await this.db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.slug, slug))
      .limit(1)

    if (existingOrg) {
      throw new ConflictError('An organization with this slug already exists')
    }

    // Create org + member in transaction
    const newOrg = await withTransaction(async (tx) => {
      const [org] = await tx
        .insert(schema.organizations)
        .values({
          name,
          slug,
          description: description ?? null,
          createdBy: userId,
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
        throw new ServiceError('Failed to create organization', 'ORG_CREATION_FAILED', 500)
      }

      // Add creator as owner
      await tx.insert(schema.organizationMembers).values({
        organizationId: org.id,
        userId,
        role: 'owner',
      })

      return org
    })

    return newOrg
  }

  /**
   * List user's organizations
   */
  async listOrganizations(userId: string): Promise<OrganizationWithRole[]> {
    const orgs = await this.db
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
      .where(eq(schema.organizationMembers.userId, userId))
      .orderBy(desc(schema.organizations.updatedAt))

    return orgs as OrganizationWithRole[]
  }

  /**
   * Get organization with user's role
   */
  async getOrganization(userId: string, orgId: string): Promise<OrganizationWithRole> {
    const [result] = await this.db
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
          eq(schema.organizationMembers.userId, userId),
          eq(schema.organizations.id, orgId)
        )
      )
      .limit(1)

    if (!result) {
      throw new NotFoundError('Organization', orgId)
    }

    return result as OrganizationWithRole
  }

  /**
   * Get user's membership in an organization
   */
  async getMembership(userId: string, orgId: string): Promise<{ role: OrganizationRole } | null> {
    const [membership] = await this.db
      .select({ role: schema.organizationMembers.role })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, orgId),
          eq(schema.organizationMembers.userId, userId)
        )
      )
      .limit(1)

    return membership as { role: OrganizationRole } | null
  }

  /**
   * Update organization
   */
  async updateOrganization(
    userId: string,
    orgId: string,
    input: UpdateOrganizationInput
  ): Promise<Organization> {
    const { name, slug, description } = input

    // Validate input
    if (name === undefined && slug === undefined && description === undefined) {
      throw new ValidationError('At least one field must be provided')
    }

    // Check membership and role
    const membership = await this.getMembership(userId, orgId)
    if (!membership) {
      throw new NotFoundError('Organization', orgId)
    }

    if (membership.role !== 'owner' && membership.role !== 'admin') {
      throw new AuthorizationError('Only owners and admins can update the organization')
    }

    // Check slug uniqueness if changing
    if (slug) {
      const [existingOrg] = await this.db
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
        throw new ConflictError('An organization with this slug already exists')
      }
    }

    // Build update
    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    if (name !== undefined) updateData['name'] = name
    if (slug !== undefined) updateData['slug'] = slug
    if (description !== undefined) updateData['description'] = description

    const [updatedOrg] = await this.db
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
      throw new NotFoundError('Organization', orgId)
    }

    return updatedOrg
  }

  /**
   * Delete organization (owner only)
   */
  async deleteOrganization(userId: string, orgId: string): Promise<void> {
    const membership = await this.getMembership(userId, orgId)
    if (!membership) {
      throw new NotFoundError('Organization', orgId)
    }

    if (membership.role !== 'owner') {
      throw new AuthorizationError('Only the owner can delete the organization')
    }

    const [deleted] = await this.db
      .delete(schema.organizations)
      .where(eq(schema.organizations.id, orgId))
      .returning({ id: schema.organizations.id })

    if (!deleted) {
      throw new NotFoundError('Organization', orgId)
    }
  }

  /**
   * List organization members
   */
  async listMembers(userId: string, orgId: string): Promise<OrganizationMember[]> {
    // Verify membership
    const membership = await this.getMembership(userId, orgId)
    if (!membership) {
      throw new NotFoundError('Organization', orgId)
    }

    const members = await this.db
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

    return members as OrganizationMember[]
  }

  /**
   * Update member role (owner only)
   */
  async updateMemberRole(
    userId: string,
    orgId: string,
    memberId: string,
    newRole: OrganizationRole
  ): Promise<OrganizationMember> {
    // Check requester role
    const requesterMembership = await this.getMembership(userId, orgId)
    if (!requesterMembership) {
      throw new NotFoundError('Organization', orgId)
    }

    if (requesterMembership.role !== 'owner') {
      throw new AuthorizationError('Only the owner can change member roles')
    }

    // Get target member
    const [targetMember] = await this.db
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
      throw new NotFoundError('Member', memberId)
    }

    // Cannot change owner's role
    if (targetMember.role === 'owner') {
      throw new AuthorizationError("Cannot change the owner's role")
    }

    // Update role
    const [updatedMember] = await this.db
      .update(schema.organizationMembers)
      .set({ role: newRole, updatedAt: new Date() })
      .where(eq(schema.organizationMembers.id, memberId))
      .returning({
        id: schema.organizationMembers.id,
        organizationId: schema.organizationMembers.organizationId,
        userId: schema.organizationMembers.userId,
        role: schema.organizationMembers.role,
        createdAt: schema.organizationMembers.createdAt,
        updatedAt: schema.organizationMembers.updatedAt,
      })

    // Get user info
    const [userInfo] = await this.db
      .select({ name: schema.users.name, email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, targetMember.userId))
      .limit(1)

    return {
      ...updatedMember,
      userName: userInfo?.name ?? null,
      userEmail: userInfo?.email ?? '',
    } as OrganizationMember
  }

  /**
   * Remove member from organization
   */
  async removeMember(userId: string, orgId: string, memberId: string): Promise<void> {
    // Get requester membership
    const requesterMembership = await this.getMembership(userId, orgId)
    if (!requesterMembership) {
      throw new NotFoundError('Organization', orgId)
    }

    // Get requester's member record
    const [_requesterMemberRecord] = await this.db
      .select({ id: schema.organizationMembers.id })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, orgId),
          eq(schema.organizationMembers.userId, userId)
        )
      )
      .limit(1)

    // Get target member
    const [targetMember] = await this.db
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
      throw new NotFoundError('Member', memberId)
    }

    const isSelfRemoval = targetMember.userId === userId

    if (isSelfRemoval) {
      // Owner cannot leave
      if (targetMember.role === 'owner') {
        throw new AuthorizationError('Owner cannot leave. Transfer ownership first or delete the organization.')
      }
    } else {
      // Check permissions for removing others
      if (requesterMembership.role !== 'owner' && requesterMembership.role !== 'admin') {
        throw new AuthorizationError('Only owners and admins can remove members')
      }

      // Admins cannot remove owners or other admins
      if (requesterMembership.role === 'admin') {
        if (targetMember.role === 'owner' || targetMember.role === 'admin') {
          throw new AuthorizationError('Admins cannot remove owners or other admins')
        }
      }

      // Cannot remove the owner
      if (targetMember.role === 'owner') {
        throw new AuthorizationError('Cannot remove the organization owner')
      }
    }

    // Delete membership
    const [deleted] = await this.db
      .delete(schema.organizationMembers)
      .where(eq(schema.organizationMembers.id, memberId))
      .returning({ id: schema.organizationMembers.id })

    if (!deleted) {
      throw new ServiceError('Failed to remove member', 'MEMBER_REMOVAL_FAILED', 500)
    }
  }

  /**
   * Create invitation
   */
  async createInvitation(
    userId: string,
    orgId: string,
    input: CreateInvitationInput
  ): Promise<TeamInvitation> {
    const { email, role, inviterName, inviterEmail } = input

    // Check requester role
    const membership = await this.getMembership(userId, orgId)
    if (!membership) {
      throw new NotFoundError('Organization', orgId)
    }

    if (membership.role !== 'owner' && membership.role !== 'admin') {
      throw new AuthorizationError('Only owners and admins can invite members')
    }

    // Check if already a member
    const [existingMember] = await this.db
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
      throw new ConflictError('User is already a member of this organization')
    }

    // Check for pending invitation
    const [existingInvitation] = await this.db
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
      throw new ConflictError('A pending invitation already exists for this email')
    }

    // Generate token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

    // Get org name
    const [organization] = await this.db
      .select({ name: schema.organizations.name })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, orgId))
      .limit(1)

    // Create invitation
    const [invitation] = await this.db
      .insert(schema.teamInvitations)
      .values({
        organizationId: orgId,
        email,
        role,
        invitedBy: userId,
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
      throw new ServiceError('Failed to create invitation', 'INVITATION_CREATION_FAILED', 500)
    }

    // Send email (non-blocking)
    const appUrl = process.env['APP_URL'] || 'https://planflow.tools'
    const inviteLink = `${appUrl}/invitations/${token}`

    sendTeamInvitationEmail({
      to: email,
      inviterName: inviterName || inviterEmail || 'A team member',
      organizationName: organization?.name || 'your team',
      role,
      inviteLink,
      expiresAt,
    }).catch((error) => {
      console.error('Failed to send invitation email:', error)
    })

    return invitation as TeamInvitation
  }

  /**
   * List pending invitations
   */
  async listInvitations(userId: string, orgId: string): Promise<TeamInvitation[]> {
    const membership = await this.getMembership(userId, orgId)
    if (!membership) {
      throw new NotFoundError('Organization', orgId)
    }

    const invitations = await this.db
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

    return invitations as TeamInvitation[]
  }

  /**
   * Revoke invitation
   */
  async revokeInvitation(userId: string, orgId: string, invitationId: string): Promise<void> {
    const membership = await this.getMembership(userId, orgId)
    if (!membership) {
      throw new NotFoundError('Organization', orgId)
    }

    if (membership.role !== 'owner' && membership.role !== 'admin') {
      throw new AuthorizationError('Only owners and admins can revoke invitations')
    }

    const [deleted] = await this.db
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
      throw new NotFoundError('Invitation', invitationId)
    }
  }

  /**
   * Accept invitation
   */
  async acceptInvitation(userId: string, userEmail: string, token: string): Promise<Organization> {
    // Find invitation
    const [invitation] = await this.db
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
      throw new NotFoundError('Invitation')
    }

    if (invitation.acceptedAt) {
      throw new ConflictError('Invitation has already been accepted')
    }

    if (new Date() > invitation.expiresAt) {
      throw new ServiceError('Invitation has expired', 'INVITATION_EXPIRED', 410)
    }

    if (invitation.email !== userEmail) {
      throw new AuthorizationError('This invitation was sent to a different email address')
    }

    // Accept in transaction
    await withTransaction(async (tx) => {
      await tx.insert(schema.organizationMembers).values({
        organizationId: invitation.organizationId,
        userId,
        role: invitation.role,
      })

      await tx
        .update(schema.teamInvitations)
        .set({ acceptedAt: new Date() })
        .where(eq(schema.teamInvitations.id, invitation.id))
    })

    // Fetch org
    const [org] = await this.db
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

    return org
  }

  /**
   * Decline invitation
   */
  async declineInvitation(userEmail: string, token: string): Promise<void> {
    const [invitation] = await this.db
      .select({
        id: schema.teamInvitations.id,
        email: schema.teamInvitations.email,
      })
      .from(schema.teamInvitations)
      .where(eq(schema.teamInvitations.token, token))
      .limit(1)

    if (!invitation) {
      throw new NotFoundError('Invitation')
    }

    if (invitation.email !== userEmail) {
      throw new AuthorizationError('This invitation was sent to a different email address')
    }

    await this.db
      .delete(schema.teamInvitations)
      .where(eq(schema.teamInvitations.id, invitation.id))
  }

  /**
   * Get activity log
   */
  async getActivityLog(
    userId: string,
    orgId: string,
    query: ActivityLogQuery
  ): Promise<{
    activities: ActivityLog[]
    pagination: { total: number; limit: number; offset: number; hasMore: boolean }
  }> {
    const membership = await this.getMembership(userId, orgId)
    if (!membership) {
      throw new NotFoundError('Organization', orgId)
    }

    const { limit = 20, offset = 0, action, entityType, actorId } = query

    // Build conditions
    const conditions = [eq(schema.activityLog.organizationId, orgId)]
    if (action) conditions.push(eq(schema.activityLog.action, action))
    if (entityType) conditions.push(eq(schema.activityLog.entityType, entityType))
    if (actorId) conditions.push(eq(schema.activityLog.actorId, actorId))

    // Get activities
    const activities = await this.db
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

    // Get total
    const [countResult] = await this.db
      .select({ count: count() })
      .from(schema.activityLog)
      .where(and(...conditions))

    const total = Number(countResult?.count ?? 0)

    return {
      activities: activities.map((a) => ({
        id: a.id,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        taskId: a.taskId,
        organizationId: a.organizationId,
        projectId: a.projectId,
        taskUuid: a.taskUuid,
        metadata: a.metadata as Record<string, unknown> | null,
        description: a.description,
        createdAt: a.createdAt,
        actor: {
          id: a.actorId,
          email: a.actorEmail,
          name: a.actorName,
        },
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + activities.length < total,
      },
    }
  }
}

// Export singleton instance
export const organizationService = new OrganizationService()
