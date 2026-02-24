'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, CheckCircle, XCircle, Github } from 'lucide-react'
import { useGitHubCallback } from '@/hooks/use-github'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type CallbackState = 'processing' | 'success' | 'error'

export default function GitHubCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [state, setState] = useState<CallbackState>('processing')
  const [error, setError] = useState<string | null>(null)
  const [username, setUsername] = useState<string | null>(null)

  const githubCallback = useGitHubCallback()

  useEffect(() => {
    const code = searchParams.get('code')
    const stateParam = searchParams.get('state')
    const errorParam = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    // Handle GitHub error response
    if (errorParam) {
      setState('error')
      setError(errorDescription || 'GitHub authorization was denied or failed')
      return
    }

    // Validate required parameters
    if (!code || !stateParam) {
      setState('error')
      setError('Missing required authorization parameters')
      return
    }

    // Exchange code for token
    async function completeAuthorization() {
      try {
        const result = await githubCallback.mutateAsync({
          code: code!,
          state: stateParam!,
        })

        setUsername(result.integration.githubUsername)
        setState('success')

        // Redirect to integrations page after a short delay
        setTimeout(() => {
          router.push('/dashboard/settings/integrations?github=connected')
        }, 2000)
      } catch (err) {
        setState('error')
        if (err instanceof Error) {
          // Try to parse API error message
          try {
            const parsed = JSON.parse(err.message)
            setError(parsed.error || err.message)
          } catch {
            setError(err.message)
          }
        } else {
          setError('Failed to complete GitHub authorization')
        }
      }
    }

    completeAuthorization()
  }, [searchParams, githubCallback, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 rounded-full bg-muted p-4 w-fit">
            <Github className="h-8 w-8 text-foreground" />
          </div>
          <CardTitle>GitHub Integration</CardTitle>
          <CardDescription>
            {state === 'processing' && 'Completing authorization...'}
            {state === 'success' && 'Successfully connected!'}
            {state === 'error' && 'Authorization failed'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === 'processing' && (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Verifying your GitHub authorization...
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
                  Connected as @{username}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Redirecting to settings...
                </p>
              </div>
            </div>
          )}

          {state === 'error' && (
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-3">
                <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <div className="text-center">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
              <div className="flex gap-2 mt-2">
                <Button
                  variant="outline"
                  onClick={() => router.push('/dashboard/settings/integrations')}
                >
                  Back to Settings
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
