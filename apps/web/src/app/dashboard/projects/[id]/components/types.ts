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
    color: 'bg-slate-100 text-slate-700 border-slate-200',
    columnColor: 'bg-slate-50',
  },
  IN_PROGRESS: {
    label: 'In Progress',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    columnColor: 'bg-blue-50',
  },
  DONE: {
    label: 'Done',
    color: 'bg-green-100 text-green-700 border-green-200',
    columnColor: 'bg-green-50',
  },
  BLOCKED: {
    label: 'Blocked',
    color: 'bg-red-100 text-red-700 border-red-200',
    columnColor: 'bg-red-50',
  },
}

export const complexityConfig = {
  Low: { color: 'bg-emerald-100 text-emerald-700', label: 'Low' },
  Medium: { color: 'bg-amber-100 text-amber-700', label: 'Medium' },
  High: { color: 'bg-rose-100 text-rose-700', label: 'High' },
}
