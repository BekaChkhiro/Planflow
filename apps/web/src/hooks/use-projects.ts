'use client'

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/lib/auth-api'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/error-utils'
import type { ProjectLimits, SubscriptionTier, SubscriptionStatus } from '@planflow/shared'

export interface Project {
  id: string
  name: string
  description: string | null
  plan: string | null
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export interface PaginationMeta {
  page: number
  limit: number
  totalCount: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

interface ProjectsResponse {
  success: boolean
  data: {
    projects: Project[]
    limits: ProjectLimits
    archivedCount?: number
    pagination?: PaginationMeta
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

// Default page size for pagination
export const PROJECTS_PAGE_SIZE = 20

// Archive filter type: 'active' (default), 'archived', or 'all'
export type ArchiveFilter = 'active' | 'archived' | 'all'

// Search options for projects
export interface UseProjectsOptions {
  search?: string
  limit?: number
  archived?: ArchiveFilter
}

// Standard query for getting all projects with optional search and archive filter
export function useProjects(options: UseProjectsOptions = {}) {
  const { search, limit = 100, archived = 'active' } = options

  return useQuery({
    queryKey: search
      ? [...projectsQueryKey, { search, archived }]
      : [...projectsQueryKey, { archived }],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      params.set('archived', archived)
      if (search?.trim()) {
        params.set('search', search.trim())
      }

      const response = await authApi.get<ProjectsResponse>(`/projects?${params.toString()}`)
      return {
        projects: response.data.projects,
        limits: response.data.limits,
        archivedCount: response.data.archivedCount,
        pagination: response.data.pagination,
      }
    },
  })
}

// Infinite query for paginated projects with "Load More" support, search, and archive filter
export interface UseProjectsInfiniteOptions {
  search?: string
  pageSize?: number
  archived?: ArchiveFilter
}

export function useProjectsInfinite(options: UseProjectsInfiniteOptions = {}) {
  const { search, pageSize = PROJECTS_PAGE_SIZE, archived = 'active' } = options

  return useInfiniteQuery({
    queryKey: search
      ? [...projectsQueryKey, 'infinite', pageSize, { search, archived }]
      : [...projectsQueryKey, 'infinite', pageSize, { archived }],
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams()
      params.set('page', String(pageParam))
      params.set('limit', String(pageSize))
      params.set('archived', archived)
      if (search?.trim()) {
        params.set('search', search.trim())
      }

      const response = await authApi.get<ProjectsResponse>(`/projects?${params.toString()}`)
      return {
        projects: response.data.projects,
        limits: response.data.limits,
        archivedCount: response.data.archivedCount,
        pagination: response.data.pagination,
      }
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.pagination?.hasNextPage) {
        return (lastPage.pagination.page || 1) + 1
      }
      return undefined
    },
    getPreviousPageParam: (firstPage) => {
      if (firstPage.pagination?.hasPrevPage) {
        return (firstPage.pagination.page || 1) - 1
      }
      return undefined
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
      // Invalidate both standard and infinite queries
      queryClient.invalidateQueries({ queryKey: projectsQueryKey })
    },
    onError: (error: unknown) => {
      // Don't show toast for ProjectLimitError - handled by UI
      if (error instanceof ProjectLimitError) return
      toast.error(getErrorMessage(error))
    },
  })
}

// Archive project (soft delete)
export function useArchiveProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (projectId: string) => {
      const response = await authApi.delete<{
        success: boolean
        data: { message: string; project: { id: string; name: string; archivedAt: string } }
      }>(`/projects/${projectId}`)
      return response.data.project
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectsQueryKey })
      toast.success('Project archived')
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error))
    },
  })
}

// Restore an archived project
export function useRestoreProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (projectId: string) => {
      const response = await authApi.post<{
        success: boolean
        data: { message: string; project: Project }
      }>(`/projects/${projectId}/restore`)
      return response.data.project
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectsQueryKey })
      toast.success('Project restored')
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error))
    },
  })
}

// Permanently delete an archived project
export function usePermanentDeleteProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (projectId: string) => {
      await authApi.delete<DeleteProjectResponse>(`/projects/${projectId}?permanent=true`)
      return projectId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectsQueryKey })
      toast.success('Project permanently deleted')
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error))
    },
  })
}

