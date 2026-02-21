'use client'

import { useCallback } from 'react'
import { usePostHog } from 'posthog-js/react'
import {
  trackEvent,
  identifyUser,
  resetUser,
  setUserProperties,
  incrementUserProperty,
  isFeatureEnabled,
  getFeatureFlagValue,
  setGroup,
  isPostHogEnabled,
  type AnalyticsEvent,
  type AnalyticsEventProperties,
} from '@/lib/posthog'

/**
 * Main analytics hook for tracking events and user properties
 */
export function useAnalytics() {
  const posthog = usePostHog()

  // Track a custom event
  const track = useCallback(
    (event: AnalyticsEvent, properties?: AnalyticsEventProperties) => {
      trackEvent(event, { ...properties, source: 'web' })
    },
    []
  )

  // Identify user
  const identify = useCallback(
    (
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
      identifyUser(userId, properties)
    },
    []
  )

  // Reset user identity
  const reset = useCallback(() => {
    resetUser()
  }, [])

  // Set user properties
  const setProperties = useCallback(
    (properties: Record<string, string | number | boolean>) => {
      setUserProperties(properties)
    },
    []
  )

  // Increment a numeric property
  const increment = useCallback((property: string, value: number = 1) => {
    incrementUserProperty(property, value)
  }, [])

  // Check if a feature flag is enabled
  const checkFeature = useCallback((featureKey: string): boolean => {
    return isFeatureEnabled(featureKey)
  }, [])

  // Get feature flag value
  const getFeature = useCallback(<T = string | boolean>(featureKey: string): T | undefined => {
    return getFeatureFlagValue<T>(featureKey)
  }, [])

  // Set organization/team group
  const setOrganization = useCallback(
    (organizationId: string, properties?: Record<string, unknown>) => {
      setGroup('organization', organizationId, properties)
    },
    []
  )

  return {
    track,
    identify,
    reset,
    setProperties,
    increment,
    checkFeature,
    getFeature,
    setOrganization,
    isEnabled: isPostHogEnabled(),
    posthog,
  }
}

/**
 * Hook for tracking authentication events
 */
export function useAuthAnalytics() {
  const { track, identify, reset, setProperties, increment } = useAnalytics()

  const trackSignUp = useCallback(
    (userId: string, email: string, name?: string, referralSource?: string) => {
      identify(userId, { email, name, createdAt: new Date().toISOString() })
      track('user_signed_up', {
        source: 'web',
        ...(referralSource && { referralSource }),
      })
      increment('total_signups')
    },
    [identify, track, increment]
  )

  const trackLogin = useCallback(
    (userId: string, email: string, method?: 'email' | 'github' | 'google') => {
      identify(userId, { email })
      track('user_logged_in', {
        source: 'web',
        ...(method && { method }),
      })
      setProperties({ lastLoginAt: new Date().toISOString() })
    },
    [identify, track, setProperties]
  )

  const trackLogout = useCallback(() => {
    track('user_logged_out', { source: 'web' })
    reset()
  }, [track, reset])

  return {
    trackSignUp,
    trackLogin,
    trackLogout,
  }
}

/**
 * Hook for tracking project events
 */
export function useProjectAnalytics() {
  const { track, increment } = useAnalytics()

  const trackProjectCreated = useCallback(
    (projectId: string, projectName: string) => {
      track('project_created', { projectId, projectName })
      increment('projects_created')
    },
    [track, increment]
  )

  const trackProjectViewed = useCallback(
    (projectId: string, projectName: string) => {
      track('project_viewed', { projectId, projectName })
    },
    [track]
  )

  const trackProjectDeleted = useCallback(
    (projectId: string, projectName: string) => {
      track('project_deleted', { projectId, projectName })
    },
    [track]
  )

  const trackPlanSynced = useCallback(
    (projectId: string, direction: 'push' | 'pull') => {
      track('plan_synced', { projectId, direction })
      increment('plans_synced')
    },
    [track, increment]
  )

  return {
    trackProjectCreated,
    trackProjectViewed,
    trackProjectDeleted,
    trackPlanSynced,
  }
}

/**
 * Hook for tracking task events
 */
