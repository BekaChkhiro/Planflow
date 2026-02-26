'use client'

import { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { User, Key, Server, Plug, Bell, Shield } from 'lucide-react'

import { cn } from '@/lib/utils'

interface SettingsLayoutProps {
  children: ReactNode
}

const settingsNavItems = [
  {
    title: 'Profile',
    href: '/dashboard/settings/profile',
    icon: User,
    description: 'Manage your account details',
  },
  {
    title: 'Security',
    href: '/dashboard/settings/security',
    icon: Shield,
    description: 'Sessions & logout options',
  },
  {
    title: 'API Tokens',
    href: '/dashboard/settings/tokens',
    icon: Key,
    description: 'Manage MCP authentication',
  },
  {
    title: 'MCP Setup',
    href: '/dashboard/settings/mcp-setup',
    icon: Server,
    description: 'Connect Claude Code to PlanFlow',
  },
  {
    title: 'Integrations',
    href: '/dashboard/settings/integrations',
    icon: Plug,
    description: 'Connect GitHub, Slack & more',
  },
  {
    title: 'Notifications',
    href: '/dashboard/settings/notifications',
    icon: Bell,
    description: 'Push, email & in-app alerts',
  },
  // Billing hidden during free early access period
  // {
  //   title: 'Billing',
  //   href: '/dashboard/settings/billing',
  //   icon: CreditCard,
  //   description: 'Manage your subscription',
  // },
]

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const pathname = usePathname()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your account settings and preferences
        </p>
      </div>

      <div className="flex flex-col gap-6 md:flex-row md:gap-8">
        {/* Sidebar Navigation */}
        <aside className="md:w-56 lg:w-64 shrink-0">
          {/* Mobile: horizontal scroll, Desktop: vertical list */}
          <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 md:mx-0 md:flex-col md:gap-1 md:overflow-visible md:px-0 md:pb-0">
            {settingsNavItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors md:gap-3',
                    isActive
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <div className="whitespace-nowrap md:whitespace-normal">
                    <div>{item.title}</div>
                    <div className="hidden text-xs font-normal text-muted-foreground md:block">
                      {item.description}
                    </div>
                  </div>
                </Link>
              )
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}
