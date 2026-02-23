'use client'

import { ReactNode, useState, Suspense } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { PostHogProvider } from '@/components/analytics/posthog-provider'
import { ServiceWorkerRegistration } from '@/components/notifications/service-worker-registration'

interface ProvidersProps {
  children: ReactNode
}

// Cache timing constants (T13.1 - Performance Optimization)
const CACHE_TIME = {
  // How long data is considered fresh (won't refetch)
  staleTime: 5 * 60 * 1000, // 5 minutes
  // How long inactive data stays in cache before garbage collection
  gcTime: 30 * 60 * 1000, // 30 minutes
} as const

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data is considered fresh for 5 minutes - reduces unnecessary refetches
        staleTime: CACHE_TIME.staleTime,
        // Keep inactive query data in cache for 30 minutes
        gcTime: CACHE_TIME.gcTime,
        // Retry failed requests up to 1 time
        retry: 1,
        // Don't refetch on window focus - user can manually refresh if needed
        refetchOnWindowFocus: false,
        // Don't refetch on reconnect - prevents thundering herd on reconnection
        refetchOnReconnect: false,
        // Refetch on mount only if data is stale
        refetchOnMount: true,
      },
      mutations: {
        // Retry mutations once on failure
        retry: 1,
      },
    },
  })
}

// Browser: create a singleton query client
let browserQueryClient: QueryClient | undefined = undefined

function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always make a new query client
    return makeQueryClient()
  } else {
    // Browser: make a new query client if we don't already have one
    if (!browserQueryClient) {
      browserQueryClient = makeQueryClient()
    }
    return browserQueryClient
  }
}

export function Providers({ children }: ProvidersProps) {
  // Use useState to ensure the same QueryClient instance across renders
  const [queryClient] = useState(() => getQueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <Suspense fallback={null}>
          <PostHogProvider>
            {children}
          </PostHogProvider>
        </Suspense>
        {/* Service Worker for Push Notifications (T6.8) */}
        <ServiceWorkerRegistration />
      </ThemeProvider>
    </QueryClientProvider>
  )
}
