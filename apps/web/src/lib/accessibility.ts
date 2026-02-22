/**
 * Accessibility Utilities for PlanFlow
 *
 * This module provides common accessibility helpers and hooks
 * for WCAG 2.1 AA compliance.
 */

import { useCallback, useEffect, useRef } from 'react'

/**
 * Hook to announce messages to screen readers via live region
 */
export function useAnnounce() {
  const announcerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // Create or get the live region element
    let announcer = document.getElementById('sr-announcer') as HTMLDivElement

    if (!announcer) {
      announcer = document.createElement('div')
      announcer.id = 'sr-announcer'
      announcer.setAttribute('role', 'status')
      announcer.setAttribute('aria-live', 'polite')
      announcer.setAttribute('aria-atomic', 'true')
      announcer.className = 'sr-only'
      document.body.appendChild(announcer)
    }

    announcerRef.current = announcer

    return () => {
      // Don't remove on cleanup as other components may use it
    }
  }, [])

  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    if (!announcerRef.current) return

    // Set the priority
    announcerRef.current.setAttribute('aria-live', priority)

    // Clear and set message to ensure announcement
    announcerRef.current.textContent = ''

    // Use requestAnimationFrame to ensure the clear takes effect
    requestAnimationFrame(() => {
      if (announcerRef.current) {
        announcerRef.current.textContent = message
      }
    })
  }, [])

  return announce
}

/**
 * Hook to trap focus within a container (for modals/dialogs)
 */
export function useFocusTrap(containerRef: React.RefObject<HTMLElement>, isActive: boolean) {
  useEffect(() => {
    if (!isActive || !containerRef.current) return

    const container = containerRef.current
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement?.focus()
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    }

    container.addEventListener('keydown', handleKeyDown)

    // Focus first element when trap is activated
    firstElement?.focus()

    return () => {
      container.removeEventListener('keydown', handleKeyDown)
    }
  }, [containerRef, isActive])
}

/**
 * Hook to restore focus when a component unmounts
 */
export function useRestoreFocus() {
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement

    return () => {
      // Restore focus on unmount
      previousFocusRef.current?.focus()
    }
  }, [])

  return previousFocusRef
}

/**
 * Generate a unique ID for accessibility associations
 */
let idCounter = 0
export function generateA11yId(prefix = 'a11y'): string {
  return `${prefix}-${++idCounter}-${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Hook to generate stable accessibility IDs
 */
export function useA11yId(prefix = 'a11y'): string {
  const idRef = useRef<string>()

  if (!idRef.current) {
    idRef.current = generateA11yId(prefix)
  }

  return idRef.current
}

/**
 * Get appropriate aria-label for star ratings
 */
export function getStarRatingLabel(rating: number, maxRating: number = 5): string {
  if (rating === 0) return 'No rating selected'
  if (rating === 1) return '1 star'
  return `${rating} stars out of ${maxRating}`
}

/**
 * Get description text for interactive elements
 */
export const a11yDescriptions = {
  closeButton: 'Close dialog',
  submitButton: 'Submit form',
  cancelButton: 'Cancel and close',
  loadingSpinner: 'Loading, please wait',
  notificationBadge: (count: number) =>
    count === 1 ? '1 unread notification' : `${count} unread notifications`,
  searchInput: 'Search',
  mentionAutocomplete: 'Type @ to mention team members',
  keyboardHint: (shortcut: string, action: string) =>
    `Press ${shortcut} to ${action}`,
} as const

/**
 * Create keyboard shortcut hint text for screen readers
 */
export function formatKeyboardShortcut(keys: string[]): string {
  return keys.join(' + ')
}

/**
 * Check if reduced motion is preferred
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Hook to detect reduced motion preference
 */
export function usePrefersReducedMotion(): boolean {
  const ref = useRef(prefersReducedMotion())

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    ref.current = mediaQuery.matches

    const handler = (e: MediaQueryListEvent) => {
      ref.current = e.matches
    }

    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  return ref.current
}

/**
 * Visually hidden styles for screen reader only content
 * Use this when you need inline styles instead of sr-only class
 */
export const visuallyHiddenStyle: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: '0',
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: '0',
}
