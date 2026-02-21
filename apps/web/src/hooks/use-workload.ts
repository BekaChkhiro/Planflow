'use client'

import { useQuery } from '@tanstack/react-query'
import { authApi } from '@/lib/auth-api'
import { useTeamMembers, type TeamMember, type MemberRole } from './use-team'
import { type Task, type TaskAssignee } from './use-projects'

// Workload status types
export type WorkloadStatus = 'light' | 'balanced' | 'heavy' | 'overloaded'

// Task status distribution for a member
export interface TaskStatusBreakdown {
  done: number
  inProgress: number
  blocked: number
  todo: number
}

// Workload data for a single team member
export interface MemberWorkload {
  memberId: string
  userId: string
  name: string
  email: string
  role: MemberRole
  taskCount: number
  completedCount: number
  inProgressCount: number
  blockedCount: number
  todoCount: number
  estimatedHours: number
  completedHours: number
  completionRate: number
  workloadStatus: WorkloadStatus
  statusBreakdown: TaskStatusBreakdown
  currentTasks: {
    taskId: string
    name: string
    status: Task['status']
  }[]
}

// Team workload summary
export interface TeamWorkloadSummary {
  totalTasks: number
  assignedTasks: number
  unassignedTasks: number
  averageTasksPerMember: number
  membersOverloaded: number
  membersAvailable: number
  totalEstimatedHours: number
  completedHours: number
}

// Response types
interface ProjectTasksResponse {
  success: boolean
  data: {
    tasks: Task[]
  }
}

interface OrganizationProjectsResponse {
  success: boolean
  data: {
    projects: Array<{
      id: string
      name: string
      organizationId: string
    }>
  }
}

// Thresholds for workload status
const WORKLOAD_THRESHOLDS = {
  light: 3, // 0-3 tasks
  balanced: 6, // 4-6 tasks
  heavy: 10, // 7-10 tasks
  // > 10 tasks = overloaded
}

// Calculate workload status based on task count
function getWorkloadStatus(taskCount: number): WorkloadStatus {
  if (taskCount <= WORKLOAD_THRESHOLDS.light) return 'light'
  if (taskCount <= WORKLOAD_THRESHOLDS.balanced) return 'balanced'
  if (taskCount <= WORKLOAD_THRESHOLDS.heavy) return 'heavy'
  return 'overloaded'
}

// Get color for workload status
export function getWorkloadStatusColor(status: WorkloadStatus): string {
  switch (status) {
    case 'light':
      return 'text-green-600 bg-green-100'
    case 'balanced':
      return 'text-blue-600 bg-blue-100'
    case 'heavy':
      return 'text-yellow-600 bg-yellow-100'
    case 'overloaded':
      return 'text-red-600 bg-red-100'
  }
}

// Get label for workload status
export function getWorkloadStatusLabel(status: WorkloadStatus): string {
  switch (status) {
    case 'light':
      return 'Available'
    case 'balanced':
      return 'Balanced'
    case 'heavy':
      return 'Busy'
    case 'overloaded':
      return 'Overloaded'
  }
}

// Query key
export const workloadQueryKey = (organizationId: string) => ['organization', organizationId, 'workload']

/**
 * Hook to compute team workload data
 * Combines team members with their assigned tasks across all organization projects
 */
