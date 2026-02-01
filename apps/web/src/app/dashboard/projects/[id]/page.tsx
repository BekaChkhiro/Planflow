'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Calendar,
  Clock,
  FileText,
  ListTodo,
  LayoutDashboard,
  Settings,
  MoreVertical,
  Pencil,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Circle,
  AlertCircle,
  Loader2,
  LayoutGrid,
  List,
  Ban,
  ChevronRight,
  GripVertical,
} from 'lucide-react'

import { useProject, useDeleteProject, useUpdateProject, useProjectTasks, type Task } from '@/hooks/use-projects'
import { useProjectWebSocket } from '@/hooks/use-websocket'
import { ConnectionIndicator } from '@/components/ui/connection-indicator'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { MarkdownViewer } from '@/components/markdown-viewer'
import { ProgressRing } from '@/components/ui/progress-ring'
import { PhaseProgress, type PhaseData } from '@/components/ui/phase-progress'
import { TaskDistributionBar } from '@/components/ui/task-distribution-bar'
import { ComplexityBreakdown } from '@/components/ui/complexity-breakdown'

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(dateString)
}


// Task display interface (extends API Task with computed phase)
interface DisplayTask {
  id: string
  taskId: string
  name: string
  complexity: 'Low' | 'Medium' | 'High'
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'
  dependencies: string[]
  phase: number
  updatedAt: string
}

// Convert API tasks to display tasks with computed phase
function toDisplayTasks(tasks: Task[]): DisplayTask[] {
  return tasks.map((task) => {
    // Extract phase from taskId (T1.1 -> 1, T2.3 -> 2, T5A.1 -> 5, T8B.2 -> 8)
    // Updated regex to handle sub-phase letters (T5A, T8B, etc.)
    const phaseMatch = task.taskId.match(/T(\d+)/)
    const phase = phaseMatch && phaseMatch[1] ? parseInt(phaseMatch[1], 10) : 1

    return {
      id: task.id,
      taskId: task.taskId,
      name: task.name,
      complexity: task.complexity,
      status: task.status,
      dependencies: task.dependencies,
      phase,
      updatedAt: task.updatedAt,
    }
  })
}

// Compute task stats from API tasks
function computeTaskStats(tasks: Task[]): {
  total: number
  done: number
  inProgress: number
  blocked: number
  todo: number
} {
  const stats = { total: tasks.length, done: 0, inProgress: 0, blocked: 0, todo: 0 }

  tasks.forEach((task) => {
    if (task.status === 'DONE') stats.done++
    else if (task.status === 'IN_PROGRESS') stats.inProgress++
    else if (task.status === 'BLOCKED') stats.blocked++
    else stats.todo++
  })

  return stats
}

// Group tasks by phase number
function groupTasksByPhase(tasks: DisplayTask[]): PhaseData[] {
  const phaseMap = new Map<number, { total: number; done: number; inProgress: number }>()

  tasks.forEach((task) => {
    const existing = phaseMap.get(task.phase) || { total: 0, done: 0, inProgress: 0 }
    existing.total++
    if (task.status === 'DONE') existing.done++
    if (task.status === 'IN_PROGRESS') existing.inProgress++
    phaseMap.set(task.phase, existing)
  })

  return Array.from(phaseMap.entries())
    .map(([phase, data]) => ({ phase, ...data }))
    .sort((a, b) => a.phase - b.phase)
}

// Count tasks by complexity
function calculateComplexityDistribution(tasks: DisplayTask[]): { low: number; medium: number; high: number } {
  return tasks.reduce(
    (acc, task) => {
      if (task.complexity === 'Low') acc.low++
      else if (task.complexity === 'Medium') acc.medium++
      else if (task.complexity === 'High') acc.high++
      return acc
    },
    { low: 0, medium: 0, high: 0 }
  )
}

