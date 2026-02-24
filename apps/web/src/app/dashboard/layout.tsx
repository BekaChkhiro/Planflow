'use client'

import { ReactNode } from 'react'

import { ProtectedRoute } from '@/components/auth'
import { KeyboardShortcutsProvider } from '@/components/keyboard-shortcuts-dialog'
import { SkipLink } from '@/lib/accessibility'
import {
  DashboardSidebar,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/dashboard/dashboard-sidebar'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useAggregateStats } from '@/hooks/use-aggregate-stats'

interface DashboardLayoutProps {
  children: ReactNode
}

// Mobile header shown only on small screens
function MobileHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 lg:hidden">
      <SidebarTrigger />
      <Link href="/dashboard" className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
          <span className="text-xs font-bold text-primary-foreground">P</span>
        </div>
        <span className="text-lg font-bold">PlanFlow</span>
      </Link>
    </header>
  )
}

function DashboardLayoutContent({ children }: DashboardLayoutProps) {
  const { isCollapsed } = useSidebar()
  const { data: stats } = useAggregateStats()

  // Map aggregate stats to sidebar props format
  const quickStats = stats
    ? {
        totalTasks: stats.totalTasks,
        completedTasks: stats.completedTasks,
        inProgressTasks: stats.inProgressTasks,
        blockedTasks: stats.blockedTasks,
      }
    : undefined

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <DashboardSidebar quickStats={quickStats} />

      {/* Main Content Area */}
      <div
        className={cn(
          'min-h-screen transition-all duration-300',
          // Desktop: offset by sidebar width
          isCollapsed ? 'lg:pl-16' : 'lg:pl-64'
        )}
      >
        {/* Mobile Header */}
        <MobileHeader />

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
    </div>
  )
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <ProtectedRoute>
      <KeyboardShortcutsProvider>
        <SkipLink href="#main-content">Skip to main content</SkipLink>
        <SidebarProvider>
          <DashboardLayoutContent>{children}</DashboardLayoutContent>
        </SidebarProvider>
      </KeyboardShortcutsProvider>
    </ProtectedRoute>
  )
}
