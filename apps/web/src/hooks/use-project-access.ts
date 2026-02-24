'use client'

import { useOrganizationContext } from '@/hooks/use-organization-context'

interface ProjectAccess {
  canEdit: boolean
  canDelete: boolean
  role: 'owner' | 'admin' | 'editor' | 'viewer' | undefined
  isLoading: boolean
}

/**
 * Hook for checking user's access level for projects.
 * Uses the organization context to determine permissions.
 *
 * Access levels:
 * - owner/admin: Can view, edit, delete, archive/restore projects
 * - editor: Can view and edit projects
 * - viewer: Can only view projects
 */
export function useProjectAccess(): ProjectAccess {
  const { role, canEdit, canDelete, isLoading } = useOrganizationContext()

  return {
    canEdit,
    canDelete,
    role,
    isLoading,
  }
}