// Status configuration
const statusConfig = {
  TODO: {
    label: 'To Do',
    color: 'bg-slate-100 text-slate-700 border-slate-200',
    icon: Circle,
    columnColor: 'bg-slate-50',
  },
  IN_PROGRESS: {
    label: 'In Progress',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: Loader2,
    columnColor: 'bg-blue-50',
  },
  DONE: {
    label: 'Done',
    color: 'bg-green-100 text-green-700 border-green-200',
    icon: CheckCircle2,
    columnColor: 'bg-green-50',
  },
  BLOCKED: {
    label: 'Blocked',
    color: 'bg-red-100 text-red-700 border-red-200',
    icon: Ban,
    columnColor: 'bg-red-50',
  },
}

const complexityConfig = {
  Low: { color: 'bg-emerald-100 text-emerald-700', label: 'Low' },
  Medium: { color: 'bg-amber-100 text-amber-700', label: 'Medium' },
  High: { color: 'bg-rose-100 text-rose-700', label: 'High' },
}

function TaskCard({ task, view }: { task: DisplayTask; view: 'kanban' | 'list' }) {
  const StatusIcon = statusConfig[task.status].icon

  if (view === 'list') {
    return (
      <div className="flex items-center gap-4 rounded-lg border bg-white p-4 transition-colors hover:bg-gray-50">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100">
          <StatusIcon
            className={`h-4 w-4 ${
              task.status === 'IN_PROGRESS' ? 'animate-spin text-blue-500' : ''
            } ${task.status === 'DONE' ? 'text-green-500' : ''} ${
              task.status === 'BLOCKED' ? 'text-red-500' : ''
            } ${task.status === 'TODO' ? 'text-gray-400' : ''}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{task.taskId}</span>
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <span className="truncate font-medium">{task.name}</span>
          </div>
          {task.dependencies.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Depends on: {task.dependencies.join(', ')}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline" className={complexityConfig[task.complexity].color}>
            {task.complexity}
          </Badge>
          <Badge className="text-xs" variant="outline">
            Phase {task.phase}
          </Badge>
        </div>
      </div>
    )
  }

  // Kanban card
  return (
    <div className="group rounded-lg border bg-white p-3 shadow-sm transition-all hover:shadow-md">
      <div className="mb-2 flex items-start justify-between">
        <span className="font-mono text-xs text-muted-foreground">{task.taskId}</span>
        <Badge variant="outline" className={`text-xs ${complexityConfig[task.complexity].color}`}>
          {task.complexity}
        </Badge>
      </div>
      <p className="mb-3 text-sm font-medium leading-snug">{task.name}</p>
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-xs">
          Phase {task.phase}
        </Badge>
        {task.dependencies.length > 0 && (
          <span className="text-xs text-muted-foreground" title={`Depends on: ${task.dependencies.join(', ')}`}>
            {task.dependencies.length} dep{task.dependencies.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  )
}

function KanbanColumn({
  status,
  tasks,
}: {
  status: DisplayTask['status']
  tasks: DisplayTask[]
}) {
  const config = statusConfig[status]
  const StatusIcon = config.icon

  return (
    <div className={`flex min-w-[280px] flex-col rounded-lg ${config.columnColor} p-3`}>
      <div className="mb-3 flex items-center gap-2">
        <StatusIcon
          className={`h-4 w-4 ${status === 'IN_PROGRESS' ? 'animate-spin' : ''}`}
        />
        <h3 className="font-semibold">{config.label}</h3>
        <Badge variant="secondary" className="ml-auto">
          {tasks.length}
        </Badge>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-200 p-4 text-center">
            <p className="text-sm text-muted-foreground">No tasks</p>
          </div>
        ) : (
          tasks.map((task) => <TaskCard key={task.id} task={task} view="kanban" />)
        )}
      </div>
    </div>
  )
}

function KanbanView({ tasks }: { tasks: DisplayTask[] }) {
  // Helper to sort by taskId (T1.1, T1.2, T2.1, etc.)
  const sortByTaskId = (a: DisplayTask, b: DisplayTask) => a.taskId.localeCompare(b.taskId, undefined, { numeric: true })
  // Helper to sort by updatedAt descending (most recent first)
  const sortByUpdatedAtDesc = (a: DisplayTask, b: DisplayTask) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()

  const tasksByStatus = {
    // TODO, IN_PROGRESS, BLOCKED - sort by taskId for logical order
    TODO: tasks.filter((t) => t.status === 'TODO').sort(sortByTaskId),
    IN_PROGRESS: tasks.filter((t) => t.status === 'IN_PROGRESS').sort(sortByTaskId),
    BLOCKED: tasks.filter((t) => t.status === 'BLOCKED').sort(sortByTaskId),
    // DONE - sort by updatedAt descending (most recently completed first)
    DONE: tasks.filter((t) => t.status === 'DONE').sort(sortByUpdatedAtDesc),
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      <KanbanColumn status="TODO" tasks={tasksByStatus.TODO} />
      <KanbanColumn status="IN_PROGRESS" tasks={tasksByStatus.IN_PROGRESS} />
      <KanbanColumn status="BLOCKED" tasks={tasksByStatus.BLOCKED} />
      <KanbanColumn status="DONE" tasks={tasksByStatus.DONE} />
    </div>
  )
}

function ListView({
  tasks,
  groupBy,
}: {
  tasks: DisplayTask[]
  groupBy: 'status' | 'phase'
}) {
  if (groupBy === 'status') {
    const statuses: DisplayTask['status'][] = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE']

    return (
      <div className="space-y-6">
        {statuses.map((status) => {
          const statusTasks = tasks.filter((t) => t.status === status)
          if (statusTasks.length === 0) return null

          const config = statusConfig[status]
          const StatusIcon = config.icon

          return (
            <div key={status}>
              <div className="mb-3 flex items-center gap-2">
                <StatusIcon
                  className={`h-4 w-4 ${status === 'IN_PROGRESS' ? 'animate-spin' : ''}`}
                />
                <h3 className="font-semibold">{config.label}</h3>
                <Badge variant="secondary">{statusTasks.length}</Badge>
              </div>
              <div className="space-y-2">
                {statusTasks.map((task) => (
                  <TaskCard key={task.id} task={task} view="list" />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // Group by phase
  const phases = [...new Set(tasks.map((t) => t.phase))].sort((a, b) => a - b)

  return (
    <div className="space-y-6">
      {phases.map((phase) => {
        const phaseTasks = tasks.filter((t) => t.phase === phase)

        return (
          <div key={phase}>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="font-semibold">Phase {phase}</h3>
              <Badge variant="secondary">{phaseTasks.length}</Badge>
              <span className="ml-2 text-sm text-muted-foreground">
                {phaseTasks.filter((t) => t.status === 'DONE').length}/{phaseTasks.length} completed
              </span>
            </div>
            <div className="space-y-2">
              {phaseTasks.map((task) => (
                <TaskCard key={task.id} task={task} view="list" />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ProjectDetailSkeleton() {
  return (
    <div>
      {/* Header skeleton */}
      <div className="mb-6">
        <Skeleton className="mb-4 h-5 w-24" />
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="mt-2 h-4 w-96" />
          </div>
          <Skeleton className="h-10 w-10 rounded" />
        </div>
        <div className="mt-4 flex items-center gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>

      {/* Tabs skeleton */}
      <Skeleton className="mb-4 h-10 w-80" />

      {/* Content skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  )
}

function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <Card className="border-red-200 bg-red-50">
      <CardContent className="flex flex-col items-center justify-center py-16">
        <div className="rounded-full bg-red-100 p-4">
          <AlertCircle className="h-8 w-8 text-red-400" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-red-900">Failed to load project</h3>
        <p className="mt-2 max-w-sm text-center text-sm text-red-600">
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>
        <div className="mt-6 flex gap-3">
          <Button variant="outline" asChild>
            <Link href="/dashboard/projects">Back to Projects</Link>
          </Button>
          <Button onClick={onRetry}>Try again</Button>
        </div>
      </CardContent>
    </Card>
  )
}

function NotFoundState() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-16">
        <div className="rounded-full bg-gray-100 p-4">
          <FileText className="h-8 w-8 text-gray-400" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-gray-900">Project not found</h3>
        <p className="mt-2 max-w-sm text-center text-sm text-gray-500">
          The project you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.
        </p>
        <Button className="mt-6" asChild>
          <Link href="/dashboard/projects">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

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
    default: 'bg-gray-100 text-gray-600',
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

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Progress</span>
        <span className="font-medium">{progress}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

function OverviewTab({ tasks: apiTasks }: { tasks: Task[] }) {
  const stats = computeTaskStats(apiTasks)
  const tasks = toDisplayTasks(apiTasks)
  const progress = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0
  const phases = groupTasksByPhase(tasks)
  const complexity = calculateComplexityDistribution(tasks)

  if (stats.total === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="rounded-full bg-gray-100 p-4">
            <ListTodo className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No tasks found</h3>
          <p className="mt-2 max-w-sm text-center text-sm text-gray-500">
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

function PlanTab({ plan }: { plan: string | null | undefined }) {
  if (!plan) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="rounded-full bg-gray-100 p-4">
            <FileText className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No plan content</h3>
          <p className="mt-2 max-w-sm text-center text-sm text-gray-500">
            This project doesn&apos;t have a plan yet. Use the MCP integration to sync your
            PROJECT_PLAN.md file from the terminal.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Project Plan</CardTitle>
        <CardDescription>Synced from PROJECT_PLAN.md</CardDescription>
      </CardHeader>
      <CardContent>
        <MarkdownViewer content={plan} />
      </CardContent>
    </Card>
  )
}

function TasksTab({ tasks: apiTasks }: { tasks: Task[] }) {
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')
  const [groupBy, setGroupBy] = useState<'status' | 'phase'>('status')
  const [filterStatus, setFilterStatus] = useState<DisplayTask['status'] | 'ALL'>('ALL')
  const [filterPhase, setFilterPhase] = useState<number | 'ALL'>('ALL')

  const tasks = toDisplayTasks(apiTasks)
  const stats = computeTaskStats(apiTasks)

  if (stats.total === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="rounded-full bg-gray-100 p-4">
            <ListTodo className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No tasks found</h3>
          <p className="mt-2 max-w-sm text-center text-sm text-gray-500">
            Tasks will appear here once you sync your PROJECT_PLAN.md file.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Get unique phases for filter
  const phases = [...new Set(tasks.map((t) => t.phase))].sort((a, b) => a - b)

  // Apply filters
  let filteredTasks = tasks
  if (filterStatus !== 'ALL') {
    filteredTasks = filteredTasks.filter((t) => t.status === filterStatus)
  }
  if (filterPhase !== 'ALL') {
    filteredTasks = filteredTasks.filter((t) => t.phase === filterPhase)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 py-4">
          {/* View Toggle */}
          <div className="flex items-center gap-1 rounded-lg border p-1">
            <Button
              variant={viewMode === 'kanban' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-3"
              onClick={() => setViewMode('kanban')}
            >
              <LayoutGrid className="mr-2 h-4 w-4" />
              Kanban
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-3"
              onClick={() => setViewMode('list')}
            >
              <List className="mr-2 h-4 w-4" />
              List
            </Button>
          </div>

          {/* Group By (List view only) */}
          {viewMode === 'list' && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Group by:</span>
              <div className="flex items-center gap-1 rounded-lg border p-1">
                <Button
                  variant={groupBy === 'status' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setGroupBy('status')}
                >
                  Status
                </Button>
                <Button
                  variant={groupBy === 'phase' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setGroupBy('phase')}
                >
                  Phase
                </Button>
              </div>
            </div>
          )}

          <Separator orientation="vertical" className="h-8" />

          {/* Filters */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Filter:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as DisplayTask['status'] | 'ALL')}
              className="h-8 rounded-md border bg-background px-2 text-sm"
            >
              <option value="ALL">All Status</option>
              <option value="TODO">To Do</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="BLOCKED">Blocked</option>
              <option value="DONE">Done</option>
            </select>
            <select
              value={filterPhase}
              onChange={(e) =>
                setFilterPhase(e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value, 10))
              }
              className="h-8 rounded-md border bg-background px-2 text-sm"
            >
              <option value="ALL">All Phases</option>
              {phases.map((phase) => (
                <option key={phase} value={phase}>
                  Phase {phase}
                </option>
              ))}
            </select>
          </div>

          {/* Stats Summary */}
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              Showing {filteredTasks.length} of {tasks.length} tasks
            </span>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                {stats.done}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                {stats.inProgress}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-slate-300" />
                {stats.todo}
              </span>
              {stats.blocked > 0 && (
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  {stats.blocked}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Task Views */}
      {filteredTasks.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-gray-100 p-4">
              <ListTodo className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">No matching tasks</h3>
            <p className="mt-2 max-w-sm text-center text-sm text-gray-500">
              Try adjusting your filters to see more tasks.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setFilterStatus('ALL')
                setFilterPhase('ALL')
              }}
            >
              Clear filters
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === 'kanban' ? (
        <KanbanView tasks={filteredTasks} />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <ListView tasks={filteredTasks} groupBy={groupBy} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function EditProjectDialog({
  open,
  onOpenChange,
  project,
  onSave,
  isSaving,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: { id: string; name: string; description: string | null }
  onSave: (data: { name: string; description: string | null }) => void
  isSaving: boolean
}) {
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description || '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({ name, description: description || null })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
          <DialogDescription>Update your project details.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Project name"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Project description (optional)"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || !name.trim()}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save changes'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params['id'] as string

  const { data: project, isLoading, error, refetch } = useProject(projectId)
  const { data: tasks = [], isLoading: tasksLoading } = useProjectTasks(projectId)
  const deleteProject = useDeleteProject()
  const updateProject = useUpdateProject()

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)

  // WebSocket for real-time updates
  const { status: wsStatus } = useProjectWebSocket({
    projectId,
    enabled: !isLoading && !error && !!project,
  })

  const handleDelete = async () => {
    try {
      await deleteProject.mutateAsync(projectId)
      router.push('/dashboard/projects')
    } catch (err) {
      console.error('Failed to delete project:', err)
    }
  }

  const handleEdit = async (data: { name: string; description: string | null }) => {
    try {
      await updateProject.mutateAsync({ projectId, data })
      setShowEditDialog(false)
    } catch (err) {
      console.error('Failed to update project:', err)
    }
  }

  if (isLoading || tasksLoading) {
    return <ProjectDetailSkeleton />
  }

  if (error) {
    // Check if it's a 404 error
    if ((error as { status?: number }).status === 404) {
      return <NotFoundState />
    }
    return <ErrorState error={error as Error} onRetry={() => refetch()} />
  }

  if (!project) {
    return <NotFoundState />
  }

  const stats = computeTaskStats(tasks)
  const progress = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link href="/dashboard/projects">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Link>
        </Button>

        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
              {stats.total > 0 && (
                <Badge variant={progress === 100 ? 'default' : 'secondary'}>{progress}%</Badge>
              )}
              <ConnectionIndicator status={wsStatus} />
            </div>
            {project.description && (
              <p className="mt-1 text-sm text-gray-500">{project.description}</p>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit project
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/projects/${project.id}/settings`}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600 focus:bg-red-50 focus:text-red-600"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            <span>Created {formatDate(project.createdAt)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>Updated {formatRelativeTime(project.updatedAt)}</span>
          </div>
        </div>
      </div>

      <Separator className="mb-6" />

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview" className="gap-2">
            <LayoutDashboard className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="plan" className="gap-2">
            <FileText className="h-4 w-4" />
            Plan
          </TabsTrigger>
          <TabsTrigger value="tasks" className="gap-2">
            <ListTodo className="h-4 w-4" />
            Tasks
            {stats.total > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                {stats.total}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab tasks={tasks} />
        </TabsContent>

        <TabsContent value="plan">
          <PlanTab plan={project.plan} />
        </TabsContent>

        <TabsContent value="tasks">
          <TasksTab tasks={tasks} />
        </TabsContent>
      </Tabs>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{project.name}&quot;? This action cannot be
              undone and will permanently delete all project data including tasks and plans.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
              disabled={deleteProject.isPending}
            >
              {deleteProject.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog */}
      {showEditDialog && (
        <EditProjectDialog
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          project={project}
          onSave={handleEdit}
          isSaving={updateProject.isPending}
        />
      )}
    </div>
  )
}
