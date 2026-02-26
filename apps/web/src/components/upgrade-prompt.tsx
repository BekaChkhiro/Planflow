'use client'

import type { ProjectLimits } from '@planflow/shared'

import { Badge } from '@/components/ui/badge'
import { formatProjectLimit } from '@/hooks/use-projects'

interface UpgradePromptProps {
  limits: ProjectLimits
}

export function UpgradePrompt({ limits: _limits }: UpgradePromptProps) {
  // During free early access period, no upgrade prompts are shown
  // All features are available for free
  return null
}

interface ProjectLimitBadgeProps {
  limits: ProjectLimits
  className?: string
}

export function ProjectLimitBadge({ limits, className }: ProjectLimitBadgeProps) {
  const limitText = formatProjectLimit(limits)

  // Unlimited (Pro/Team/Enterprise)
  if (limits.maxProjects === -1) {
    return (
      <Badge variant="secondary" className={className}>
        {limitText}
      </Badge>
    )
  }

  // At limit
  if (!limits.canCreate) {
    return (
      <Badge variant="destructive" className={className}>
        {limitText}
      </Badge>
    )
  }

  // Near limit (80% or more)
  const usagePercent = (limits.currentCount / limits.maxProjects) * 100
  if (usagePercent >= 80) {
    return (
      <Badge variant="outline" className={`border-amber-300 bg-amber-50 text-amber-700 ${className}`}>
        {limitText}
      </Badge>
    )
  }

  // Normal usage
  return (
    <Badge variant="outline" className={className}>
      {limitText}
    </Badge>
  )
}
