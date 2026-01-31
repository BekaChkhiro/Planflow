'use client'

import { ReactNode } from 'react'

import { ProtectedRoute } from '@/components/auth'
import { Navbar } from '@/components/landing/navbar'

interface DashboardLayoutProps {
  children: ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </ProtectedRoute>
  )
}
