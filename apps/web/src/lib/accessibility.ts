"use client"

/**
 * Accessibility Utilities for PlanFlow
 *
 * This module provides common accessibility helpers and hooks
 * for WCAG 2.1 AA compliance.
 */

import React, { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject, type CSSProperties, type ReactNode } from 'react'

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
export function useFocusTrap(containerRef: RefObject<HTMLElement>, isActive: boolean) {
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
export const visuallyHiddenStyle: CSSProperties = {
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

// =============================================================================
// KEYBOARD NAVIGATION UTILITIES
// =============================================================================

/**
 * Key codes for common keyboard navigation
 */
export const KeyCode = {
  ENTER: 'Enter',
  SPACE: ' ',
  ESCAPE: 'Escape',
  TAB: 'Tab',
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',
  HOME: 'Home',
  END: 'End',
  PAGE_UP: 'PageUp',
  PAGE_DOWN: 'PageDown',
} as const

/**
 * Type for keyboard shortcut definition
 */
export interface KeyboardShortcut {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  meta?: boolean
  description: string
  action: () => void
}

/**
 * Check if a keyboard event matches a shortcut
 */
export function matchesShortcut(event: KeyboardEvent, shortcut: Omit<KeyboardShortcut, 'description' | 'action'>): boolean {
  const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase()
  const ctrlMatches = !!shortcut.ctrl === (event.ctrlKey || event.metaKey)
  const shiftMatches = !!shortcut.shift === event.shiftKey
  const altMatches = !!shortcut.alt === event.altKey

  return keyMatches && ctrlMatches && shiftMatches && altMatches
}

/**
 * Hook to handle escape key press
 */
export function useEscapeKey(callback: () => void, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === KeyCode.ESCAPE) {
        event.preventDefault()
        callback()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [callback, enabled])
}

/**
 * Hook to register a keyboard shortcut
 */
export function useKeyboardShortcut(
  shortcut: Omit<KeyboardShortcut, 'description' | 'action'>,
  callback: () => void,
  enabled: boolean = true
) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      if (matchesShortcut(event, shortcut)) {
        event.preventDefault()
        callbackRef.current()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [shortcut, enabled])
}

/**
 * Hook for arrow key navigation in lists
 */
export function useArrowKeyNavigation<T extends HTMLElement>(
  items: T[] | NodeListOf<T> | null,
  options: {
    enabled?: boolean
    loop?: boolean
    orientation?: 'vertical' | 'horizontal' | 'both'
    onSelect?: (index: number, element: T) => void
  } = {}
) {
  const {
    enabled = true,
    loop = true,
    orientation = 'vertical',
    onSelect,
  } = options

  const currentIndexRef = useRef(-1)

  const focusItem = useCallback((index: number) => {
    if (!items || items.length === 0) return

    const itemsArray = Array.from(items)
    if (index < 0 || index >= itemsArray.length) return

    currentIndexRef.current = index
    const element = itemsArray[index]
    if (element) {
      element.focus()
      onSelect?.(index, element)
    }
  }, [items, onSelect])

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled || !items || items.length === 0) return

    const itemsArray = Array.from(items)
    const currentIndex = currentIndexRef.current
    let nextIndex = currentIndex

    const isVertical = orientation === 'vertical' || orientation === 'both'
    const isHorizontal = orientation === 'horizontal' || orientation === 'both'

    switch (event.key) {
      case KeyCode.ARROW_DOWN:
        if (isVertical) {
          event.preventDefault()
          nextIndex = currentIndex + 1
          if (nextIndex >= itemsArray.length) {
            nextIndex = loop ? 0 : itemsArray.length - 1
          }
        }
        break

      case KeyCode.ARROW_UP:
        if (isVertical) {
          event.preventDefault()
          nextIndex = currentIndex - 1
          if (nextIndex < 0) {
            nextIndex = loop ? itemsArray.length - 1 : 0
          }
        }
        break

      case KeyCode.ARROW_RIGHT:
        if (isHorizontal) {
          event.preventDefault()
          nextIndex = currentIndex + 1
          if (nextIndex >= itemsArray.length) {
            nextIndex = loop ? 0 : itemsArray.length - 1
          }
        }
        break

      case KeyCode.ARROW_LEFT:
        if (isHorizontal) {
          event.preventDefault()
          nextIndex = currentIndex - 1
          if (nextIndex < 0) {
            nextIndex = loop ? itemsArray.length - 1 : 0
          }
        }
        break

      case KeyCode.HOME:
        event.preventDefault()
        nextIndex = 0
        break

      case KeyCode.END:
        event.preventDefault()
        nextIndex = itemsArray.length - 1
        break

      default:
        return
    }

    if (nextIndex !== currentIndex) {
      focusItem(nextIndex)
    }
  }, [enabled, items, loop, orientation, focusItem])

  useEffect(() => {
    if (!enabled) return

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown, enabled])

  return {
    currentIndex: currentIndexRef.current,
    focusItem,
    focusFirst: () => focusItem(0),
    focusLast: () => items && focusItem(items.length - 1),
  }
}

/**
 * Hook for keyboard-navigable list container
 * Attach the returned props to your list container
 */
