'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/lib/auth-api'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/error-utils'

// Types
export type ProjectMemberRole = 'owner' | 'editor' | 'viewer'

export interface ProjectMember {
  id: string
  projectId: string
  userId: string
  role: ProjectMemberRole
  invitedBy: string | null
  createdAt: string
  updatedAt: string
  userName: string | null
  userEmail: string
}

export interface ProjectInvitation {
  id: string
  projectId: string
  email: string
  role: ProjectMemberRole
  invitedBy: string
  expiresAt: string
  createdAt: string
  inviterName: string | null
}

// Response types
interface MembersResponse {
  success: boolean
  data: {
    members: ProjectMember[]
  }
}

interface InvitationsResponse {
  success: boolean
  data: {
    invitations: ProjectInvitation[]
  }
}

interface InviteMemberResponse {
  success: boolean
  data: {
    invitation: ProjectInvitation
  }
}

interface UpdateMemberResponse {
  success: boolean
  data: {
    member: ProjectMember
  }
}

interface RemoveMemberResponse {
  success: boolean
  data: {
    message: string
  }
}

// Query keys
export const projectMembersQueryKey = (projectId: string) => ['projects', projectId, 'members']
export const projectInvitationsQueryKey = (projectId: string) => ['projects', projectId, 'invitations']

// Hooks

/**
 * Fetch members of a project
 */
export function useProjectMembers(projectId: string | undefined) {
  return useQuery({
    queryKey: projectMembersQueryKey(projectId || ''),
    queryFn: async () => {
      if (!projectId) return []
      const response = await authApi.get<MembersResponse>(`/projects/${projectId}/members`)
      return response.data.members
    },
    enabled: !!projectId,
  })
}

/**
 * Fetch pending invitations for a project
 */
export function useProjectInvitations(projectId: string | undefined) {
  return useQuery({
    queryKey: projectInvitationsQueryKey(projectId || ''),
    queryFn: async () => {
      if (!projectId) return []
      const response = await authApi.get<InvitationsResponse>(`/projects/${projectId}/members/invitations`)
      return response.data.invitations
    },
    enabled: !!projectId,
  })
}

/**
 * Invite a new member to the project
 */
export function useInviteProjectMember(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { email: string; role?: 'editor' | 'viewer' }) => {
      const response = await authApi.post<InviteMemberResponse>(
        `/projects/${projectId}/members/invitations`,
        data
      )
      return response.data.invitation
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectInvitationsQueryKey(projectId) })
      toast.success('Invitation sent successfully')
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error))
    },
  })
}

/**
 * Update a project member's role
 */
export function useUpdateProjectMemberRole(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: 'editor' | 'viewer' }) => {
      const response = await authApi.patch<UpdateMemberResponse>(
        `/projects/${projectId}/members/${memberId}`,
        { role }
      )
      return response.data.member
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectMembersQueryKey(projectId) })
      toast.success('Member role updated')
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error))
    },
  })
}

/**
 * Remove a member from the project
 */
export function useRemoveProjectMember(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (memberId: string) => {
      const response = await authApi.delete<RemoveMemberResponse>(
        `/projects/${projectId}/members/${memberId}`
      )
      return response.data.message
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectMembersQueryKey(projectId) })
      toast.success('Member removed from project')
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error))
    },
  })
}

/**
 * Revoke a pending invitation
 */
export function useRevokeProjectInvitation(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (invitationId: string) => {
      await authApi.delete(`/projects/${projectId}/members/invitations/${invitationId}`)
      return invitationId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectInvitationsQueryKey(projectId) })
      toast.success('Invitation revoked')
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error))
    },
  })
}

// Helper functions

/**
 * Get display label for a project role
 */
export function getProjectRoleLabel(role: ProjectMemberRole): string {
  const labels: Record<ProjectMemberRole, string> = {
    owner: 'Owner',
    editor: 'Editor',
    viewer: 'Viewer',
  }
  return labels[role]
}

/**
 * Get badge variant for a project role
 */
export function getProjectRoleBadgeVariant(role: ProjectMemberRole): 'default' | 'secondary' | 'outline' {
  switch (role) {
    case 'owner':
      return 'default'
    case 'editor':
      return 'secondary'
    default:
      return 'outline'
  }
}

/**
 * Check if a user can manage project members (owner only)
 */
export function canManageProjectMembers(role: ProjectMemberRole): boolean {
  return role === 'owner'
}

/**
 * Get initials from a name or email
 */
export function getProjectMemberInitials(name: string | null | undefined, email: string): string {
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
