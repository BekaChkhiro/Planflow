'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/lib/auth-api'
import type { ProjectLimits, SubscriptionTier, SubscriptionStatus } from '@planflow/shared'

export interface Project {
  id: string
  name: string
  description: string | null
  plan: string | null
  createdAt: string
  updatedAt: string
}

interface ProjectsResponse {
  success: boolean
  data: {
    projects: Project[]
    limits: ProjectLimits
  }
}

interface CreateProjectData {
  name: string
  description?: string
  plan?: string
}

interface CreateProjectResponse {
  success: boolean
  data: {
    project: Project
    limits: ProjectLimits
  }
}

interface DeleteProjectResponse {
  success: boolean
  data: {
    message: string
  }
}

// Error class for project limit errors
export class ProjectLimitError extends Error {
  code = 'PROJECT_LIMIT_REACHED' as const
  currentCount: number
  maxProjects: number
  tier: SubscriptionTier
  status: SubscriptionStatus

  constructor(
    message: string,
    details: {
      currentCount: number
      maxProjects: number
      tier: SubscriptionTier
      status: SubscriptionStatus
    }
  ) {
    super(message)
    this.name = 'ProjectLimitError'
    this.currentCount = details.currentCount
    this.maxProjects = details.maxProjects
    this.tier = details.tier
    this.status = details.status
  }
}

// Helper to format project limit display
export function formatProjectLimit(limits: ProjectLimits): string {
  if (limits.maxProjects === -1) {
    return `${limits.currentCount} projects`
  }
  return `${limits.currentCount}/${limits.maxProjects} projects`
}

// Helper to check if user is at project limit
export function isAtProjectLimit(limits: ProjectLimits): boolean {
  return !limits.canCreate
}

export const projectsQueryKey = ['projects']

export function useProjects() {
  return useQuery({
    queryKey: projectsQueryKey,
    queryFn: async () => {
      const response = await authApi.get<ProjectsResponse>('/projects')
      return {
        projects: response.data.projects,
        limits: response.data.limits,
      }
    },
  })
}

export function useCreateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateProjectData) => {
      try {
        const response = await authApi.post<CreateProjectResponse>('/projects', data)
        return response.data.project
      } catch (error: unknown) {
        // Check if this is a project limit error
        if (
          error &&
          typeof error === 'object' &&
          'response' in error &&
          error.response &&
          typeof error.response === 'object' &&
          'data' in error.response
        ) {
          const responseData = error.response.data as {
            code?: string
            error?: string
            details?: {
              currentCount: number
              maxProjects: number
              tier: SubscriptionTier
              status: SubscriptionStatus
            }
          }
          if (responseData.code === 'PROJECT_LIMIT_REACHED' && responseData.details) {
            throw new ProjectLimitError(responseData.error || 'Project limit reached', responseData.details)
          }
        }
        throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectsQueryKey })
    },
  })
}

export function useDeleteProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (projectId: string) => {
      await authApi.delete<DeleteProjectResponse>(`/projects/${projectId}`)
      return projectId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectsQueryKey })
    },
  })
}

// Single project query
interface ProjectResponse {
  success: boolean
  data: {
    project: Project
  }
}

export function projectQueryKey(projectId: string) {
  return ['project', projectId]
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: projectQueryKey(projectId),
    queryFn: async () => {
      const response = await authApi.get<ProjectResponse>(`/projects/${projectId}`)
      return response.data.project
    },
    enabled: !!projectId,
  })
}

// Update project mutation
interface UpdateProjectData {
  name?: string
  description?: string | null
  plan?: string | null
}

interface UpdateProjectResponse {
  success: boolean
  data: {
    project: Project
  }
}

export function useUpdateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, data }: { projectId: string; data: UpdateProjectData }) => {
      const response = await authApi.put<UpdateProjectResponse>(`/projects/${projectId}`, data)
      return response.data.project
    },
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: projectsQueryKey })
      queryClient.setQueryData(projectQueryKey(project.id), project)
    },
  })
}
