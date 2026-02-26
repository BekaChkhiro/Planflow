"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Menu, LayoutDashboard, User, Settings, LogOut, MessageSquare, Users, Bell, BarChart3, Keyboard } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useAuthStore } from "@/stores/auth-store"
import { FeedbackDialog } from "@/components/feedback-dialog"
import { NotificationCenter } from "@/components/notifications"
import { ThemeToggle } from "@/components/theme-toggle"
import { SkipLink } from "@/components/ui/skip-link"
import { KeyboardShortcutsDialog } from "@/components/keyboard-shortcuts-dialog"
import { useKeyboardShortcut as _useKeyboardShortcut } from "@/lib/accessibility"

function getInitials(name: string | undefined): string {
  if (!name) return 'U'
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

const navLinks = [
  { label: "Pricing", href: "/pricing" },
  { label: "Docs", href: "/docs" },
]

export function Navbar() {
  const [isOpen, setIsOpen] = React.useState(false)
  const [feedbackOpen, setFeedbackOpen] = React.useState(false)
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false)
  const { user, isAuthenticated, isInitialized, logout } = useAuthStore()
  const pathname = usePathname()
  const router = useRouter()

  // Navigation keyboard shortcuts (g + letter)
  // These use a two-key sequence pattern
  const [pendingG, setPendingG] = React.useState(false)

  React.useEffect(() => {
    if (!isAuthenticated) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger in inputs
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      if (e.key === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setPendingG(true)
        // Reset after 1 second
        setTimeout(() => setPendingG(false), 1000)
        return
      }

      if (pendingG) {
        setPendingG(false)
        switch (e.key) {
          case 'h':
            e.preventDefault()
            router.push('/dashboard')
            break
          case 'p':
            e.preventDefault()
            router.push('/dashboard/projects')
            break
          case 's':
            e.preventDefault()
            router.push('/dashboard/settings')
            break
          case 't':
            e.preventDefault()
            router.push('/dashboard/team')
            break
          case 'n':
            e.preventDefault()
            router.push('/dashboard/notifications')
            break
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isAuthenticated, pendingG, router])

  // Check if a nav link is current
  const isCurrentPage = (href: string) => {
    if (href.startsWith('#')) return false
    return pathname === href
  }

  return (
    <>
    {/* Skip Link for keyboard navigation */}
    <SkipLink />

    <header
      className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      role="banner"
    >
      <div className="container mx-auto flex h-16 items-center px-4">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center space-x-2"
          aria-label="PlanFlow - Go to homepage"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary" aria-hidden="true">
            <span className="text-sm font-bold text-primary-foreground">P</span>
          </div>
          <span className="text-xl font-bold">PlanFlow</span>
        </Link>

        {/* Desktop Navigation - Centered */}
        <nav className="hidden md:flex md:items-center md:justify-center md:space-x-6 md:flex-1" aria-label="Main navigation">
          {navLinks.map((link) => {
            const isCurrent = isCurrentPage(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
                aria-current={isCurrent ? 'page' : undefined}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>

        {/* Desktop Auth Buttons */}
        <div className="hidden md:flex md:items-center md:space-x-4">
          {isInitialized && isAuthenticated ? (
            <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFeedbackOpen(true)}
              className="text-muted-foreground hover:text-foreground"
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              Feedback
            </Button>
            <NotificationCenter />
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-9 w-9 rounded-full"
                  aria-label={`User menu for ${user?.name || 'user'}`}
                  aria-haspopup="menu"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {getInitials(user?.name)}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user?.name}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user?.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard" className="flex items-center">
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    Dashboard
                    <DropdownMenuShortcut>G H</DropdownMenuShortcut>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/team" className="flex items-center">
                    <Users className="mr-2 h-4 w-4" />
                    Team
                    <DropdownMenuShortcut>G T</DropdownMenuShortcut>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/team/analytics" className="flex items-center">
                    <BarChart3 className="mr-2 h-4 w-4" />
                    Analytics
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/notifications" className="flex items-center">
                    <Bell className="mr-2 h-4 w-4" />
                    Notifications
                    <DropdownMenuShortcut>G N</DropdownMenuShortcut>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings/profile" className="flex items-center">
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings" className="flex items-center">
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                    <DropdownMenuShortcut>G S</DropdownMenuShortcut>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShortcutsOpen(true)}
                >
                  <Keyboard className="mr-2 h-4 w-4" />
                  Keyboard shortcuts
                  <DropdownMenuShortcut>?</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="text-red-600 focus:bg-red-50 focus:text-red-600 dark:focus:bg-red-950"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </>
          ) : (
            <>
              <ThemeToggle />
              <Button variant="ghost" asChild>
                <Link href="/login">Sign In</Link>
              </Button>
              <Button asChild>
                <Link href="/register">Get Started</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile Menu */}
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open navigation menu"
              aria-expanded={isOpen}
              aria-controls="mobile-nav"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="w-[300px] sm:w-[400px]"
            aria-describedby="mobile-nav-description"
          >
            <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
            <SheetDescription id="mobile-nav-description" className="sr-only">
              Main navigation menu with links to features, pricing, docs, and account settings.
            </SheetDescription>
            <nav
              id="mobile-nav"
              className="flex flex-col space-y-4 mt-8"
              aria-label="Mobile navigation"
            >
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className="text-lg font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
              <div className="flex flex-col space-y-2 pt-4 border-t">
                {isInitialized && isAuthenticated ? (
                  <>
                    <div className="flex items-center gap-3 px-2 py-2">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {getInitials(user?.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <p className="text-sm font-medium">{user?.name}</p>
                        <p className="text-xs text-muted-foreground">{user?.email}</p>
                      </div>
                    </div>
                    <Button variant="ghost" asChild className="justify-start">
                      <Link href="/dashboard" onClick={() => setIsOpen(false)}>
                        <LayoutDashboard className="mr-2 h-4 w-4" />
                        Dashboard
                      </Link>
                    </Button>
                    <Button variant="ghost" asChild className="justify-start">
                      <Link href="/dashboard/team" onClick={() => setIsOpen(false)}>
                        <Users className="mr-2 h-4 w-4" />
                        Team
                      </Link>
                    </Button>
                    <Button variant="ghost" asChild className="justify-start">
                      <Link href="/dashboard/team/analytics" onClick={() => setIsOpen(false)}>
                        <BarChart3 className="mr-2 h-4 w-4" />
                        Analytics
                      </Link>
                    </Button>
                    <Button variant="ghost" asChild className="justify-start">
                      <Link href="/dashboard/notifications" onClick={() => setIsOpen(false)}>
                        <Bell className="mr-2 h-4 w-4" />
                        Notifications
                      </Link>
                    </Button>
                    <Button variant="ghost" asChild className="justify-start">
                      <Link href="/dashboard/settings" onClick={() => setIsOpen(false)}>
                        <Settings className="mr-2 h-4 w-4" />
                        Settings
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      className="justify-start"
                      onClick={() => {
                        setFeedbackOpen(true)
                        setIsOpen(false)
                      }}
                    >
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Feedback
                    </Button>
                    <Button
                      variant="ghost"
                      className="justify-start text-red-600 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                      onClick={() => {
                        logout()
                        setIsOpen(false)
                      }}
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Log out
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" asChild className="justify-start">
                      <Link href="/login" onClick={() => setIsOpen(false)}>
                        Sign In
                      </Link>
                    </Button>
                    <Button asChild>
                      <Link href="/register" onClick={() => setIsOpen(false)}>
                        Get Started
                      </Link>
                    </Button>
                  </>
                )}
              </div>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
    <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  )
}
