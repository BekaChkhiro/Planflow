'use client'

import * as React from 'react'
import { useKeyboardNavigation } from '@/lib/accessibility'

/**
 * Context for keyboard navigation state
 */
const KeyboardNavigationContext = React.createContext<boolean>(false)

/**
 * Hook to check if user is navigating with keyboard
 */
export function useIsKeyboardUser() {
  return React.useContext(KeyboardNavigationContext)
}

/**
 * Focus Visible Provider
 *
 * Adds a 'keyboard-user' class to the document body when the user
 * is navigating with keyboard. This enables enhanced focus styles.
 *
 * Usage: Wrap your app with this provider in the root layout.
 *
 * CSS example:
 * ```css
 * .keyboard-user *:focus-visible {
 *   outline: 2px solid var(--ring);
 *   outline-offset: 2px;
 * }
 * ```
 */
export function FocusVisibleProvider({ children }: { children: React.ReactNode }) {
  const isKeyboardUser = useKeyboardNavigation()

  React.useEffect(() => {
    if (isKeyboardUser) {
      document.body.classList.add('keyboard-user')
    } else {
      document.body.classList.remove('keyboard-user')
    }

    return () => {
      document.body.classList.remove('keyboard-user')
    }
  }, [isKeyboardUser])

  return (
    <KeyboardNavigationContext.Provider value={isKeyboardUser}>
      {children}
    </KeyboardNavigationContext.Provider>
  )
}

/**
 * Focus ring component that wraps focusable elements
 * Provides consistent focus ring styling
 */
export function FocusRing({
  children,
  className,
  offset = 2,
  color = 'ring',
}: {
  children: React.ReactNode
  className?: string
  offset?: number
  color?: 'ring' | 'primary' | 'destructive'
}) {
  const colorClasses = {
    ring: 'focus-visible:ring-ring',
    primary: 'focus-visible:ring-primary',
    destructive: 'focus-visible:ring-destructive',
  }

  const offsetClasses = {
    0: 'focus-visible:ring-offset-0',
    1: 'focus-visible:ring-offset-1',
    2: 'focus-visible:ring-offset-2',
    4: 'focus-visible:ring-offset-4',
  }

  return (
    <div
      className={`
        focus-visible:outline-none
        focus-visible:ring-2
        ${colorClasses[color]}
        ${offsetClasses[offset as keyof typeof offsetClasses] || 'focus-visible:ring-offset-2'}
        ${className || ''}
      `}
    >
      {children}
    </div>
  )
}

/**
 * Focus trap hook that keeps focus within a container
 * Useful for modals, dialogs, and dropdown menus
 */
export function useFocusOnMount(
  ref: React.RefObject<HTMLElement>,
  options: {
    enabled?: boolean
    autoFocus?: boolean
    restoreFocus?: boolean
  } = {}
) {
  const { enabled = true, autoFocus = true, restoreFocus = true } = options
  const previousFocusRef = React.useRef<HTMLElement | null>(null)

  React.useEffect(() => {
    if (!enabled) return

    // Store the previously focused element
    if (restoreFocus) {
      previousFocusRef.current = document.activeElement as HTMLElement
    }

    // Auto-focus the container or first focusable element
    if (autoFocus && ref.current) {
      const focusableElements = ref.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      const firstFocusable = focusableElements[0]

      if (firstFocusable) {
        // Use setTimeout to ensure the element is ready
        setTimeout(() => firstFocusable.focus(), 0)
      } else {
        ref.current.focus()
      }
    }

    return () => {
      // Restore focus on unmount
      if (restoreFocus && previousFocusRef.current) {
        previousFocusRef.current.focus()
      }
    }
  }, [ref, enabled, autoFocus, restoreFocus])
}

/**
 * Roving tabindex hook for keyboard navigation in lists/grids
 * Only one item in the group is focusable at a time
 */
export function useRovingTabIndex<T extends HTMLElement>(
  containerRef: React.RefObject<HTMLElement>,
  options: {
    selector?: string
    orientation?: 'horizontal' | 'vertical' | 'both'
    loop?: boolean
  } = {}
) {
  const { selector = '[role="option"], [role="menuitem"], button', orientation = 'vertical', loop = true } = options
  const [activeIndex, setActiveIndex] = React.useState(0)

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const items = container.querySelectorAll<T>(selector)

    // Set initial tabindex
    items.forEach((item, index) => {
      item.setAttribute('tabindex', index === activeIndex ? '0' : '-1')
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      const items = container.querySelectorAll<T>(selector)
      if (items.length === 0) return

      let nextIndex = activeIndex
      const isVertical = orientation === 'vertical' || orientation === 'both'
      const isHorizontal = orientation === 'horizontal' || orientation === 'both'

      switch (event.key) {
        case 'ArrowDown':
          if (isVertical) {
            event.preventDefault()
            nextIndex = activeIndex + 1
            if (nextIndex >= items.length) nextIndex = loop ? 0 : items.length - 1
          }
          break
        case 'ArrowUp':
          if (isVertical) {
            event.preventDefault()
            nextIndex = activeIndex - 1
            if (nextIndex < 0) nextIndex = loop ? items.length - 1 : 0
          }
          break
        case 'ArrowRight':
          if (isHorizontal) {
            event.preventDefault()
            nextIndex = activeIndex + 1
            if (nextIndex >= items.length) nextIndex = loop ? 0 : items.length - 1
          }
          break
        case 'ArrowLeft':
          if (isHorizontal) {
            event.preventDefault()
            nextIndex = activeIndex - 1
            if (nextIndex < 0) nextIndex = loop ? items.length - 1 : 0
          }
          break
        case 'Home':
          event.preventDefault()
          nextIndex = 0
          break
        case 'End':
          event.preventDefault()
          nextIndex = items.length - 1
          break
        default:
          return
      }

      if (nextIndex !== activeIndex) {
        setActiveIndex(nextIndex)
        items.forEach((item, index) => {
          item.setAttribute('tabindex', index === nextIndex ? '0' : '-1')
        })
        items[nextIndex]?.focus()
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => container.removeEventListener('keydown', handleKeyDown)
  }, [containerRef, activeIndex, selector, orientation, loop])

  return { activeIndex, setActiveIndex }
}
