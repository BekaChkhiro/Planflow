'use client'

import {
  ListTodo,
  CheckCircle2,
  Loader2,
  Circle,
  RefreshCw,
  FileText,
} from 'lucide-react'

import type { Task } from '@/hooks/use-projects'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ProgressRing } from '@/components/ui/progress-ring'
import { PhaseProgress } from '@/components/ui/phase-progress'
import { TaskDistributionBar } from '@/components/ui/task-distribution-bar'
import { ComplexityBreakdown } from '@/components/ui/complexity-breakdown'
import { toDisplayTasks, computeTaskStats, groupTasksByPhase, calculateComplexityDistribution } from './utils'

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  variant = 'default',
}: {
  title: string
  value: number | string
  icon: React.ElementType
  description?: string
  variant?: 'default' | 'success' | 'warning' | 'info'
}) {
  const variantStyles = {
    default: 'bg-muted text-muted-foreground',
    success: 'bg-green-100 text-green-600',
    warning: 'bg-yellow-100 text-yellow-600',
    info: 'bg-blue-100 text-blue-600',
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div className={`rounded-lg p-3 ${variantStyles[variant]}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function OverviewTab({ tasks: apiTasks }: { tasks: Task[] }) {
  const stats = computeTaskStats(apiTasks)
  const tasks = toDisplayTasks(apiTasks)
  const progress = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0
  const phases = groupTasksByPhase(tasks)
  const complexity = calculateComplexityDistribution(tasks)

  if (stats.total === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="rounded-full bg-muted p-4">
            <ListTodo className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-foreground">No tasks found</h3>
          <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
            This project doesn&apos;t have any tasks yet. Sync your PROJECT_PLAN.md file using the
            MCP integration to see task statistics here.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Row 1: Progress Ring + Stats Grid */}
      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        {/* Progress Ring Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Overall Progress</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center pb-6">
            <ProgressRing progress={progress} size={140} strokeWidth={10} />
            <p className="mt-3 text-sm text-muted-foreground">
              {stats.done} of {stats.total} tasks completed
            </p>
          </CardContent>
        </Card>

        {/* 2x2 Stats Grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard title="Total Tasks" value={stats.total} icon={ListTodo} variant="info" />
          <StatCard title="Completed" value={stats.done} icon={CheckCircle2} variant="success" />
          <StatCard title="In Progress" value={stats.inProgress} icon={Loader2} variant="warning" />
          <StatCard
            title="To Do"
            value={stats.todo + stats.blocked}
            icon={Circle}
            description={stats.blocked > 0 ? `${stats.blocked} blocked` : undefined}
          />
        </div>
      </div>

      {/* Row 2: Phase Progress Timeline */}
      {phases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Phase Progress</CardTitle>
            <CardDescription>Progress across implementation phases</CardDescription>
          </CardHeader>
          <CardContent>
            <PhaseProgress phases={phases} />
          </CardContent>
        </Card>
      )}

      {/* Row 3: Status Distribution + Complexity Breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Status Distribution Bar */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Status Distribution</CardTitle>
            <CardDescription>Tasks by current status</CardDescription>
          </CardHeader>
          <CardContent>
            <TaskDistributionBar
              done={stats.done}
              inProgress={stats.inProgress}
              blocked={stats.blocked}
              todo={stats.todo}
            />
          </CardContent>
        </Card>

        {/* Complexity Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Complexity Breakdown</CardTitle>
            <CardDescription>Tasks by estimated complexity</CardDescription>
          </CardHeader>
          <CardContent>
            <ComplexityBreakdown low={complexity.low} medium={complexity.medium} high={complexity.high} />
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" size="sm" disabled>
            <RefreshCw className="mr-2 h-4 w-4" />
            Sync from Terminal
          </Button>
          <Button variant="outline" size="sm" disabled>
            <FileText className="mr-2 h-4 w-4" />
            Export Plan
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// Loading skeleton for code splitting
export function OverviewTabSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        <Card>
          <CardContent className="flex flex-col items-center py-8">
            <div className="h-[140px] w-[140px] animate-pulse rounded-full bg-gray-200" />
            <div className="mt-3 h-4 w-32 animate-pulse rounded bg-gray-200" />
          </CardContent>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 animate-pulse rounded-lg bg-gray-200" />
                  <div className="space-y-2">
                    <div className="h-4 w-20 animate-pulse rounded bg-gray-200" />
                    <div className="h-6 w-16 animate-pulse rounded bg-gray-200" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
