'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { Loader2 } from 'lucide-react'

interface AuthGuardProps {
  children: React.ReactNode
}

/**
 * AuthGuard prevents authenticated users from accessing auth pages (login, register, etc.)
 * Redirects to dashboard or returnUrl if already logged in.
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated, isInitialized, isLoading } = useAuthStore()

  useEffect(() => {
    if (isInitialized && isAuthenticated) {
      // Redirect authenticated users to dashboard or returnUrl
      const returnUrl = searchParams.get('returnUrl')
      router.replace(returnUrl || '/dashboard')
    }
  }, [isInitialized, isAuthenticated, router, searchParams])

  // Show loading state while checking auth
  if (!isInitialized || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // Don't render auth pages if already authenticated
  if (isAuthenticated) {
    return null
  }

  return <>{children}</>
}
