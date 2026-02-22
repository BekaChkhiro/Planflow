'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface SkipLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  /** Target element ID to skip to (without #) */
  targetId?: string
  /** Custom label for the skip link */
  label?: string
}

/**
 * Skip Link Component
 *
 * Allows keyboard users to skip navigation and go directly to main content.
 * The link is visually hidden until focused.
 *
 * Usage:
 * 1. Add <SkipLink /> at the top of your layout
 * 2. Add id="main-content" to your main content container
 */
export function SkipLink({
  targetId = 'main-content',
  label = 'Skip to main content',
  className,
  ...props
}: SkipLinkProps) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()

    const target = document.getElementById(targetId)
    if (target) {
      // Make the target focusable if it isn't already
      if (!target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1')
      }
      target.focus()
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <a
      href={`#${targetId}`}
      onClick={handleClick}
      className={cn(
        // Visually hidden by default
        'fixed left-4 top-4 z-[100] -translate-y-full opacity-0',
        // Visible when focused
        'focus:translate-y-0 focus:opacity-100',
        // Visual styling
        'rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground',
        'shadow-lg ring-2 ring-primary ring-offset-2',
        // Transitions
        'transition-all duration-200',
        // Focus styles
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        className
      )}
      {...props}
    >
      {label}
    </a>
  )
}

/**
 * Main Content Container
 *
 * Wrapper for main content that provides the target for skip link
 * and proper ARIA landmark.
 */
export function MainContent({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={cn('outline-none', className)}
      {...props}
    >
      {children}
    </main>
  )
}
