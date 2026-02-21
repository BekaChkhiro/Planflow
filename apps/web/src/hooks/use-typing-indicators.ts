'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { TypingIndicatorData } from './use-websocket'

// How long to wait before considering typing "stopped" (no more keystrokes)
const TYPING_TIMEOUT_MS = 3000

// How long before we stop showing the indicator (even if we don't get stop message)
const DISPLAY_TIMEOUT_MS = 5000

// Debounce interval for sending typing events
const DEBOUNCE_MS = 1000

interface UseTypingIndicatorsOptions {
  taskId: string
  sendTypingStart: (taskId: string, taskDisplayId: string) => void
  sendTypingStop: () => void
}

interface TypingUser {
  userId: string
  email: string
  name: string | null
  startedAt: string
  timeoutId: NodeJS.Timeout
}

// Display-only version without internal timeoutId
export interface TypingUserDisplay {
  userId: string
  email: string
  name: string | null
  startedAt: string
}

/**
 * Hook for managing typing indicators on a specific task
 * Handles both local typing state and remote typing users
 */
export function useTypingIndicators({
  taskId,
  sendTypingStart,
  sendTypingStop,
}: UseTypingIndicatorsOptions) {
  // Map of users currently typing (userId -> user info)
  const [typingUsers, setTypingUsers] = useState<Map<string, TypingUser>>(new Map())

  // Local typing state
  const isTypingRef = useRef(false)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastTypingEventRef = useRef<number>(0)
  const taskDisplayIdRef = useRef<string>('')

  /**
   * Called when the user starts typing in the comment input
   */
  const handleInputChange = useCallback((taskDisplayId: string) => {
    const now = Date.now()
    taskDisplayIdRef.current = taskDisplayId

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Debounce: only send typing event if enough time has passed
    if (!isTypingRef.current || now - lastTypingEventRef.current > DEBOUNCE_MS) {
      isTypingRef.current = true
      lastTypingEventRef.current = now
      sendTypingStart(taskId, taskDisplayId)
    }

    // Set timeout to stop typing
    typingTimeoutRef.current = setTimeout(() => {
      if (isTypingRef.current) {
        isTypingRef.current = false
        sendTypingStop()
      }
    }, TYPING_TIMEOUT_MS)
  }, [taskId, sendTypingStart, sendTypingStop])

  /**
   * Called when the user explicitly stops typing (blur, submit, etc.)
   */
  const handleStopTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = null
    }

    if (isTypingRef.current) {
      isTypingRef.current = false
      sendTypingStop()
    }
  }, [sendTypingStop])

  /**
   * Handle incoming typing start event from another user
   */
  const handleRemoteTypingStart = useCallback((data: TypingIndicatorData) => {
    // Only handle events for this task
    if (data.taskId !== taskId) return

    setTypingUsers((prev) => {
      const newMap = new Map(prev)

      // Clear existing timeout for this user if any
      const existing = newMap.get(data.userId)
      if (existing?.timeoutId) {
        clearTimeout(existing.timeoutId)
      }

      // Set auto-remove timeout
      const timeoutId = setTimeout(() => {
        setTypingUsers((current) => {
          const updated = new Map(current)
          updated.delete(data.userId)
          return updated
        })
      }, DISPLAY_TIMEOUT_MS)

      newMap.set(data.userId, {
        userId: data.userId,
        email: data.email,
        name: data.name,
        startedAt: data.startedAt,
        timeoutId,
      })

      return newMap
    })
  }, [taskId])

  /**
   * Handle incoming typing stop event from another user
   */
  const handleRemoteTypingStop = useCallback((data: { userId: string; taskId: string }) => {
    // Only handle events for this task
    if (data.taskId !== taskId) return

    setTypingUsers((prev) => {
      const newMap = new Map(prev)

      // Clear timeout and remove user
      const existing = newMap.get(data.userId)
      if (existing?.timeoutId) {
        clearTimeout(existing.timeoutId)
      }
      newMap.delete(data.userId)

      return newMap
    })
  }, [taskId])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear local typing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
      // Send stop if we were typing
      if (isTypingRef.current) {
        sendTypingStop()
      }
      // Clear all remote typing timeouts
      typingUsers.forEach((user) => {
        if (user.timeoutId) {
          clearTimeout(user.timeoutId)
        }
      })
    }
  }, [sendTypingStop, typingUsers])

  // Get array of typing users (excluding self)
  const typingUsersList = Array.from(typingUsers.values())

  return {
    // Local typing actions
    handleInputChange,
    handleStopTyping,
    // Remote typing handlers (to be connected to WebSocket)
    handleRemoteTypingStart,
    handleRemoteTypingStop,
    // Current typing users
    typingUsers: typingUsersList,
    isAnyoneTyping: typingUsersList.length > 0,
  }
}

/**
 * Format typing indicator text
 * e.g., "John is typing...", "John and Jane are typing...", "3 people are typing..."
 */
export function formatTypingIndicator(users: TypingUserDisplay[]): string {
  if (users.length === 0) return ''

  const names = users.map((u) => u.name || u.email.split('@')[0])

  if (names.length === 1) {
    return `${names[0]} is typing...`
  }

  if (names.length === 2) {
    return `${names[0]} and ${names[1]} are typing...`
  }

  return `${names.length} people are typing...`
}
