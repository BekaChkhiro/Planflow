'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/lib/auth-api'

// Types
export type MemberRole = 'owner' | 'admin' | 'editor' | 'viewer'

export interface Organization {
  id: string
  name: string
  slug: string
  description: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  role: MemberRole
}

export interface TeamMember {
  id: string
  organizationId: string
  userId: string
  role: MemberRole
  createdAt: string
  updatedAt: string
  userName: string
  userEmail: string
}

export interface TeamInvitation {
  id: string
  organizationId: string
  email: string
  role: MemberRole
  invitedBy: string
  token: string
  expiresAt: string
  acceptedAt: string | null
  createdAt: string
  inviterName: string
}

// Response types
interface OrganizationsResponse {
  success: boolean
  data: {
    organizations: Organization[]
  }
}

interface MembersResponse {
  success: boolean
  data: {
    members: TeamMember[]
  }
}

interface InvitationsResponse {
  success: boolean
  data: {
    invitations: TeamInvitation[]
  }
}

interface InviteMemberResponse {
  success: boolean
  data: {
    invitation: TeamInvitation
  }
}

interface UpdateMemberResponse {
  success: boolean
  data: {
    member: TeamMember
  }
}

interface RemoveMemberResponse {
  success: boolean
  data: {
    message: string
  }
}

// Query keys
export const organizationsQueryKey = ['organizations']
export const membersQueryKey = (orgId: string) => ['organizations', orgId, 'members']
export const invitationsQueryKey = (orgId: string) => ['organizations', orgId, 'invitations']

// Hooks

/**
 * Fetch all organizations the user belongs to
 */
export function useOrganizations() {
  return useQuery({
    queryKey: organizationsQueryKey,
    queryFn: async () => {
      const response = await authApi.get<OrganizationsResponse>('/organizations')
      return response.data.organizations
    },
  })
}

/**
 * Fetch members of an organization
 */
export function useTeamMembers(organizationId: string | undefined) {
  return useQuery({
    queryKey: membersQueryKey(organizationId || ''),
    queryFn: async () => {
      if (!organizationId) return []
      const response = await authApi.get<MembersResponse>(`/organizations/${organizationId}/members`)
      return response.data.members
    },
    enabled: !!organizationId,
  })
}

/**
 * Fetch pending invitations for an organization
 */
export function useTeamInvitations(organizationId: string | undefined) {
  return useQuery({
    queryKey: invitationsQueryKey(organizationId || ''),
    queryFn: async () => {
      if (!organizationId) return []
      const response = await authApi.get<InvitationsResponse>(`/organizations/${organizationId}/invitations`)
      return response.data.invitations
    },
    enabled: !!organizationId,
  })
}

/**
 * Invite a new member to the organization
 */
export function useInviteMember(organizationId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { email: string; role?: MemberRole }) => {
      const response = await authApi.post<InviteMemberResponse>(
        `/organizations/${organizationId}/invitations`,
        data
      )
      return response.data.invitation
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invitationsQueryKey(organizationId) })
    },
  })
}

/**
 * Update a member's role
 */
export function useUpdateMemberRole(organizationId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: MemberRole }) => {
      const response = await authApi.patch<UpdateMemberResponse>(
        `/organizations/${organizationId}/members/${memberId}`,
        { role }
      )
      return response.data.member
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membersQueryKey(organizationId) })
    },
  })
}

/**
 * Remove a member from the organization
 */
export function useRemoveMember(organizationId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (memberId: string) => {
      const response = await authApi.delete<RemoveMemberResponse>(
        `/organizations/${organizationId}/members/${memberId}`
      )
      return response.data.message
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membersQueryKey(organizationId) })
    },
  })
}

/**
 * Revoke a pending invitation
 */
export function useRevokeInvitation(organizationId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (invitationId: string) => {
      await authApi.delete(`/organizations/${organizationId}/invitations/${invitationId}`)
      return invitationId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invitationsQueryKey(organizationId) })
    },
  })
}

// Helper functions

/**
 * Get display label for a role
 */
export function getRoleLabel(role: MemberRole): string {
  const labels: Record<MemberRole, string> = {
    owner: 'Owner',
    admin: 'Admin',
    editor: 'Editor',
    viewer: 'Viewer',
  }
  return labels[role]
}

/**
 * Get badge color for a role
 */
export function getRoleBadgeVariant(role: MemberRole): 'default' | 'secondary' | 'outline' {
  switch (role) {
    case 'owner':
      return 'default'
    case 'admin':
      return 'secondary'
    default:
      return 'outline'
  }
}

/**
 * Check if a user can manage members (owner or admin)
 */
export function canManageMembers(role: MemberRole): boolean {
  return role === 'owner' || role === 'admin'
}

/**
 * Check if a user can change roles (owner only)
 */
export function canChangeRoles(role: MemberRole): boolean {
  return role === 'owner'
}

/**
 * Get initials from a name or email
 */
export function getInitials(name: string | null | undefined, email: string): string {
  if (name) {
    const parts = name.trim().split(' ').filter(Boolean)
    if (parts.length >= 2) {
      const first = parts[0]?.[0] || ''
      const last = parts[parts.length - 1]?.[0] || ''
      return `${first}${last}`.toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}
