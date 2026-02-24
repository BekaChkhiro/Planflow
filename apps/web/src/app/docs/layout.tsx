'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronDown, ChevronRight } from 'lucide-react'
import { useState, useEffect } from 'react'

interface TocItem {
  id: string
  title: string
  level: number
}

const navigation = [
  { title: 'Overview', href: '/docs', slug: '' },
  { title: 'Getting Started', href: '/docs/getting-started', slug: 'getting-started' },
  { title: 'MCP Installation', href: '/docs/mcp-installation', slug: 'mcp-installation' },
  { title: 'User Guide', href: '/docs/user-guide', slug: 'user-guide' },
  { title: 'Plugin Commands', href: '/docs/plugin-commands', slug: 'plugin-commands' },
  { title: 'MCP Tools', href: '/docs/mcp-tools', slug: 'mcp-tools' },
  { title: 'Examples', href: '/docs/examples', slug: 'examples' },
]

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [toc, setToc] = useState<TocItem[]>([])
  const [activeSection, setActiveSection] = useState<string>('')
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set())

  // Extract TOC from page content
  useEffect(() => {
    const extractToc = () => {
      const headings = document.querySelectorAll('article h2, article h3')
      const items: TocItem[] = []

      headings.forEach((heading) => {
        const id = heading.id || heading.textContent?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || ''
        if (!heading.id) {
          heading.id = id
        }
        items.push({
          id,
          title: heading.textContent || '',
          level: heading.tagName === 'H2' ? 2 : 3,
        })
      })

      setToc(items)

      // Auto-expand current page
      const currentPage = navigation.find(n => n.href === pathname)
      if (currentPage && 'slug' in currentPage) {
        setExpandedPages(new Set([pathname]))
      }
    }

    // Wait for content to render
    setTimeout(extractToc, 100)
  }, [pathname])

  // Track active section on scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id)
          }
        })
      },
      { rootMargin: '-80px 0px -80% 0px' }
    )

    const headings = document.querySelectorAll('article h2, article h3')
    headings.forEach((heading) => observer.observe(heading))

    return () => observer.disconnect()
  }, [toc])

  const toggleExpand = (href: string) => {
    setExpandedPages(prev => {
      const next = new Set(prev)
      if (next.has(href)) {
        next.delete(href)
      } else {
        next.add(href)
      }
      return next
    })
  }

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const isActive = (href: string) => pathname === href
  const isExpanded = (href: string) => expandedPages.has(href)

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-30 h-screen w-64 border-r bg-background overflow-y-auto">
        <div className="flex h-14 items-center border-b px-4">
          <Link href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>
        <div className="p-4">
          <h2 className="font-semibold mb-4">Documentation</h2>
          <nav className="space-y-0.5">
            {navigation.map((item) => (
              <div key={item.href}>
                <div className="flex items-center">
                  <Link
                    href={item.href!}
                    className={cn(
                      'flex-1 block rounded-md px-3 py-1.5 text-sm transition-colors',
                      isActive(item.href!)
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {item.title}
                  </Link>
                  {isActive(item.href!) && toc.length > 0 && (
                    <button
                      onClick={() => toggleExpand(item.href!)}
                      className="p-1 hover:bg-muted rounded"
                    >
                      {isExpanded(item.href!) ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  )}
                </div>

                {/* Table of Contents for active page */}
                {isActive(item.href!) && isExpanded(item.href!) && toc.length > 0 && (
                  <div className="ml-3 mt-1 border-l border-border pl-3 space-y-0.5">
                    {toc.filter(t => t.level === 2).map((section) => (
                      <button
                        key={section.id}
                        onClick={() => scrollToSection(section.id)}
                        className={cn(
                          'block w-full text-left px-2 py-1 text-xs rounded transition-colors',
                          activeSection === section.id
                            ? 'text-primary font-medium'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {section.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-64">
        <div className="max-w-3xl mx-auto py-10 px-8">
          {children}
        </div>
      </main>
    </div>
  )
}
