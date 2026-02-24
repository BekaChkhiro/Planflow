'use client'

import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import type { AuthResponse, ApiResponse } from '@planflow/shared'

type OAuthProvider = 'github' | 'google'

interface OAuthAuthorizeResponse {
  url: string
  state: string
  expiresIn: number
}

interface OAuthCallbackResponse {
  user: AuthResponse['user']
  token: string
  refreshToken: string
  expiresIn: number
  refreshExpiresIn: number
  isNewUser: boolean
  isLinkedAccount: boolean
  redirectUrl: string | null
}

// OAuth error codes from the API (T18.10)
export enum OAuthErrorCode {
  EMAIL_EXISTS_UNVERIFIED = 'EMAIL_EXISTS_UNVERIFIED',
  EMAIL_EXISTS_DIFFERENT_PROVIDER = 'EMAIL_EXISTS_DIFFERENT_PROVIDER',
  EMAIL_REQUIRED = 'EMAIL_REQUIRED',
  ACCOUNT_ALREADY_LINKED = 'ACCOUNT_ALREADY_LINKED',
  PROVIDER_ACCOUNT_EXISTS = 'PROVIDER_ACCOUNT_EXISTS',
}

export interface OAuthErrorResponse {
  success: false
  error: string
  errorCode?: OAuthErrorCode
  details?: {
    existingProvider?: string
    email?: string
  }
}

export class OAuthCallbackError extends Error {
  errorCode?: OAuthErrorCode
  details?: {
    existingProvider?: string
    email?: string
  }

  constructor(message: string, errorCode?: OAuthErrorCode, details?: { existingProvider?: string; email?: string }) {
    super(message)
    this.name = 'OAuthCallbackError'
    this.errorCode = errorCode
    this.details = details
  }
}

interface OAuthAuthorizeParams {
  provider: OAuthProvider
  redirectUrl?: string
}

interface OAuthCallbackParams {
  provider: OAuthProvider
  code: string
  state: string
}

/**
 * Hook for OAuth authentication (login/register with GitHub or Google)
 */
export function useOAuthAuth() {
  const authStore = useAuthStore()

  /**
   * Get OAuth authorization URL
   * Redirects user to provider's login page
   */
  const authorize = useMutation({
    mutationFn: async ({ provider, redirectUrl }: OAuthAuthorizeParams) => {
      const response = await api.post<ApiResponse<OAuthAuthorizeResponse>>(
        '/auth/oauth/authorize',
        { provider, redirectUrl }
      )

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to get authorization URL')
      }

      return response.data
    },
    onSuccess: (data) => {
      // Redirect to OAuth provider
      window.location.href = data.url
    },
  })

  /**
   * Handle OAuth callback - exchange code for token and login
   */
  const callback = useMutation({
    mutationFn: async ({ provider, code, state }: OAuthCallbackParams) => {
      const response = await api.post<ApiResponse<OAuthCallbackResponse> & OAuthErrorResponse>(
        '/auth/oauth/callback',
        { provider, code, state }
      )

      if (!response.success || !response.data) {
        // Check for structured error response with error code (T18.10)
        const errorResponse = response as OAuthErrorResponse
        if (errorResponse.errorCode) {
          throw new OAuthCallbackError(
            errorResponse.error,
            errorResponse.errorCode,
            errorResponse.details
          )
        }
        throw new Error(response.error || 'OAuth authentication failed')
      }

      return response.data
    },
    onSuccess: (data) => {
      // Login user with the received tokens
      authStore.login({
        user: data.user,
        token: data.token,
        refreshToken: data.refreshToken,
        expiresIn: data.expiresIn,
        refreshExpiresIn: data.refreshExpiresIn,
      })
    },
  })

  /**
   * Start OAuth flow - initiates authorization
   */
  const startOAuthFlow = async (provider: OAuthProvider, redirectUrl?: string) => {
    await authorize.mutateAsync({ provider, redirectUrl })
  }

  /**
   * Complete OAuth flow - handles callback
   */
  const completeOAuthFlow = async (provider: OAuthProvider, code: string, state: string) => {
    return await callback.mutateAsync({ provider, code, state })
  }

  return {
    startOAuthFlow,
    completeOAuthFlow,
    isAuthorizing: authorize.isPending,
    isProcessingCallback: callback.isPending,
    authorizeError: authorize.error,
    callbackError: callback.error,
  }
}

/**
 * Hook specifically for GitHub OAuth
 */
export function useGitHubOAuth() {
  const { startOAuthFlow, completeOAuthFlow, isAuthorizing, isProcessingCallback, authorizeError, callbackError } = useOAuthAuth()

  return {
    startGitHubLogin: (redirectUrl?: string) => startOAuthFlow('github', redirectUrl),
    completeGitHubLogin: (code: string, state: string) => completeOAuthFlow('github', code, state),
    isLoading: isAuthorizing || isProcessingCallback,
    error: authorizeError || callbackError,
  }
}

/**
 * Hook specifically for Google OAuth
 */
export function useGoogleOAuth() {
  const { startOAuthFlow, completeOAuthFlow, isAuthorizing, isProcessingCallback, authorizeError, callbackError } = useOAuthAuth()

  return {
    startGoogleLogin: (redirectUrl?: string) => startOAuthFlow('google', redirectUrl),
    completeGoogleLogin: (code: string, state: string) => completeOAuthFlow('google', code, state),
    isLoading: isAuthorizing || isProcessingCallback,
    error: authorizeError || callbackError,
  }
}
