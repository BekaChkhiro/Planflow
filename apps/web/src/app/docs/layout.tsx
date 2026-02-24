'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState, useEffect } from 'react'
import { Navbar } from '@/components/landing/navbar'
import { Footer } from '@/components/landing/footer'

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
      { rootMargin: '-100px 0px -80% 0px' }
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
      // Update URL with hash
      window.history.pushState(null, '', `${pathname}#${id}`)
    }
  }

  const isActive = (href: string) => pathname === href
  const isExpanded = (href: string) => expandedPages.has(href)

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <div className="flex-1">
        <div className="container mx-auto px-4">
          <div className="flex gap-8 py-8">
            {/* Sidebar */}
            <aside className="hidden lg:block w-56 shrink-0">
              <div className="sticky top-24">
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

            {/* Mobile navigation */}
            <div className="lg:hidden mb-6 w-full">
              <select
                value={pathname}
                onChange={(e) => window.location.href = e.target.value}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                {navigation.map((item) => (
                  <option key={item.href} value={item.href}>
                    {item.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Main content */}
            <main className="flex-1 min-w-0">
              {children}
            </main>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}
