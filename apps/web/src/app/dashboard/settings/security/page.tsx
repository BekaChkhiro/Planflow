'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Shield, LogOut, Monitor, Smartphone as _Smartphone, Clock, Trash2, AlertTriangle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

import { Button } from '@/components/ui/button'
import { SessionListSkeleton } from '@/components/ui/loading-skeletons'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { useAuthStore } from '@/stores/auth-store'
import { env } from '@/env'
import { LinkedAccounts } from '@/components/settings/linked-accounts'

interface Session {
  id: string
  createdAt: string
  expiresAt: string
  isCurrent: boolean
}

/**
 * Component to handle OAuth linking success notification
 * Separated to properly use useSearchParams with Suspense
 */
function OAuthLinkingNotification() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  useEffect(() => {
    const linkedProvider = searchParams.get('linked')
    if (linkedProvider) {
      toast({
        title: 'Account connected',
        description: `Your ${linkedProvider === 'github' ? 'GitHub' : 'Google'} account has been connected successfully.`,
      })
      // Remove the query param from URL
      router.replace('/dashboard/settings/security', { scroll: false })
    }
  }, [searchParams, toast, router])

  return null
}

export default function SecuritySettingsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { token, refreshToken, logout } = useAuthStore()

  const [sessions, setSessions] = useState<Session[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoggingOutAll, setIsLoggingOutAll] = useState(false)
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null)

  // Fetch active sessions
  useEffect(() => {
    const fetchSessions = async () => {
      if (!token) return

      try {
        const url = new URL(`${env.NEXT_PUBLIC_API_URL}/auth/sessions`)
        if (refreshToken) {
          url.searchParams.set('current', refreshToken)
        }

        const response = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (response.ok) {
          const data = await response.json()
          if (data.success && data.data?.sessions) {
            setSessions(data.data.sessions)
          }
        }
      } catch (error) {
        console.error('Failed to fetch sessions:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchSessions()
  }, [token, refreshToken])

  // Logout from all devices
  const handleLogoutAll = async () => {
    if (!token) return

    setIsLoggingOutAll(true)
    try {
      const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/auth/logout-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ refreshToken }),
      })

      if (response.ok) {
        const data = await response.json()
        toast({
          title: 'Logged out from all devices',
          description: data.data?.message || 'All sessions have been revoked',
        })
        // Logout the current session as well
        await logout()
        router.push('/login')
      } else {
        throw new Error('Failed to logout from all devices')
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to logout from all devices. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsLoggingOutAll(false)
    }
  }

  // Revoke a specific session
  const handleRevokeSession = async (sessionId: string) => {
    if (!token) return

    setRevokingSessionId(sessionId)
    try {
      const response = await fetch(
        `${env.NEXT_PUBLIC_API_URL}/auth/sessions/${sessionId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (response.ok) {
        // Check if this was the current session
        const session = sessions.find((s) => s.id === sessionId)
        if (session?.isCurrent) {
          toast({
            title: 'Session revoked',
            description: 'You have been logged out.',
          })
          await logout()
          router.push('/login')
        } else {
          toast({
            title: 'Session revoked',
            description: 'The session has been terminated.',
          })
          setSessions(sessions.filter((s) => s.id !== sessionId))
        }
      } else {
        throw new Error('Failed to revoke session')
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to revoke session. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setRevokingSessionId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Handle OAuth linking success notification */}
      <Suspense fallback={null}>
        <OAuthLinkingNotification />
      </Suspense>

      <div>
        <h2 className="text-xl font-semibold text-foreground">Security</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your connected accounts, active sessions, and security settings
        </p>
      </div>

      {/* Connected OAuth Accounts */}
      <LinkedAccounts />

      {/* Logout from All Devices */}
      <Card className="border-status-error bg-status-error">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-status-error">
            <AlertTriangle className="h-5 w-5" />
            Logout from All Devices
          </CardTitle>
          <CardDescription className="text-status-error opacity-80">
            This will terminate all active sessions including the current one.
            You will need to log in again on all devices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isLoggingOutAll}>
                <LogOut className="mr-2 h-4 w-4" />
                {isLoggingOutAll ? 'Logging out...' : 'Logout from All Devices'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Logout from all devices?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will immediately terminate all your active sessions,
                  including this one. You will be redirected to the login page.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleLogoutAll}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Yes, logout everywhere
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* Active Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Active Sessions
          </CardTitle>
          <CardDescription>
            These are the devices that are currently logged into your account.
            You can revoke any session to log out from that device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <SessionListSkeleton count={3} />
          ) : sessions.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No active sessions found
            </p>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`flex items-center justify-between rounded-lg border p-4 ${
                    session.isCurrent
                      ? 'border-status-info bg-status-info'
                      : 'border-border'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`rounded-full p-2 ${
                        session.isCurrent ? 'bg-status-info' : 'bg-muted'
                      }`}
                    >
                      <Monitor
                        className={`h-5 w-5 ${
                          session.isCurrent ? 'text-status-info' : 'text-muted-foreground'
                        }`}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">
                          {session.isCurrent ? 'Current Session' : 'Session'}
                        </span>
                        {session.isCurrent && (
                          <span className="rounded-full bg-status-info px-2 py-0.5 text-xs font-medium text-status-info">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          Created{' '}
                          {formatDistanceToNow(new Date(session.createdAt), {
                            addSuffix: true,
                          })}
                        </span>
                        <span>
                          Expires{' '}
                          {formatDistanceToNow(new Date(session.expiresAt), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-status-error hover:bg-status-error"
                        disabled={revokingSessionId === session.id}
                      >
                        {revokingSessionId === session.id ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-destructive" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Revoke {session.isCurrent ? 'current ' : ''}session?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {session.isCurrent
                            ? 'This will log you out immediately. You will need to log in again.'
                            : 'This will terminate the session on that device. They will need to log in again.'}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleRevokeSession(session.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {session.isCurrent ? 'Yes, log me out' : 'Revoke session'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Security Tips</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong>Review your sessions regularly</strong> - If you see any
            sessions you don&apos;t recognize, revoke them immediately.
          </p>
          <p>
            <strong>Use unique passwords</strong> - Don&apos;t reuse passwords across
            different services.
          </p>
          <p>
            <strong>Logout from shared devices</strong> - Always logout when
            using a shared or public computer.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
