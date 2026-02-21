'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import type { AuthResponse, LoginRequest, RegisterRequest, ApiResponse, User } from '@planflow/shared'
import { api, ApiError } from '@/lib/api'
import { trackEvent, resetUser } from '@/lib/posthog'

interface UseAuthReturn {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  isInitialized: boolean
  login: (credentials: LoginRequest) => Promise<{ success: boolean; error?: string }>
  register: (data: RegisterRequest) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  getToken: () => Promise<string | null>
}

export function useAuth(): UseAuthReturn {
  const router = useRouter()
  const store = useAuthStore()

  const login = useCallback(
    async (credentials: LoginRequest): Promise<{ success: boolean; error?: string }> => {
      store.setLoading(true)

      try {
        const response = await api.post<ApiResponse<AuthResponse>>('/auth/login', credentials)

        if (response.success && response.data) {
          store.login(response.data)
          return { success: true }
        }

        return { success: false, error: response.error || 'Login failed' }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 401) {
            return { success: false, error: 'Invalid email or password' }
          }
          return { success: false, error: err.message }
        }
        return { success: false, error: 'Unable to connect to the server' }
      } finally {
        store.setLoading(false)
      }
    },
    [store]
  )

  const register = useCallback(
    async (data: RegisterRequest): Promise<{ success: boolean; error?: string }> => {
      store.setLoading(true)

      try {
        const response = await api.post<ApiResponse<{ user: { id: string; email: string } }>>(
          '/auth/register',
          data
        )

        if (response.success) {
          return { success: true }
        }

        return { success: false, error: response.error || 'Registration failed' }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 409) {
            return { success: false, error: 'An account with this email already exists' }
          }
          if (err.status === 400) {
            return { success: false, error: 'Please check your input and try again' }
          }
          return { success: false, error: err.message }
        }
        return { success: false, error: 'Unable to connect to the server' }
      } finally {
        store.setLoading(false)
      }
    },
    [store]
  )

  const logout = useCallback(async () => {
    // Track logout event before resetting user
    trackEvent('user_logged_out', { source: 'web' })
    resetUser()
    await store.logout()
    router.push('/login')
  }, [store, router])

  const getToken = useCallback(async (): Promise<string | null> => {
    const currentToken = store.getToken()

    if (!currentToken) {
      return null
    }

    // Check if token is expired or about to expire
    if (store.isTokenExpired()) {
      const refreshed = await store.refreshAccessToken()
      if (!refreshed) {
        return null
      }
      return store.getToken()
    }

    return currentToken
  }, [store])

  return {
    user: store.user,
    isAuthenticated: store.isAuthenticated,
    isLoading: store.isLoading,
    isInitialized: store.isInitialized,
    login,
    register,
    logout,
    getToken,
  }
}
