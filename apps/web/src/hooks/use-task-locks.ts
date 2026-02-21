'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import type { TaskLockInfo, TaskLockResult } from './use-websocket'

// Lock auto-extend interval (4 minutes - before 5 minute expiry)
const LOCK_EXTEND_INTERVAL = 4 * 60 * 1000

interface UseTaskLocksOptions {
  projectId: string
  // WebSocket methods from useProjectWebSocket
  sendTaskLock: (taskId: string, taskUuid: string, taskName?: string) => void
  sendTaskUnlock: (taskId: string, taskUuid?: string) => void
  sendTaskLockExtend: (taskId: string) => void
  isConnected: boolean
}

interface TaskLockState {
  locks: Map<string, TaskLockInfo>
  myLocks: Set<string> // Task IDs that the current user has locked
}

/**
 * Hook to manage task locks in the UI
 */
export function useTaskLocks({
  projectId,
  sendTaskLock,
  sendTaskUnlock,
  sendTaskLockExtend,
  isConnected,
}: UseTaskLocksOptions) {
  const authStore = useAuthStore()
  const currentUserId = authStore.user?.id

  // State for locks
  const [state, setState] = useState<TaskLockState>({
    locks: new Map(),
    myLocks: new Set(),
  })

  // Ref for auto-extend timers
  const extendTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  // Pending lock requests (for optimistic UI)
  const [pendingLocks, setPendingLocks] = useState<Set<string>>(new Set())

  /**
   * Handle locks list from server (on connect)
   */
  const handleLocksList = useCallback((locks: TaskLockInfo[]) => {
    const lockMap = new Map<string, TaskLockInfo>()
    const myLocks = new Set<string>()

    for (const lock of locks) {
      lockMap.set(lock.taskId, lock)
      if (lock.lockedBy.userId === currentUserId) {
        myLocks.add(lock.taskId)
      }
    }

    setState({ locks: lockMap, myLocks })
  }, [currentUserId])

  /**
   * Handle task locked event
   */
  const handleTaskLocked = useCallback((lock: TaskLockInfo) => {
    setState(prev => {
      const locks = new Map(prev.locks)
      const myLocks = new Set(prev.myLocks)

      locks.set(lock.taskId, lock)
      if (lock.lockedBy.userId === currentUserId) {
        myLocks.add(lock.taskId)
      }

      return { locks, myLocks }
    })

    // Clear from pending
    setPendingLocks(prev => {
      const next = new Set(prev)
      next.delete(lock.taskId)
      return next
    })
  }, [currentUserId])

  /**
   * Handle task unlocked event
   */
  const handleTaskUnlocked = useCallback((data: { taskId: string; taskUuid: string; unlockedBy: { id: string; email: string; name: string | null } | null }) => {
    setState(prev => {
      const locks = new Map(prev.locks)
      const myLocks = new Set(prev.myLocks)

      locks.delete(data.taskId)
      myLocks.delete(data.taskId)

      return { locks, myLocks }
    })

    // Clear any extend timer
    const timer = extendTimersRef.current.get(data.taskId)
    if (timer) {
      clearInterval(timer)
      extendTimersRef.current.delete(data.taskId)
    }
  }, [])

  /**
   * Handle task lock extended event
   */
  const handleTaskLockExtended = useCallback((lock: TaskLockInfo) => {
    setState(prev => {
      const locks = new Map(prev.locks)
      locks.set(lock.taskId, lock)
      return { ...prev, locks }
    })
  }, [])

  /**
   * Handle lock result (response to our lock request)
   */
  const handleLockResult = useCallback((result: TaskLockResult) => {
    // Clear from pending
    setPendingLocks(prev => {
      const next = new Set(prev)
      next.delete(result.lock.taskId)
      return next
    })

    if (result.success) {
      // Update state
      setState(prev => {
        const locks = new Map(prev.locks)
        const myLocks = new Set(prev.myLocks)

        locks.set(result.lock.taskId, result.lock)
        myLocks.add(result.lock.taskId)

        return { locks, myLocks }
      })

      // Start auto-extend timer
      const timer = setInterval(() => {
        sendTaskLockExtend(result.lock.taskId)
      }, LOCK_EXTEND_INTERVAL)

      extendTimersRef.current.set(result.lock.taskId, timer)
    }

    return result
  }, [sendTaskLockExtend])

  /**
   * Request a lock on a task
   */
  const lockTask = useCallback((taskId: string, taskUuid: string, taskName?: string) => {
    if (!isConnected) return false

    // Check if already locked by someone else
    const existingLock = state.locks.get(taskId)
    if (existingLock && existingLock.lockedBy.userId !== currentUserId) {
      return false
    }

    // Add to pending
    setPendingLocks(prev => new Set(prev).add(taskId))

    // Send lock request
    sendTaskLock(taskId, taskUuid, taskName)
    return true
  }, [isConnected, state.locks, currentUserId, sendTaskLock])

  /**
   * Release a lock on a task
   */
  const unlockTask = useCallback((taskId: string, taskUuid?: string) => {
    if (!isConnected) return false

    // Check if we own the lock
    if (!state.myLocks.has(taskId)) {
      return false
    }

    // Clear extend timer
    const timer = extendTimersRef.current.get(taskId)
    if (timer) {
      clearInterval(timer)
      extendTimersRef.current.delete(taskId)
    }

    // Update state optimistically
    setState(prev => {
      const locks = new Map(prev.locks)
      const myLocks = new Set(prev.myLocks)

      locks.delete(taskId)
      myLocks.delete(taskId)

      return { locks, myLocks }
    })

    // Send unlock request
    sendTaskUnlock(taskId, taskUuid)
    return true
  }, [isConnected, state.myLocks, sendTaskUnlock])

  /**
   * Check if a task is locked
   */
  const isTaskLocked = useCallback((taskId: string): boolean => {
    return state.locks.has(taskId)
  }, [state.locks])

  /**
   * Check if current user owns the lock
   */
  const isMyLock = useCallback((taskId: string): boolean => {
    return state.myLocks.has(taskId)
  }, [state.myLocks])

  /**
   * Check if a task is locked by someone else
   */
  const isLockedByOther = useCallback((taskId: string): boolean => {
    return state.locks.has(taskId) && !state.myLocks.has(taskId)
  }, [state.locks, state.myLocks])

  /**
   * Get lock info for a task
   */
  const getLock = useCallback((taskId: string): TaskLockInfo | undefined => {
    return state.locks.get(taskId)
  }, [state.locks])

  /**
   * Get all locks
   */
  const getAllLocks = useCallback((): TaskLockInfo[] => {
    return Array.from(state.locks.values())
  }, [state.locks])

  /**
   * Check if lock request is pending
   */
  const isLockPending = useCallback((taskId: string): boolean => {
    return pendingLocks.has(taskId)
  }, [pendingLocks])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of extendTimersRef.current.values()) {
        clearInterval(timer)
      }
      extendTimersRef.current.clear()
    }
  }, [])

  // Clear state when disconnected
  useEffect(() => {
    if (!isConnected) {
      setState({ locks: new Map(), myLocks: new Set() })
      setPendingLocks(new Set())
      for (const timer of extendTimersRef.current.values()) {
        clearInterval(timer)
      }
      extendTimersRef.current.clear()
    }
  }, [isConnected])

  return {
    // Lock operations
    lockTask,
    unlockTask,
    // Lock queries
    isTaskLocked,
    isMyLock,
    isLockedByOther,
    getLock,
    getAllLocks,
    isLockPending,
    // Event handlers (connect these to useProjectWebSocket callbacks)
    handleLocksList,
    handleTaskLocked,
    handleTaskUnlocked,
    handleTaskLockExtended,
    handleLockResult,
  }
}
