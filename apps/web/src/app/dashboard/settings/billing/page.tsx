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
      return 'bg-gray-100 text-gray-700 border-gray-200'
    case 'pro':
      return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'team':
      return 'bg-purple-100 text-purple-700 border-purple-200'
    case 'enterprise':
      return 'bg-amber-100 text-amber-700 border-amber-200'
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200'
  }
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-700 border-green-200'
    case 'trialing':
      return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'past_due':
      return 'bg-yellow-100 text-yellow-700 border-yellow-200'
    case 'canceled':
      return 'bg-gray-100 text-gray-500 border-gray-200'
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200'
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
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
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
          <div className="rounded-md bg-yellow-50 border border-yellow-200 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800">
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
          <div className="rounded-md bg-gray-50 border border-gray-200 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-gray-500 shrink-0 mt-0.5" />
              <div className="text-sm text-gray-600">
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
          <div className="rounded-lg border bg-gray-50 p-4">
            <div className="grid gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Current period</span>
                <span className="text-gray-700">
                  {formatDate(subscription.currentPeriodStart)} - {formatDate(subscription.currentPeriodEnd)}
                </span>
              </div>
              {subscription.canceledAt && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Canceled on</span>
                  <span className="text-gray-700">{formatDate(subscription.canceledAt)}</span>
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
          <div className="rounded-md bg-blue-50 border border-blue-200 p-4">
            <div className="flex items-start gap-3">
              <Loader2 className="h-5 w-5 text-blue-600 shrink-0 mt-0.5 animate-spin" />
              <div className="text-sm text-blue-800">
                <p className="font-medium">Setting up your billing account</p>
                <p className="mt-1">
                  Your subscription is being processed. Billing management will be available shortly.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-600">
              In the billing portal, you can:
            </p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                View and download invoices
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                Update your payment method
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
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
              <h3 className="font-semibold text-gray-900">Pro</h3>
              <p className="text-sm text-gray-500">For individuals and small teams</p>
            </div>
            <Badge className="bg-blue-100 text-blue-700 border-blue-200">Popular</Badge>
          </div>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              Unlimited projects
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              Advanced task management
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
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
            <h3 className="font-semibold text-gray-900">Team</h3>
            <p className="text-sm text-gray-500">For growing teams and organizations</p>
          </div>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              Everything in Pro
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              Team collaboration features
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
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
        <h2 className="text-lg font-medium text-gray-900">Billing</h2>
        <p className="text-sm text-gray-500">
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
