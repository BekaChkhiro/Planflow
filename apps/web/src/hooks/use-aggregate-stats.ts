'use client'

import { useQuery } from '@tanstack/react-query'
import { authApi } from '@/lib/auth-api'
import { useOrganizationContext } from './use-organization-context'

// Response types
interface TaskStatsResponse {
  success: boolean
  data: {
    stats: {
      total: number
      todo: number
      inProgress: number
      done: number
      blocked: number
    }
  }
}

interface ProjectsResponse {
  success: boolean
  data: {
    projects: Array<{
      id: string
      name: string
    }>
  }
}

interface ProjectTasksResponse {
  success: boolean
  data: {
    tasks: Array<{
      id: string
      status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'
    }>
  }
}

export interface AggregateStats {
  totalTasks: number
  completedTasks: number
  inProgressTasks: number
  blockedTasks: number
}

/**
 * Hook to get aggregated task statistics across all projects in the current organization
 */
export function useAggregateStats() {
  const { currentOrganizationId } = useOrganizationContext()

  return useQuery({
    queryKey: ['aggregate-stats', currentOrganizationId],
    queryFn: async (): Promise<AggregateStats> => {
      if (!currentOrganizationId) {
        return {
          totalTasks: 0,
          completedTasks: 0,
          inProgressTasks: 0,
          blockedTasks: 0,
        }
      }

      // First try to get stats from API if available
      try {
        const response = await authApi.get<TaskStatsResponse>(
          `/organizations/${currentOrganizationId}/stats`
        )
        if (response.data?.stats) {
          return {
            totalTasks: response.data.stats.total,
            completedTasks: response.data.stats.done,
            inProgressTasks: response.data.stats.inProgress,
            blockedTasks: response.data.stats.blocked,
          }
        }
      } catch {
        // Stats endpoint not available, calculate manually
      }

      // Fallback: Calculate stats from projects
      try {
        const projectsResponse = await authApi.get<ProjectsResponse>(
          `/projects?organizationId=${currentOrganizationId}`
        )
        const projects = projectsResponse.data?.projects || []

        let totalTasks = 0
        let completedTasks = 0
        let inProgressTasks = 0
        let blockedTasks = 0

        // Fetch tasks from each project (limit to first 5 for performance)
        for (const project of projects.slice(0, 5)) {
          try {
            const tasksResponse = await authApi.get<ProjectTasksResponse>(
              `/projects/${project.id}/tasks`
            )
            const tasks = tasksResponse.data?.tasks || []

            totalTasks += tasks.length
            completedTasks += tasks.filter(t => t.status === 'DONE').length
            inProgressTasks += tasks.filter(t => t.status === 'IN_PROGRESS').length
            blockedTasks += tasks.filter(t => t.status === 'BLOCKED').length
          } catch {
            // Skip projects with access errors
          }
        }

        return {
          totalTasks,
          completedTasks,
          inProgressTasks,
          blockedTasks,
        }
      } catch {
        return {
          totalTasks: 0,
          completedTasks: 0,
          inProgressTasks: 0,
          blockedTasks: 0,
        }
      }
    },
    enabled: !!currentOrganizationId,
    staleTime: 60000, // 1 minute
    refetchOnWindowFocus: false,
  })
}
