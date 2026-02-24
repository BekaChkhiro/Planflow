'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Loader2, CheckCircle, XCircle, Users, Building2, UserPlus, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/stores/auth-store'
import { api, ApiError } from '@/lib/api'
import { authApi } from '@/lib/auth-api'
import { getRoleLabel } from '@/hooks/use-team'
import type { MemberRole } from '@/hooks/use-team'

interface InvitationDetails {
  id: string
  email: string
  role: MemberRole
  expiresAt: string
  createdAt: string
  organizationName: string
  inviterName: string
}

interface InvitationResponse {
  success: boolean
  data?: {
    invitation: InvitationDetails
  }
  error?: string
}

interface AcceptResponse {
  success: boolean
  data?: {
    organization: {
      id: string
      name: string
      slug: string
    }
  }
  error?: string
}

type PageState = 'loading' | 'ready' | 'accepting' | 'declining' | 'success' | 'declined' | 'error'

export default function InvitationPage() {
  const router = useRouter()
  const params = useParams()
  const token = params['token'] as string

  const [state, setState] = useState<PageState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null)
  const [acceptedOrg, setAcceptedOrg] = useState<{ name: string; slug: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { isAuthenticated, user, isInitialized } = useAuthStore()

  // Fetch invitation details
  useEffect(() => {
    async function fetchInvitation() {
      try {
        const response = await api.get<InvitationResponse>(`/invitations/${token}`)

        if (response.success && response.data) {
          setInvitation(response.data.invitation)
          setState('ready')
        } else {
          setError(response.error || 'Failed to load invitation')
          setState('error')
        }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            setError('This invitation link is invalid or has been revoked.')
          } else if (err.status === 410) {
            setError('This invitation has expired or has already been accepted.')
          } else {
            setError(err.message || 'Failed to load invitation')
          }
        } else {
          setError('An unexpected error occurred')
        }
        setState('error')
      }
    }

    if (token) {
      fetchInvitation()
    }
  }, [token])

  // Redirect to login if not authenticated (after initialization)
  useEffect(() => {
    if (isInitialized && !isAuthenticated && state === 'ready') {
      const returnUrl = encodeURIComponent(`/invitations/${token}`)
      router.push(`/login?returnUrl=${returnUrl}`)
    }
  }, [isInitialized, isAuthenticated, state, token, router])

  async function handleAccept() {
    setIsSubmitting(true)
    try {
      const response = await authApi.post<AcceptResponse>(`/invitations/${token}/accept`)

      if (response.success && response.data) {
        setAcceptedOrg({
          name: response.data.organization.name,
          slug: response.data.organization.slug,
        })
        setState('success')

        // Redirect to dashboard after a short delay
        setTimeout(() => {
          router.push('/dashboard/team')
        }, 2000)
      } else {
        setError(response.error || 'Failed to accept invitation')
        setState('error')
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          setError('This invitation was sent to a different email address. Please log in with the correct account.')
        } else if (err.status === 409) {
          setError('This invitation has already been accepted.')
        } else if (err.status === 410) {
          setError('This invitation has expired.')
        } else {
          setError(err.message || 'Failed to accept invitation')
        }
      } else {
        setError('An unexpected error occurred')
      }
      setState('error')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDecline() {
    setIsSubmitting(true)
    try {
      await authApi.post(`/invitations/${token}/decline`)
      setState('declined')

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.push('/dashboard')
      }, 2000)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Failed to decline invitation')
      } else {
        setError('An unexpected error occurred')
      }
      setState('error')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Show loading while checking auth state
  if (!isInitialized || state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 rounded-full bg-muted p-4 w-fit">
              <Users className="h-8 w-8 text-foreground" />
            </div>
            <CardTitle>Team Invitation</CardTitle>
            <CardDescription>Loading invitation details...</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    )
  }

  // Error state
  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-950 p-4 w-fit">
              <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <CardTitle>Invitation Error</CardTitle>
            <CardDescription className="text-red-600 dark:text-red-400">{error}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="outline" onClick={() => router.push('/dashboard')}>
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Success state
  if (state === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-950 p-4 w-fit">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle>Welcome to the team!</CardTitle>
            <CardDescription>
              You have successfully joined <strong>{acceptedOrg?.name}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <p className="text-sm text-muted-foreground">Redirecting to your team...</p>
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    )
  }

  // Declined state
  if (state === 'declined') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 rounded-full bg-muted p-4 w-fit">
              <XCircle className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle>Invitation Declined</CardTitle>
            <CardDescription>You have declined this invitation.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <p className="text-sm text-muted-foreground">Redirecting to dashboard...</p>
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    )
  }

  // Ready state - show invitation details
  if (state === 'ready' && invitation && isAuthenticated) {
    const expiresAt = new Date(invitation.expiresAt)
    const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))

    // Check if the invitation email matches the logged-in user's email
    const emailMismatch = user?.email && invitation.email !== user.email

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 rounded-full bg-blue-100 dark:bg-blue-950 p-4 w-fit">
              <UserPlus className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <CardTitle>You&apos;re Invited!</CardTitle>
            <CardDescription>
              You have been invited to join a team
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Organization</p>
                  <p className="font-medium">{invitation.organizationName}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                <Users className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Invited by</p>
                  <p className="font-medium">{invitation.inviterName}</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Your role</p>
                    <Badge variant="secondary">{getRoleLabel(invitation.role)}</Badge>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Expires in</p>
                  <p className="text-sm font-medium">{daysLeft} day{daysLeft !== 1 ? 's' : ''}</p>
                </div>
              </div>
            </div>

            {emailMismatch && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-200">
                <p className="font-medium">Email mismatch</p>
                <p>This invitation was sent to <strong>{invitation.email}</strong>, but you are logged in as <strong>{user?.email}</strong>.</p>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleDecline}
                disabled={isSubmitting}
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Decline
              </Button>
              <Button
                className="flex-1"
                onClick={handleAccept}
                disabled={isSubmitting || !!emailMismatch}
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Accept
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Fallback loading (waiting for auth redirect)
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 rounded-full bg-muted p-4 w-fit">
            <Users className="h-8 w-8 text-foreground" />
          </div>
          <CardTitle>Team Invitation</CardTitle>
          <CardDescription>Redirecting to login...</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    </div>
  )
}
