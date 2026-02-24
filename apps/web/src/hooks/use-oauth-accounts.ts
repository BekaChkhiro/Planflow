'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import type { ApiResponse } from '@planflow/shared'

export type OAuthProvider = 'github' | 'google'

export interface OAuthAccount {
  id: string
  provider: OAuthProvider
  providerEmail: string | null
  providerUsername: string | null
  providerName: string | null
  providerAvatarUrl: string | null
  createdAt: string
}

interface OAuthAccountsResponse {
  accounts: OAuthAccount[]
  hasPassword: boolean
}

interface OAuthLinkResponse {
  url: string
  state: string
  expiresIn: number
}

interface OAuthProviderInfo {
  id: OAuthProvider
  name: string
  configured: boolean
  scopes: string[]
}

interface OAuthProvidersResponse {
  providers: OAuthProviderInfo[]
}

/**
 * Hook for managing OAuth accounts linked to the user's profile
 */
export function useOAuthAccounts() {
  const { token } = useAuthStore()
  const queryClient = useQueryClient()

  // Fetch linked OAuth accounts and hasPassword status
  const {
    data: accountsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['oauth-accounts'],
    queryFn: async () => {
      const response = await api.get<ApiResponse<OAuthAccountsResponse>>(
        '/auth/oauth/accounts'
      )

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch OAuth accounts')
      }

      return {
        accounts: response.data.accounts,
        hasPassword: response.data.hasPassword,
      }
    },
    enabled: !!token,
  })

  const accounts = accountsData?.accounts
  const hasPassword = accountsData?.hasPassword ?? false

  // Fetch available OAuth providers
  const { data: providers } = useQuery({
    queryKey: ['oauth-providers'],
    queryFn: async () => {
      const response = await api.get<ApiResponse<OAuthProvidersResponse>>(
        '/auth/oauth/providers'
      )

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch OAuth providers')
      }

      return response.data.providers
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - providers don't change often
  })

  // Link a new OAuth provider
  const linkMutation = useMutation({
    mutationFn: async ({
      provider,
      redirectUrl,
    }: {
      provider: OAuthProvider
      redirectUrl?: string
    }) => {
      const response = await api.post<ApiResponse<OAuthLinkResponse>>(
        '/auth/oauth/link',
        { provider, redirectUrl }
      )

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to initiate OAuth linking')
      }

      return response.data
    },
    onSuccess: (data) => {
      // Redirect to OAuth provider
      window.location.href = data.url
    },
  })

  // Unlink an OAuth provider
  const unlinkMutation = useMutation({
    mutationFn: async (provider: OAuthProvider) => {
      const response = await api.delete<ApiResponse<{ message: string }>>(
        `/auth/oauth/accounts/${provider}`
      )

      if (!response.success) {
        throw new Error(response.error || 'Failed to unlink OAuth account')
      }

      return response.data
    },
    onSuccess: () => {
      // Refetch accounts after unlinking
      queryClient.invalidateQueries({ queryKey: ['oauth-accounts'] })
    },
  })

  // Helper to check if a provider is linked
  const isProviderLinked = (provider: OAuthProvider): boolean => {
    return accounts?.some((acc) => acc.provider === provider) ?? false
  }

  // Helper to get account for a provider
  const getProviderAccount = (provider: OAuthProvider): OAuthAccount | undefined => {
    return accounts?.find((acc) => acc.provider === provider)
  }

  // Helper to check if provider is configured
  const isProviderConfigured = (provider: OAuthProvider): boolean => {
    return providers?.find((p) => p.id === provider)?.configured ?? false
  }

  // Helper to check if a specific provider can be unlinked
  // User must have either a password or another OAuth account
  const canUnlinkProvider = (provider: OAuthProvider): boolean => {
    const otherAccounts = accounts?.filter((acc) => acc.provider !== provider) ?? []
    return hasPassword || otherAccounts.length > 0
  }

  return {
    accounts: accounts ?? [],
    providers: providers ?? [],
    hasPassword,
    isLoading,
    error,
    refetch,
    linkProvider: linkMutation.mutate,
    linkProviderAsync: linkMutation.mutateAsync,
    isLinking: linkMutation.isPending,
    linkError: linkMutation.error,
    unlinkProvider: unlinkMutation.mutate,
    unlinkProviderAsync: unlinkMutation.mutateAsync,
    isUnlinking: unlinkMutation.isPending,
    unlinkError: unlinkMutation.error,
    isProviderLinked,
    getProviderAccount,
    isProviderConfigured,
    canUnlinkProvider,
  }
}
