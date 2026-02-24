'use client'

import { useEffect } from 'react'
import { useOrganizations, type Organization } from '@/hooks/use-team'
import { useOrganizationStore } from '@/stores/organization-store'

interface OrganizationContext {
  currentOrganization: Organization | undefined
  currentOrganizationId: string | null
  organizations: Organization[] | undefined
  setSelectedOrganization: (id: string | null) => void
  isLoading: boolean
  // Helper to check current user's role
  canEdit: boolean
  canDelete: boolean
  role: Organization['role'] | undefined
}

/**
 * Hook for managing organization context throughout the app.
 * Automatically selects the first organization if none is selected.
 * Persists selection in localStorage.
 */
export function useOrganizationContext(): OrganizationContext {
  const { data: organizations, isLoading } = useOrganizations()
  const selectedId = useOrganizationStore((s) => s.selectedOrganizationId)
  const setSelectedOrganization = useOrganizationStore((s) => s.setSelectedOrganization)

  // Find current organization - use selectedId or fall back to first
  const currentOrganizationId = selectedId || organizations?.[0]?.id || null
  const currentOrganization = organizations?.find((o) => o.id === currentOrganizationId)

  // Auto-select first organization if none selected
  useEffect(() => {
    if (!isLoading && !selectedId && organizations?.[0]) {
      setSelectedOrganization(organizations[0].id)
    }
  }, [organizations, selectedId, isLoading, setSelectedOrganization])

  // If selected org doesn't exist in list (e.g., removed), reset to first
  useEffect(() => {
    if (!isLoading && selectedId && organizations && !currentOrganization) {
      setSelectedOrganization(organizations[0]?.id || null)
    }
  }, [organizations, selectedId, currentOrganization, isLoading, setSelectedOrganization])

  // Role-based permissions
  const role = currentOrganization?.role
  const canEdit = role === 'owner' || role === 'admin' || role === 'editor'
  const canDelete = role === 'owner' || role === 'admin'

  return {
    currentOrganization,
    currentOrganizationId,
    organizations,
    setSelectedOrganization,
    isLoading,
    canEdit,
    canDelete,
    role,
  }
}
