'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ChevronLeft } from 'lucide-react'

const navigation = [
  { title: 'Overview', href: '/docs' },
  { title: 'Getting Started', href: '/docs/getting-started' },
  { title: 'MCP Installation', href: '/docs/mcp-installation' },
  { title: 'User Guide', href: '/docs/user-guide' },
  { title: 'Plugin Commands', href: '/docs/plugin-commands' },
  { title: 'MCP Tools', href: '/docs/mcp-tools' },
  { title: 'Examples', href: '/docs/examples' },
  { divider: true },
  { title: 'API Reference', href: '/docs/api-reference' },
  { title: 'Integrations API', href: '/docs/api-integrations' },
  { title: 'Real-time API', href: '/docs/api-realtime' },
  { title: 'Notifications API', href: '/docs/api-notifications' },
  { divider: true },
  { title: 'Architecture', href: '/docs/architecture' },
  { title: 'Development', href: '/docs/development' },
  { title: 'Contributing', href: '/docs/contributing' },
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
      <aside className="fixed left-0 top-0 z-30 h-screen w-56 border-r bg-background overflow-y-auto">
        <div className="flex h-14 items-center border-b px-4">
          <Link href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>
        <div className="p-4">
          <h2 className="font-semibold mb-4">Documentation</h2>
          <nav className="space-y-1">
            {navigation.map((item, i) =>
              'divider' in item ? (
                <hr key={i} className="my-3 border-border" />
              ) : (
                <Link
                  key={item.href}
                  href={item.href!}
                  className={cn(
                    'block rounded-md px-3 py-1.5 text-sm transition-colors',
                    pathname === item.href
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {item.title}
                </Link>
              )
            )}
          </nav>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-56">
        <div className="max-w-3xl mx-auto py-10 px-8">
          {children}
        </div>
      </main>
    </div>
  )
}
