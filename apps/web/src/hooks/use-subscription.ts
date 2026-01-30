'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/lib/auth-api'
import type { SubscriptionTier, SubscriptionStatus } from '@planflow/shared'

export interface Subscription {
  id: string
  userId: string
  tier: SubscriptionTier
  status: SubscriptionStatus
  lemonSqueezyCustomerId: string | null
  lemonSqueezySubscriptionId: string | null
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  canceledAt: string | null
  createdAt: string
  updatedAt: string
}

interface SubscriptionResponse {
  success: boolean
  data: {
    subscription: Subscription
  }
}

interface CheckoutResponse {
  success: boolean
  data: {
    checkoutUrl: string
  }
}

interface PortalResponse {
  success: boolean
  data: {
    portalUrl: string
  }
}

export const subscriptionQueryKey = ['subscription']

/**
 * Hook to get the current user's subscription.
 * Automatically creates a free tier subscription if none exists.
 */
export function useSubscription() {
  return useQuery({
    queryKey: subscriptionQueryKey,
    queryFn: async () => {
      const response = await authApi.get<SubscriptionResponse>('/subscriptions/current')
      return response.data.subscription
    },
  })
}

/**
 * Hook to create a checkout session and redirect to LemonSqueezy.
 * On success, automatically redirects to the checkout URL.
 */
export function useCreateCheckout() {
  return useMutation({
    mutationFn: async (tier: 'pro' | 'team') => {
      const response = await authApi.post<CheckoutResponse>('/subscriptions/checkout', { tier })
      return response.data.checkoutUrl
    },
    onSuccess: (checkoutUrl) => {
      // Redirect to LemonSqueezy checkout
      window.location.href = checkoutUrl
    },
    onError: (error) => {
      console.error('Checkout error:', error)
    },
  })
}

/**
 * Hook to create a customer portal session.
 * On success, opens the LemonSqueezy customer portal in a new tab.
 */
export function useCreatePortalSession() {
  return useMutation({
    mutationFn: async () => {
      const response = await authApi.post<PortalResponse>('/subscriptions/portal', {})
      return response.data.portalUrl
    },
    onSuccess: (portalUrl) => {
      // Open portal in new tab
      window.open(portalUrl, '_blank', 'noopener,noreferrer')
    },
    onError: (error) => {
      console.error('Portal session error:', error)
    },
  })
}

/**
 * Hook to invalidate the subscription query.
 * Useful after returning from checkout success page.
 */
export function useInvalidateSubscription() {
  const queryClient = useQueryClient()

  return () => {
    queryClient.invalidateQueries({ queryKey: subscriptionQueryKey })
  }
}

/**
 * Check if a subscription is active (either active or trialing).
 */
export function isSubscriptionActive(subscription: Subscription | null | undefined): boolean {
  if (!subscription) return false
  return subscription.status === 'active' || subscription.status === 'trialing'
}

/**
 * Check if a user has a paid subscription (pro or team).
 */
export function isPaidSubscription(subscription: Subscription | null | undefined): boolean {
  if (!subscription) return false
  return subscription.tier === 'pro' || subscription.tier === 'team' || subscription.tier === 'enterprise'
}
