'use client'

import { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { User, Key, CreditCard, Server } from 'lucide-react'

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
    title: 'Billing',
    href: '/dashboard/settings/billing',
    icon: CreditCard,
    description: 'Manage your subscription',
  },
]

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const pathname = usePathname()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your account settings and preferences
        </p>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Sidebar Navigation */}
        <aside className="lg:w-64">
          <nav className="space-y-1">
            {settingsNavItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <div>
                    <div>{item.title}</div>
                    <div className="text-xs font-normal text-gray-500">
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
