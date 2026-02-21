'use client'

import { useQuery, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'
import { authApi } from '@/lib/auth-api'

// Activity action types matching the API
export type ActivityAction =
  | 'task_created'
  | 'task_updated'
  | 'task_deleted'
  | 'task_status_changed'
  | 'task_assigned'
  | 'task_unassigned'
  | 'comment_created'
  | 'comment_updated'
  | 'comment_deleted'
  | 'project_created'
  | 'project_updated'
  | 'project_deleted'
  | 'plan_updated'
  | 'member_invited'
  | 'member_joined'
  | 'member_removed'
  | 'member_role_changed'

export type ActivityEntity = 'task' | 'comment' | 'project' | 'organization' | 'member' | 'invitation'

export interface ActivityActor {
  id: string
  email: string
  name: string | null
}

export interface Activity {
  id: string
  action: ActivityAction
  entityType: ActivityEntity
  entityId: string | null
  taskId: string | null
  taskUuid: string | null
  organizationId: string | null
  projectId: string | null
  metadata: Record<string, unknown> | null
  description: string | null
  createdAt: string
  actor: ActivityActor
}

interface ActivityResponse {
  success: boolean
  data: {
    activities: Activity[]
    pagination: {
      total: number
      limit: number
      offset: number
      hasMore: boolean
    }
  }
}

interface ActivityQueryParams {
  action?: ActivityAction
  entityType?: ActivityEntity
  taskId?: string
  limit?: number
  offset?: number
}

// Query keys
export const projectActivityQueryKey = (projectId: string, params?: ActivityQueryParams) =>
  ['project', projectId, 'activity', params] as const

export const taskActivityQueryKey = (projectId: string, taskId: string) =>
  ['project', projectId, 'task', taskId, 'activity'] as const

/**
 * Hook to fetch project activity with pagination
 */
export function useProjectActivity(projectId: string, params?: ActivityQueryParams) {
  return useQuery({
    queryKey: projectActivityQueryKey(projectId, params),
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      if (params?.action) searchParams.set('action', params.action)
      if (params?.entityType) searchParams.set('entityType', params.entityType)
      if (params?.taskId) searchParams.set('taskId', params.taskId)
      if (params?.limit) searchParams.set('limit', String(params.limit))
      if (params?.offset) searchParams.set('offset', String(params.offset))

      const queryString = searchParams.toString()
      const url = `/projects/${projectId}/activity${queryString ? `?${queryString}` : ''}`

      const response = await authApi.get<ActivityResponse>(url)
      return response.data
    },
    enabled: !!projectId,
    staleTime: 30000, // Consider data stale after 30 seconds
  })
}

/**
 * Hook to fetch project activity with infinite scroll
 */
export function useProjectActivityInfinite(
  projectId: string,
  params?: Omit<ActivityQueryParams, 'offset'>
) {
  return useInfiniteQuery({
    queryKey: ['project', projectId, 'activity', 'infinite', params],
    queryFn: async ({ pageParam = 0 }) => {
      const searchParams = new URLSearchParams()
      if (params?.action) searchParams.set('action', params.action)
      if (params?.entityType) searchParams.set('entityType', params.entityType)
      if (params?.taskId) searchParams.set('taskId', params.taskId)
      searchParams.set('limit', String(params?.limit || 20))
      searchParams.set('offset', String(pageParam))

      const url = `/projects/${projectId}/activity?${searchParams.toString()}`
      const response = await authApi.get<ActivityResponse>(url)
      return response.data
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (lastPage.pagination.hasMore) {
        return lastPage.pagination.offset + lastPage.pagination.limit
      }
      return undefined
    },
    enabled: !!projectId,
    staleTime: 30000,
  })
}

/**
 * Hook to fetch activity for a specific task
 */
export function useTaskActivity(projectId: string, taskId: string) {
  return useQuery({
    queryKey: taskActivityQueryKey(projectId, taskId),
    queryFn: async () => {
      const response = await authApi.get<ActivityResponse>(
        `/projects/${projectId}/tasks/${taskId}/activity`
      )
      return response.data
    },
    enabled: !!projectId && !!taskId,
    staleTime: 30000,
  })
}

/**
 * Hook to handle real-time activity updates
 * Call this in components that use activity data
 */
