'use client'

import { ReactNode } from 'react'
import { AuthGuard } from '@/components/auth'
import { Navbar, Footer } from '@/components/landing'

interface AuthLayoutProps {
  children: ReactNode
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col bg-gray-50">
        <Navbar />
        <main className="flex flex-1 items-center justify-center px-4 py-12">
          <div className="w-full max-w-md">{children}</div>
        </main>
        <Footer />
      </div>
    </AuthGuard>
  )
}
