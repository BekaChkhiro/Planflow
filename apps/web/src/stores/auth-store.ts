'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { User, AuthResponse, ApiResponse, TokenRefreshResponse } from '@planflow/shared'
import { env } from '@/env'

interface AuthState {
  user: User | null
  token: string | null
  refreshToken: string | null
  expiresAt: number | null
  isAuthenticated: boolean
  isLoading: boolean
  isInitialized: boolean
}

interface AuthActions {
  login: (authResponse: AuthResponse) => void
  logout: () => Promise<void>
  refreshAccessToken: () => Promise<boolean>
  setLoading: (loading: boolean) => void
  initialize: () => void
  getToken: () => string | null
  isTokenExpired: () => boolean
  updateUser: (user: Partial<User>) => void
}

type AuthStore = AuthState & AuthActions

const initialState: AuthState = {
  user: null,
  token: null,
  refreshToken: null,
  expiresAt: null,
  isAuthenticated: false,
  isLoading: true,
  isInitialized: false,
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      login: (authResponse: AuthResponse) => {
        const expiresAt = Date.now() + authResponse.expiresIn * 1000
        set({
          user: authResponse.user,
          token: authResponse.token,
          refreshToken: authResponse.refreshToken,
          expiresAt,
          isAuthenticated: true,
          isLoading: false,
          isInitialized: true,
        })
      },

      logout: async () => {
        const { refreshToken, token } = get()

        // Call logout endpoint to invalidate refresh token
        if (refreshToken && token) {
          try {
            await fetch(`${env.NEXT_PUBLIC_API_URL}/auth/logout`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ refreshToken }),
            })
          } catch {
            // Ignore errors - we're logging out anyway
          }
        }

        set({
          ...initialState,
          isLoading: false,
          isInitialized: true,
        })
      },

      refreshAccessToken: async () => {
        const { refreshToken } = get()

        if (!refreshToken) {
          return false
        }

        try {
          const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/auth/refresh`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ refreshToken }),
          })

          if (!response.ok) {
            // Refresh token is invalid or expired - logout
            get().logout()
            return false
          }

          const data: ApiResponse<TokenRefreshResponse> = await response.json()

          if (data.success && data.data) {
            const expiresAt = Date.now() + data.data.expiresIn * 1000
            set({
              token: data.data.token,
              expiresAt,
            })
            return true
          }

          return false
        } catch {
          return false
        }
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading })
      },

      initialize: () => {
        const state = get()
        // Mark as initialized and stop loading
        set({
          isInitialized: true,
          isLoading: false,
          // Verify authentication state
          isAuthenticated: !!(state.token && state.user),
        })
      },

      getToken: () => {
        return get().token
      },

      isTokenExpired: () => {
        const { expiresAt } = get()
        if (!expiresAt) return true
        // Consider token expired 30 seconds before actual expiration
        return Date.now() >= expiresAt - 30000
      },

      updateUser: (userData: Partial<User>) => {
        const { user } = get()
        if (user) {
          set({
            user: { ...user, ...userData },
          })
        }
      },
    }),
    {
      name: 'planflow-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        expiresAt: state.expiresAt,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        // Called when state is rehydrated from storage
        if (state) {
          state.initialize()
        }
      },
    }
  )
)

// Selector hooks for better performance
export const useUser = () => useAuthStore((state) => state.user)
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated)
export const useAuthLoading = () => useAuthStore((state) => state.isLoading)
export const useAuthInitialized = () => useAuthStore((state) => state.isInitialized)
