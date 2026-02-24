'use client'

import { Loader2, CreditCard, ExternalLink, Check, AlertCircle, Sparkles } from 'lucide-react'

import {
  useSubscription,
  useCreateCheckout,
  useCreatePortalSession,
  isPaidSubscription,
} from '@/hooks/use-subscription'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'

function formatDate(dateString: string | null): string {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function getTierLabel(tier: string): string {
  switch (tier) {
    case 'free':
      return 'Free'
    case 'pro':
      return 'Pro'
    case 'team':
      return 'Team'
    case 'enterprise':
      return 'Enterprise'
    default:
      return tier
  }
}

function getTierBadgeClass(tier: string): string {
  switch (tier) {
    case 'free':
      return 'bg-muted text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600'
    case 'pro':
      return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 border-blue-200 dark:border-blue-700'
    case 'team':
      return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-200 border-purple-200 dark:border-purple-700'
    case 'enterprise':
      return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-200 border-amber-200 dark:border-amber-700'
    default:
      return 'bg-muted text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600'
  }
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-200 border-green-200 dark:border-green-700'
    case 'trialing':
      return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 border-blue-200 dark:border-blue-700'
    case 'past_due':
      return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-200 border-yellow-200 dark:border-yellow-700'
    case 'canceled':
      return 'bg-muted text-muted-foreground border-gray-200 dark:border-gray-600'
    default:
      return 'bg-muted text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600'
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Active'
    case 'trialing':
      return 'Trial'
    case 'past_due':
      return 'Past Due'
    case 'canceled':
      return 'Canceled'
    default:
      return status
  }
}

function SubscriptionStatusCard() {
  const { data: subscription, isLoading, error } = useSubscription()

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64 mt-1" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || !subscription) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
            Failed to load subscription information. Please try again.
          </div>
        </CardContent>
      </Card>
    )
  }

  const isPaid = isPaidSubscription(subscription)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Subscription Status
        </CardTitle>
        <CardDescription>Your current plan and billing information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Past due warning */}
        {subscription.status === 'past_due' && (
          <div className="rounded-md bg-[hsl(var(--warning-bg))] border border-[hsl(var(--warning-border))] p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800 dark:text-yellow-200">
                <p className="font-medium">Payment issue detected</p>
                <p className="mt-1">
                  Please update your payment method to avoid service interruption.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Canceled notice */}
        {subscription.status === 'canceled' && subscription.currentPeriodEnd && (
          <div className="rounded-md bg-muted/50 border border-gray-200 dark:border-gray-600 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium">Subscription canceled</p>
                <p className="mt-1">
                  Your access continues until {formatDate(subscription.currentPeriodEnd)}.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Status badges */}
        <div className="flex items-center gap-3">
          <Badge className={getTierBadgeClass(subscription.tier)}>
            {getTierLabel(subscription.tier)}
          </Badge>
          <Badge className={getStatusBadgeClass(subscription.status)}>
            {getStatusLabel(subscription.status)}
          </Badge>
        </div>

        {/* Billing period for paid users */}
        {isPaid && subscription.currentPeriodStart && subscription.currentPeriodEnd && (
          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="grid gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Current period</span>
                <span className="text-foreground">
                  {formatDate(subscription.currentPeriodStart)} - {formatDate(subscription.currentPeriodEnd)}
                </span>
              </div>
              {subscription.canceledAt && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Canceled on</span>
                  <span className="text-foreground">{formatDate(subscription.canceledAt)}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function BillingActionsCard() {
  const { data: subscription, isLoading } = useSubscription()
  const createPortalSession = useCreatePortalSession()

  if (isLoading || !subscription) {
    return null
  }

  const isPaid = isPaidSubscription(subscription)

  if (!isPaid) {
    return null
  }

  // Check if customer ID exists (webhook may not have processed yet)
  const hasCustomerId = !!subscription.lemonSqueezyCustomerId

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manage Billing</CardTitle>
        <CardDescription>
          Access the billing portal to manage your subscription
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasCustomerId ? (
          <div className="rounded-md bg-[hsl(var(--info-bg))] border border-[hsl(var(--info-border))] p-4">
            <div className="flex items-start gap-3">
              <Loader2 className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5 animate-spin" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <p className="font-medium">Setting up your billing account</p>
                <p className="mt-1">
                  Your subscription is being processed. Billing management will be available shortly.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              In the billing portal, you can:
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                View and download invoices
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                Update your payment method
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                Change or cancel your subscription
              </li>
            </ul>
            <Button
              onClick={() => createPortalSession.mutate()}
              disabled={createPortalSession.isPending}
              className="w-full sm:w-auto"
            >
              {createPortalSession.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="mr-2 h-4 w-4" />
              )}
              Open Billing Portal
            </Button>
            {createPortalSession.isError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                Failed to open billing portal. Please try again.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function UpgradeCard() {
  const { data: subscription, isLoading } = useSubscription()
  const createCheckout = useCreateCheckout()

  if (isLoading || !subscription) {
    return null
  }

  const isPaid = isPaidSubscription(subscription)

  if (isPaid) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          Upgrade Your Plan
        </CardTitle>
        <CardDescription>
          Unlock more features with a paid subscription
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Pro Plan */}
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground">Pro</h3>
              <p className="text-sm text-muted-foreground">For individuals and small teams</p>
            </div>
            <Badge className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">Popular</Badge>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
              Unlimited projects
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
              Advanced task management
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
              Priority support
            </li>
          </ul>
          <Button
            onClick={() => createCheckout.mutate('pro')}
            disabled={createCheckout.isPending}
            className="w-full"
          >
            {createCheckout.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Upgrade to Pro
          </Button>
        </div>

        {/* Team Plan */}
        <div className="rounded-lg border p-4 space-y-3">
          <div>
            <h3 className="font-semibold text-foreground">Team</h3>
            <p className="text-sm text-muted-foreground">For growing teams and organizations</p>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
              Everything in Pro
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
              Team collaboration features
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
              Admin controls and analytics
            </li>
          </ul>
          <Button
            onClick={() => createCheckout.mutate('team')}
            disabled={createCheckout.isPending}
            variant="outline"
            className="w-full"
          >
            {createCheckout.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Upgrade to Team
          </Button>
        </div>

        {createCheckout.isError && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Failed to start checkout. Please try again.
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function BillingSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-foreground">Billing</h2>
        <p className="text-sm text-muted-foreground">
          Manage your subscription and billing settings
        </p>
      </div>

      <Separator />

      <SubscriptionStatusCard />
      <BillingActionsCard />
      <UpgradeCard />
    </div>
  )
}
