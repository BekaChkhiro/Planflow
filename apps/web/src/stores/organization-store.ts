'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface OrganizationState {
  selectedOrganizationId: string | null
}

interface OrganizationActions {
  setSelectedOrganization: (id: string | null) => void
}

type OrganizationStore = OrganizationState & OrganizationActions

export const useOrganizationStore = create<OrganizationStore>()(
  persist(
    (set) => ({
      selectedOrganizationId: null,

      setSelectedOrganization: (id) => set({ selectedOrganizationId: id }),
    }),
    {
      name: 'planflow-organization',
      storage: createJSONStorage(() => localStorage),
    }
  )
)

// Selector hooks for better performance
export const useSelectedOrganizationId = () => useOrganizationStore((state) => state.selectedOrganizationId)
export const useSetSelectedOrganization = () => useOrganizationStore((state) => state.setSelectedOrganization)
