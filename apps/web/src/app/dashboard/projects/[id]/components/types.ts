import type { Task, TaskAssignee } from '@/hooks/use-projects'

// Task display interface (extends API Task with computed phase)
export interface DisplayTask {
  id: string
  taskId: string
  name: string
  description: string | null
  complexity: 'Low' | 'Medium' | 'High'
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'
  dependencies: string[]
  phase: number
  updatedAt: string
  estimatedHours: number | null
  assignee: TaskAssignee | null
  displayOrder: number // For drag-and-drop ordering (T14.3)
}

// Re-export Task type for convenience
export type { Task, TaskAssignee }

// Status configuration
export const statusConfig = {
  TODO: {
    label: 'To Do',
    color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    columnColor: 'bg-slate-50 dark:bg-slate-900/50',
  },
  IN_PROGRESS: {
    label: 'In Progress',
    color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    columnColor: 'bg-blue-50 dark:bg-blue-900/20',
  },
  DONE: {
    label: 'Done',
    color: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
    columnColor: 'bg-green-50 dark:bg-green-900/20',
  },
  BLOCKED: {
    label: 'Blocked',
    color: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
    columnColor: 'bg-red-50 dark:bg-red-900/20',
  },
}

export const complexityConfig = {
  Low: { color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300', label: 'Low' },
  Medium: { color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300', label: 'Medium' },
  High: { color: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300', label: 'High' },
}
