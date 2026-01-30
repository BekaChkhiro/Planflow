'use client'

import Link from 'next/link'
import { AlertTriangle, CreditCard, Sparkles } from 'lucide-react'
import type { ProjectLimits } from '@planflow/shared'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatProjectLimit } from '@/hooks/use-projects'

interface UpgradePromptProps {
  limits: ProjectLimits
}

export function UpgradePrompt({ limits }: UpgradePromptProps) {
  // Different messages based on subscription status
  if (limits.status === 'past_due') {
    return (
      <Alert variant="destructive" className="mb-6">
        <CreditCard className="h-4 w-4" />
        <AlertTitle>Payment Required</AlertTitle>
        <AlertDescription className="flex flex-col gap-3">
          <p>
            Your payment method needs to be updated. Please update your billing information to continue creating projects.
          </p>
          <div>
            <Button asChild size="sm" variant="destructive">
              <Link href="/settings/billing">Update Payment</Link>
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    )
  }

  if (limits.status === 'canceled') {
    return (
      <Alert className="mb-6 border-amber-200 bg-amber-50">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-900">Subscription Canceled</AlertTitle>
        <AlertDescription className="flex flex-col gap-3">
          <p className="text-amber-800">
            Your subscription has been canceled. You can still access your existing projects, but new project creation is limited to the free tier ({limits.maxProjects} projects max).
          </p>
          <div>
            <Button asChild size="sm" variant="outline" className="border-amber-300 hover:bg-amber-100">
              <Link href="/settings/billing">Resubscribe</Link>
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    )
  }

  // At limit on free tier
  return (
    <Alert className="mb-6 border-blue-200 bg-blue-50">
      <Sparkles className="h-4 w-4 text-blue-600" />
      <AlertTitle className="text-blue-900">Project Limit Reached</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p className="text-blue-800">
          You&apos;ve reached the maximum of {limits.maxProjects} projects on the free tier. Upgrade to Pro for unlimited projects and premium features.
        </p>
        <div>
          <Button asChild size="sm" className="bg-blue-600 hover:bg-blue-700">
            <Link href="/settings/billing">Upgrade to Pro</Link>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
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