export function useTaskAnalytics() {
  const { track, increment } = useAnalytics()

  const trackTaskCreated = useCallback(
    (taskId: string, projectId: string) => {
      track('task_created', { taskId, projectId })
      increment('tasks_created')
    },
    [track, increment]
  )

  const trackTaskUpdated = useCallback(
    (taskId: string, projectId: string, changes: string[]) => {
      track('task_updated', {
        taskId,
        projectId,
        changesCount: changes.length,
      })
    },
    [track]
  )

  const trackTaskCompleted = useCallback(
    (taskId: string, projectId: string) => {
      track('task_completed', { taskId, projectId })
      increment('tasks_completed')
    },
    [track, increment]
  )

  const trackTaskAssigned = useCallback(
    (taskId: string, projectId: string, assigneeId: string) => {
      track('task_assigned', { taskId, projectId, assigneeId })
    },
    [track]
  )

  const trackTaskCommented = useCallback(
    (taskId: string, projectId: string, hasMentions: boolean) => {
      track('task_commented', { taskId, projectId, hasMentions })
      increment('comments_created')
    },
    [track, increment]
  )

  return {
    trackTaskCreated,
    trackTaskUpdated,
    trackTaskCompleted,
    trackTaskAssigned,
    trackTaskCommented,
  }
}

/**
 * Hook for tracking team events
 */
export function useTeamAnalytics() {
  const { track, setOrganization } = useAnalytics()

  const trackTeamMemberInvited = useCallback(
    (organizationId: string, role: string, teamSize: number) => {
      track('team_member_invited', { organizationId, role, teamSize })
      setOrganization(organizationId, { memberCount: teamSize })
    },
    [track, setOrganization]
  )

  const trackTeamMemberRemoved = useCallback(
    (organizationId: string, teamSize: number) => {
      track('team_member_removed', { organizationId, teamSize })
      setOrganization(organizationId, { memberCount: teamSize })
    },
    [track, setOrganization]
  )

  const trackTeamRoleChanged = useCallback(
    (organizationId: string, newRole: string) => {
      track('team_role_changed', { organizationId, role: newRole })
    },
    [track]
  )

  return {
    trackTeamMemberInvited,
    trackTeamMemberRemoved,
    trackTeamRoleChanged,
  }
}

/**
 * Hook for tracking integration events
 */
export function useIntegrationAnalytics() {
  const { track } = useAnalytics()

  const trackGitHubConnected = useCallback(
    (organizationId?: string) => {
      track('github_connected', { organizationId })
    },
    [track]
  )

  const trackGitHubDisconnected = useCallback(
    (organizationId?: string) => {
      track('github_disconnected', { organizationId })
    },
    [track]
  )

  const trackSlackConnected = useCallback(
    (organizationId?: string) => {
      track('slack_connected', { organizationId })
    },
    [track]
  )

  const trackDiscordConnected = useCallback(
    (organizationId?: string) => {
      track('discord_connected', { organizationId })
    },
    [track]
  )

  return {
    trackGitHubConnected,
    trackGitHubDisconnected,
    trackSlackConnected,
    trackDiscordConnected,
  }
}

/**
 * Hook for tracking subscription events
 */
export function useSubscriptionAnalytics() {
  const { track, setProperties } = useAnalytics()

  const trackSubscriptionStarted = useCallback(
    (plan: string, billingInterval: 'monthly' | 'yearly') => {
      track('subscription_started', { plan, billingInterval })
      setProperties({ plan, subscribedAt: new Date().toISOString() })
    },
    [track, setProperties]
  )

  const trackSubscriptionCancelled = useCallback(
    (plan: string, reason?: string) => {
      track('subscription_cancelled', { plan, ...(reason && { reason }) })
    },
    [track]
  )

  const trackSubscriptionUpgraded = useCallback(
    (fromPlan: string, toPlan: string) => {
      track('subscription_upgraded', { fromPlan, toPlan })
      setProperties({ plan: toPlan, upgradedAt: new Date().toISOString() })
    },
    [track, setProperties]
  )

  return {
    trackSubscriptionStarted,
    trackSubscriptionCancelled,
    trackSubscriptionUpgraded,
  }
}

/**
 * Hook for tracking feature usage
 */
export function useFeatureAnalytics() {
  const { track, increment } = useAnalytics()

  const trackFeatureUsed = useCallback(
    (featureName: string, metadata?: Record<string, string | number | boolean>) => {
      track('feature_used', { featureName, ...metadata })
      increment(`feature_${featureName}_used`)
    },
    [track, increment]
  )

  const trackMCPSetupViewed = useCallback(() => {
    track('mcp_setup_viewed', {})
  }, [track])

  const trackAPITokenCreated = useCallback(() => {
    track('api_token_created', {})
    increment('api_tokens_created')
  }, [track, increment])

  return {
    trackFeatureUsed,
    trackMCPSetupViewed,
    trackAPITokenCreated,
  }
}

export default useAnalytics
