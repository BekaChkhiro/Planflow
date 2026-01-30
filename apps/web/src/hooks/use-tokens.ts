'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/lib/auth-api'

export interface ApiToken {
  id: string
  name: string
  lastUsedAt: string | null
  expiresAt: string | null
  isRevoked: boolean
  createdAt: string
}

export interface CreatedToken {
  token: string
  id: string
  name: string
  expiresAt: string | null
  createdAt: string
}

interface TokensResponse {
  success: boolean
  data: {
    tokens: ApiToken[]
  }
}

interface CreateTokenData {
  name: string
  expiresInDays?: number
}

interface CreateTokenResponse {
  success: boolean
  data: CreatedToken
  message: string
}

interface RevokeTokenResponse {
  success: boolean
  data: {
    message: string
  }
}

export const tokensQueryKey = ['api-tokens']

export function useTokens() {
  return useQuery({
    queryKey: tokensQueryKey,
    queryFn: async () => {
      const response = await authApi.get<TokensResponse>('/api-tokens')
      return response.data.tokens
    },
  })
}

export function useCreateToken() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateTokenData) => {
      const response = await authApi.post<CreateTokenResponse>('/api-tokens', data)
      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tokensQueryKey })
    },
  })
}

export function useRevokeToken() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (tokenId: string) => {
      await authApi.delete<RevokeTokenResponse>(`/api-tokens/${tokenId}`)
      return tokenId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tokensQueryKey })
    },
  })
}
