'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import {
  FolderKanban,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  ArrowRight,
  Activity,
  TrendingUp,
  Zap,
} from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge as _Badge } from '@/components/ui/badge'
import { useProjects } from '@/hooks/use-projects'
import { useTeamMembers } from '@/hooks/use-team'
import { useOrganizationContext } from '@/hooks/use-organization-context'
import { useAggregateStats } from '@/hooks/use-aggregate-stats'
import { useAuthStore } from '@/stores/auth-store'

function getInitials(name: string | undefined): string {
  if (!name) return 'U'
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function formatRelativeTime(dateString: string): string {
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true })
  } catch {
    return 'Recently'
  }
}

// Stats Card Component
function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  isLoading,
}: {
  title: string
  value: number | string
  description?: string
  icon: React.ComponentType<{ className?: string }>
  trend?: { value: number; label: string }
  isLoading?: boolean
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-8 rounded" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-16 mb-1" />
          <Skeleton className="h-3 w-32" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
        {trend && (
          <div className="flex items-center gap-1 mt-1">
            <TrendingUp className="h-3 w-3 text-green-500" />
            <span className="text-xs text-green-500">+{trend.value}%</span>
            <span className="text-xs text-muted-foreground">{trend.label}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Quick Actions Component
function QuickActions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Quick Actions
        </CardTitle>
        <CardDescription>Common tasks to get started</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        <Button variant="outline" className="justify-start h-auto py-3" asChild>
          <Link href="/dashboard/projects">
            <Plus className="h-4 w-4 mr-2" />
            <div className="text-left">
              <div className="font-medium">Create New Project</div>
              <div className="text-xs text-muted-foreground">Start a new project plan</div>
            </div>
          </Link>
        </Button>
        <Button variant="outline" className="justify-start h-auto py-3" asChild>
          <Link href="/dashboard/team">
            <Users className="h-4 w-4 mr-2" />
            <div className="text-left">
              <div className="font-medium">Invite Team Member</div>
              <div className="text-xs text-muted-foreground">Add collaborators to your team</div>
            </div>
          </Link>
        </Button>
        <Button variant="outline" className="justify-start h-auto py-3" asChild>
          <Link href="/dashboard/settings/mcp-setup">
            <Activity className="h-4 w-4 mr-2" />
            <div className="text-left">
              <div className="font-medium">Connect Claude Code</div>
              <div className="text-xs text-muted-foreground">Set up MCP integration</div>
            </div>
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

// Recent Projects Component
function RecentProjects() {
  const { currentOrganizationId } = useOrganizationContext()
  const { data, isLoading } = useProjects({
    organizationId: currentOrganizationId,
    limit: 5,
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <FolderKanban className="h-5 w-5" />
            Recent Projects
          </CardTitle>
          <CardDescription>Your latest project activity</CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/projects">
            View All
            <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-1" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : data?.projects && data.projects.length > 0 ? (
          <div className="space-y-3">
            {data.projects.slice(0, 5).map((project) => (
              <Link
                key={project.id}
                href={`/dashboard/projects/${project.id}`}
                className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-muted transition-colors"
              >
                <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center">
                  <FolderKanban className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{project.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Updated {formatRelativeTime(project.updatedAt)}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <FolderKanban className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No projects yet</p>
            <Button size="sm" className="mt-3" asChild>
              <Link href="/dashboard/projects">
                <Plus className="h-4 w-4 mr-1" />
                Create Project
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Team Members Component
function TeamOverview() {
  const { currentOrganizationId } = useOrganizationContext()
  const { data: members, isLoading } = useTeamMembers(currentOrganizationId ?? undefined)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Members
          </CardTitle>
          <CardDescription>People in your organization</CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/team">
            Manage
            <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex -space-x-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-10 rounded-full border-2 border-background" />
            ))}
          </div>
        ) : members && members.length > 0 ? (
          <div className="space-y-4">
            <div className="flex -space-x-2">
              {members.slice(0, 5).map((member) => (
                <Avatar key={member.id} className="h-10 w-10 border-2 border-background">
                  <AvatarFallback className="text-xs">
                    {getInitials(member.userName || member.userEmail)}
                  </AvatarFallback>
                </Avatar>
              ))}
              {members.length > 5 && (
                <div className="h-10 w-10 rounded-full bg-muted border-2 border-background flex items-center justify-center">
                  <span className="text-xs font-medium">+{members.length - 5}</span>
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {members.length} team member{members.length !== 1 ? 's' : ''}
            </p>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-2">No team members yet</p>
            <Button size="sm" variant="outline" asChild>
              <Link href="/dashboard/team">
                <Plus className="h-4 w-4 mr-1" />
                Invite Members
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const { currentOrganization } = useOrganizationContext()
  const { data: stats, isLoading: statsLoading } = useAggregateStats()
  const { data: projectsData, isLoading: projectsLoading } = useProjects({
    organizationId: currentOrganization?.id,
    limit: 1,
  })

  const greeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }

  const projectCount = projectsData?.pagination?.totalCount ?? 0
  const completionRate = stats && stats.totalTasks > 0
    ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
    : 0

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">
          {greeting()}, {user?.name?.split(' ')[0] || 'there'}! 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          Here's what's happening with your projects today.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Projects"
          value={projectCount}
          description={currentOrganization?.name || 'All organizations'}
          icon={FolderKanban}
          isLoading={projectsLoading}
        />
        <StatsCard
          title="Tasks Completed"
          value={stats?.completedTasks ?? 0}
          description={`${completionRate}% completion rate`}
          icon={CheckCircle2}
          isLoading={statsLoading}
        />
        <StatsCard
          title="In Progress"
          value={stats?.inProgressTasks ?? 0}
          description="Active tasks being worked on"
          icon={Clock}
          isLoading={statsLoading}
        />
        <StatsCard
          title="Blocked"
          value={stats?.blockedTasks ?? 0}
          description={stats?.blockedTasks ? 'Need attention' : 'No blockers'}
          icon={AlertCircle}
          isLoading={statsLoading}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Recent Projects */}
        <div className="lg:col-span-2 space-y-6">
          <RecentProjects />
        </div>

        {/* Right Column - Quick Actions & Team */}
        <div className="space-y-6">
          <QuickActions />
          <TeamOverview />
        </div>
      </div>
    </div>
  )
}