// Legacy alias for backward compatibility (now does soft delete/archive)
export const useDeleteProject = useArchiveProject

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
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error))
    },
  })
}

// Assignee info returned from API
export interface TaskAssignee {
  id: string
  email: string
  name: string | null
}

// Task interface matching API response
export interface Task {
  id: string
  taskId: string
  name: string
  description: string | null
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'
  complexity: 'Low' | 'Medium' | 'High'
  estimatedHours: number | null
  dependencies: string[]
  displayOrder?: number // For drag-and-drop ordering (T14.3)
  assigneeId: string | null
  assignedBy: string | null
  assignedAt: string | null
  assignee: TaskAssignee | null
  createdAt: string
  updatedAt: string
}

interface TasksResponse {
  success: boolean
  data: {
    projectId: string
    projectName: string
    tasks: Task[]
  }
}

export function projectTasksQueryKey(projectId: string) {
  return ['project', projectId, 'tasks']
}

export function useProjectTasks(projectId: string) {
  return useQuery({
    queryKey: projectTasksQueryKey(projectId),
    queryFn: async () => {
      const response = await authApi.get<TasksResponse>(`/projects/${projectId}/tasks`)
      return response.data.tasks
    },
    enabled: !!projectId,
  })
}

// Assign task mutation
interface AssignTaskResponse {
  success: boolean
  data: {
    task: Task
  }
}

export function useAssignTask(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ taskId, assigneeId }: { taskId: string; assigneeId: string | null }) => {
      const response = await authApi.post<AssignTaskResponse>(
        `/projects/${projectId}/tasks/${taskId}/assign`,
        { assigneeId }
      )
      return response.data.task
    },
    onSuccess: () => {
      // Invalidate tasks query to refetch with updated assignee
      queryClient.invalidateQueries({ queryKey: projectTasksQueryKey(projectId) })
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error))
    },
  })
}

// Duplicate task mutation (T14.4)
interface DuplicateTaskResponse {
  success: boolean
  data: {
    projectId: string
    projectName: string
    originalTaskId: string
    task: Task
  }
}

export function useDuplicateTask(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ taskId, name }: { taskId: string; name?: string }) => {
      const response = await authApi.post<DuplicateTaskResponse>(
        `/projects/${projectId}/tasks/${taskId}/duplicate`,
        name ? { name } : {}
      )
      return response.data
    },
    onSuccess: (data) => {
      // Invalidate tasks query to refetch with the new duplicated task
      queryClient.invalidateQueries({ queryKey: projectTasksQueryKey(projectId) })
      toast.success(`Task duplicated as ${data.task.taskId}`)
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error))
    },
  })
}

// Reorder tasks mutation (T14.3 - Drag and Drop)
interface ReorderTasksResponse {
  success: boolean
  data: {
    projectId: string
    projectName: string
    updatedCount: number
    tasks: Array<{ taskId: string; displayOrder: number; status?: string }>
  }
}

export interface TaskReorderItem {
  taskId: string
  displayOrder: number
  status?: string
}

export function useReorderTasks(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (tasks: TaskReorderItem[]) => {
      const response = await authApi.post<ReorderTasksResponse>(
        `/projects/${projectId}/tasks/reorder`,
        { tasks }
      )
      return response.data
    },
    onMutate: async (tasks) => {
      // Optimistic update: update task order in cache
      await queryClient.cancelQueries({ queryKey: projectTasksQueryKey(projectId) })

      const previousTasks = queryClient.getQueryData<Task[]>(projectTasksQueryKey(projectId))

      if (previousTasks) {
        const updatedTasks = previousTasks.map(task => {
          const update = tasks.find(t => t.taskId === task.taskId)
          if (update) {
            return {
              ...task,
              displayOrder: update.displayOrder,
              status: update.status || task.status,
            }
          }
          return task
        })
        queryClient.setQueryData(projectTasksQueryKey(projectId), updatedTasks)
      }

      return { previousTasks }
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousTasks) {
        queryClient.setQueryData(projectTasksQueryKey(projectId), context.previousTasks)
      }
      toast.error(getErrorMessage(error))
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: projectTasksQueryKey(projectId) })
    },
  })
}
