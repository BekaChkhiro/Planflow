'use client'

import { useCallback, useEffect, useRef, useReducer } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/lib/auth-api'
import { toast } from '@/hooks/use-toast'
import { projectTasksQueryKey, type Task } from '@/hooks/use-projects'
import { getErrorMessage } from '@/lib/error-utils'

// Maximum number of undo operations to keep in history
const MAX_UNDO_HISTORY = 10

// Time window (ms) during which undo is available
const UNDO_WINDOW_MS = 30000 // 30 seconds

export type TaskOperation = 'status_change' | 'assignment' | 'update'

export interface UndoableTaskOperation {
  id: string
  projectId: string
  taskId: string // API task ID (UUID)
  taskDisplayId: string // Display ID like T1.1
  taskName: string
  operation: TaskOperation
  previousValue: Partial<Task>
  newValue: Partial<Task>
  timestamp: number
  description: string
}

// In-memory undo stack (per session)
let undoStack: UndoableTaskOperation[] = []
const undoListeners: Array<() => void> = []

function notifyListeners() {
  undoListeners.forEach(listener => listener())
}

/**
 * Add an operation to the undo stack
 */
export function pushUndoOperation(operation: UndoableTaskOperation): void {
  // Remove expired operations
  const now = Date.now()
  undoStack = undoStack.filter(op => now - op.timestamp < UNDO_WINDOW_MS)

  // Add new operation
  undoStack.push(operation)

  // Limit stack size
  if (undoStack.length > MAX_UNDO_HISTORY) {
    undoStack = undoStack.slice(-MAX_UNDO_HISTORY)
  }

  notifyListeners()
}

/**
 * Pop the most recent undoable operation
 */
export function popUndoOperation(): UndoableTaskOperation | undefined {
  const now = Date.now()

  // Find the most recent valid operation
  while (undoStack.length > 0) {
    const operation = undoStack.pop()
    if (operation && now - operation.timestamp < UNDO_WINDOW_MS) {
      notifyListeners()
      return operation
    }
  }

  notifyListeners()
  return undefined
}

/**
 * Get the most recent undoable operation without removing it
 */
export function peekUndoOperation(): UndoableTaskOperation | undefined {
  const now = Date.now()

  // Find the most recent valid operation from the end
  for (let i = undoStack.length - 1; i >= 0; i--) {
    const operation = undoStack[i]
    if (operation && now - operation.timestamp < UNDO_WINDOW_MS) {
      return operation
    }
  }

  return undefined
}

/**
 * Clear all undo operations for a specific task
 */
export function clearUndoOperationsForTask(taskId: string): void {
  undoStack = undoStack.filter(op => op.taskId !== taskId)
  notifyListeners()
}

/**
 * Clear all undo operations
 */
export function clearAllUndoOperations(): void {
  undoStack = []
  notifyListeners()
}

/**
 * Get the current undo stack (for debugging)
 */
export function getUndoStack(): UndoableTaskOperation[] {
  const now = Date.now()
  return undoStack.filter(op => now - op.timestamp < UNDO_WINDOW_MS)
}

interface UpdateTaskResponse {
  success: boolean
  data: {
    task: Task
  }
}

interface UseTaskUndoOptions {
  projectId: string
  onUndoSuccess?: (operation: UndoableTaskOperation) => void
  onUndoError?: (error: unknown, operation: UndoableTaskOperation) => void
}

/**
 * Hook to manage task undo operations
 */
export function useTaskUndo({ projectId: _projectId, onUndoSuccess, onUndoError }: UseTaskUndoOptions) {
  const queryClient = useQueryClient()
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

  // Subscribe to undo stack changes
  useEffect(() => {
    const listener = () => forceUpdate()
    undoListeners.push(listener)
    return () => {
      const index = undoListeners.indexOf(listener)
      if (index > -1) {
        undoListeners.splice(index, 1)
      }
    }
  }, [])

  // Mutation to revert a task change
  const undoMutation = useMutation({
    mutationFn: async (operation: UndoableTaskOperation) => {
      const response = await authApi.patch<UpdateTaskResponse>(
        `/projects/${operation.projectId}/tasks/${operation.taskId}`,
        operation.previousValue
      )
      return { task: response.data.task, operation }
    },
    onSuccess: ({ operation }) => {
      // Invalidate tasks query to refresh the list
      queryClient.invalidateQueries({ queryKey: projectTasksQueryKey(operation.projectId) })

      toast({
        title: 'Undone',
        description: `Reverted: ${operation.description}`,
        duration: 3000,
      })

      onUndoSuccess?.(operation)
    },
    onError: (error: unknown, operation) => {
      toast.error(getErrorMessage(error))
      onUndoError?.(error, operation)
    },
  })

  /**
   * Undo the most recent operation
   */
  const undo = useCallback(() => {
    const operation = popUndoOperation()
    if (operation) {
      undoMutation.mutate(operation)
      return true
    }
    return false
  }, [undoMutation])

  /**
   * Check if undo is available
   */
  const canUndo = peekUndoOperation() !== undefined

  /**
   * Get the description of the operation that would be undone
   */
  const undoDescription = peekUndoOperation()?.description

  return {
    undo,
    canUndo,
    undoDescription,
    isUndoing: undoMutation.isPending,
  }
}

