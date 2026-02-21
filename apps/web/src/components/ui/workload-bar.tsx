import * as React from 'react'

import { cn } from '@/lib/utils'

interface WorkloadBarProps {
  /** Current task count */
  current: number
  /** Maximum capacity (for visual reference) */
  max?: number
  /** Color scheme based on workload status */
  status?: 'light' | 'balanced' | 'heavy' | 'overloaded'
  /** Additional class names */
  className?: string
  /** Show the count label */
  showLabel?: boolean
  /** Height of the bar */
  size?: 'sm' | 'md' | 'lg'
}

const statusColors = {
  light: 'bg-green-500',
  balanced: 'bg-blue-500',
  heavy: 'bg-yellow-500',
  overloaded: 'bg-red-500',
}

const sizeClasses = {
  sm: 'h-2',
  md: 'h-3',
  lg: 'h-4',
}

function WorkloadBar({
  current,
  max = 15,
  status = 'balanced',
  className,
  showLabel = true,
  size = 'md',
}: WorkloadBarProps) {
  const percentage = Math.min((current / max) * 100, 100)
  const color = statusColors[status]
  const heightClass = sizeClasses[size]

  return (
    <div className={cn('w-full', className)}>
      <div className={cn('w-full overflow-hidden rounded-full bg-gray-100', heightClass)}>
        <div
          className={cn('transition-all duration-300 rounded-full', color, heightClass)}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <div className="mt-1 flex justify-between text-xs text-gray-500">
          <span>{current} tasks</span>
          {current > max && (
            <span className="text-red-500 font-medium">+{current - max} over capacity</span>
          )}
        </div>
      )}
    </div>
  )
}

export { WorkloadBar }
export type { WorkloadBarProps }
