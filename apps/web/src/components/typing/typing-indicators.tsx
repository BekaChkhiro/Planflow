'use client'

import { useState, useCallback, useEffect } from 'react'
import { TypingIndicator } from './typing-indicator'
import { useProjectWebSocket, type TypingIndicatorData } from '@/hooks/use-websocket'
import type { TypingUserDisplay } from '@/hooks/use-typing-indicators'

interface TypingIndicatorsProps {
  projectId: string
  taskId: string
  className?: string
}

// How long before we stop showing the indicator (even if we don't get stop message)
const DISPLAY_TIMEOUT_MS = 5000

interface TypingUser extends TypingUserDisplay {
  timeoutId: NodeJS.Timeout
}

/**
 * Component that displays typing indicators for a specific task
 * Connects to WebSocket and listens for typing events
 */
export function TypingIndicators({ projectId, taskId, className }: TypingIndicatorsProps) {
  const [typingUsers, setTypingUsers] = useState<Map<string, TypingUser>>(new Map())

  // Handle incoming typing start event
  const handleTypingStart = useCallback((data: TypingIndicatorData) => {
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

  // Handle incoming typing stop event
  const handleTypingStop = useCallback((data: { userId: string; taskId: string }) => {
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

  // Connect to WebSocket
  useProjectWebSocket({
    projectId,
    enabled: !!projectId && !!taskId,
    onTypingStart: handleTypingStart,
    onTypingStop: handleTypingStop,
  })

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      typingUsers.forEach((user) => {
        if (user.timeoutId) {
          clearTimeout(user.timeoutId)
        }
      })
    }
  }, [typingUsers])

  // Get array of typing users for display
  const typingUsersList: TypingUserDisplay[] = Array.from(typingUsers.values()).map(
    ({ userId, email, name, startedAt }) => ({ userId, email, name, startedAt })
  )

  if (typingUsersList.length === 0) {
    return null
  }

  return <TypingIndicator users={typingUsersList} className={className} />
}