export function useKeyboardNavigableList<T>(
  items: T[],
  options: {
    onSelect?: (item: T, index: number) => void
    onEscape?: () => void
    initialIndex?: number
    loop?: boolean
    orientation?: 'vertical' | 'horizontal' | 'both'
  } = {}
) {
  const {
    onSelect,
    onEscape,
    initialIndex = 0,
    loop = true,
    orientation = 'vertical',
  } = options

  const [activeIndex, setActiveIndex] = useState(initialIndex)
  const containerRef = useRef<HTMLElement>(null)

  const handleKeyDown = useCallback((event: ReactKeyboardEvent) => {
    const isVertical = orientation === 'vertical' || orientation === 'both'
    const isHorizontal = orientation === 'horizontal' || orientation === 'both'

    let nextIndex = activeIndex

    switch (event.key) {
      case KeyCode.ARROW_DOWN:
        if (isVertical) {
          event.preventDefault()
          nextIndex = activeIndex + 1
          if (nextIndex >= items.length) {
            nextIndex = loop ? 0 : items.length - 1
          }
        }
        break

      case KeyCode.ARROW_UP:
        if (isVertical) {
          event.preventDefault()
          nextIndex = activeIndex - 1
          if (nextIndex < 0) {
            nextIndex = loop ? items.length - 1 : 0
          }
        }
        break

      case KeyCode.ARROW_RIGHT:
        if (isHorizontal) {
          event.preventDefault()
          nextIndex = activeIndex + 1
          if (nextIndex >= items.length) {
            nextIndex = loop ? 0 : items.length - 1
          }
        }
        break

      case KeyCode.ARROW_LEFT:
        if (isHorizontal) {
          event.preventDefault()
          nextIndex = activeIndex - 1
          if (nextIndex < 0) {
            nextIndex = loop ? items.length - 1 : 0
          }
        }
        break

      case KeyCode.HOME:
        event.preventDefault()
        nextIndex = 0
        break

      case KeyCode.END:
        event.preventDefault()
        nextIndex = items.length - 1
        break

      case KeyCode.ENTER:
      case KeyCode.SPACE:
        event.preventDefault()
        if (items[activeIndex]) {
          onSelect?.(items[activeIndex], activeIndex)
        }
        break

      case KeyCode.ESCAPE:
        event.preventDefault()
        onEscape?.()
        break

      default:
        return
    }

    if (nextIndex !== activeIndex) {
      setActiveIndex(nextIndex)
    }
  }, [activeIndex, items, loop, orientation, onSelect, onEscape])

  // Reset active index when items change
  useEffect(() => {
    if (activeIndex >= items.length) {
      setActiveIndex(Math.max(0, items.length - 1))
    }
  }, [items.length, activeIndex])

  return {
    activeIndex,
    setActiveIndex,
    containerRef,
    getContainerProps: () => ({
      ref: containerRef,
      role: 'listbox',
      tabIndex: 0,
      'aria-activedescendant': items[activeIndex] ? `item-${activeIndex}` : undefined,
      onKeyDown: handleKeyDown,
    }),
    getItemProps: (index: number) => ({
      id: `item-${index}`,
      role: 'option',
      'aria-selected': index === activeIndex,
      'data-active': index === activeIndex,
      tabIndex: index === activeIndex ? 0 : -1,
      onMouseEnter: () => setActiveIndex(index),
      onClick: () => {
        const item = items[index]
        if (item !== undefined) {
          onSelect?.(item, index)
        }
      },
    }),
  }
}

/**
 * Hook to detect if user is navigating via keyboard
 */
export function useKeyboardNavigation() {
  const [isKeyboardUser, setIsKeyboardUser] = useState(false)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        setIsKeyboardUser(true)
      }
    }

    const handleMouseDown = () => {
      setIsKeyboardUser(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleMouseDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [])

  return isKeyboardUser
}

/**
 * Skip link component for keyboard accessibility
 * Add this at the top of your page layout
 */
export function SkipLink({
  href = '#main-content',
  children = 'Skip to main content'
}: {
  href?: string
  children?: ReactNode
}) {
  return React.createElement('a', {
    href,
    className: 'sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-background focus:border focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring',
    children,
  })
}

/**
 * Keyboard shortcuts map for displaying in help dialogs
 */
export const globalKeyboardShortcuts = {
  navigation: [
    { keys: ['?'], description: 'Show keyboard shortcuts' },
    { keys: ['g', 'h'], description: 'Go to dashboard (home)' },
    { keys: ['g', 'p'], description: 'Go to projects' },
    { keys: ['g', 's'], description: 'Go to settings' },
    { keys: ['g', 't'], description: 'Go to team' },
    { keys: ['g', 'n'], description: 'Go to notifications' },
  ],
  general: [
    { keys: ['Esc'], description: 'Close modal/dialog' },
    { keys: ['Tab'], description: 'Move to next focusable element' },
    { keys: ['Shift', 'Tab'], description: 'Move to previous focusable element' },
    { keys: ['Enter'], description: 'Activate button/link' },
    { keys: ['Space'], description: 'Toggle checkbox/select option' },
  ],
  lists: [
    { keys: ['↑'], description: 'Previous item' },
    { keys: ['↓'], description: 'Next item' },
    { keys: ['Home'], description: 'Go to first item' },
    { keys: ['End'], description: 'Go to last item' },
    { keys: ['Enter'], description: 'Select item' },
  ],
  forms: [
    { keys: ['Cmd/Ctrl', 'Enter'], description: 'Submit form' },
    { keys: ['Esc'], description: 'Cancel and close' },
  ],
} as const

/**
 * Format keyboard shortcut for display
 */
export function formatShortcutKeys(keys: readonly string[]): string {
  return keys.map(key => {
    // Handle special keys for display
    switch (key.toLowerCase()) {
      case 'cmd/ctrl':
        return typeof navigator !== 'undefined' && navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'
      case 'cmd':
        return '⌘'
      case 'ctrl':
        return 'Ctrl'
      case 'shift':
        return '⇧'
      case 'alt':
        return '⌥'
      case 'enter':
        return '↵'
      case 'esc':
      case 'escape':
        return 'Esc'
      case 'tab':
        return '⇥'
      case 'space':
        return '␣'
      default:
        return key
    }
  }).join(' + ')
}
