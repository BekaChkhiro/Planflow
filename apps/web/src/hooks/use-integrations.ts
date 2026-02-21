'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/lib/auth-api'

export type IntegrationType = 'github' | 'slack' | 'discord'

export type IntegrationStatus = 'connected' | 'disconnected' | 'pending'

export interface Integration {
  id: string
  type: IntegrationType
  status: IntegrationStatus
  connectedAt: string | null
  enabledEvents?: string[]
  metadata: {
    // GitHub specific
    username?: string
    repository?: string
    installationId?: string
    // Slack specific
    workspace?: string
    channel?: string
    webhookConfigured?: boolean
    // Discord specific
    server?: string
    webhookUrl?: string
  }
}

// Event types that can be enabled/disabled for notifications
export const NOTIFICATION_EVENT_TYPES = [
  {
    id: 'task_status_changed',
    label: 'Task Status Changes',
    description: 'When a task moves to TODO, IN_PROGRESS, DONE, or BLOCKED',
    emoji: '🔄',
  },
  {
    id: 'task_assigned',
    label: 'Task Assignments',
    description: 'When a task is assigned to a team member',
    emoji: '👤',
  },
  {
    id: 'task_unassigned',
    label: 'Task Unassignments',
    description: 'When a task assignment is removed',
    emoji: '👋',
  },
  {
    id: 'task_completed',
    label: 'Task Completions',
    description: 'When a task is marked as done',
    emoji: '✅',
  },
  {
    id: 'comment_created',
    label: 'New Comments',
    description: 'When someone comments on a task',
    emoji: '💬',
  },
  {
    id: 'mention',
    label: 'Mentions',
    description: 'When you are @mentioned in a comment',
    emoji: '📣',
  },
  {
    id: 'member_joined',
    label: 'Member Joined',
    description: 'When a new member joins the team',
    emoji: '🎉',
  },
  {
    id: 'member_removed',
    label: 'Member Removed',
    description: 'When a member leaves or is removed from the team',
    emoji: '👋',
  },
] as const

export type NotificationEventType = typeof NOTIFICATION_EVENT_TYPES[number]['id']

// Default enabled events for new integrations
export const DEFAULT_ENABLED_EVENTS: NotificationEventType[] = [
  'task_status_changed',
  'task_assigned',
  'task_completed',
  'comment_created',
  'mention',
  'member_joined',
]

export interface IntegrationConfig {
  type: IntegrationType
  name: string
  description: string
  icon: string
  features: string[]
  comingSoon?: boolean
}

// Available integrations configuration
export const INTEGRATIONS_CONFIG: IntegrationConfig[] = [
  {
    type: 'github',
    name: 'GitHub',
    description: 'Connect your GitHub account to link tasks with issues and pull requests.',
    icon: 'github',
    features: [
      'Link tasks to GitHub issues',
      'Auto-update task status on PR merge',
      'Generate branch names from tasks',
      'Create PRs directly from tasks',
    ],
  },
  {
    type: 'slack',
    name: 'Slack',
    description: 'Get notified in Slack when tasks are updated or assigned.',
    icon: 'slack',
    features: [
      'Task completion notifications',
      'Assignment notifications',
      'Daily/weekly digest messages',
      'Custom channel routing',
    ],
  },
  {
    type: 'discord',
    name: 'Discord',
    description: 'Send task updates to your Discord server.',
    icon: 'discord',
    features: [
      'Task status updates',
      'Team activity notifications',
      'Webhook-based integration',
      'Custom notification formats',
    ],
  },
]

interface IntegrationsResponse {
  success: boolean
  data: {
    integrations: Integration[]
  }
}

interface ConnectIntegrationResponse {
  success: boolean
  data: {
    authUrl?: string
    integration?: Integration
  }
  message?: string
}

interface DisconnectIntegrationResponse {
  success: boolean
  message: string
}

interface ConfigureWebhookData {
  type: 'slack' | 'discord'
  webhookUrl: string
  channel?: string
}

interface ConfigureWebhookResponse {
  success: boolean
  data: {
    integration: Integration
  }
  message?: string
}

export const integrationsQueryKey = ['integrations']

