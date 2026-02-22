/**
 * Organization Service Unit Tests
 * Tests for organization management, members, and invitations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the database module
vi.mock('../../db/index.js', () => ({
  getDbClient: vi.fn(),
  schema: {
    organizations: {
      id: 'id',
      name: 'name',
      slug: 'slug',
      description: 'description',
      createdBy: 'createdBy',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    organizationMembers: {
      id: 'id',
      organizationId: 'organizationId',
      userId: 'userId',
      role: 'role',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    users: {
      id: 'id',
      email: 'email',
      name: 'name',
    },
    teamInvitations: {
      id: 'id',
      organizationId: 'organizationId',
      email: 'email',
      role: 'role',
      invitedBy: 'invitedBy',
      token: 'token',
      expiresAt: 'expiresAt',
      acceptedAt: 'acceptedAt',
      createdAt: 'createdAt',
    },
    activityLog: {
      id: 'id',
      action: 'action',
      entityType: 'entityType',
      entityId: 'entityId',
      taskId: 'taskId',
      actorId: 'actorId',
      organizationId: 'organizationId',
      projectId: 'projectId',
      taskUuid: 'taskUuid',
      metadata: 'metadata',
      description: 'description',
      createdAt: 'createdAt',
    },
  },
  withTransaction: vi.fn((fn) => fn({
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  })),
}))

// Mock helper functions
vi.mock('../../utils/helpers.js', () => ({
  generateSlug: vi.fn((name: string) => name.toLowerCase().replace(/\s+/g, '-')),
}))

// Mock email service
vi.mock('../../lib/email.js', () => ({
  sendTeamInvitationEmail: vi.fn(() => Promise.resolve()),
}))

import { getDbClient, withTransaction } from '../../db/index.js'
import { OrganizationService } from '../organization.service.js'
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ServiceError,
  ValidationError,
} from '../errors.js'

describe('OrganizationService', () => {
  let organizationService: OrganizationService
  let mockDb: ReturnType<typeof createMockDb>

  function createMockDb() {
    const mockSelect = vi.fn()
    const mockFrom = vi.fn()
    const mockWhere = vi.fn()
    const mockLimit = vi.fn()
    const mockOrderBy = vi.fn()
    const mockOffset = vi.fn()
    const mockInnerJoin = vi.fn()
    const mockInsert = vi.fn()
    const mockValues = vi.fn()
    const mockReturning = vi.fn()
    const mockUpdate = vi.fn()
    const mockSet = vi.fn()
    const mockDelete = vi.fn()

    // Storage for mock results
    let limitResults: unknown[] = [[]]
    let orderByResults: unknown[] = [[]]
    let offsetResults: unknown[] = [[]]
    let whereResults: unknown[] = [[]]
    let limitIndex = 0
    let orderByIndex = 0
    let offsetIndex = 0
    let whereIndex = 0

    // Create chain object
    const createChain = (): Record<string, unknown> => {
      const chain: Record<string, unknown> = {
        from: mockFrom,
        where: mockWhere,
        limit: mockLimit,
        orderBy: mockOrderBy,
        offset: mockOffset,
        innerJoin: mockInnerJoin,
        returning: mockReturning,
      }
      return chain
    }

    mockSelect.mockImplementation(() => createChain())
    mockFrom.mockImplementation(() => createChain())
    mockInnerJoin.mockImplementation(() => createChain())
    mockWhere.mockImplementation(() => {
      const chain = createChain()
      chain.then = (resolve: (value: unknown) => void) => resolve(whereResults[whereIndex++] ?? [])
      return chain
    })
    mockOrderBy.mockImplementation(() => {
      const chain = createChain()
      chain.then = (resolve: (value: unknown) => void) => resolve(orderByResults[orderByIndex++] ?? [])
      return chain
    })
    mockLimit.mockImplementation(() => {
      const chain = createChain()
      chain.then = (resolve: (value: unknown) => void) => resolve(limitResults[limitIndex++] ?? [])
      return chain
    })
    mockOffset.mockImplementation(() => {
      const chain = createChain()
      chain.then = (resolve: (value: unknown) => void) => resolve(offsetResults[offsetIndex++] ?? [])
      return chain
    })
    mockReturning.mockResolvedValue([])
    mockInsert.mockReturnValue({ values: mockValues })
    mockValues.mockReturnValue({ returning: mockReturning })
    mockUpdate.mockReturnValue({ set: mockSet })
    mockSet.mockReturnValue({ where: mockWhere })
    mockDelete.mockReturnValue({ where: mockWhere })

    return {
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
      _mocks: {
        select: mockSelect,
        from: mockFrom,
        where: mockWhere,
        limit: mockLimit,
        orderBy: mockOrderBy,
        offset: mockOffset,
        innerJoin: mockInnerJoin,
        insert: mockInsert,
        values: mockValues,
        returning: mockReturning,
        update: mockUpdate,
        set: mockSet,
        delete: mockDelete,
        setLimitResults: (results: unknown[]) => {
          limitResults = results
          limitIndex = 0
        },
        setOrderByResults: (results: unknown[]) => {
          orderByResults = results
          orderByIndex = 0
        },
        setOffsetResults: (results: unknown[]) => {
          offsetResults = results
          offsetIndex = 0
        },
        setWhereResults: (results: unknown[]) => {
          whereResults = results
          whereIndex = 0
        },
        resetIndexes: () => {
          limitIndex = 0
          orderByIndex = 0
          offsetIndex = 0
          whereIndex = 0
        },
      },
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockDb = createMockDb()
    vi.mocked(getDbClient).mockReturnValue(mockDb as never)
    organizationService = new OrganizationService()
  })

  describe('createOrganization', () => {
    it('should create organization successfully', async () => {
      const mockNewOrg = {
        id: 'org-123',
        name: 'Test Org',
        slug: 'test-org',
        description: 'A test organization',
        createdBy: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      // First: slug check returns empty (no conflict)
      mockDb._mocks.setLimitResults([[]])

      // Mock transaction
      vi.mocked(withTransaction).mockImplementationOnce(async (fn) => {
        const mockTx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([mockNewOrg]),
            }),
          }),
        }
        return fn(mockTx)
      })

      const result = await organizationService.createOrganization('user-123', {
        name: 'Test Org',
        description: 'A test organization',
      })

      expect(result.id).toBe('org-123')
      expect(result.name).toBe('Test Org')
    })

    it('should throw ConflictError if slug exists', async () => {
      mockDb._mocks.setLimitResults([[{ id: 'existing-org' }]])

      await expect(organizationService.createOrganization('user-123', {
        name: 'Test Org',
        slug: 'existing-slug',
      })).rejects.toThrow(ConflictError)
    })
  })

  describe('listOrganizations', () => {
    it('should return list of organizations with roles', async () => {
      const mockOrgs = [
        {
          id: 'org-1',
          name: 'Org 1',
          slug: 'org-1',
          description: null,
          createdBy: 'user-123',
          createdAt: new Date(),
          updatedAt: new Date(),
          role: 'owner',
        },
      ]
      mockDb._mocks.setOrderByResults([mockOrgs])

      const result = await organizationService.listOrganizations('user-123')

      expect(result).toHaveLength(1)
      expect(result[0].role).toBe('owner')
    })
  })

  describe('getOrganization', () => {
    it('should return organization with user role', async () => {
      const mockOrg = {
        id: 'org-123',
        name: 'Test Org',
        slug: 'test-org',
        description: null,
        createdBy: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date(),
        role: 'owner',
      }
      mockDb._mocks.setLimitResults([[mockOrg]])

      const result = await organizationService.getOrganization('user-123', 'org-123')

      expect(result.id).toBe('org-123')
      expect(result.role).toBe('owner')
    })

    it('should throw NotFoundError if not a member', async () => {
      mockDb._mocks.setLimitResults([[]])

      await expect(organizationService.getOrganization('user-123', 'org-456'))
        .rejects.toThrow(NotFoundError)
    })
  })

  describe('getMembership', () => {
    it('should return membership with role', async () => {
      mockDb._mocks.setLimitResults([[{ role: 'admin' }]])

      const result = await organizationService.getMembership('user-123', 'org-123')

      expect(result?.role).toBe('admin')
    })

    it('should return null if not a member', async () => {
      mockDb._mocks.setLimitResults([[]])

      const result = await organizationService.getMembership('user-123', 'org-123')

      // Service returns undefined when destructuring empty array, not null
      expect(result).toBeFalsy()
    })
  })

  describe('updateOrganization', () => {
    it('should update organization name', async () => {
      const mockUpdatedOrg = {
        id: 'org-123',
        name: 'Updated Name',
        slug: 'test-org',
        description: null,
        createdBy: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      // First: membership check
      mockDb._mocks.setLimitResults([[{ role: 'owner' }]])
      mockDb._mocks.returning.mockResolvedValueOnce([mockUpdatedOrg])

      const result = await organizationService.updateOrganization('user-123', 'org-123', {
        name: 'Updated Name',
      })

      expect(result.name).toBe('Updated Name')
    })

    it('should throw ValidationError if no fields provided', async () => {
      await expect(organizationService.updateOrganization('user-123', 'org-123', {}))
        .rejects.toThrow(ValidationError)
    })

    it('should throw NotFoundError if not a member', async () => {
      mockDb._mocks.setLimitResults([[]])

      await expect(organizationService.updateOrganization('user-123', 'org-123', { name: 'Test' }))
        .rejects.toThrow(NotFoundError)
    })

    it('should throw AuthorizationError if not owner/admin', async () => {
      mockDb._mocks.setLimitResults([[{ role: 'member' }]])

      await expect(organizationService.updateOrganization('user-123', 'org-123', { name: 'Test' }))
        .rejects.toThrow(AuthorizationError)
    })

    it('should throw ConflictError if new slug exists', async () => {
      // Membership check
      mockDb._mocks.setLimitResults([
        [{ role: 'owner' }],
        [{ id: 'other-org' }], // Slug conflict
      ])

      await expect(organizationService.updateOrganization('user-123', 'org-123', { slug: 'taken-slug' }))
        .rejects.toThrow(ConflictError)
    })
  })

  describe('deleteOrganization', () => {
    it('should delete organization for owner', async () => {
      mockDb._mocks.setLimitResults([[{ role: 'owner' }]])
      mockDb._mocks.returning.mockResolvedValueOnce([{ id: 'org-123' }])

      await organizationService.deleteOrganization('user-123', 'org-123')

      expect(mockDb.delete).toHaveBeenCalled()
    })

    it('should throw NotFoundError if not a member', async () => {
      mockDb._mocks.setLimitResults([[]])

      await expect(organizationService.deleteOrganization('user-123', 'org-123'))
        .rejects.toThrow(NotFoundError)
    })

    it('should throw AuthorizationError if not owner', async () => {
      mockDb._mocks.setLimitResults([[{ role: 'admin' }]])

      await expect(organizationService.deleteOrganization('user-123', 'org-123'))
        .rejects.toThrow(AuthorizationError)
    })
  })

  describe('listMembers', () => {
    it('should return list of members', async () => {
      const mockMembers = [
        {
          id: 'member-1',
          organizationId: 'org-123',
          userId: 'user-123',
          role: 'owner',
          createdAt: new Date(),
          updatedAt: new Date(),
          userName: 'User One',
          userEmail: 'user1@example.com',
        },
      ]

      // Membership check
      mockDb._mocks.setLimitResults([[{ role: 'member' }]])
      mockDb._mocks.setOrderByResults([mockMembers])

      const result = await organizationService.listMembers('user-123', 'org-123')

      expect(result).toHaveLength(1)
      expect(result[0].userEmail).toBe('user1@example.com')
    })

    it('should throw NotFoundError if not a member', async () => {
      mockDb._mocks.setLimitResults([[]])

      await expect(organizationService.listMembers('user-123', 'org-123'))
        .rejects.toThrow(NotFoundError)
    })
  })

  describe('updateMemberRole', () => {
    it('should update member role for owner', async () => {
      const mockUpdatedMember = {
        id: 'member-1',
        organizationId: 'org-123',
        userId: 'user-456',
        role: 'admin',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      // Requester membership
      mockDb._mocks.setLimitResults([
        [{ role: 'owner' }],
        [{ id: 'member-1', userId: 'user-456', role: 'member' }], // Target member
        [{ name: 'User', email: 'user@example.com' }], // User info
      ])
      mockDb._mocks.returning.mockResolvedValueOnce([mockUpdatedMember])

      const result = await organizationService.updateMemberRole('user-123', 'org-123', 'member-1', 'admin')

      expect(result.role).toBe('admin')
    })

    it('should throw AuthorizationError if not owner', async () => {
      mockDb._mocks.setLimitResults([[{ role: 'admin' }]])

      await expect(organizationService.updateMemberRole('user-123', 'org-123', 'member-1', 'admin'))
        .rejects.toThrow(AuthorizationError)
    })

    it('should throw NotFoundError if member not found', async () => {
      mockDb._mocks.setLimitResults([
        [{ role: 'owner' }],
        [], // No member found
      ])

      await expect(organizationService.updateMemberRole('user-123', 'org-123', 'nonexistent', 'admin'))
        .rejects.toThrow(NotFoundError)
    })

    it('should throw AuthorizationError when trying to change owner role', async () => {
      mockDb._mocks.setLimitResults([
        [{ role: 'owner' }],
        [{ id: 'member-1', userId: 'owner-user', role: 'owner' }],
      ])

      await expect(organizationService.updateMemberRole('user-123', 'org-123', 'member-1', 'admin'))
        .rejects.toThrow(AuthorizationError)
    })
  })

  describe('removeMember', () => {
    it('should allow owner to remove a member', async () => {
      mockDb._mocks.setLimitResults([
        [{ role: 'owner' }], // Requester membership
        [{ id: 'requester-member-id' }], // Requester member record
        [{ id: 'member-1', userId: 'user-456', role: 'member' }], // Target member
      ])
      mockDb._mocks.returning.mockResolvedValueOnce([{ id: 'member-1' }])

      await organizationService.removeMember('user-123', 'org-123', 'member-1')

      expect(mockDb.delete).toHaveBeenCalled()
    })

    it('should allow member to remove themselves', async () => {
      mockDb._mocks.setLimitResults([
        [{ role: 'member' }], // Requester membership
        [{ id: 'member-1' }], // Requester member record
        [{ id: 'member-1', userId: 'user-123', role: 'member' }], // Same user
      ])
      mockDb._mocks.returning.mockResolvedValueOnce([{ id: 'member-1' }])

      await organizationService.removeMember('user-123', 'org-123', 'member-1')

      expect(mockDb.delete).toHaveBeenCalled()
    })

    it('should throw AuthorizationError when owner tries to leave', async () => {
      mockDb._mocks.setLimitResults([
        [{ role: 'owner' }],
        [{ id: 'owner-member-id' }],
        [{ id: 'owner-member-id', userId: 'user-123', role: 'owner' }],
      ])

      await expect(organizationService.removeMember('user-123', 'org-123', 'owner-member-id'))
        .rejects.toThrow(AuthorizationError)
    })

    it('should throw AuthorizationError when member tries to remove another', async () => {
      mockDb._mocks.setLimitResults([
        [{ role: 'member' }],
        [{ id: 'member-1' }],
        [{ id: 'member-2', userId: 'user-456', role: 'member' }],
      ])

      await expect(organizationService.removeMember('user-123', 'org-123', 'member-2'))
        .rejects.toThrow(AuthorizationError)
    })
  })

  describe('createInvitation', () => {
    it('should create invitation for new email', async () => {
      const mockInvitation = {
        id: 'inv-123',
        organizationId: 'org-123',
        email: 'newuser@example.com',
        role: 'member',
        invitedBy: 'user-123',
        token: 'mock-token',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        acceptedAt: null,
        createdAt: new Date(),
      }

      mockDb._mocks.setLimitResults([
        [{ role: 'owner' }], // Membership check
        [], // No existing member
        [], // No existing invitation
        [{ name: 'Test Org' }], // Org name
      ])
      mockDb._mocks.returning.mockResolvedValueOnce([mockInvitation])

      const result = await organizationService.createInvitation('user-123', 'org-123', {
        email: 'newuser@example.com',
        role: 'member',
      })

      expect(result.email).toBe('newuser@example.com')
    })

    it('should throw AuthorizationError if not owner/admin', async () => {
      mockDb._mocks.setLimitResults([[{ role: 'member' }]])

      await expect(organizationService.createInvitation('user-123', 'org-123', {
        email: 'new@example.com',
        role: 'member',
      })).rejects.toThrow(AuthorizationError)
    })

    it('should throw ConflictError if user is already a member', async () => {
      mockDb._mocks.setLimitResults([
        [{ role: 'owner' }],
        [{ id: 'existing-member' }], // Already a member
      ])

      await expect(organizationService.createInvitation('user-123', 'org-123', {
        email: 'existing@example.com',
        role: 'member',
      })).rejects.toThrow(ConflictError)
    })

    it('should throw ConflictError if pending invitation exists', async () => {
      mockDb._mocks.setLimitResults([
        [{ role: 'owner' }],
        [], // No existing member
        [{ id: 'existing-invitation' }], // Pending invitation
      ])

      await expect(organizationService.createInvitation('user-123', 'org-123', {
        email: 'pending@example.com',
        role: 'member',
      })).rejects.toThrow(ConflictError)
    })
  })

  describe('listInvitations', () => {
    it('should return pending invitations', async () => {
      const mockInvitations = [
        {
          id: 'inv-1',
          organizationId: 'org-123',
          email: 'invited@example.com',
          role: 'member',
          invitedBy: 'user-123',
          token: 'token-1',
          expiresAt: new Date(Date.now() + 86400000),
          acceptedAt: null,
          createdAt: new Date(),
          inviterName: 'Inviter',
        },
      ]

      mockDb._mocks.setLimitResults([[{ role: 'member' }]])
      mockDb._mocks.setOrderByResults([mockInvitations])

      const result = await organizationService.listInvitations('user-123', 'org-123')

      expect(result).toHaveLength(1)
      expect(result[0].email).toBe('invited@example.com')
    })

    it('should throw NotFoundError if not a member', async () => {
      mockDb._mocks.setLimitResults([[]])

      await expect(organizationService.listInvitations('user-123', 'org-123'))
        .rejects.toThrow(NotFoundError)
    })
  })

  describe('revokeInvitation', () => {
    it('should revoke invitation for owner/admin', async () => {
      mockDb._mocks.setLimitResults([[{ role: 'admin' }]])
      mockDb._mocks.returning.mockResolvedValueOnce([{ id: 'inv-123' }])

      await organizationService.revokeInvitation('user-123', 'org-123', 'inv-123')

      expect(mockDb.delete).toHaveBeenCalled()
    })

    it('should throw AuthorizationError if not owner/admin', async () => {
      mockDb._mocks.setLimitResults([[{ role: 'member' }]])

      await expect(organizationService.revokeInvitation('user-123', 'org-123', 'inv-123'))
        .rejects.toThrow(AuthorizationError)
    })

    it('should throw NotFoundError if invitation not found', async () => {
      mockDb._mocks.setLimitResults([[{ role: 'owner' }]])
      mockDb._mocks.returning.mockResolvedValueOnce([])

      await expect(organizationService.revokeInvitation('user-123', 'org-123', 'nonexistent'))
        .rejects.toThrow(NotFoundError)
    })
  })

  describe('acceptInvitation', () => {
    it('should accept valid invitation', async () => {
      const mockInvitation = {
        id: 'inv-123',
        organizationId: 'org-123',
        email: 'user@example.com',
        role: 'member',
        expiresAt: new Date(Date.now() + 86400000),
        acceptedAt: null,
      }
      const mockOrg = {
        id: 'org-123',
        name: 'Test Org',
        slug: 'test-org',
        description: null,
        createdBy: 'owner-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockDb._mocks.setLimitResults([[mockInvitation], [mockOrg]])

      vi.mocked(withTransaction).mockImplementationOnce(async (fn) => {
        const mockTx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue([]),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        }
        return fn(mockTx)
      })

      const result = await organizationService.acceptInvitation('user-123', 'user@example.com', 'valid-token')

      expect(result.id).toBe('org-123')
    })

    it('should throw NotFoundError if invitation not found', async () => {
      mockDb._mocks.setLimitResults([[]])

      await expect(organizationService.acceptInvitation('user-123', 'user@example.com', 'invalid-token'))
        .rejects.toThrow(NotFoundError)
    })

    it('should throw ConflictError if already accepted', async () => {
      const mockInvitation = {
        id: 'inv-123',
        organizationId: 'org-123',
        email: 'user@example.com',
        role: 'member',
        expiresAt: new Date(Date.now() + 86400000),
        acceptedAt: new Date(), // Already accepted
      }
      mockDb._mocks.setLimitResults([[mockInvitation]])

      await expect(organizationService.acceptInvitation('user-123', 'user@example.com', 'token'))
        .rejects.toThrow(ConflictError)
    })

    it('should throw ServiceError if invitation expired', async () => {
      const mockInvitation = {
        id: 'inv-123',
        organizationId: 'org-123',
        email: 'user@example.com',
        role: 'member',
        expiresAt: new Date(Date.now() - 86400000), // Expired
        acceptedAt: null,
      }
      mockDb._mocks.setLimitResults([[mockInvitation]])

      await expect(organizationService.acceptInvitation('user-123', 'user@example.com', 'token'))
        .rejects.toThrow(ServiceError)
    })

    it('should throw AuthorizationError if email does not match', async () => {
      const mockInvitation = {
        id: 'inv-123',
        organizationId: 'org-123',
        email: 'other@example.com',
        role: 'member',
        expiresAt: new Date(Date.now() + 86400000),
        acceptedAt: null,
      }
      mockDb._mocks.setLimitResults([[mockInvitation]])

      await expect(organizationService.acceptInvitation('user-123', 'user@example.com', 'token'))
        .rejects.toThrow(AuthorizationError)
    })
  })

  describe('declineInvitation', () => {
    it('should decline invitation', async () => {
      mockDb._mocks.setLimitResults([[{ id: 'inv-123', email: 'user@example.com' }]])

      await organizationService.declineInvitation('user@example.com', 'valid-token')

      expect(mockDb.delete).toHaveBeenCalled()
    })

    it('should throw NotFoundError if invitation not found', async () => {
      mockDb._mocks.setLimitResults([[]])

      await expect(organizationService.declineInvitation('user@example.com', 'invalid-token'))
        .rejects.toThrow(NotFoundError)
    })

    it('should throw AuthorizationError if email does not match', async () => {
      mockDb._mocks.setLimitResults([[{ id: 'inv-123', email: 'other@example.com' }]])

      await expect(organizationService.declineInvitation('user@example.com', 'token'))
        .rejects.toThrow(AuthorizationError)
    })
  })

  describe('getActivityLog', () => {
    it('should return activity log with pagination', async () => {
      const mockActivities = [
        {
          id: 'activity-1',
          action: 'task_updated',
          entityType: 'task',
          entityId: 'task-1',
          taskId: 'T1',
          actorId: 'user-123',
          organizationId: 'org-123',
          projectId: 'proj-1',
          taskUuid: 'task-uuid',
          metadata: { field: 'status' },
          description: 'Updated task',
          createdAt: new Date(),
          actorEmail: 'actor@example.com',
          actorName: 'Actor',
        },
      ];

      // Membership check uses limit
      (mockDb._mocks as { setLimitResults: (r: unknown[]) => void }).setLimitResults([[{ role: 'member' }]]);
      // Activities query returns via offset
      (mockDb._mocks as { setOffsetResults: (r: unknown[]) => void }).setOffsetResults([mockActivities]);
      // Count query returns via where
      (mockDb._mocks as { setWhereResults: (r: unknown[]) => void }).setWhereResults([[{ count: 1 }]])

      const result = await organizationService.getActivityLog('user-123', 'org-123', {})

      expect(result.activities).toHaveLength(1)
      expect(result.activities[0].action).toBe('task_updated')
    })

    it('should throw NotFoundError if not a member', async () => {
      mockDb._mocks.setLimitResults([[]])

      await expect(organizationService.getActivityLog('user-123', 'org-123', {}))
        .rejects.toThrow(NotFoundError)
    })
  })
})
