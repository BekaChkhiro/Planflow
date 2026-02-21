'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import posthog from 'posthog-js'
import {
  initPostHog,
  isPostHogEnabled,
  trackPageView,
  identifyUser,
  resetUser,
  setGroup,
  POSTHOG_KEY,
  POSTHOG_HOST,
} from '@/lib/posthog'
import { useAuthStore } from '@/stores/auth-store'

// Page view tracker component
function PostHogPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (pathname && isPostHogEnabled()) {
      let url = window.origin + pathname
      if (searchParams?.toString()) {
        url = url + '?' + searchParams.toString()
      }
      trackPageView(url)
    }
  }, [pathname, searchParams])

  return null
}

// User identity tracker component
function PostHogUserIdentity() {
  const { user, isAuthenticated } = useAuthStore()
  const previousUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isPostHogEnabled()) return

    if (isAuthenticated && user) {
      // Only identify if user changed
      if (previousUserIdRef.current !== user.id) {
        identifyUser(user.id, {
          email: user.email,
          name: user.name || undefined,
          createdAt: user.createdAt instanceof Date
            ? user.createdAt.toISOString()
            : String(user.createdAt),
        })

        previousUserIdRef.current = user.id
      }
    } else if (previousUserIdRef.current) {
      // User logged out
      resetUser()
      previousUserIdRef.current = null
    }
  }, [isAuthenticated, user])

  return null
}

interface PostHogProviderProps {
  children: React.ReactNode
}

export function PostHogProvider({ children }: PostHogProviderProps) {
  useEffect(() => {
    // Initialize PostHog on client side
    if (isPostHogEnabled()) {
      initPostHog()
    }
  }, [])

  // If PostHog is not enabled, just render children without provider
  if (!isPostHogEnabled()) {
    return <>{children}</>
  }

  return (
    <PHProvider
      apiKey={POSTHOG_KEY}
      options={{
        api_host: POSTHOG_HOST,
        capture_pageview: false, // We handle this manually
        capture_pageleave: true,
      }}
    >
      <PostHogPageView />
      <PostHogUserIdentity />
      {children}
    </PHProvider>
  )
}

export default PostHogProvider
