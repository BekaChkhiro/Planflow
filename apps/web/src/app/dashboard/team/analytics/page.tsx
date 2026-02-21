'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import {
  Users,
  Activity,
  CheckCircle2,
  MessageSquare,
  TrendingUp,
  UserCheck,
  BarChart3,
  Building2,
  ChevronDown,
  RefreshCw,
  Crown,
  Shield,
  Edit3,
  Eye,
  Calendar,
  Zap,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'

import {
  useOrganizations,
  getRoleLabel,
  getInitials,
  type MemberRole,
} from '@/hooks/use-team'
import {
  useTeamAnalytics,
  getActionLabel,
  getActionChartColor,
  type MemberActivityStats,
  type ActivityTrend,
  type ActionDistribution,
  type RoleDistribution,
} from '@/hooks/use-team-analytics'

// Stats card component
function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  trendLabel,
}: {
  title: string
  value: string | number
  description?: string
  icon: React.ElementType
  trend?: 'up' | 'down' | 'neutral'
  trendLabel?: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
        {trendLabel && (
          <div className="mt-1 flex items-center text-xs">
            {trend === 'up' && <TrendingUp className="mr-1 h-3 w-3 text-green-500" />}
            {trend === 'down' && <TrendingUp className="mr-1 h-3 w-3 rotate-180 text-red-500" />}
            <span className={
              trend === 'up' ? 'text-green-500' :
              trend === 'down' ? 'text-red-500' :
              'text-muted-foreground'
            }>
              {trendLabel}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Role icon component
function RoleIcon({ role, className }: { role: MemberRole; className?: string }) {
  switch (role) {
    case 'owner':
      return <Crown className={className} />
    case 'admin':
      return <Shield className={className} />
    case 'editor':
      return <Edit3 className={className} />
    case 'viewer':
      return <Eye className={className} />
  }
}

// Role color
function getRoleColor(role: MemberRole): string {
  switch (role) {
    case 'owner':
      return 'bg-yellow-500'
    case 'admin':
      return 'bg-blue-500'
    case 'editor':
      return 'bg-green-500'
    case 'viewer':
      return 'bg-gray-400'
  }
}

// Activity trend bar chart
function ActivityTrendChart({ data }: { data: ActivityTrend[] }) {
  const maxValue = Math.max(...data.map(d => d.count), 1)

  return (
    <div className="flex h-[200px] items-end gap-1">
      {data.map((item, index) => {
        const height = (item.count / maxValue) * 100
        const date = parseISO(item.date)
        const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')

        return (
          <div
            key={item.date}
            className="group relative flex flex-1 flex-col items-center"
          >
            {/* Tooltip */}
            <div className="absolute -top-8 hidden rounded bg-gray-900 px-2 py-1 text-xs text-white group-hover:block">
              <div className="font-medium">{item.count} activities</div>
              <div className="text-gray-400">{format(date, 'MMM d')}</div>
            </div>

            {/* Bar */}
            <div
              className={`w-full rounded-t transition-all group-hover:opacity-80 ${
                isToday ? 'bg-blue-500' : 'bg-blue-400'
              }`}
              style={{ height: `${Math.max(height, 2)}%` }}
            />

            {/* Label (show every other day on small screens) */}
            <div className={`mt-1 text-[10px] text-muted-foreground ${index % 2 === 0 ? 'block' : 'hidden sm:block'}`}>
              {format(date, 'd')}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Role distribution chart
function RoleDistributionChart({ data }: { data: RoleDistribution[] }) {
  return (
    <div className="space-y-4">
      {data.map((item) => (
        <div key={item.role} className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <RoleIcon role={item.role} className="h-4 w-4 text-muted-foreground" />
              <span>{getRoleLabel(item.role)}</span>
            </div>
            <span className="font-medium">{item.count}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full transition-all ${getRoleColor(item.role)}`}
                style={{ width: `${item.percentage}%` }}
              />
            </div>
            <span className="w-10 text-right text-xs text-muted-foreground">
              {item.percentage}%
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// Action distribution chart
function ActionDistributionChart({ data }: { data: ActionDistribution[] }) {
  // Only show top 8 actions
  const topActions = data.slice(0, 8)

  return (
    <div className="space-y-3">
      {topActions.map((item) => (
        <div key={item.action} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="truncate">{getActionLabel(item.action)}</span>
            <span className="ml-2 font-medium">{item.count}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full transition-all"
                style={{
                  width: `${item.percentage}%`,
                  backgroundColor: getActionChartColor(item.action),
                }}
              />
            </div>
            <span className="w-10 text-right text-xs text-muted-foreground">
              {item.percentage}%
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// Member leaderboard
function MemberLeaderboard({ members }: { members: MemberActivityStats[] }) {
  // Show top 10
  const topMembers = members.slice(0, 10)

  if (topMembers.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        No activity data yet
      </div>
    )
  }

  const maxActions = topMembers[0]?.actionsCount || 1

  return (
    <div className="space-y-4">
      {topMembers.map((member, index) => {
        const barWidth = (member.actionsCount / maxActions) * 100

        return (
          <div key={member.memberId} className="flex items-center gap-3">
            {/* Rank */}
            <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
              index === 0 ? 'bg-yellow-100 text-yellow-700' :
              index === 1 ? 'bg-gray-100 text-gray-700' :
              index === 2 ? 'bg-orange-100 text-orange-700' :
              'bg-gray-50 text-gray-500'
            }`}>
              {index + 1}
            </div>

            {/* Avatar */}
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-blue-100 text-xs text-blue-700">
                {getInitials(member.memberName, member.memberEmail)}
              </AvatarFallback>
            </Avatar>

            {/* Info and bar */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="truncate text-sm font-medium">{member.memberName}</span>
                <span className="ml-2 text-sm text-muted-foreground">
                  {member.actionsCount} actions
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Member details table
function MemberDetailsTable({ members }: { members: MemberActivityStats[] }) {
  return (
    <div className="rounded-lg border">
      <div className="grid grid-cols-5 gap-4 border-b bg-muted/50 px-4 py-3 text-sm font-medium">
        <div className="col-span-2">Member</div>
        <div className="text-center">Actions</div>
        <div className="text-center">Tasks Done</div>
        <div className="text-center">Comments</div>
      </div>
      <ScrollArea className="h-[400px]">
        {members.map((member) => (
          <div
            key={member.memberId}
            className="grid grid-cols-5 gap-4 border-b px-4 py-3 text-sm last:border-0 hover:bg-muted/50"
          >
            <div className="col-span-2 flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-blue-100 text-xs text-blue-700">
                  {getInitials(member.memberName, member.memberEmail)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="truncate font-medium">{member.memberName}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {member.memberEmail}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-center">
              <Badge variant="secondary">{member.actionsCount}</Badge>
            </div>
            <div className="flex items-center justify-center">
              <Badge variant="outline" className="text-green-600">
                {member.tasksCompleted}
              </Badge>
            </div>
            <div className="flex items-center justify-center">
              <Badge variant="outline" className="text-blue-600">
                {member.commentsCreated}
              </Badge>
            </div>
          </div>
        ))}
      </ScrollArea>
    </div>
  )
}

// Loading skeleton
function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Stats cards skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="mt-1 h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts skeleton */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[200px]" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[200px]" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Empty state
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-gray-100 p-4">
        <BarChart3 className="h-8 w-8 text-gray-400" />
      </div>
      <h3 className="mt-4 text-lg font-medium text-gray-900">No analytics available</h3>
      <p className="mt-2 max-w-sm text-sm text-gray-500">
        Team analytics will appear here once there is activity in your organization.
      </p>
    </div>
  )
}

// Main page component
export default function TeamAnalyticsPage() {
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)

  // Fetch organizations
  const { data: organizations, isLoading: orgsLoading, error: orgsError } = useOrganizations()

  // Auto-select first organization
  const currentOrgId = selectedOrgId || organizations?.[0]?.id
  const currentOrg = organizations?.find((org) => org.id === currentOrgId)

  // Fetch analytics
  const { data: analytics, isLoading: analyticsLoading, refetch } = useTeamAnalytics(currentOrgId)

  const isLoading = orgsLoading || analyticsLoading

  if (isLoading) {
    return <AnalyticsSkeleton />
  }

  if (orgsError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-red-100 p-4">
          <BarChart3 className="h-8 w-8 text-red-600" />
        </div>
        <h3 className="mt-4 text-lg font-medium text-gray-900">Failed to load analytics</h3>
        <p className="mt-2 text-sm text-gray-500">
          There was an error loading your team analytics. Please try again.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    )
  }

  if (!organizations || organizations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-gray-100 p-4">
          <Building2 className="h-8 w-8 text-gray-400" />
        </div>
        <h3 className="mt-4 text-lg font-medium text-gray-900">No organizations yet</h3>
        <p className="mt-2 max-w-sm text-sm text-gray-500">
          You&apos;re not a member of any organizations. Create one to start tracking team analytics.
        </p>
      </div>
    )
  }

  if (!analytics) {
    return <EmptyState />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Team Analytics</h1>
          <p className="text-sm text-gray-500">
            Insights into your team&apos;s activity and productivity
          </p>
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

          {/* Refresh button */}
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Organization name (when single org) */}
      {currentOrg && organizations.length === 1 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Building2 className="h-4 w-4" />
          <span>{currentOrg.name}</span>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Members"
          value={analytics.totalMembers}
          description={`${analytics.activeThisWeek} active this week`}
          icon={Users}
        />
        <StatsCard
          title="Active Today"
          value={analytics.activeToday}
          description={`of ${analytics.totalMembers} members`}
          icon={UserCheck}
          trend={analytics.activeToday > 0 ? 'up' : 'neutral'}
          trendLabel={analytics.activeToday > 0 ? 'Members online' : 'No activity today'}
        />
        <StatsCard
          title="Tasks Completed"
          value={analytics.tasksCompleted}
          description="In the last 14 days"
          icon={CheckCircle2}
        />
        <StatsCard
          title="Comments"
          value={analytics.commentsCreated}
          description="In the last 14 days"
          icon={MessageSquare}
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Activity Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Activity Trend
            </CardTitle>
            <CardDescription>Daily activity over the last 14 days</CardDescription>
          </CardHeader>
          <CardContent>
            <ActivityTrendChart data={analytics.activityTrends} />
          </CardContent>
        </Card>

        {/* Role Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Role Distribution
            </CardTitle>
            <CardDescription>Team members by role</CardDescription>
          </CardHeader>
          <CardContent>
            <RoleDistributionChart data={analytics.roleDistribution} />
          </CardContent>
        </Card>
      </div>

      {/* Tabs for detailed views */}
      <Tabs defaultValue="leaderboard" className="space-y-4">
        <TabsList>
          <TabsTrigger value="leaderboard" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Leaderboard
          </TabsTrigger>
          <TabsTrigger value="details" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Member Details
          </TabsTrigger>
          <TabsTrigger value="actions" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Action Types
          </TabsTrigger>
        </TabsList>

        <TabsContent value="leaderboard">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Activity Leaderboard
              </CardTitle>
              <CardDescription>Top contributors by total actions</CardDescription>
            </CardHeader>
            <CardContent>
              <MemberLeaderboard members={analytics.memberActivity} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Member Activity Details
              </CardTitle>
              <CardDescription>Detailed breakdown per team member</CardDescription>
            </CardHeader>
            <CardContent>
              <MemberDetailsTable members={analytics.memberActivity} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Action Type Distribution
              </CardTitle>
              <CardDescription>Breakdown of activity by type</CardDescription>
            </CardHeader>
            <CardContent>
              <ActionDistributionChart data={analytics.actionDistribution} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Footer info */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Calendar className="h-3 w-3" />
        <span>Analytics based on activity from the last 14 days</span>
      </div>
    </div>
  )
}
