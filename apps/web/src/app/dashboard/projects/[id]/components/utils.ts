import type { Task } from '@/hooks/use-projects'
import type { DisplayTask } from './types'
import type { PhaseData } from '@/components/ui/phase-progress'

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatRelativeTime(dateString: string): string {
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

// Convert API tasks to display tasks with computed phase
export function toDisplayTasks(tasks: Task[]): DisplayTask[] {
  return tasks.map((task) => {
    // Extract phase from taskId (T1.1 -> 1, T2.3 -> 2, T5A.1 -> 5, T8B.2 -> 8)
    // Updated regex to handle sub-phase letters (T5A, T8B, etc.)
    const phaseMatch = task.taskId.match(/T(\d+)/)
    const phase = phaseMatch && phaseMatch[1] ? parseInt(phaseMatch[1], 10) : 1

    return {
      id: task.id,
      taskId: task.taskId,
      name: task.name,
      description: task.description,
      complexity: task.complexity,
      status: task.status,
      dependencies: task.dependencies,
      phase,
      updatedAt: task.updatedAt,
      estimatedHours: task.estimatedHours,
      assignee: task.assignee,
      displayOrder: task.displayOrder ?? 0,
    }
  })
}

// Compute task stats from API tasks
export function computeTaskStats(tasks: Task[]): {
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
export function groupTasksByPhase(tasks: DisplayTask[]): PhaseData[] {
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
export function calculateComplexityDistribution(tasks: DisplayTask[]): { low: number; medium: number; high: number } {
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
