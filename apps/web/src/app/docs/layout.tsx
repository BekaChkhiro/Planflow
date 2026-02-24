'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  BookOpen,
  Code2,
  Rocket,
  FileText,
  Users,
  Zap,
  Bell,
  GitBranch,
  Terminal,
  Settings,
  HelpCircle,
  Home
} from 'lucide-react'

const navigation = [
  {
    title: 'Getting Started',
    items: [
      { title: 'Overview', href: '/docs', icon: Home },
      { title: 'Getting Started', href: '/docs/getting-started', icon: Rocket },
      { title: 'MCP Installation', href: '/docs/mcp-installation', icon: Terminal },
    ],
  },
  {
    title: 'User Guides',
    items: [
      { title: 'User Guide', href: '/docs/user-guide', icon: BookOpen },
      { title: 'Plugin Commands', href: '/docs/plugin-commands', icon: Terminal },
      { title: 'MCP Tools', href: '/docs/mcp-tools', icon: Settings },
      { title: 'Examples', href: '/docs/examples', icon: Code2 },
    ],
  },
  {
    title: 'API Reference',
    items: [
      { title: 'API Reference', href: '/docs/api-reference', icon: FileText },
      { title: 'Integrations API', href: '/docs/api-integrations', icon: GitBranch },
      { title: 'Real-time API', href: '/docs/api-realtime', icon: Zap },
      { title: 'Notifications API', href: '/docs/api-notifications', icon: Bell },
    ],
  },
  {
    title: 'Developer Docs',
    items: [
      { title: 'Architecture', href: '/docs/architecture', icon: Code2 },
      { title: 'Development Setup', href: '/docs/development', icon: Terminal },
      { title: 'Contributing', href: '/docs/contributing', icon: Users },
    ],
  },
]

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-30 h-screen w-64 border-r bg-background overflow-y-auto">
        <div className="flex h-14 items-center border-b px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <BookOpen className="h-5 w-5 text-primary" />
            <span>PlanFlow Docs</span>
          </Link>
        </div>
        <nav className="space-y-6 p-4">
          {navigation.map((section) => (
            <div key={section.title}>
              <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
                {section.title}
              </h4>
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon
                  const isActive = pathname === item.href
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                          isActive
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {item.title}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-64">
        <div className="container max-w-4xl py-10 px-8">
          {children}
        </div>
      </main>
    </div>
  )
}
