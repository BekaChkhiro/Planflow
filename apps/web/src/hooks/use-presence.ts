'use client'

import { useState, useCallback, useMemo } from 'react'

// Presence status types
export type PresenceStatus = 'online' | 'idle' | 'away' | 'offline'

// Working on data for a user
export interface WorkingOnData {
  taskId: string          // e.g., "T1.1"
  taskUuid: string        // UUID for API calls
  taskName: string        // Display name
  startedAt: string       // ISO timestamp
}

// User presence data
export interface UserPresence {
  userId: string
  email: string
  name: string | null
  status: PresenceStatus
  connectedAt: string
  lastActiveAt: string
  workingOn: WorkingOnData | null
}

// Presence state
export interface PresenceState {
  users: Map<string, UserPresence>
  onlineCount: number
}

/**
 * Hook to manage presence state for real-time online indicators
 *
 * Use with useProjectWebSocket callbacks:
 * - onPresenceList: handlePresenceList
 * - onPresenceJoined: handlePresenceJoined
 * - onPresenceLeft: handlePresenceLeft
 * - onPresenceUpdated: handlePresenceUpdated
 * - onWorkingOnChanged: handleWorkingOnChanged
 */
export function usePresence() {
  const [presenceState, setPresenceState] = useState<PresenceState>({
    users: new Map(),
    onlineCount: 0,
  })

  /**
   * Handle initial presence list from server
   */
  const handlePresenceList = useCallback((data: {
    users: UserPresence[]
    onlineCount: number
  }) => {
    const usersMap = new Map<string, UserPresence>()
    data.users.forEach(user => {
      usersMap.set(user.userId, user)
    })
    setPresenceState({
      users: usersMap,
      onlineCount: data.onlineCount,
    })
  }, [])

  /**
   * Handle user joining (came online)
   */
  const handlePresenceJoined = useCallback((data: {
    user: UserPresence
    onlineCount: number
  }) => {
    setPresenceState(prev => {
      const newUsers = new Map(prev.users)
      newUsers.set(data.user.userId, data.user)
      return {
        users: newUsers,
        onlineCount: data.onlineCount,
      }
    })
  }, [])

  /**
   * Handle user leaving (went offline)
   */
  const handlePresenceLeft = useCallback((data: {
    userId: string
    onlineCount: number
  }) => {
    setPresenceState(prev => {
      const newUsers = new Map(prev.users)
      newUsers.delete(data.userId)
      return {
        users: newUsers,
        onlineCount: data.onlineCount,
      }
    })
  }, [])

  /**
   * Handle user status update (online/idle/away)
   */
  const handlePresenceUpdated = useCallback((data: {
    userId: string
    status: PresenceStatus
    lastActiveAt: string
  }) => {
    setPresenceState(prev => {
      const user = prev.users.get(data.userId)
      if (!user) return prev

      const newUsers = new Map(prev.users)
      newUsers.set(data.userId, {
        ...user,
        status: data.status,
        lastActiveAt: data.lastActiveAt,
      })
      return {
        ...prev,
        users: newUsers,
      }
    })
  }, [])

  /**
   * Handle working on changed (user started/stopped working on a task)
   */
  const handleWorkingOnChanged = useCallback((data: {
    userId: string
    workingOn: WorkingOnData | null
  }) => {
    setPresenceState(prev => {
      const user = prev.users.get(data.userId)
      if (!user) return prev

      const newUsers = new Map(prev.users)
      newUsers.set(data.userId, {
        ...user,
        workingOn: data.workingOn,
      })
      return {
        ...prev,
        users: newUsers,
      }
    })
  }, [])

  /**
   * Get presence for a specific user
   */
  const getUserPresence = useCallback((userId: string): UserPresence | undefined => {
    return presenceState.users.get(userId)
  }, [presenceState.users])

  /**
   * Check if a user is online
   */
  const isUserOnline = useCallback((userId: string): boolean => {
    const user = presenceState.users.get(userId)
    return !!user && user.status !== 'offline'
  }, [presenceState.users])

  /**
   * Get all online users as an array
   */
  const onlineUsers = useMemo(() => {
    return Array.from(presenceState.users.values())
  }, [presenceState.users])

  /**
   * Get presence status for a user (returns 'offline' if not found)
   */
  const getPresenceStatus = useCallback((userId: string): PresenceStatus => {
    const user = presenceState.users.get(userId)
    return user?.status || 'offline'
  }, [presenceState.users])

  /**
   * Get what a user is working on
   */
  const getWorkingOn = useCallback((userId: string): WorkingOnData | null => {
    const user = presenceState.users.get(userId)
    return user?.workingOn || null
  }, [presenceState.users])

  /**
   * Clear all presence data (e.g., on disconnect)
   */
  const clearPresence = useCallback(() => {
    setPresenceState({
      users: new Map(),
      onlineCount: 0,
    })
  }, [])

  return {
    // State
    presenceState,
    onlineUsers,
    onlineCount: presenceState.onlineCount,

    // Handlers for WebSocket events
    handlePresenceList,
    handlePresenceJoined,
    handlePresenceLeft,
    handlePresenceUpdated,
    handleWorkingOnChanged,

    // Query functions
    getUserPresence,
    isUserOnline,
    getPresenceStatus,
    getWorkingOn,

    // Utilities
    clearPresence,
  }
}

/**
 * Get a color class for a presence status
 */
export function getPresenceColor(status: PresenceStatus): string {
  switch (status) {
    case 'online':
      return 'bg-green-500'
    case 'idle':
      return 'bg-yellow-500'
    case 'away':
      return 'bg-orange-500'
    case 'offline':
    default:
      return 'bg-gray-400'
  }
}

/**
 * Get a ring color class for a presence status
 */
export function getPresenceRingColor(status: PresenceStatus): string {
  switch (status) {
    case 'online':
      return 'ring-green-500'
    case 'idle':
      return 'ring-yellow-500'
    case 'away':
      return 'ring-orange-500'
    case 'offline':
    default:
      return 'ring-gray-400'
  }
}

/**
 * Get a label for a presence status
 */
export function getPresenceLabel(status: PresenceStatus): string {
  switch (status) {
    case 'online':
      return 'Online'
    case 'idle':
      return 'Idle'
    case 'away':
      return 'Away'
    case 'offline':
    default:
      return 'Offline'
  }
}

/**
 * Format "last active" time
 */
export function formatLastActive(lastActiveAt: string): string {
  const lastActive = new Date(lastActiveAt)
  const now = new Date()
  const diffMs = now.getTime() - lastActive.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return lastActive.toLocaleDateString()
}
