'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/hooks/use-toast'
import { authApi } from '@/lib/auth-api'
import type { TaskStatus } from '@/components/tasks'

// Query key helpers
const projectTasksQueryKey = (projectId: string) => ['project-tasks', projectId]

// Types for bulk operations
export interface BulkStatusUpdateRequest {
  taskIds: string[]
  status: TaskStatus
}

export interface BulkAssignRequest {
  taskIds: string[]
  assigneeId: string | null
}

export interface BulkDeleteRequest {
  taskIds: string[]
}

// API response types (with success and data wrapper)
interface BulkStatusUpdateResponse {
  success: boolean
  data: BulkStatusUpdateData
}

interface BulkStatusUpdateData {
  projectId: string
  projectName: string
  updatedCount: number
  status: TaskStatus
  tasks: Array<{
    id: string
    taskId: string
    name: string
    status: TaskStatus
    updatedAt: string
  }>
}

interface BulkAssignResponse {
  success: boolean
  data: BulkAssignData
}

interface BulkAssignData {
  projectId: string
  projectName: string
  updatedCount: number
  assignee: { id: string; email: string; name: string | null } | null
  tasks: Array<{
    id: string
    taskId: string
    name: string
    assigneeId: string | null
    assignedBy: string | null
    assignedAt: string | null
    assignee: { id: string; email: string; name: string | null } | null
    updatedAt: string
  }>
}

interface BulkDeleteResponse {
  success: boolean
  data: BulkDeleteData
}

interface BulkDeleteData {
  projectId: string
  projectName: string
  deletedCount: number
  deletedTasks: Array<{
    id: string
    taskId: string
    name: string
  }>
}

// Hook for bulk status update
export function useBulkStatusUpdate(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ taskIds, status }: BulkStatusUpdateRequest) => {
      const response = await authApi.post<BulkStatusUpdateResponse>(
        `/projects/${projectId}/tasks/bulk-status`,
        { taskIds, status }
      )
      return response.data
    },
    onSuccess: (data: BulkStatusUpdateData) => {
      queryClient.invalidateQueries({ queryKey: projectTasksQueryKey(projectId) })
      const statusLabels: Record<TaskStatus, string> = {
        TODO: 'To Do',
        IN_PROGRESS: 'In Progress',
        DONE: 'Done',
        BLOCKED: 'Blocked',
      }
      const statusLabel = statusLabels[data.status]
      toast.success(`${data.updatedCount} task${data.updatedCount > 1 ? 's' : ''} marked as ${statusLabel}`)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update task statuses')
    },
  })
}

// Hook for bulk assignment
export function useBulkAssign(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ taskIds, assigneeId }: BulkAssignRequest) => {
      const response = await authApi.post<BulkAssignResponse>(
        `/projects/${projectId}/tasks/bulk-assign`,
        { taskIds, assigneeId }
      )
      return response.data
    },
    onSuccess: (data: BulkAssignData) => {
      queryClient.invalidateQueries({ queryKey: projectTasksQueryKey(projectId) })
      if (data.assignee) {
        toast.success(
          `${data.updatedCount} task${data.updatedCount > 1 ? 's' : ''} assigned to ${data.assignee.name || data.assignee.email}`
        )
      } else {
        toast.success(
          `${data.updatedCount} task${data.updatedCount > 1 ? 's' : ''} unassigned`
        )
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to assign tasks')
    },
  })
}

// Hook for bulk delete
export function useBulkDelete(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ taskIds }: BulkDeleteRequest) => {
      const response = await authApi.post<BulkDeleteResponse>(
        `/projects/${projectId}/tasks/bulk-delete`,
        { taskIds }
      )
      return response.data
    },
    onSuccess: (data: BulkDeleteData) => {
      queryClient.invalidateQueries({ queryKey: projectTasksQueryKey(projectId) })
      toast.success(
        `${data.deletedCount} task${data.deletedCount > 1 ? 's' : ''} deleted`
      )
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete tasks')
    },
  })
}
