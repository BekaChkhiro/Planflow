import * as React from 'react'

import { cn } from '@/lib/utils'

interface ComplexityBreakdownProps {
  low: number
  medium: number
  high: number
  className?: string
}

function ComplexityBreakdown({ low, medium, high, className }: ComplexityBreakdownProps) {
  const total = low + medium + high

  if (total === 0) {
    return null
  }

  const items = [
    {
      label: 'Low',
      count: low,
      percentage: Math.round((low / total) * 100),
      barColor: 'bg-emerald-500',
      bgColor: 'bg-emerald-50',
      textColor: 'text-emerald-700',
    },
    {
      label: 'Medium',
      count: medium,
      percentage: Math.round((medium / total) * 100),
      barColor: 'bg-amber-500',
      bgColor: 'bg-amber-50',
      textColor: 'text-amber-700',
    },
    {
      label: 'High',
      count: high,
      percentage: Math.round((high / total) * 100),
      barColor: 'bg-rose-500',
      bgColor: 'bg-rose-50',
      textColor: 'text-rose-700',
    },
  ]

  return (
    <div className={cn('grid grid-cols-3 gap-3', className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className={cn('relative overflow-hidden rounded-lg p-3', item.bgColor)}
        >
          {/* Accent bar at top */}
          <div className={cn('absolute inset-x-0 top-0 h-1', item.barColor)} />

          <div className="pt-1">
            <p className={cn('text-2xl font-bold', item.textColor)}>{item.count}</p>
            <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
            <p className="text-xs text-muted-foreground">{item.percentage}%</p>
          </div>
        </div>
      ))}
    </div>
  )
}

export { ComplexityBreakdown }
export type { ComplexityBreakdownProps }