export function useActivitySubscription(projectId: string) {
  const queryClient = useQueryClient()
  const lastActivityIdRef = useRef<string | null>(null)

  // Handler for new activity from WebSocket
  const handleActivityCreated = useCallback(
    (activity: Activity) => {
      // Prevent duplicate updates
      if (lastActivityIdRef.current === activity.id) {
        return
      }
      lastActivityIdRef.current = activity.id

      // Optimistically add to the activity list
      queryClient.setQueriesData<ActivityResponse['data']>(
        { queryKey: ['project', projectId, 'activity'], exact: false },
        (old) => {
          if (!old) return old

          // Check if activity already exists
          const exists = old.activities.some((a) => a.id === activity.id)
          if (exists) return old

          return {
            ...old,
            activities: [activity, ...old.activities],
            pagination: {
              ...old.pagination,
              total: old.pagination.total + 1,
            },
          }
        }
      )

      // Also update infinite query cache
      queryClient.setQueriesData(
        { queryKey: ['project', projectId, 'activity', 'infinite'], exact: false },
        (old: { pages: Array<ActivityResponse['data']>; pageParams: number[] } | undefined) => {
          if (!old || !old.pages || old.pages.length === 0) return old

          // Add to first page
          const firstPage = old.pages[0]
          if (!firstPage) return old

          const exists = firstPage.activities.some((a) => a.id === activity.id)
          if (exists) return old

          return {
            ...old,
            pages: [
              {
                ...firstPage,
                activities: [activity, ...firstPage.activities],
                pagination: {
                  ...firstPage.pagination,
                  total: firstPage.pagination.total + 1,
                },
              },
              ...old.pages.slice(1),
            ],
          }
        }
      )

      // If it's a task-specific activity, update that cache too
      if (activity.taskId) {
        queryClient.setQueriesData<ActivityResponse['data']>(
          { queryKey: taskActivityQueryKey(projectId, activity.taskId) },
          (old) => {
            if (!old) return old

            const exists = old.activities.some((a) => a.id === activity.id)
            if (exists) return old

            return {
              ...old,
              activities: [activity, ...old.activities],
              pagination: {
                ...old.pagination,
                total: old.pagination.total + 1,
              },
            }
          }
        )
      }
    },
    [projectId, queryClient]
  )

  // Clean up ref on unmount
  useEffect(() => {
    return () => {
      lastActivityIdRef.current = null
    }
  }, [])

  return { handleActivityCreated }
}

/**
 * Get human-readable description for an activity
 */
export function getActivityDescription(activity: Activity): string {
  const actorName = activity.actor.name || activity.actor.email
  const taskId = activity.taskId || ''

  switch (activity.action) {
    case 'task_created':
      return `${actorName} created task ${taskId}`
    case 'task_updated':
      return `${actorName} updated task ${taskId}`
    case 'task_deleted':
      return `${actorName} deleted task ${taskId}`
    case 'task_status_changed': {
      const oldStatus = activity.metadata?.['oldStatus'] as string | undefined
      const newStatus = activity.metadata?.['newStatus'] as string | undefined
      if (oldStatus && newStatus) {
        return `${actorName} changed ${taskId} from ${oldStatus} to ${newStatus}`
      }
      return `${actorName} changed the status of ${taskId}`
    }
    case 'task_assigned': {
      const assigneeName = activity.metadata?.['assigneeName'] as string | undefined
      const assigneeEmail = activity.metadata?.['assigneeEmail'] as string | undefined
      const assignee = assigneeName || assigneeEmail || 'someone'
      return `${actorName} assigned ${taskId} to ${assignee}`
    }
    case 'task_unassigned':
      return `${actorName} unassigned ${taskId}`
    case 'comment_created':
      return `${actorName} commented on ${taskId}`
    case 'comment_updated':
      return `${actorName} edited a comment on ${taskId}`
    case 'comment_deleted':
      return `${actorName} deleted a comment on ${taskId}`
    case 'project_created':
      return `${actorName} created the project`
    case 'project_updated':
      return `${actorName} updated project settings`
    case 'project_deleted':
      return `${actorName} deleted the project`
    case 'plan_updated':
      return `${actorName} updated the project plan`
    case 'member_invited': {
      const inviteeEmail = activity.metadata?.['inviteeEmail'] as string | undefined
      return `${actorName} invited ${inviteeEmail || 'someone'} to the team`
    }
    case 'member_joined':
      return `${actorName} joined the team`
    case 'member_removed': {
      const removedEmail = activity.metadata?.['removedEmail'] as string | undefined
      return `${actorName} removed ${removedEmail || 'someone'} from the team`
    }
    case 'member_role_changed': {
      const oldRole = activity.metadata?.['oldRole'] as string | undefined
      const newRole = activity.metadata?.['newRole'] as string | undefined
      if (oldRole && newRole) {
        return `${actorName} changed role from ${oldRole} to ${newRole}`
      }
      return `${actorName} changed a member's role`
    }
    default:
      return activity.description || `${actorName} performed an action`
  }
}

/**
 * Get icon name for activity type
 */
export function getActivityIcon(action: ActivityAction): string {
  switch (action) {
    case 'task_created':
      return 'plus-circle'
    case 'task_updated':
    case 'project_updated':
      return 'edit'
    case 'task_deleted':
    case 'project_deleted':
    case 'comment_deleted':
      return 'trash-2'
    case 'task_status_changed':
      return 'refresh-cw'
    case 'task_assigned':
      return 'user-plus'
    case 'task_unassigned':
      return 'user-minus'
    case 'comment_created':
    case 'comment_updated':
      return 'message-square'
    case 'project_created':
      return 'folder-plus'
    case 'plan_updated':
      return 'file-text'
    case 'member_invited':
      return 'mail'
    case 'member_joined':
      return 'user-check'
    case 'member_removed':
      return 'user-x'
    case 'member_role_changed':
      return 'shield'
    default:
      return 'activity'
  }
}

/**
 * Get color class for activity type
 */
export function getActivityColor(action: ActivityAction): string {
  switch (action) {
    case 'task_created':
    case 'project_created':
    case 'member_joined':
      return 'text-green-500'
    case 'task_deleted':
    case 'project_deleted':
    case 'comment_deleted':
    case 'member_removed':
      return 'text-red-500'
    case 'task_status_changed':
      return 'text-blue-500'
    case 'task_assigned':
    case 'task_unassigned':
      return 'text-purple-500'
    case 'comment_created':
    case 'comment_updated':
      return 'text-yellow-500'
    case 'member_invited':
    case 'member_role_changed':
      return 'text-orange-500'
    default:
      return 'text-muted-foreground'
  }
}
