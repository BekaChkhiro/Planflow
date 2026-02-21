'use client'

import { useQuery } from '@tanstack/react-query'
import { authApi } from '@/lib/auth-api'
import { useMemo } from 'react'
import type { Activity, ActivityAction } from './use-activity'
import type { TeamMember, MemberRole } from './use-team'

// Analytics types
export interface MemberActivityStats {
  memberId: string
  memberName: string
  memberEmail: string
  actionsCount: number
  tasksCompleted: number
  commentsCreated: number
  lastActive: string | null
}

export interface ActivityTrend {
  date: string
  count: number
}

export interface ActionDistribution {
  action: ActivityAction
  count: number
  percentage: number
}

export interface RoleDistribution {
  role: MemberRole
  count: number
  percentage: number
}

export interface TeamAnalytics {
  totalMembers: number
  roleDistribution: RoleDistribution[]
  memberActivity: MemberActivityStats[]
  activityTrends: ActivityTrend[]
  actionDistribution: ActionDistribution[]
  totalActivities: number
  tasksCompleted: number
  commentsCreated: number
  activeToday: number
  activeThisWeek: number
}

interface ActivitiesResponse {
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

interface MembersResponse {
  success: boolean
  data: {
    members: TeamMember[]
  }
}

// Query key
export const teamAnalyticsQueryKey = (orgId: string) => ['organizations', orgId, 'analytics']

// Fetch all activities for an organization (paginated, get multiple pages)
async function fetchAllOrgActivities(orgId: string): Promise<Activity[]> {
  const allActivities: Activity[] = []
  let offset = 0
  const limit = 100
  let hasMore = true

  while (hasMore && offset < 500) { // Cap at 500 activities for performance
    const response = await authApi.get<ActivitiesResponse>(
      `/organizations/${orgId}/activity?limit=${limit}&offset=${offset}`
    )
    const { activities, pagination } = response.data
    allActivities.push(...activities)
    hasMore = pagination.hasMore
    offset += limit
  }

  return allActivities
}

// Get activities from the last N days
function getActivitiesInRange(activities: Activity[], days: number): Activity[] {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return activities.filter(a => new Date(a.createdAt) >= cutoff)
}

// Compute analytics from raw data
function computeAnalytics(
  members: TeamMember[],
  activities: Activity[]
): TeamAnalytics {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekAgo = new Date(now)
  weekAgo.setDate(weekAgo.getDate() - 7)

  // Role distribution
  const roleCount: Record<MemberRole, number> = {
    owner: 0,
    admin: 0,
    editor: 0,
    viewer: 0,
  }
  members.forEach(m => {
    roleCount[m.role] = (roleCount[m.role] || 0) + 1
  })

  const roleDistribution: RoleDistribution[] = (
    Object.entries(roleCount) as [MemberRole, number][]
  )
    .filter(([_, count]) => count > 0)
    .map(([role, count]) => ({
      role,
      count,
      percentage: members.length > 0 ? Math.round((count / members.length) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)

  // Member activity stats
  const memberActivityMap = new Map<string, MemberActivityStats>()
  members.forEach(m => {
    memberActivityMap.set(m.userId, {
      memberId: m.userId,
      memberName: m.userName || m.userEmail,
      memberEmail: m.userEmail,
      actionsCount: 0,
      tasksCompleted: 0,
      commentsCreated: 0,
      lastActive: null,
    })
  })

  // Count activities per member
  let totalTasksCompleted = 0
  let totalCommentsCreated = 0
  const activeToday = new Set<string>()
  const activeThisWeek = new Set<string>()

  activities.forEach(activity => {
    const stats = memberActivityMap.get(activity.actor.id)
    if (stats) {
      stats.actionsCount++

      if (!stats.lastActive || new Date(activity.createdAt) > new Date(stats.lastActive)) {
        stats.lastActive = activity.createdAt
      }

      if (activity.action === 'task_status_changed') {
        const newStatus = activity.metadata?.['newStatus'] as string | undefined
        if (newStatus === 'DONE') {
          stats.tasksCompleted++
          totalTasksCompleted++
        }
      }

      if (activity.action === 'comment_created') {
        stats.commentsCreated++
        totalCommentsCreated++
      }

      const activityDate = new Date(activity.createdAt)
      if (activityDate >= todayStart) {
        activeToday.add(activity.actor.id)
      }
      if (activityDate >= weekAgo) {
        activeThisWeek.add(activity.actor.id)
      }
    }
  })

  const memberActivity = Array.from(memberActivityMap.values())
    .sort((a, b) => b.actionsCount - a.actionsCount)

  // Activity trends (last 14 days)
  const trendMap = new Map<string, number>()
  for (let i = 13; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    if (dateStr) {
      trendMap.set(dateStr, 0)
    }
  }

  activities.forEach(activity => {
    const dateStr = activity.createdAt.split('T')[0]
    if (dateStr && trendMap.has(dateStr)) {
      trendMap.set(dateStr, (trendMap.get(dateStr) || 0) + 1)
    }
  })

  const activityTrends: ActivityTrend[] = Array.from(trendMap.entries())
    .map(([date, count]) => ({ date, count }))

  // Action distribution
  const actionCount = new Map<ActivityAction, number>()
  activities.forEach(activity => {
    actionCount.set(activity.action, (actionCount.get(activity.action) || 0) + 1)
  })

  const actionDistribution: ActionDistribution[] = Array.from(actionCount.entries())
    .map(([action, count]) => ({
      action,
      count,
      percentage: activities.length > 0 ? Math.round((count / activities.length) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)

  return {
    totalMembers: members.length,
    roleDistribution,
    memberActivity,
    activityTrends,
    actionDistribution,
    totalActivities: activities.length,
    tasksCompleted: totalTasksCompleted,
    commentsCreated: totalCommentsCreated,
    activeToday: activeToday.size,
    activeThisWeek: activeThisWeek.size,
  }
}

/**
 * Hook to fetch and compute team analytics
 */
export function useTeamAnalytics(organizationId: string | undefined) {
  // Fetch members
  const membersQuery = useQuery({
    queryKey: ['organizations', organizationId, 'members'],
    queryFn: async () => {
      if (!organizationId) return []
      const response = await authApi.get<MembersResponse>(
        `/organizations/${organizationId}/members`
      )
      return response.data.members
    },
    enabled: !!organizationId,
    staleTime: 60000,
  })

  // Fetch activities
  const activitiesQuery = useQuery({
    queryKey: ['organizations', organizationId, 'all-activities'],
    queryFn: async () => {
      if (!organizationId) return []
      return fetchAllOrgActivities(organizationId)
    },
    enabled: !!organizationId,
    staleTime: 60000,
  })

  // Compute analytics
  const analytics = useMemo(() => {
    if (!membersQuery.data || !activitiesQuery.data) {
      return null
    }
    return computeAnalytics(membersQuery.data, activitiesQuery.data)
  }, [membersQuery.data, activitiesQuery.data])

  return {
    data: analytics,
    isLoading: membersQuery.isLoading || activitiesQuery.isLoading,
    error: membersQuery.error || activitiesQuery.error,
    refetch: () => {
      membersQuery.refetch()
      activitiesQuery.refetch()
    },
  }
}

/**
 * Get a friendly label for an activity action
 */
export function getActionLabel(action: ActivityAction): string {
  const labels: Record<ActivityAction, string> = {
    task_created: 'Tasks Created',
    task_updated: 'Tasks Updated',
    task_deleted: 'Tasks Deleted',
    task_status_changed: 'Status Changes',
    task_assigned: 'Assignments',
    task_unassigned: 'Unassignments',
    comment_created: 'Comments',
    comment_updated: 'Comments Edited',
    comment_deleted: 'Comments Deleted',
    project_created: 'Projects Created',
    project_updated: 'Projects Updated',
    project_deleted: 'Projects Deleted',
    plan_updated: 'Plans Updated',
    member_invited: 'Invitations Sent',
    member_joined: 'Members Joined',
    member_removed: 'Members Removed',
    member_role_changed: 'Role Changes',
  }
  return labels[action] || action
}

/**
 * Get color for an activity action (for charts)
 */
export function getActionChartColor(action: ActivityAction): string {
  const colors: Record<string, string> = {
    task_created: '#22c55e',
    task_updated: '#3b82f6',
    task_deleted: '#ef4444',
    task_status_changed: '#8b5cf6',
    task_assigned: '#ec4899',
    task_unassigned: '#f97316',
    comment_created: '#eab308',
    comment_updated: '#f59e0b',
    comment_deleted: '#dc2626',
    project_created: '#10b981',
    project_updated: '#06b6d4',
    project_deleted: '#b91c1c',
    plan_updated: '#6366f1',
    member_invited: '#14b8a6',
    member_joined: '#84cc16',
    member_removed: '#f43f5e',
    member_role_changed: '#a855f7',
  }
  return colors[action] || '#6b7280'
}
