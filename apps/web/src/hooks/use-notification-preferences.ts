'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './use-auth'

export interface NotificationPreferences {
  pushEnabled: boolean
  pushMentions: boolean
  pushAssignments: boolean
  pushComments: boolean
  pushStatusChanges: boolean
  pushTaskCreated: boolean
  pushInvitations: boolean
  emailEnabled: boolean
  emailMentions: boolean
  emailAssignments: boolean
  emailDigest: boolean
  emailDigestFrequency: 'daily' | 'weekly' | 'none'
  emailDigestTime: string
  emailDigestTimezone: string
  lastDigestSentAt: string | null
  toastEnabled: boolean
}

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001'

const DEFAULT_PREFERENCES: NotificationPreferences = {
  pushEnabled: true,
  pushMentions: true,
  pushAssignments: true,
  pushComments: true,
  pushStatusChanges: false,
  pushTaskCreated: false,
  pushInvitations: true,
  emailEnabled: true,
  emailMentions: true,
  emailAssignments: true,
  emailDigest: false,
  emailDigestFrequency: 'daily',
  emailDigestTime: '09:00',
  emailDigestTimezone: 'UTC',
  lastDigestSentAt: null,
  toastEnabled: true,
}

export function useNotificationPreferences() {
  const { getToken, isAuthenticated } = useAuth()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const getTokenRef = useRef(getToken)
  getTokenRef.current = getToken

  // Fetch preferences
  const {
    data: preferences,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: async (): Promise<NotificationPreferences> => {
      const token = await getTokenRef.current()
      if (!token) return DEFAULT_PREFERENCES

      const response = await fetch(`${API_URL}/notifications/preferences`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch preferences')
      }

      return data.data as NotificationPreferences
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5, // 5 minutes
    initialData: DEFAULT_PREFERENCES,
  })

  // Update preferences mutation
  const updateMutation = useMutation({
    mutationFn: async (
      updates: Partial<NotificationPreferences>
    ): Promise<NotificationPreferences> => {
      const token = await getTokenRef.current()
      if (!token) throw new Error('Not authenticated')

      const response = await fetch(`${API_URL}/notifications/preferences`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to update preferences')
      }

      return data.data as NotificationPreferences
    },
    onSuccess: (newPreferences) => {
      queryClient.setQueryData(['notification-preferences'], newPreferences)
      setError(null)
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  // Update a single preference
  const updatePreference = useCallback(
    async <K extends keyof NotificationPreferences>(
      key: K,
      value: NotificationPreferences[K]
    ): Promise<boolean> => {
      try {
        await updateMutation.mutateAsync({ [key]: value })
        return true
      } catch {
        return false
      }
    },
    [updateMutation]
  )

  // Batch update preferences
  const updatePreferences = useCallback(
    async (updates: Partial<NotificationPreferences>): Promise<boolean> => {
      try {
        await updateMutation.mutateAsync(updates)
        return true
      } catch {
        return false
      }
    },
    [updateMutation]
  )

  // Toggle a boolean preference
  const togglePreference = useCallback(
    async (key: keyof NotificationPreferences): Promise<boolean> => {
      if (!preferences) return false

      const currentValue = preferences[key]
      if (typeof currentValue !== 'boolean') return false

      return updatePreference(key, !currentValue)
    },
    [preferences, updatePreference]
  )

  return {
    preferences: preferences ?? DEFAULT_PREFERENCES,
    isLoading,
    error,
    isUpdating: updateMutation.isPending,
    updatePreference,
    updatePreferences,
    togglePreference,
    refetch,
  }
}