export function useIntegrations() {
  return useQuery({
    queryKey: integrationsQueryKey,
    queryFn: async () => {
      try {
        const integrations: Integration[] = []

        // Fetch GitHub integration status
        try {
          const githubResponse = await authApi.get<{
            success: boolean
            data: {
              configured: boolean
              connected: boolean
              integration: {
                id: string
                githubId: string
                githubUsername: string
                githubEmail: string | null
                githubAvatarUrl: string | null
                githubName: string | null
                grantedScopes: string[] | null
                isConnected: boolean
                lastSyncAt: string | null
                createdAt: string
                updatedAt: string
              } | null
            }
          }>('/integrations/github')

          if (githubResponse.data.connected && githubResponse.data.integration) {
            const gh = githubResponse.data.integration
            integrations.push({
              id: gh.id,
              type: 'github',
              status: 'connected',
              connectedAt: gh.createdAt,
              metadata: {
                username: gh.githubUsername,
              },
            })
          }
        } catch {
          // GitHub integration not available, continue
        }

        // Try to fetch other integrations from generic endpoint
        try {
          const response = await authApi.get<IntegrationsResponse>('/integrations')
          // Add Slack/Discord integrations
          for (const integration of response.data?.integrations ?? []) {
            if (integration.type !== 'github') {
              integrations.push(integration)
            }
          }
        } catch {
          // Generic integrations endpoint not available
        }

        return integrations
      } catch {
        // Return empty array if APIs not implemented yet
        return [] as Integration[]
      }
    },
  })
}

export function useConnectIntegration() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (type: IntegrationType) => {
      if (type === 'github') {
        // Use the new GitHub OAuth authorize endpoint
        const response = await authApi.post<{
          success: boolean
          data: {
            authorizationUrl: string
            state: string
            expiresIn: number
          }
        }>('/integrations/github/authorize')

        return {
          data: {
            authUrl: response.data.authorizationUrl,
          },
        }
      }

      // Slack/Discord use webhook-based connection
      const response = await authApi.post<ConnectIntegrationResponse>(`/integrations/${type}/connect`)
      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: integrationsQueryKey })
    },
  })
}

export function useDisconnectIntegration() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (type: IntegrationType) => {
      if (type === 'github') {
        // Use the new GitHub disconnect endpoint
        await authApi.post<{ success: boolean; data: { message: string } }>(
          '/integrations/github/disconnect'
        )
      } else {
        await authApi.delete<DisconnectIntegrationResponse>(`/integrations/${type}`)
      }
      return type
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: integrationsQueryKey })
    },
  })
}

export function useConfigureWebhook() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: ConfigureWebhookData) => {
      const response = await authApi.post<ConfigureWebhookResponse>(
        `/integrations/${data.type}/webhook`,
        {
          webhookUrl: data.webhookUrl,
          channel: data.channel,
        }
      )
      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: integrationsQueryKey })
    },
  })
}

interface UpdateNotificationPreferencesData {
  type: 'slack' | 'discord'
  integrationId: string
  enabledEvents: string[]
}

interface UpdateNotificationPreferencesResponse {
  success: boolean
  data: {
    integration: Integration
  }
  message?: string
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: UpdateNotificationPreferencesData) => {
      const response = await authApi.patch<UpdateNotificationPreferencesResponse>(
        `/integrations/${data.type}/${data.integrationId}`,
        {
          enabledEvents: data.enabledEvents,
        }
      )
      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: integrationsQueryKey })
    },
  })
}

interface TestWebhookData {
  type: 'slack' | 'discord'
  integrationId: string
}

interface TestWebhookResponse {
  success: boolean
  message: string
}

export function useTestWebhook() {
  return useMutation({
    mutationFn: async (data: TestWebhookData) => {
      const response = await authApi.post<TestWebhookResponse>(
        `/integrations/${data.type}/${data.integrationId}/test`
      )
      return response
    },
  })
}

// Helper to get integration status
export function getIntegrationStatus(
  integrations: Integration[] | undefined,
  type: IntegrationType
): Integration | undefined {
  return integrations?.find((i) => i.type === type)
}
