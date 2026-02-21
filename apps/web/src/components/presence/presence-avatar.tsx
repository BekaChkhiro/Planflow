'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  type PresenceStatus,
  type WorkingOnData,
  getPresenceColor,
  getPresenceLabel,
  formatLastActive,
} from '@/hooks/use-presence'

// Size variants for the avatar
type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const sizeClasses: Record<AvatarSize, string> = {
  xs: 'h-6 w-6',
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
  xl: 'h-16 w-16',
}

const indicatorSizeClasses: Record<AvatarSize, string> = {
  xs: 'h-2 w-2',
  sm: 'h-2.5 w-2.5',
  md: 'h-3 w-3',
  lg: 'h-3.5 w-3.5',
  xl: 'h-4 w-4',
}

const indicatorPositionClasses: Record<AvatarSize, string> = {
  xs: '-bottom-0.5 -right-0.5',
  sm: '-bottom-0.5 -right-0.5',
  md: 'bottom-0 right-0',
  lg: 'bottom-0.5 right-0.5',
  xl: 'bottom-1 right-1',
}

const textSizeClasses: Record<AvatarSize, string> = {
  xs: 'text-[10px]',
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
  xl: 'text-lg',
}

export interface PresenceAvatarProps {
  /** User's name for initials fallback */
  name?: string | null
  /** User's email for initials fallback */
  email: string
  /** Avatar image URL */
  src?: string | null
  /** Presence status */
  status?: PresenceStatus
  /** Whether to show the presence indicator */
  showIndicator?: boolean
  /** What the user is currently working on */
  workingOn?: WorkingOnData | null
  /** Last active timestamp for tooltip */
  lastActiveAt?: string | null
  /** Size variant */
  size?: AvatarSize
  /** Additional class names for the container */
  className?: string
  /** Additional class names for the avatar */
  avatarClassName?: string
  /** Background color class for fallback */
  fallbackBgColor?: string
  /** Text color class for fallback */
  fallbackTextColor?: string
  /** Whether to show tooltip with presence info */
  showTooltip?: boolean
  /** Pulse animation for online status */
  pulse?: boolean
}

/**
 * Get initials from name or email
 */
function getInitials(name: string | null | undefined, email: string): string {
  if (name) {
    const parts = name.trim().split(' ').filter(Boolean)
    if (parts.length >= 2) {
      const first = parts[0]?.[0] || ''
      const last = parts[parts.length - 1]?.[0] || ''
      return `${first}${last}`.toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

/**
 * Presence indicator dot component
 */
function PresenceIndicator({
  status,
  size,
  pulse,
}: {
  status: PresenceStatus
  size: AvatarSize
  pulse?: boolean
}) {
  return (
    <span
      className={cn(
        'absolute block rounded-full ring-2 ring-white',
        indicatorSizeClasses[size],
        indicatorPositionClasses[size],
        getPresenceColor(status),
        pulse && status === 'online' && 'animate-pulse'
      )}
    />
  )
}

/**
 * Avatar with online presence indicator
 */
export function PresenceAvatar({
  name,
  email,
  src,
  status = 'offline',
  showIndicator = true,
  workingOn,
  lastActiveAt,
  size = 'md',
  className,
  avatarClassName,
  fallbackBgColor = 'bg-blue-100',
  fallbackTextColor = 'text-blue-700',
  showTooltip = true,
  pulse = false,
}: PresenceAvatarProps) {
  const initials = getInitials(name, email)

  const avatarContent = (
    <div className={cn('relative inline-block', className)}>
      <Avatar className={cn(sizeClasses[size], avatarClassName)}>
        {src && <AvatarImage src={src} alt={name || email} />}
        <AvatarFallback className={cn(fallbackBgColor, fallbackTextColor, textSizeClasses[size])}>
          {initials}
        </AvatarFallback>
      </Avatar>
      {showIndicator && (
        <PresenceIndicator status={status} size={size} pulse={pulse} />
      )}
    </div>
  )

  // If no tooltip, just return the avatar
  if (!showTooltip) {
    return avatarContent
  }

  // Build tooltip content
  const tooltipContent = (
    <div className="space-y-1 text-xs">
      <div className="font-medium">{name || email}</div>
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'inline-block h-2 w-2 rounded-full',
            getPresenceColor(status)
          )}
        />
        <span>{getPresenceLabel(status)}</span>
        {status === 'offline' && lastActiveAt && (
          <span className="text-gray-400">· {formatLastActive(lastActiveAt)}</span>
        )}
      </div>
      {workingOn && (
        <div className="mt-1 text-gray-400">
          Working on: <span className="text-gray-200">{workingOn.taskId}</span>
        </div>
      )}
    </div>
  )

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {avatarContent}
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-gray-900 text-white">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * Stack of presence avatars (for showing multiple online users)
 */
export interface PresenceAvatarStackProps {
  users: Array<{
    userId: string
    name?: string | null
    email: string
    src?: string | null
    status: PresenceStatus
    workingOn?: WorkingOnData | null
    lastActiveAt?: string | null
  }>
  /** Maximum number of avatars to show */
  max?: number
  /** Size variant */
  size?: AvatarSize
  /** Additional class names */
  className?: string
}

export function PresenceAvatarStack({
  users,
  max = 4,
  size = 'sm',
  className,
}: PresenceAvatarStackProps) {
  const visibleUsers = users.slice(0, max)
  const remainingCount = Math.max(0, users.length - max)

  return (
    <div className={cn('flex -space-x-2', className)}>
      {visibleUsers.map((user) => (
        <PresenceAvatar
          key={user.userId}
          name={user.name}
          email={user.email}
          src={user.src}
          status={user.status}
          workingOn={user.workingOn}
          lastActiveAt={user.lastActiveAt}
          size={size}
          avatarClassName="ring-2 ring-white"
        />
      ))}
      {remainingCount > 0 && (
        <div
          className={cn(
            'flex items-center justify-center rounded-full bg-gray-200 ring-2 ring-white',
            sizeClasses[size],
            textSizeClasses[size],
            'font-medium text-gray-600'
          )}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  )
}

/**
 * Simple online indicator badge (for minimal UI)
 */
export function OnlineBadge({
  status,
  showLabel = false,
  size = 'md',
  className,
}: {
  status: PresenceStatus
  showLabel?: boolean
  size?: AvatarSize
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className={cn(
          'inline-block rounded-full',
          indicatorSizeClasses[size],
          getPresenceColor(status)
        )}
      />
      {showLabel && (
        <span className={cn('text-gray-600', textSizeClasses[size])}>
          {getPresenceLabel(status)}
        </span>
      )}
    </span>
  )
}
