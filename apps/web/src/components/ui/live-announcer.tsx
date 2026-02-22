'use client'

import * as React from 'react'
import { createContext, useContext, useCallback, useState, useEffect } from 'react'

interface LiveAnnouncerContextValue {
  announce: (message: string, priority?: 'polite' | 'assertive') => void
}

const LiveAnnouncerContext = createContext<LiveAnnouncerContextValue | null>(null)

/**
 * Hook to announce messages to screen readers
 *
 * @example
 * ```tsx
 * const { announce } = useLiveAnnouncer()
 *
 * // Announce a status update
 * announce('Task completed successfully')
 *
 * // Announce an urgent message
 * announce('Error: Failed to save', 'assertive')
 * ```
 */
export function useLiveAnnouncer() {
  const context = useContext(LiveAnnouncerContext)

  if (!context) {
    // Return a no-op if used outside provider (for safety)
    return {
      announce: () => {
        console.warn('useLiveAnnouncer must be used within a LiveAnnouncerProvider')
      },
    }
  }

  return context
}

interface LiveAnnouncerProviderProps {
  children: React.ReactNode
}

/**
 * Provider component that creates a live region for screen reader announcements.
 *
 * Add this near the root of your app (e.g., in layout.tsx):
 *
 * @example
 * ```tsx
 * <LiveAnnouncerProvider>
 *   <App />
 * </LiveAnnouncerProvider>
 * ```
 */
export function LiveAnnouncerProvider({ children }: LiveAnnouncerProviderProps) {
  const [politeMessage, setPoliteMessage] = useState('')
  const [assertiveMessage, setAssertiveMessage] = useState('')

  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    if (priority === 'assertive') {
      // Clear first to ensure re-announcement
      setAssertiveMessage('')
      requestAnimationFrame(() => {
        setAssertiveMessage(message)
      })
    } else {
      setPoliteMessage('')
      requestAnimationFrame(() => {
        setPoliteMessage(message)
      })
    }

    // Clear messages after announcement (to allow re-announcing same message)
    setTimeout(() => {
      if (priority === 'assertive') {
        setAssertiveMessage('')
      } else {
        setPoliteMessage('')
      }
    }, 1000)
  }, [])

  return (
    <LiveAnnouncerContext.Provider value={{ announce }}>
      {children}

      {/* Polite live region for non-urgent announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {politeMessage}
      </div>

      {/* Assertive live region for urgent announcements */}
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {assertiveMessage}
      </div>
    </LiveAnnouncerContext.Provider>
  )
}

/**
 * Component to announce a message when mounted or when message changes.
 *
 * @example
 * ```tsx
 * <LiveAnnounce message="3 items loaded" />
 * <LiveAnnounce message="Error occurred" priority="assertive" />
 * ```
 */
export function LiveAnnounce({
  message,
  priority = 'polite',
}: {
  message: string
  priority?: 'polite' | 'assertive'
}) {
  const { announce } = useLiveAnnouncer()

  useEffect(() => {
    if (message) {
      announce(message, priority)
    }
  }, [message, priority, announce])

  return null
}

/**
 * Component that renders visually hidden content for screen readers.
 *
 * @example
 * ```tsx
 * <VisuallyHidden>This text is only visible to screen readers</VisuallyHidden>
 * ```
 */
export function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return <span className="sr-only">{children}</span>
}

/**
 * Hook to manage focus for accessibility
 *
 * @example
 * ```tsx
 * const focusRef = useFocusOnMount<HTMLHeadingElement>()
 * return <h1 ref={focusRef} tabIndex={-1}>Page Title</h1>
 * ```
 */
export function useFocusOnMount<T extends HTMLElement>() {
  const ref = React.useRef<T>(null)

  useEffect(() => {
    // Focus the element after mount with a small delay
    const timeoutId = setTimeout(() => {
      ref.current?.focus()
    }, 100)

    return () => clearTimeout(timeoutId)
  }, [])

  return ref
}
