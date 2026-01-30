'use client'

import { ReactNode } from 'react'
import { AuthGuard } from '@/components/auth'

interface AuthLayoutProps {
  children: ReactNode
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </AuthGuard>
  )
}
