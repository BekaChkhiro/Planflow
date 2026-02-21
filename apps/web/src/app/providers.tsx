'use client'

import { ReactNode, useState, Suspense } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PostHogProvider } from '@/components/analytics/posthog-provider'
import { ServiceWorkerRegistration } from '@/components/notifications/service-worker-registration'

interface ProvidersProps {
  children: ReactNode
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // SSR: Prevent refetching immediately on the client
        staleTime: 60 * 1000, // 1 minute
        // Retry failed requests up to 1 time
        retry: 1,
        // Don't refetch on window focus by default
        refetchOnWindowFocus: false,
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
      <Suspense fallback={null}>
        <PostHogProvider>
          {children}
        </PostHogProvider>
      </Suspense>
      {/* Service Worker for Push Notifications (T6.8) */}
      <ServiceWorkerRegistration />
      {/* Theme Provider can be added here if dark mode is needed */}
    </QueryClientProvider>
  )
}
