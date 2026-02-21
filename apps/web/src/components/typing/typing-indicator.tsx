'use client'

import { cn } from '@/lib/utils'
import { formatTypingIndicator, type TypingUserDisplay } from '@/hooks/use-typing-indicators'

interface TypingIndicatorProps {
  users: TypingUserDisplay[]
  className?: string
}

/**
 * Animated typing indicator dots
 */
function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5 ml-1">
      <span
        className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce"
        style={{ animationDelay: '0ms' }}
      />
      <span
        className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce"
        style={{ animationDelay: '150ms' }}
      />
      <span
        className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce"
        style={{ animationDelay: '300ms' }}
      />
    </span>
  )
}

/**
 * Typing indicator component that shows who is currently typing
 * Shows animated dots and user names
 */
export function TypingIndicator({ users, className }: TypingIndicatorProps) {
  if (users.length === 0) {
    return null
  }

  const text = formatTypingIndicator(users)
  // Remove "..." from the end since we'll add animated dots
  const displayText = text.replace(/\.{3}$/, '')

  return (
    <div
      className={cn(
        'flex items-center text-sm text-muted-foreground animate-in fade-in duration-200',
        className
      )}
    >
      <span>{displayText}</span>
      <TypingDots />
    </div>
  )
}

/**
 * Compact typing indicator for use in tight spaces
 * Just shows dots with tooltip
 */
export function TypingIndicatorCompact({
  users,
  className,
}: TypingIndicatorProps) {
  if (users.length === 0) {
    return null
  }

  const text = formatTypingIndicator(users)

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1',
        className
      )}
      title={text}
    >
      <span className="text-xs text-muted-foreground">
        {users.length === 1 && users[0]
          ? (users[0].name || users[0].email.split('@')[0])
          : `${users.length} typing`}
      </span>
      <TypingDots />
    </div>
  )
}
