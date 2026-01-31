'use client'

import { Wifi, WifiOff, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ConnectionStatus } from '@/hooks/use-websocket'

interface ConnectionIndicatorProps {
  status: ConnectionStatus
  className?: string
  showLabel?: boolean
}

const statusConfig: Record<
  ConnectionStatus,
  {
    icon: typeof Wifi
    label: string
    color: string
    bgColor: string
    animate?: boolean
  }
> = {
  connected: {
    icon: Wifi,
    label: 'Live',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  connecting: {
    icon: Loader2,
    label: 'Connecting',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
    animate: true,
  },
  disconnected: {
    icon: WifiOff,
    label: 'Offline',
    color: 'text-gray-400',
    bgColor: 'bg-gray-100',
  },
  error: {
    icon: WifiOff,
    label: 'Error',
    color: 'text-red-500',
    bgColor: 'bg-red-100',
  },
}

export function ConnectionIndicator({
  status,
  className,
  showLabel = true,
}: ConnectionIndicatorProps) {
  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium',
        config.bgColor,
        config.color,
        className
      )}
    >
      <Icon
        className={cn('h-3 w-3', {
          'animate-spin': config.animate,
        })}
      />
      {showLabel && <span>{config.label}</span>}
    </div>
  )
}

/**
 * Minimal dot indicator for tight spaces
 */
export function ConnectionDot({
  status,
  className,
}: {
  status: ConnectionStatus
  className?: string
}) {
  const colorMap: Record<ConnectionStatus, string> = {
    connected: 'bg-green-500',
    connecting: 'bg-yellow-500 animate-pulse',
    disconnected: 'bg-gray-400',
    error: 'bg-red-500',
  }

  return (
    <span
      className={cn('inline-block h-2 w-2 rounded-full', colorMap[status], className)}
      title={statusConfig[status].label}
    />
  )
}
