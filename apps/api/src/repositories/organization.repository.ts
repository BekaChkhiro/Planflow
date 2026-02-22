/**
 * Organization Repository
 * Handles all organization and membership database operations
 */

import { and, desc, eq, sql } from 'drizzle-orm'
import { schema } from '../db/index.js'
import { BaseRepository, type FindAllOptions } from './base.repository.js'

// Role enum type
export const MemberRoles = ['owner', 'admin', 'editor', 'viewer'] as const
export type MemberRole = (typeof MemberRoles)[number]

// Types
export interface Organization {
  id: string
  name: string
  slug: string
  description: string | null
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export interface OrganizationMember {
  id: string
  organizationId: string
  userId: string
  role: MemberRole
  createdAt: Date
  updatedAt: Date
}

export interface OrganizationMemberWithUser extends OrganizationMember {
  user: {
    id: string
    email: string
    name: string | null
  }
}

export interface OrganizationWithRole extends Organization {
  role: MemberRole
}

export interface TeamInvitation {
  id: string
  organizationId: string
  email: string
  role: MemberRole
  invitedBy: string
  token: string
  expiresAt: Date
  acceptedAt: Date | null
  createdAt: Date
}

export interface CreateOrganizationInput {
  name: string
  slug: string
  description?: string | null
  createdBy: string
}

export interface UpdateOrganizationInput {
  name?: string
  slug?: string
  description?: string | null
}

export interface CreateInvitationInput {
  organizationId: string
  email: string
  role: MemberRole
  invitedBy: string
  token: string
  expiresAt: Date
}

/**
 * OrganizationRepository - Handles organization data access
 */
export class OrganizationRepository extends BaseRepository {
  /**
   * Find organization by ID
   */
  async findById(id: string): Promise<Organization | null> {
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
      .where(eq(schema.organizations.id, id))
      .limit(1)

    return org ?? null
  }

  /**
   * Find organization by slug
   */
  async findBySlug(slug: string): Promise<Organization | null> {
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
      .where(eq(schema.organizations.slug, slug))
      .limit(1)

    return org ?? null
  }

  /**
   * Find organization for a user (with role)
   */
  async findByIdForUser(orgId: string, userId: string): Promise<OrganizationWithRole | null> {
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
      .innerJoin(schema.organizations, eq(schema.organizationMembers.organizationId, schema.organizations.id))
      .where(and(eq(schema.organizationMembers.userId, userId), eq(schema.organizations.id, orgId)))
      .limit(1)

    return result ?? null
  }

  /**
   * Find all organizations for a user
   */
  async findAllByUserId(userId: string, options?: FindAllOptions): Promise<OrganizationWithRole[]> {
    const limit = options?.limit ?? 50
    const offset = options?.offset ?? 0

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
      .innerJoin(schema.organizations, eq(schema.organizationMembers.organizationId, schema.organizations.id))
      .where(eq(schema.organizationMembers.userId, userId))
      .orderBy(desc(schema.organizations.createdAt))
      .limit(limit)
      .offset(offset)

    return orgs
  }

  /**
   * Check if slug exists
   */
  async slugExists(slug: string, excludeOrgId?: string): Promise<boolean> {
    const conditions = [eq(schema.organizations.slug, slug)]
    if (excludeOrgId) {
      conditions.push(sql`${schema.organizations.id} != ${excludeOrgId}`)
    }

    const [existing] = await this.db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(and(...conditions))
      .limit(1)

    return !!existing
  }

  /**
   * Create organization
   */
  async create(data: CreateOrganizationInput): Promise<Organization> {
    const [newOrg] = await this.db
      .insert(schema.organizations)
      .values({
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        createdBy: data.createdBy,
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

    if (!newOrg) {
      throw new Error('Failed to create organization')
    }

    return newOrg
  }

  /**
   * Update organization
   */
  async update(id: string, data: UpdateOrganizationInput): Promise<Organization | null> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (data.name !== undefined) updateData['name'] = data.name
    if (data.slug !== undefined) updateData['slug'] = data.slug
    if (data.description !== undefined) updateData['description'] = data.description

    const [updated] = await this.db
      .update(schema.organizations)
      .set(updateData)
      .where(eq(schema.organizations.id, id))
      .returning({
        id: schema.organizations.id,
        name: schema.organizations.name,
        slug: schema.organizations.slug,
        description: schema.organizations.description,
        createdBy: schema.organizations.createdBy,
        createdAt: schema.organizations.createdAt,
        updatedAt: schema.organizations.updatedAt,
      })

    return updated ?? null
  }

  /**
   * Delete organization
   */
  async delete(id: string): Promise<boolean> {
    const [deleted] = await this.db
      .delete(schema.organizations)
      .where(eq(schema.organizations.id, id))
      .returning({ id: schema.organizations.id })

    return !!deleted
  }

  // ============ Member operations ============

  /**
   * Find member by ID
   */
  async findMemberById(memberId: string): Promise<OrganizationMember | null> {
    const [member] = await this.db
      .select({
        id: schema.organizationMembers.id,
        organizationId: schema.organizationMembers.organizationId,
        userId: schema.organizationMembers.userId,
        role: schema.organizationMembers.role,
        createdAt: schema.organizationMembers.createdAt,
        updatedAt: schema.organizationMembers.updatedAt,
      })
      .from(schema.organizationMembers)
      .where(eq(schema.organizationMembers.id, memberId))
      .limit(1)

    return member ?? null
  }

  /**
   * Find member by organization and user
   */
  async findMember(organizationId: string, userId: string): Promise<OrganizationMember | null> {
    const [member] = await this.db
      .select({
        id: schema.organizationMembers.id,
        organizationId: schema.organizationMembers.organizationId,
        userId: schema.organizationMembers.userId,
        role: schema.organizationMembers.role,
        createdAt: schema.organizationMembers.createdAt,
        updatedAt: schema.organizationMembers.updatedAt,
      })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, organizationId),
          eq(schema.organizationMembers.userId, userId)
        )
      )
      .limit(1)

