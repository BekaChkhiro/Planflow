import * as React from 'react'
import { CheckCircle2, Circle, Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

interface PhaseData {
  phase: number
  total: number
  done: number
  inProgress: number
}

interface PhaseProgressProps {
  phases: PhaseData[]
  className?: string
}

function PhaseProgress({ phases, className }: PhaseProgressProps) {
  if (phases.length === 0) {
    return null
  }

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-start justify-between gap-2">
        {phases.map((phase, index) => {
          const progress = phase.total > 0 ? Math.round((phase.done / phase.total) * 100) : 0
          const isComplete = progress === 100
          const hasInProgress = phase.inProgress > 0
          const notStarted = phase.done === 0 && phase.inProgress === 0

          return (
            <div key={phase.phase} className="flex flex-1 flex-col items-center">
              {/* Connector line + Node */}
              <div className="flex w-full items-center">
                {/* Left connector */}
                {index > 0 && (
                  <div
                    className={cn(
                      'h-0.5 flex-1',
                      phases[index - 1]!.done === phases[index - 1]!.total
                        ? 'bg-green-500'
                        : 'bg-gray-200'
                    )}
                  />
                )}
                {index === 0 && <div className="flex-1" />}

                {/* Node */}
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors',
                    isComplete && 'border-green-500 bg-green-50 text-green-600',
                    hasInProgress && !isComplete && 'border-blue-500 bg-blue-50 text-blue-600',
                    notStarted && 'border-gray-300 bg-gray-50 text-gray-400'
                  )}
                >
                  {isComplete ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : hasInProgress ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </div>

                {/* Right connector */}
                {index < phases.length - 1 && (
                  <div
                    className={cn('h-0.5 flex-1', isComplete ? 'bg-green-500' : 'bg-gray-200')}
                  />
                )}
                {index === phases.length - 1 && <div className="flex-1" />}
              </div>

              {/* Phase label and stats */}
              <div className="mt-2 text-center">
                <p className="text-sm font-medium">Phase {phase.phase}</p>
                <p className="text-xs text-muted-foreground">
                  {phase.done}/{phase.total}
                </p>
              </div>

              {/* Mini progress bar */}
              <div className="mt-1 h-1 w-full max-w-[60px] overflow-hidden rounded-full bg-gray-200">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-300',
                    isComplete && 'bg-green-500',
                    hasInProgress && !isComplete && 'bg-blue-500',
                    notStarted && 'bg-gray-300'
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export { PhaseProgress }
export type { PhaseProgressProps, PhaseData }
