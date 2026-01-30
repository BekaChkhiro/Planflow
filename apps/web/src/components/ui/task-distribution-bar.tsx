import * as React from 'react'

import { cn } from '@/lib/utils'

interface TaskDistributionBarProps {
  done: number
  inProgress: number
  blocked: number
  todo: number
  className?: string
  showLegend?: boolean
}

function TaskDistributionBar({
  done,
  inProgress,
  blocked,
  todo,
  className,
  showLegend = true,
}: TaskDistributionBarProps) {
  const total = done + inProgress + blocked + todo

  if (total === 0) {
    return null
  }

  const segments = [
    { label: 'Done', count: done, color: 'bg-green-500', textColor: 'text-green-600' },
    { label: 'In Progress', count: inProgress, color: 'bg-blue-500', textColor: 'text-blue-600' },
    { label: 'Blocked', count: blocked, color: 'bg-red-500', textColor: 'text-red-600' },
    { label: 'To Do', count: todo, color: 'bg-gray-300', textColor: 'text-gray-600' },
  ].filter((s) => s.count > 0)

  return (
    <div className={cn('w-full', className)}>
      {/* Stacked bar */}
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-gray-100">
        {segments.map((segment) => {
          const percentage = (segment.count / total) * 100
          return (
            <div
              key={segment.label}
              className={cn('transition-all duration-300', segment.color)}
              style={{ width: `${percentage}%` }}
              title={`${segment.label}: ${segment.count} (${Math.round(percentage)}%)`}
            />
          )
        })}
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="mt-3 flex flex-wrap gap-4">
          {segments.map((segment) => {
            const percentage = Math.round((segment.count / total) * 100)
            return (
              <div key={segment.label} className="flex items-center gap-2">
                <div className={cn('h-3 w-3 rounded-full', segment.color)} />
                <span className="text-sm">
                  <span className={cn('font-medium', segment.textColor)}>{segment.count}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    {segment.label} ({percentage}%)
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export { TaskDistributionBar }
export type { TaskDistributionBarProps }