    return member ?? null
  }

  /**
   * Find all members of an organization with user info
   */
  async findMembersByOrganizationId(organizationId: string): Promise<OrganizationMemberWithUser[]> {
    const members = await this.db
      .select({
        id: schema.organizationMembers.id,
        organizationId: schema.organizationMembers.organizationId,
        userId: schema.organizationMembers.userId,
        role: schema.organizationMembers.role,
        createdAt: schema.organizationMembers.createdAt,
        updatedAt: schema.organizationMembers.updatedAt,
        user: {
          id: schema.users.id,
          email: schema.users.email,
          name: schema.users.name,
        },
      })
      .from(schema.organizationMembers)
      .innerJoin(schema.users, eq(schema.organizationMembers.userId, schema.users.id))
      .where(eq(schema.organizationMembers.organizationId, organizationId))
      .orderBy(desc(schema.organizationMembers.createdAt))

    return members
  }

  /**
   * Count members in an organization
   */
  async countMembers(organizationId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.organizationMembers)
      .where(eq(schema.organizationMembers.organizationId, organizationId))

    return result?.count ?? 0
  }

  /**
   * Add member to organization
   */
  async addMember(organizationId: string, userId: string, role: MemberRole): Promise<OrganizationMember> {
    const [newMember] = await this.db
      .insert(schema.organizationMembers)
      .values({
        organizationId,
        userId,
        role,
      })
      .returning({
        id: schema.organizationMembers.id,
        organizationId: schema.organizationMembers.organizationId,
        userId: schema.organizationMembers.userId,
        role: schema.organizationMembers.role,
        createdAt: schema.organizationMembers.createdAt,
        updatedAt: schema.organizationMembers.updatedAt,
      })

    if (!newMember) {
      throw new Error('Failed to add member')
    }

    return newMember
  }

  /**
   * Update member role
   */
  async updateMemberRole(memberId: string, role: MemberRole): Promise<OrganizationMember | null> {
    const [updated] = await this.db
      .update(schema.organizationMembers)
      .set({
        role,
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

    return updated ?? null
  }

  /**
   * Remove member from organization
   */
  async removeMember(memberId: string): Promise<boolean> {
    const [deleted] = await this.db
      .delete(schema.organizationMembers)
      .where(eq(schema.organizationMembers.id, memberId))
      .returning({ id: schema.organizationMembers.id })

    return !!deleted
  }

  /**
   * Check if user is member of organization
   */
  async isMember(organizationId: string, userId: string): Promise<boolean> {
    const member = await this.findMember(organizationId, userId)
    return !!member
  }

  /**
   * Get user's role in organization
   */
  async getUserRole(organizationId: string, userId: string): Promise<string | null> {
    const member = await this.findMember(organizationId, userId)
    return member?.role ?? null
  }

  // ============ Invitation operations ============

  /**
   * Find invitation by token
   */
  async findInvitationByToken(token: string): Promise<TeamInvitation | null> {
    const [invitation] = await this.db
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
      })
      .from(schema.teamInvitations)
      .where(eq(schema.teamInvitations.token, token))
      .limit(1)

    return invitation ?? null
  }

  /**
   * Find pending invitation by email and organization
   */
  async findPendingInvitation(organizationId: string, email: string): Promise<TeamInvitation | null> {
    const normalizedEmail = email.toLowerCase()

    const [invitation] = await this.db
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
      })
      .from(schema.teamInvitations)
      .where(
        and(
          eq(schema.teamInvitations.organizationId, organizationId),
          eq(schema.teamInvitations.email, normalizedEmail),
          sql`${schema.teamInvitations.acceptedAt} IS NULL`
        )
      )
      .limit(1)

    return invitation ?? null
  }

  /**
   * Find all pending invitations for an organization
   */
  async findPendingInvitationsByOrganizationId(organizationId: string): Promise<TeamInvitation[]> {
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
      })
      .from(schema.teamInvitations)
      .where(
        and(
          eq(schema.teamInvitations.organizationId, organizationId),
          sql`${schema.teamInvitations.acceptedAt} IS NULL`
        )
      )
      .orderBy(desc(schema.teamInvitations.createdAt))

    return invitations
  }

  /**
   * Create invitation
   */
  async createInvitation(data: CreateInvitationInput): Promise<TeamInvitation> {
    const [newInvitation] = await this.db
      .insert(schema.teamInvitations)
      .values({
        organizationId: data.organizationId,
        email: data.email.toLowerCase(),
        role: data.role,
        invitedBy: data.invitedBy,
        token: data.token,
        expiresAt: data.expiresAt,
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

    if (!newInvitation) {
      throw new Error('Failed to create invitation')
    }

    return newInvitation
  }

  /**
   * Accept invitation
   */
  async acceptInvitation(invitationId: string): Promise<TeamInvitation | null> {
    const [updated] = await this.db
      .update(schema.teamInvitations)
      .set({ acceptedAt: new Date() })
      .where(eq(schema.teamInvitations.id, invitationId))
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

    return updated ?? null
  }

  /**
   * Delete invitation
   */
  async deleteInvitation(invitationId: string): Promise<boolean> {
    const [deleted] = await this.db
      .delete(schema.teamInvitations)
      .where(eq(schema.teamInvitations.id, invitationId))
      .returning({ id: schema.teamInvitations.id })

    return !!deleted
  }
}

// Export singleton instance
export const organizationRepository = new OrganizationRepository()