export function useTeamWorkload(organizationId: string | undefined) {
  // Get team members
  const { data: members, isLoading: membersLoading } = useTeamMembers(organizationId)

  // Fetch all organization projects and their tasks
  return useQuery({
    queryKey: workloadQueryKey(organizationId || ''),
    queryFn: async (): Promise<{
      members: MemberWorkload[]
      summary: TeamWorkloadSummary
      unassignedTasks: Task[]
    }> => {
      if (!organizationId || !members) {
        return {
          members: [],
          summary: {
            totalTasks: 0,
            assignedTasks: 0,
            unassignedTasks: 0,
            averageTasksPerMember: 0,
            membersOverloaded: 0,
            membersAvailable: 0,
            totalEstimatedHours: 0,
            completedHours: 0,
          },
          unassignedTasks: [],
        }
      }

      // Fetch organization projects
      const projectsResponse = await authApi.get<OrganizationProjectsResponse>(
        `/organizations/${organizationId}/projects`
      )
      const projects = projectsResponse.data?.projects || []

      // Fetch tasks from all projects
      const allTasks: Task[] = []
      for (const project of projects) {
        try {
          const tasksResponse = await authApi.get<ProjectTasksResponse>(
            `/projects/${project.id}/tasks`
          )
          allTasks.push(...(tasksResponse.data?.tasks || []))
        } catch {
          // Skip projects with no access
        }
      }

      // Group tasks by assignee
      const tasksByAssignee = new Map<string, Task[]>()
      const unassignedTasks: Task[] = []

      for (const task of allTasks) {
        if (task.assigneeId) {
          const existing = tasksByAssignee.get(task.assigneeId) || []
          existing.push(task)
          tasksByAssignee.set(task.assigneeId, existing)
        } else {
          unassignedTasks.push(task)
        }
      }

      // Build workload data for each member
      const memberWorkloads: MemberWorkload[] = members.map((member) => {
        const memberTasks = tasksByAssignee.get(member.userId) || []

        const done = memberTasks.filter((t) => t.status === 'DONE').length
        const inProgress = memberTasks.filter((t) => t.status === 'IN_PROGRESS').length
        const blocked = memberTasks.filter((t) => t.status === 'BLOCKED').length
        const todo = memberTasks.filter((t) => t.status === 'TODO').length

        const activeTasks = memberTasks.filter((t) => t.status !== 'DONE')
        const totalEstimated = memberTasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0)
        const completedEstimated = memberTasks
          .filter((t) => t.status === 'DONE')
          .reduce((sum, t) => sum + (t.estimatedHours || 0), 0)

        return {
          memberId: member.id,
          userId: member.userId,
          name: member.userName || member.userEmail,
          email: member.userEmail,
          role: member.role,
          taskCount: activeTasks.length,
          completedCount: done,
          inProgressCount: inProgress,
          blockedCount: blocked,
          todoCount: todo,
          estimatedHours: totalEstimated,
          completedHours: completedEstimated,
          completionRate: memberTasks.length > 0 ? Math.round((done / memberTasks.length) * 100) : 0,
          workloadStatus: getWorkloadStatus(activeTasks.length),
          statusBreakdown: { done, inProgress, blocked, todo },
          currentTasks: activeTasks.slice(0, 5).map((t) => ({
            taskId: t.taskId,
            name: t.name,
            status: t.status,
          })),
        }
      })

      // Sort by workload (heaviest first)
      memberWorkloads.sort((a, b) => b.taskCount - a.taskCount)

      // Calculate summary
      const totalAssigned = allTasks.filter((t) => t.assigneeId).length
      const summary: TeamWorkloadSummary = {
        totalTasks: allTasks.length,
        assignedTasks: totalAssigned,
        unassignedTasks: unassignedTasks.length,
        averageTasksPerMember:
          members.length > 0 ? Math.round((totalAssigned / members.length) * 10) / 10 : 0,
        membersOverloaded: memberWorkloads.filter((m) => m.workloadStatus === 'overloaded').length,
        membersAvailable: memberWorkloads.filter((m) => m.workloadStatus === 'light').length,
        totalEstimatedHours: allTasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0),
        completedHours: allTasks
          .filter((t) => t.status === 'DONE')
          .reduce((sum, t) => sum + (t.estimatedHours || 0), 0),
      }

      return {
        members: memberWorkloads,
        summary,
        unassignedTasks,
      }
    },
    enabled: !!organizationId && !!members && members.length > 0,
    staleTime: 30000, // 30 seconds
  })
}
