import posthog from 'posthog-js'

// PostHog configuration
export const POSTHOG_KEY = process.env['NEXT_PUBLIC_POSTHOG_KEY'] || ''
export const POSTHOG_HOST = process.env['NEXT_PUBLIC_POSTHOG_HOST'] || 'https://app.posthog.com'

// Check if PostHog should be enabled
export const isPostHogEnabled = () => {
  return (
    typeof window !== 'undefined' &&
    POSTHOG_KEY &&
    POSTHOG_KEY.length > 0 &&
    process.env.NODE_ENV === 'production'
  )
}

// Initialize PostHog client
export const initPostHog = () => {
  if (!isPostHogEnabled()) {
    return null
  }

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    // Capture pageviews automatically
    capture_pageview: false, // We'll handle this manually with Next.js router
    capture_pageleave: true,
    // Session recording (optional - enable if needed)
    disable_session_recording: false,
    // Respect Do Not Track
    respect_dnt: true,
    // Persistence
    persistence: 'localStorage+cookie',
    // Autocapture settings
    autocapture: {
      dom_event_allowlist: ['click', 'submit'],
      element_allowlist: ['button', 'a', 'input', 'form'],
      css_selector_allowlist: ['[data-ph-capture]'],
    },
    // Privacy settings
    mask_all_text: false,
    mask_all_element_attributes: false,
    // Advanced settings
    loaded: (posthogInstance) => {
      // Enable debug mode in development
      if (process.env.NODE_ENV === 'development') {
        posthogInstance.debug()
      }
    },
  })

  return posthog
}

// Get PostHog instance (for use outside React components)
export const getPostHog = () => {
  if (!isPostHogEnabled()) {
    return null
  }
  return posthog
}

// Analytics event types for type safety
export type AnalyticsEvent =
  // Authentication events
  | 'user_signed_up'
  | 'user_logged_in'
  | 'user_logged_out'
  // Project events
  | 'project_created'
  | 'project_viewed'
  | 'project_deleted'
  | 'plan_synced'
  // Task events
  | 'task_created'
  | 'task_updated'
  | 'task_completed'
  | 'task_assigned'
  | 'task_commented'
  // Team events
  | 'team_member_invited'
  | 'team_member_removed'
  | 'team_role_changed'
  // Integration events
  | 'github_connected'
  | 'github_disconnected'
  | 'slack_connected'
  | 'discord_connected'
  // Subscription events
  | 'subscription_started'
  | 'subscription_cancelled'
  | 'subscription_upgraded'
  // Feature usage events
  | 'feature_used'
  | 'mcp_setup_viewed'
  | 'api_token_created'

// Event properties type
export interface AnalyticsEventProperties {
  // Common properties
  source?: 'web' | 'mcp' | 'api'
  // Project properties
  projectId?: string
  projectName?: string
  // Task properties
  taskId?: string
  taskStatus?: string
  // Team properties
  teamSize?: number
  role?: string
  // Feature properties
  featureName?: string
  // Subscription properties
  plan?: string
  // Additional custom properties
  [key: string]: string | number | boolean | undefined
}

// Track an event
export const trackEvent = (
  event: AnalyticsEvent,
  properties?: AnalyticsEventProperties
) => {
  const ph = getPostHog()
  if (ph) {
    ph.capture(event, {
      ...properties,
      timestamp: new Date().toISOString(),
    })
  }
}

// Identify a user
export const identifyUser = (
  userId: string,
  properties?: {
    email?: string
    name?: string
    createdAt?: string
    plan?: string
    organizationId?: string
    [key: string]: string | number | boolean | undefined
  }
) => {
  const ph = getPostHog()
  if (ph) {
    ph.identify(userId, properties)
  }
}

// Reset user identity (on logout)
export const resetUser = () => {
  const ph = getPostHog()
  if (ph) {
    ph.reset()
  }
}

// Track page view
export const trackPageView = (url?: string) => {
  const ph = getPostHog()
  if (ph) {
    ph.capture('$pageview', {
      $current_url: url || (typeof window !== 'undefined' ? window.location.href : ''),
    })
  }
}

// Set user properties without identifying
export const setUserProperties = (properties: Record<string, string | number | boolean>) => {
  const ph = getPostHog()
  if (ph) {
    ph.people.set(properties)
  }
}

// Increment a numeric property (using set with computed value)
export const incrementUserProperty = (property: string, value: number = 1) => {
  const ph = getPostHog()
  if (ph) {
    // Note: PostHog JS doesn't have increment, so we track as event instead
    ph.capture('$increment', {
      property,
      value,
    })
  }
}

// Feature flags
export const isFeatureEnabled = (featureKey: string): boolean => {
  const ph = getPostHog()
  if (ph) {
    return ph.isFeatureEnabled(featureKey) ?? false
  }
  return false
}

// Get feature flag value
export const getFeatureFlagValue = <T = string | boolean>(featureKey: string): T | undefined => {
  const ph = getPostHog()
  if (ph) {
    return ph.getFeatureFlag(featureKey) as T | undefined
  }
  return undefined
}

// Group analytics (for organization/team tracking)
export const setGroup = (groupType: string, groupKey: string, properties?: Record<string, unknown>) => {
  const ph = getPostHog()
  if (ph) {
    ph.group(groupType, groupKey, properties)
  }
}

export default posthog
