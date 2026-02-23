'use client'

import { ReactNode } from 'react'

import { ProtectedRoute } from '@/components/auth'
import { Navbar } from '@/components/landing/navbar'
import { KeyboardShortcutsProvider } from '@/components/keyboard-shortcuts-dialog'
import { SkipLink } from '@/lib/accessibility'

interface DashboardLayoutProps {
  children: ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <ProtectedRoute>
      <KeyboardShortcutsProvider>
        <SkipLink href="#main-content">Skip to main content</SkipLink>
        <div className="min-h-screen bg-background">
          <Navbar />
          <main
            id="main-content"
            className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
            tabIndex={-1}
            role="main"
            aria-label="Main content"
          >
            {children}
          </main>
        </div>
      </KeyboardShortcutsProvider>
    </ProtectedRoute>
  )
}
