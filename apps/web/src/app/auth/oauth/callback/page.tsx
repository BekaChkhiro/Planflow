'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, CheckCircle, XCircle, Github } from 'lucide-react'
import { useOAuthAuth, OAuthCallbackError, OAuthErrorCode } from '@/hooks/use-oauth-auth'
import { useAuthAnalytics } from '@/hooks/use-analytics'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type CallbackState = 'processing' | 'success' | 'error'
type OAuthProvider = 'github' | 'google'

// Error messages for specific error codes (T18.10)
function getErrorMessage(error: unknown, providerName: string): {
  title: string
  message: string
  hint?: string
} {
  if (error instanceof OAuthCallbackError) {
    switch (error.errorCode) {
      case OAuthErrorCode.EMAIL_EXISTS_UNVERIFIED:
        return {
          title: 'Account Already Exists',
          message: `An account with this email already exists. For security, we cannot automatically link your ${providerName} account because your email is not verified.`,
          hint: error.details?.existingProvider
            ? `Please sign in with your ${error.details.existingProvider === 'password' ? 'email and password' : error.details.existingProvider}, then link ${providerName} from Settings > Security.`
            : `Please sign in with your existing account, then link ${providerName} from Settings > Security.`,
        }
      case OAuthErrorCode.EMAIL_REQUIRED:
        return {
          title: 'Email Required',
          message: `We couldn't get your email from ${providerName}. Please make sure your email is visible in your ${providerName} settings.`,
          hint: `Check your ${providerName} privacy settings and try again.`,
        }
      case OAuthErrorCode.ACCOUNT_ALREADY_LINKED:
        return {
          title: 'Already Linked',
          message: `This ${providerName} account is already linked to a different user.`,
          hint: 'If this is your account, please contact support.',
        }
      default:
        return {
          title: 'Authentication Failed',
          message: error.message,
        }
    }
  }

  // Generic error handling
  if (error instanceof Error) {
    return {
      title: 'Authentication Failed',
      message: error.message,
    }
  }

  return {
    title: 'Authentication Failed',
    message: 'An unexpected error occurred',
  }
}

// Google icon component
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
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

export default function OAuthCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { trackLogin } = useAuthAnalytics()
  const [state, setState] = useState<CallbackState>('processing')
  const [errorInfo, setErrorInfo] = useState<{
    title: string
    message: string
    hint?: string
  } | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const [isNewUser, setIsNewUser] = useState(false)
  const [isLinkedAccount, setIsLinkedAccount] = useState(false)
  const [provider, setProvider] = useState<OAuthProvider>('github')

  const { completeOAuthFlow } = useOAuthAuth()

  // Prevent double execution (React StrictMode, HMR, etc.)
  const hasProcessedRef = useRef(false)

  useEffect(() => {
    // Skip if already processed
    if (hasProcessedRef.current) {
      return
    }

    const code = searchParams.get('code')
    const stateParam = searchParams.get('state')
    const errorParam = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')
    const providerParam = searchParams.get('provider') as OAuthProvider | null

    // Set provider from URL or default to github
    if (providerParam && (providerParam === 'github' || providerParam === 'google')) {
      setProvider(providerParam)
    }

    // Handle OAuth error response
    if (errorParam) {
      hasProcessedRef.current = true
      setState('error')
      setErrorInfo({
        title: 'Authorization Denied',
        message: errorDescription || 'OAuth authorization was denied or failed',
      })
      return
    }

    // Validate required parameters
    if (!code || !stateParam) {
      hasProcessedRef.current = true
      setState('error')
      setErrorInfo({
        title: 'Invalid Request',
        message: 'Missing required authorization parameters',
      })
      return
    }

    // Mark as processing to prevent duplicate calls
    hasProcessedRef.current = true

    // Determine provider - use URL param (from redirect) or default to github
    // Note: state is just a random hex string, not "provider:state" format
    const finalProvider: OAuthProvider =
      (providerParam === 'github' || providerParam === 'google')
        ? providerParam
        : 'github'

    setProvider(finalProvider)

    // Exchange code for token
    async function completeAuthorization() {
      try {
        const result = await completeOAuthFlow(finalProvider, code!, stateParam!)

        setUserName(result.user.name || result.user.email)
        setIsNewUser(result.isNewUser)
        setIsLinkedAccount(result.isLinkedAccount)
        setState('success')

        // Track login/signup event (only for new logins, not account linking)
        if (!result.isLinkedAccount) {
          trackLogin(result.user.id, result.user.email, finalProvider)
        }

        // Redirect after a short delay
        setTimeout(() => {
          if (result.isLinkedAccount && result.redirectUrl) {
            // For account linking, redirect to the original page (settings)
            router.push(result.redirectUrl)
          } else {
            // For login/register, redirect to dashboard
            router.push('/dashboard')
          }
        }, 2000)
      } catch (err) {
        setState('error')
        // Get formatted error message based on error type (T18.10)
        const errorDetails = getErrorMessage(err, finalProvider === 'github' ? 'GitHub' : 'Google')
        setErrorInfo(errorDetails)
      }
    }

    completeAuthorization()
  }, [searchParams, completeOAuthFlow, router, trackLogin])

  const ProviderIcon = provider === 'github' ? Github : GoogleIcon
  const providerName = provider === 'github' ? 'GitHub' : 'Google'

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 rounded-full bg-muted p-4 w-fit">
            <ProviderIcon className="h-8 w-8 text-foreground" />
          </div>
          <CardTitle>{providerName} Authentication</CardTitle>
          <CardDescription>
            {state === 'processing' && 'Completing authentication...'}
            {state === 'success' && (
              isLinkedAccount
                ? 'Account connected!'
                : isNewUser
                  ? 'Account created!'
                  : 'Successfully signed in!'
            )}
            {state === 'error' && (errorInfo?.title || 'Authentication failed')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === 'processing' && (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Verifying your {providerName} authorization...
              </p>
            </div>
          )}

          {state === 'success' && (
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-3">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">
                  {isLinkedAccount
                    ? `${providerName} account connected!`
                    : `Welcome${isNewUser ? '' : ' back'}, ${userName}!`
                  }
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {isLinkedAccount
                    ? 'Redirecting to settings...'
                    : 'Redirecting to dashboard...'
                  }
                </p>
              </div>
            </div>
          )}

          {state === 'error' && errorInfo && (
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-3">
                <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <div className="text-center space-y-2">
                <p className="font-medium text-foreground">{errorInfo.title}</p>
                <p className="text-sm text-muted-foreground">{errorInfo.message}</p>
                {errorInfo.hint && (
                  <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
                    💡 {errorInfo.hint}
                  </p>
                )}
              </div>
              <div className="flex gap-2 mt-2">
                <Button
                  variant="outline"
                  onClick={() => router.push('/login')}
                >
                  Back to Login
                </Button>
                <Button onClick={() => window.location.reload()}>
                  Try Again
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
