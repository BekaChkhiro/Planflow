'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Users,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  ArrowLeft,
  Building2,
  Loader2,
  XCircle,
  CircleDot,
  ListTodo,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { WorkloadBar } from '@/components/ui/workload-bar'
import { TaskDistributionBar } from '@/components/ui/task-distribution-bar'

import {
  useTeamWorkload,
  getWorkloadStatusColor,
  getWorkloadStatusLabel,
  type MemberWorkload,
  type WorkloadStatus,
} from '@/hooks/use-workload'
import {
  useOrganizations,
  getInitials,
  getRoleLabel,
  getRoleBadgeVariant,
} from '@/hooks/use-team'

// Status icon component
function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'DONE':
      return <CheckCircle2 className="h-3 w-3 text-green-500" />
    case 'IN_PROGRESS':
      return <Clock className="h-3 w-3 text-blue-500" />
    case 'BLOCKED':
      return <XCircle className="h-3 w-3 text-red-500" />
    default:
      return <CircleDot className="h-3 w-3 text-gray-400" />
  }
}

// Workload status badge component
function WorkloadStatusBadge({ status }: { status: WorkloadStatus }) {
  const colorClass = getWorkloadStatusColor(status)
  const label = getWorkloadStatusLabel(status)

  return (
    <Badge variant="outline" className={colorClass}>
      {status === 'overloaded' && <AlertTriangle className="mr-1 h-3 w-3" />}
      {status === 'light' && <CheckCircle2 className="mr-1 h-3 w-3" />}
      {label}
    </Badge>
  )
}

// Member workload card component
function MemberWorkloadCard({ member }: { member: MemberWorkload }) {
  const totalTasks =
    member.completedCount + member.inProgressCount + member.blockedCount + member.todoCount

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-blue-100 text-blue-700 text-sm font-medium">
                {getInitials(member.name, member.email)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900">{member.name}</span>
                <Badge variant={getRoleBadgeVariant(member.role)} className="text-xs">
                  {getRoleLabel(member.role)}
                </Badge>
              </div>
              <span className="text-sm text-gray-500">{member.email}</span>
            </div>
          </div>
          <WorkloadStatusBadge status={member.workloadStatus} />
        </div>

        {/* Workload bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Active Tasks</span>
            <span className="text-sm font-bold text-gray-900">{member.taskCount}</span>
          </div>
          <WorkloadBar
            current={member.taskCount}
            max={10}
            status={member.workloadStatus}
            showLabel={false}
          />
        </div>

        {/* Task status distribution */}
        {totalTasks > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">All Tasks</span>
              <span className="text-sm text-gray-500">{totalTasks} total</span>
            </div>
            <TaskDistributionBar
              done={member.completedCount}
              inProgress={member.inProgressCount}
              blocked={member.blockedCount}
              todo={member.todoCount}
              showLegend={false}
            />
          </div>
        )}

        {/* Stats grid */}
        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="rounded-lg bg-green-50 p-2">
                  <div className="text-lg font-bold text-green-600">{member.completedCount}</div>
                  <div className="text-xs text-green-600">Done</div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Completed tasks</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="rounded-lg bg-blue-50 p-2">
                  <div className="text-lg font-bold text-blue-600">{member.inProgressCount}</div>
                  <div className="text-xs text-blue-600">Active</div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Tasks in progress</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="rounded-lg bg-red-50 p-2">
                  <div className="text-lg font-bold text-red-600">{member.blockedCount}</div>
                  <div className="text-xs text-red-600">Blocked</div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Blocked tasks</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="rounded-lg bg-gray-50 p-2">
                  <div className="text-lg font-bold text-gray-600">{member.todoCount}</div>
                  <div className="text-xs text-gray-600">To Do</div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Pending tasks</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Current tasks */}
        {member.currentTasks.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-medium text-gray-500 mb-2">Current Tasks</div>
            <div className="space-y-1">
              {member.currentTasks.slice(0, 3).map((task) => (
                <div
                  key={task.taskId}
                  className="flex items-center gap-2 text-sm text-gray-600"
                >
                  <StatusIcon status={task.status} />
                  <span className="font-mono text-xs text-gray-400">{task.taskId}</span>
                  <span className="truncate">{task.name}</span>
                </div>
              ))}
              {member.currentTasks.length > 3 && (
                <div className="text-xs text-gray-400">
                  +{member.currentTasks.length - 3} more tasks
                </div>
              )}
            </div>
          </div>
        )}

        {/* Completion rate */}
        {totalTasks > 0 && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-gray-500">Completion Rate</span>
            <span className="font-medium text-gray-900">{member.completionRate}%</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Summary stat card component
function StatCard({
  title,
  value,
  icon: Icon,
  description,
  trend,
  trendUp,
}: {
  title: string
  value: string | number
  icon: React.ElementType
  description?: string
  trend?: string
  trendUp?: boolean
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">{title}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
            {description && <p className="mt-1 text-xs text-gray-500">{description}</p>}
          </div>
          <div className="rounded-full bg-blue-100 p-3">
            <Icon className="h-5 w-5 text-blue-600" />
          </div>
        </div>
        {trend && (
          <div className="mt-3 flex items-center text-sm">
            <TrendingUp
              className={`mr-1 h-4 w-4 ${trendUp ? 'text-green-500' : 'text-red-500'}`}
            />
            <span className={trendUp ? 'text-green-600' : 'text-red-600'}>{trend}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Loading skeleton
function WorkloadPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-80" />
        ))}
      </div>
    </div>
  )
}