interface UseUpdateTaskOptions {
  projectId: string
  onSuccess?: (task: Task) => void
  onError?: (error: unknown) => void
}

/**
 * Hook to update a task with undo support
 */
export function useUpdateTask({ projectId, onSuccess, onError }: UseUpdateTaskOptions) {
  const queryClient = useQueryClient()
  const lastToastRef = useRef<{ dismiss: () => void } | null>(null)

  const mutation = useMutation({
    mutationFn: async ({
      task,
      updates,
      showUndo = true,
    }: {
      task: Task
      updates: Partial<Pick<Task, 'status' | 'name' | 'description' | 'complexity' | 'estimatedHours' | 'dependencies'>>
      showUndo?: boolean
    }) => {
      const response = await authApi.patch<UpdateTaskResponse>(
        `/projects/${projectId}/tasks/${task.id}`,
        updates
      )
      return {
        task: response.data.task,
        previousTask: task,
        updates,
        showUndo,
      }
    },
    onSuccess: ({ task, previousTask, updates, showUndo }) => {
      // Invalidate tasks query to refresh the list
      queryClient.invalidateQueries({ queryKey: projectTasksQueryKey(projectId) })

      // Determine operation description
      let description = 'Task updated'
      if (updates.status) {
        const statusLabels: Record<string, string> = {
          TODO: 'To Do',
          IN_PROGRESS: 'In Progress',
          DONE: 'Done',
          BLOCKED: 'Blocked',
        }
        description = `${task.taskId} → ${statusLabels[updates.status] || updates.status}`
      }

      // Create undo operation
      const operation: UndoableTaskOperation = {
        id: `${task.id}-${Date.now()}`,
        projectId,
        taskId: task.id,
        taskDisplayId: task.taskId,
        taskName: task.name,
        operation: updates.status ? 'status_change' : 'update',
        previousValue: {
          status: previousTask.status,
          name: previousTask.name,
          description: previousTask.description,
          complexity: previousTask.complexity,
          estimatedHours: previousTask.estimatedHours,
          dependencies: previousTask.dependencies,
        },
        newValue: updates,
        timestamp: Date.now(),
        description,
      }

      // Push to undo stack
      pushUndoOperation(operation)

      // Dismiss previous toast if exists
      if (lastToastRef.current) {
        lastToastRef.current.dismiss()
      }

      // Show toast with undo hint
      if (showUndo) {
        const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
        const undoHint = isMac ? '⌘Z to undo' : 'Ctrl+Z to undo'

        const toastResult = toast({
          title: updates.status ? 'Status Updated' : 'Task Updated',
          description: `${description} • ${undoHint}`,
          duration: 5000,
        })

        lastToastRef.current = toastResult
      }

      onSuccess?.(task)
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error))
      onError?.(error)
    },
  })

  return mutation
}

/**
 * Hook to set up keyboard shortcut for undo (Cmd+Z / Ctrl+Z)
 */
export function useUndoKeyboardShortcut(projectId: string) {
  const { undo, canUndo, isUndoing } = useTaskUndo({ projectId })

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+Z (Mac) or Ctrl+Z (Windows/Linux)
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const undoKey = isMac ? e.metaKey && e.key === 'z' : e.ctrlKey && e.key === 'z'

      // Make sure we're not in an input field
      const target = e.target as HTMLElement
      const isInputField = target.tagName === 'INPUT' ||
                          target.tagName === 'TEXTAREA' ||
                          target.isContentEditable

      if (undoKey && !e.shiftKey && !isInputField && canUndo && !isUndoing) {
        e.preventDefault()
        undo()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [undo, canUndo, isUndoing])

  return { canUndo, isUndoing }
}
