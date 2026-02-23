'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/lib/auth-api'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/error-utils'
import { projectQueryKey, projectTasksQueryKey, type Project } from './use-projects'

// Sync plan response from API
interface SyncPlanResponse {
  success: boolean
  data: {
    projectId: string
    projectName: string
    plan: string | null
    updatedAt: string
    tasksCount: number
    completedCount: number
    progress: number
  }
}

// Push plan to cloud (upload local plan content)
export function usePushPlan() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, plan }: { projectId: string; plan: string }) => {
      const response = await authApi.put<SyncPlanResponse>(`/projects/${projectId}/plan`, { plan })
      return response.data
    },
    onSuccess: (data, { projectId }) => {
      // Update project cache with new plan
      queryClient.setQueryData<Project>(projectQueryKey(projectId), (old) => {
        if (!old) return old
        return {
          ...old,
          plan: data.plan,
          updatedAt: data.updatedAt,
        }
      })
      // Invalidate tasks to refetch parsed tasks
      queryClient.invalidateQueries({ queryKey: projectTasksQueryKey(projectId) })
      toast.success(`Plan synced - ${data.tasksCount} tasks, ${data.progress}% complete`)
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error))
    },
  })
}

// Pull plan from cloud (download latest plan)
export function usePullPlan() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (projectId: string) => {
      const response = await authApi.get<SyncPlanResponse>(`/projects/${projectId}/plan`)
      return response.data
    },
    onSuccess: (data, projectId) => {
      // Update project cache with pulled plan
      queryClient.setQueryData<Project>(projectQueryKey(projectId), (old) => {
        if (!old) return old
        return {
          ...old,
          plan: data.plan,
          updatedAt: data.updatedAt,
        }
      })
      // Invalidate tasks to refetch
      queryClient.invalidateQueries({ queryKey: projectTasksQueryKey(projectId) })
      toast.success('Plan refreshed from cloud')
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error))
    },
  })
}

// Get sync status (compare timestamps, etc.)
export interface SyncStatus {
  lastSyncedAt: string | null
  isStale: boolean
  syncAge: string
}

export function getSyncStatus(updatedAt: string | null): SyncStatus {
  if (!updatedAt) {
    return {
      lastSyncedAt: null,
      isStale: true,
      syncAge: 'Never synced',
    }
  }

  const lastSync = new Date(updatedAt)
  const now = new Date()
  const diffMs = now.getTime() - lastSync.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  let syncAge: string
  if (diffMins < 1) {
    syncAge = 'Just now'
  } else if (diffMins < 60) {
    syncAge = `${diffMins}m ago`
  } else if (diffHours < 24) {
    syncAge = `${diffHours}h ago`
  } else {
    syncAge = `${diffDays}d ago`
  }

  // Consider stale if more than 1 hour old
  const isStale = diffMins > 60

  return {
    lastSyncedAt: updatedAt,
    isStale,
    syncAge,
  }
}