// Empty state
function EmptyState({ hasOrganization }: { hasOrganization: boolean }) {
  if (!hasOrganization) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-gray-100 p-4">
          <Building2 className="h-8 w-8 text-gray-400" />
        </div>
        <h3 className="mt-4 text-lg font-medium text-gray-900">No organizations</h3>
        <p className="mt-2 max-w-sm text-sm text-gray-500">
          You need to be part of an organization to view team workload.
        </p>
        <Link href="/dashboard/team">
          <Button className="mt-6">Go to Team</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-gray-100 p-4">
        <BarChart3 className="h-8 w-8 text-gray-400" />
      </div>
      <h3 className="mt-4 text-lg font-medium text-gray-900">No workload data</h3>
      <p className="mt-2 max-w-sm text-sm text-gray-500">
        There are no tasks assigned to team members yet. Start by creating tasks and assigning
        them to team members.
      </p>
    </div>
  )
}

// Main page component
export default function WorkloadPage() {
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)

  // Fetch organizations
  const { data: organizations, isLoading: orgsLoading, error: orgsError } = useOrganizations()

  // Auto-select first organization
  const currentOrgId = selectedOrgId || organizations?.[0]?.id

  // Fetch workload data
  const { data: workloadData, isLoading: workloadLoading } = useTeamWorkload(currentOrgId)

  // Loading state
  if (orgsLoading) {
    return <WorkloadPageSkeleton />
  }

  // Error state
  if (orgsError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-red-100 p-4">
          <AlertTriangle className="h-8 w-8 text-red-600" />
        </div>
        <h3 className="mt-4 text-lg font-medium text-gray-900">Failed to load workload</h3>
        <p className="mt-2 text-sm text-gray-500">
          There was an error loading workload data. Please try again.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    )
  }

  // No organizations
  if (!organizations || organizations.length === 0) {
    return <EmptyState hasOrganization={false} />
  }

  const { members = [], summary, unassignedTasks = [] } = workloadData || {}

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard/team">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">Team Workload</h1>
              <p className="text-sm text-gray-500">
                Monitor task distribution and team capacity
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Organization selector */}
          {organizations.length > 1 && (
            <Select value={currentOrgId} onValueChange={setSelectedOrgId}>
              <SelectTrigger className="w-[200px]">
                <Building2 className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Select organization" />
              </SelectTrigger>
              <SelectContent>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Loading workload data */}
      {workloadLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-3 text-gray-500">Loading workload data...</span>
        </div>
      )}

      {/* Workload content */}
      {!workloadLoading && summary && (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Tasks"
              value={summary.totalTasks}
              icon={ListTodo}
              description={`${summary.assignedTasks} assigned`}
            />
            <StatCard
              title="Unassigned"
              value={summary.unassignedTasks}
              icon={AlertTriangle}
              description="Tasks need owners"
            />
            <StatCard
              title="Avg per Member"
              value={summary.averageTasksPerMember}
              icon={Users}
              description="tasks per person"
            />
            <StatCard
              title="Team Capacity"
              value={`${summary.membersAvailable}/${members.length}`}
              icon={CheckCircle2}
              description="members available"
            />
          </div>

          {/* Alerts */}
          {summary.membersOverloaded > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <div>
                  <p className="font-medium text-red-800">
                    {summary.membersOverloaded} team member
                    {summary.membersOverloaded > 1 ? 's are' : ' is'} overloaded
                  </p>
                  <p className="text-sm text-red-600">
                    Consider redistributing tasks or adjusting deadlines
                  </p>
                </div>
              </div>
            </div>
          )}

          {summary.unassignedTasks > 0 && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                <div>
                  <p className="font-medium text-yellow-800">
                    {summary.unassignedTasks} task{summary.unassignedTasks > 1 ? 's are' : ' is'}{' '}
                    unassigned
                  </p>
                  <p className="text-sm text-yellow-600">
                    Assign these tasks to team members to track progress
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Member workload cards */}
          {members.length > 0 ? (
            <div>
              <h2 className="mb-4 text-lg font-semibold text-gray-900">
                Team Members ({members.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {members.map((member) => (
                  <MemberWorkloadCard key={member.memberId} member={member} />
                ))}
              </div>
            </div>
          ) : (
            <EmptyState hasOrganization={true} />
          )}

          {/* Unassigned tasks section */}
          {unassignedTasks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ListTodo className="h-5 w-5" />
                  Unassigned Tasks
                  <Badge variant="secondary">{unassignedTasks.length}</Badge>
                </CardTitle>
                <CardDescription>
                  These tasks need to be assigned to team members
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {unassignedTasks.slice(0, 10).map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between rounded-lg border bg-white p-3 hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-3">
                        <StatusIcon status={task.status} />
                        <span className="font-mono text-xs text-gray-400">{task.taskId}</span>
                        <span className="text-sm text-gray-700">{task.name}</span>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {task.complexity}
                      </Badge>
                    </div>
                  ))}
                  {unassignedTasks.length > 10 && (
                    <div className="text-center text-sm text-gray-500 py-2">
                      +{unassignedTasks.length - 10} more unassigned tasks
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
