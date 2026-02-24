'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Google OAuth Callback Page
 *
 * This page receives the OAuth callback from Google and redirects to the
 * unified OAuth callback handler at /auth/oauth/callback with the provider
 * parameter set to 'google'.
 *
 * Flow:
 * 1. User clicks "Continue with Google"
 * 2. User authorizes on Google's consent screen
 * 3. Google redirects here with code and state params
 * 4. This page redirects to /auth/oauth/callback?provider=google&...
 * 5. The unified callback handler processes the OAuth flow
 */
export default function GoogleCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    // Get all search params from the URL
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    // Build the redirect URL to the unified OAuth callback
    const params = new URLSearchParams()
    params.set('provider', 'google')

    if (code) params.set('code', code)
    if (state) params.set('state', state)
    if (error) params.set('error', error)
    if (errorDescription) params.set('error_description', errorDescription)

    // Redirect to the unified OAuth callback handler
    router.replace(`/auth/oauth/callback?${params.toString()}`)
  }, [searchParams, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 rounded-full bg-muted p-4 w-fit">
            <svg className="h-8 w-8" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
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
          </div>
          <CardTitle>Google Authentication</CardTitle>
          <CardDescription>Redirecting...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Processing your Google authorization...
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
