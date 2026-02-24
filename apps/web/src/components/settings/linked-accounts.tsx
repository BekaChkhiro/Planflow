'use client'

import { useState } from 'react'
import { Link2, Unlink, Loader2, ExternalLink, CheckCircle2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

import { Button } from '@/components/ui/button'
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
import { useOAuthAccounts, type OAuthProvider } from '@/hooks/use-oauth-accounts'

// GitHub Logo SVG
function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  )
}

// Google Logo SVG
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

interface ProviderConfig {
  id: OAuthProvider
  name: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'github',
    name: 'GitHub',
    icon: GitHubIcon,
    description: 'Sign in with your GitHub account',
  },
  {
    id: 'google',
    name: 'Google',
    icon: GoogleIcon,
    description: 'Sign in with your Google account',
  },
]

export function LinkedAccounts() {
  const { toast } = useToast()
  const {
    accounts,
    hasPassword,
    isLoading,
    isLinking,
    isUnlinking,
    linkProvider,
    unlinkProvider,
    isProviderLinked,
    getProviderAccount,
    isProviderConfigured,
    canUnlinkProvider,
  } = useOAuthAccounts()

  const [unlinkingProvider, setUnlinkingProvider] = useState<OAuthProvider | null>(null)
  const [linkingProvider, setLinkingProvider] = useState<OAuthProvider | null>(null)

  const handleLink = async (provider: OAuthProvider) => {
    setLinkingProvider(provider)
    try {
      // Get the current URL to redirect back after linking
      const redirectUrl = `${window.location.origin}/dashboard/settings/security?linked=${provider}`
      linkProvider({ provider, redirectUrl })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to link account',
        variant: 'destructive',
      })
      setLinkingProvider(null)
    }
  }

  const handleUnlink = async (provider: OAuthProvider) => {
    setUnlinkingProvider(provider)
    try {
      unlinkProvider(provider, {
        onSuccess: () => {
          toast({
            title: 'Account unlinked',
            description: `Your ${provider === 'github' ? 'GitHub' : 'Google'} account has been disconnected.`,
          })
          setUnlinkingProvider(null)
        },
        onError: (error) => {
          toast({
            title: 'Error',
            description: error instanceof Error ? error.message : 'Failed to unlink account',
            variant: 'destructive',
          })
          setUnlinkingProvider(null)
        },
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to unlink account',
        variant: 'destructive',
      })
      setUnlinkingProvider(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Connected Accounts
        </CardTitle>
        <CardDescription>
          Connect your accounts to sign in with a single click. You can also use these to
          recover your account if you forget your password.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {PROVIDERS.map((provider) => {
              const Icon = provider.icon
              const isLinked = isProviderLinked(provider.id)
              const isConfigured = isProviderConfigured(provider.id)
              const account = getProviderAccount(provider.id)
              const isCurrentlyLinking = linkingProvider === provider.id && isLinking
              const isCurrentlyUnlinking = unlinkingProvider === provider.id && isUnlinking

              return (
                <div
                  key={provider.id}
                  className={`flex items-center justify-between rounded-lg border p-4 ${
                    isLinked
                      ? 'border-status-success bg-status-success'
                      : 'border-border'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`rounded-full p-2 ${
                        isLinked ? 'bg-status-success' : 'bg-muted'
                      }`}
                    >
                      <Icon
                        className={`h-5 w-5 ${
                          isLinked ? 'text-status-success' : 'text-muted-foreground'
                        }`}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{provider.name}</span>
                        {isLinked && (
                          <span className="flex items-center gap-1 rounded-full bg-status-success px-2 py-0.5 text-xs font-medium text-status-success">
                            <CheckCircle2 className="h-3 w-3" />
                            Connected
                          </span>
                        )}
                      </div>
                      {isLinked && account ? (
                        <div className="text-sm text-muted-foreground">
                          {account.providerEmail && (
                            <span>{account.providerEmail}</span>
                          )}
                          {account.providerUsername && (
                            <span className="ml-2">@{account.providerUsername}</span>
                          )}
                          {account.createdAt && (
                            <span className="ml-2 text-xs">
                              · Connected{' '}
                              {formatDistanceToNow(new Date(account.createdAt), {
                                addSuffix: true,
                              })}
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {isConfigured ? provider.description : 'Not available'}
                        </p>
                      )}
                    </div>
                  </div>

                  {isLinked ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-status-error hover:bg-status-error"
                          disabled={!canUnlinkProvider(provider.id) || isCurrentlyUnlinking}
                          title={
                            !canUnlinkProvider(provider.id)
                              ? 'You must have at least one login method (password or another connected account)'
                              : undefined
                          }
                        >
                          {isCurrentlyUnlinking ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Unlink className="h-4 w-4" />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Disconnect {provider.name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            You will no longer be able to sign in using your {provider.name}{' '}
                            account. This action can be undone by reconnecting later.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleUnlink(provider.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Disconnect
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleLink(provider.id)}
                      disabled={!isConfigured || isCurrentlyLinking}
                    >
                      {isCurrentlyLinking ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ExternalLink className="mr-2 h-4 w-4" />
                      )}
                      Connect
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {accounts.length === 1 && !hasPassword && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">Note:</span> You cannot disconnect your only
            login method. Set a password or connect another account first.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
