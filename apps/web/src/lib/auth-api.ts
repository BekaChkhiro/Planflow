import { env } from '@/env'
import { useAuthStore } from '@/stores/auth-store'
import { ApiError } from './api'

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  body?: unknown
  headers?: Record<string, string>
}

/**
 * Authenticated API client that automatically handles token refresh.
 * Uses the auth store to get/refresh tokens.
 */
async function getValidToken(): Promise<string | null> {
  const store = useAuthStore.getState()
  const currentToken = store.getToken()

  if (!currentToken) {
    return null
  }

  // Check if token is expired or about to expire (30 second buffer)
  if (store.isTokenExpired()) {
    const refreshed = await store.refreshAccessToken()
    if (!refreshed) {
      return null
    }
    return store.getToken()
  }

  return currentToken
}

async function authRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {} } = options

  const token = await getValidToken()

  if (!token) {
    // Force logout if we can't get a valid token
    const store = useAuthStore.getState()
    store.logout()
    throw new ApiError(401, 'Not authenticated')
  }

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...headers,
  }

  const response = await fetch(`${env.NEXT_PUBLIC_API_URL}${endpoint}`, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    // If 401, try to refresh token and retry once
    if (response.status === 401) {
      const store = useAuthStore.getState()
      const refreshed = await store.refreshAccessToken()

      if (refreshed) {
        // Retry the request with new token
        const newToken = store.getToken()
        if (newToken) {
          const retryResponse = await fetch(`${env.NEXT_PUBLIC_API_URL}${endpoint}`, {
            method,
            headers: {
              ...requestHeaders,
              Authorization: `Bearer ${newToken}`,
            },
            body: body ? JSON.stringify(body) : undefined,
          })

          const retryData = await retryResponse.json().catch(() => null)

          if (!retryResponse.ok) {
            throw new ApiError(
              retryResponse.status,
              retryData?.message || retryResponse.statusText,
              retryData
            )
          }

          return retryData as T
        }
      }

      // Couldn't refresh - logout
      store.logout()
    }

    throw new ApiError(response.status, data?.message || response.statusText, data)
  }

  return data as T
}

/**
 * Authenticated API client with automatic token refresh.
 * Use this for all authenticated API calls.
 */
export const authApi = {
  get: <T>(endpoint: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    authRequest<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    authRequest<T>(endpoint, { ...options, method: 'POST', body }),

  put: <T>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    authRequest<T>(endpoint, { ...options, method: 'PUT', body }),

  patch: <T>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    authRequest<T>(endpoint, { ...options, method: 'PATCH', body }),

  delete: <T>(endpoint: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    authRequest<T>(endpoint, { ...options, method: 'DELETE' }),
}
