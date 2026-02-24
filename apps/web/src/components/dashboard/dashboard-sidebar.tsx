'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Bell,
  Settings,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Building2,
  ChevronDown,
  Check,
  Plus,
  Clock,
  CheckCircle2,
  Circle,
  AlertCircle,
  Moon,
  Sun,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAuthStore } from '@/stores/auth-store'
import { useOrganizationContext } from '@/hooks/use-organization-context'
import { useProjects, type Project } from '@/hooks/use-projects'
import { getRoleBadgeVariant, getRoleLabel } from '@/hooks/use-team'
import { useUnreadNotificationCount } from '@/hooks/use-notifications'

// ============================================================================
// Types
// ============================================================================

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  shortcut?: string
  shortcutKey?: string // The key after 'g' (e.g., 'h', 'p', 't')
  badge?: number
}

interface SidebarContextValue {
  isCollapsed: boolean
  setIsCollapsed: (value: boolean) => void
  isMobileOpen: boolean
  setIsMobileOpen: (value: boolean) => void
}

// ============================================================================
// Context
// ============================================================================

const SidebarContext = React.createContext<SidebarContextValue | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within SidebarProvider')
  }
  return context
}

// Safe version that returns null if not in provider (for checking context existence)
function useSidebarSafe(): SidebarContextValue | null {
  return React.useContext(SidebarContext)
}

// ============================================================================
// Navigation Items
// ============================================================================

const navigationItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, shortcut: 'G H', shortcutKey: 'h' },
  { label: 'Projects', href: '/dashboard/projects', icon: FolderKanban, shortcut: 'G P', shortcutKey: 'p' },
  { label: 'Team', href: '/dashboard/team', icon: Users, shortcut: 'G T', shortcutKey: 't' },
  { label: 'Analytics', href: '/dashboard/team/analytics', icon: BarChart3, shortcut: 'G A', shortcutKey: 'a' },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell, shortcut: 'G N', shortcutKey: 'n' },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings, shortcut: 'G S', shortcutKey: 's' },
]

// ============================================================================
// Keyboard Shortcuts Hook
// ============================================================================

interface UseKeyboardShortcutsReturn {
  isShortcutModeActive: boolean
}

function useKeyboardShortcuts(): UseKeyboardShortcutsReturn {
  const router = useRouter()
  const [isShortcutModeActive, setIsShortcutModeActive] = React.useState(false)
  const pendingKeyRef = React.useRef<string | null>(null)
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null)

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Ignore if user is typing in an input, textarea, or contenteditable
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('[role="dialog"]') ||
        target.closest('[role="menu"]')
      ) {
        return
      }

      // Ignore if modifier keys are pressed (except shift)
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return
      }

      const key = event.key.toLowerCase()

      // Escape to cancel shortcut mode
      if (key === 'escape' && pendingKeyRef.current) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
          timeoutRef.current = null
        }
        pendingKeyRef.current = null
        setIsShortcutModeActive(false)
        return
      }

      // If 'g' is pressed, start the sequence
      if (key === 'g' && !pendingKeyRef.current) {
        pendingKeyRef.current = 'g'
        setIsShortcutModeActive(true)

        // Clear any existing timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }

        // Reset after 1 second if no second key is pressed
        timeoutRef.current = setTimeout(() => {
          pendingKeyRef.current = null
          setIsShortcutModeActive(false)
        }, 1000)

        return
      }

      // If 'g' was pressed, check for the second key
      if (pendingKeyRef.current === 'g') {
        // Clear the timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
          timeoutRef.current = null
        }
        pendingKeyRef.current = null
        setIsShortcutModeActive(false)

        // Find matching navigation item
        const navItem = navigationItems.find(item => item.shortcutKey === key)
        if (navItem) {
          event.preventDefault()
          router.push(navItem.href)
        }
      }

      // Additional shortcuts:
      // '[' to collapse sidebar, ']' to expand sidebar
      if (key === '[' || key === ']') {
        const collapseEvent = new CustomEvent('sidebar-toggle', {
          detail: { collapse: key === '[' }
        })
        window.dispatchEvent(collapseEvent)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [router])

  return { isShortcutModeActive }
}

// ============================================================================
// Keyboard Shortcuts Indicator
// ============================================================================

function KeyboardShortcutsIndicator({ isActive }: { isActive: boolean }) {
  if (!isActive) return null

  return (
    <div
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 duration-200"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 rounded-lg border bg-background/95 px-4 py-2.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center gap-2">
          <kbd className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground shadow">
            G
          </kbd>
          <span className="text-sm text-muted-foreground">+</span>
        </div>
        <div className="flex items-center gap-3">
          {navigationItems.filter(item => item.shortcutKey).map((item) => (
            <div key={item.shortcutKey} className="flex items-center gap-1.5">
              <kbd className="flex h-6 w-6 items-center justify-center rounded bg-muted text-xs font-semibold uppercase shadow-sm">
                {item.shortcutKey}
              </kbd>
              <span className="text-xs text-muted-foreground">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Helper Functions
// ============================================================================

function getInitials(name: string | undefined): string {
  if (!name) return 'U'
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// ============================================================================
// Sidebar Organization Switcher
// ============================================================================

function SidebarOrgSwitcher() {
  const { isCollapsed } = useSidebar()
  const {
    currentOrganization,
    organizations,
    setSelectedOrganization,
    isLoading,
  } = useOrganizationContext()

  if (isLoading) {
    return (
      <div className="px-3 py-2">
        <Skeleton className={cn('h-10', isCollapsed ? 'w-10' : 'w-full')} />
      </div>
    )
  }

  if (!organizations || organizations.length === 0) {
    return (
      <div className="px-3 py-2">
        <Button
          variant="outline"
          size="sm"
          asChild
          className={cn('w-full justify-start', isCollapsed && 'justify-center px-2')}
        >
          <Link href="/dashboard/team">
            <Plus className="h-4 w-4" />
            {!isCollapsed && <span className="ml-2">Create Organization</span>}
          </Link>
        </Button>
      </div>
    )
  }

  if (isCollapsed) {
    return (
      <div className="px-3 py-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-10 w-10">
                    <Building2 className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="start" className="w-[240px]">
                  <DropdownMenuLabel>Organizations</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {organizations.map((org) => (
                    <DropdownMenuItem
                      key={org.id}
                      onClick={() => setSelectedOrganization(org.id)}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="max-w-[140px] truncate">{org.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={getRoleBadgeVariant(org.role)} className="text-xs">
                          {getRoleLabel(org.role)}
                        </Badge>
                        {org.id === currentOrganization?.id && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/team" className="flex items-center">
                      <Plus className="mr-2 h-4 w-4" />
                      Create Organization
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TooltipTrigger>
            <TooltipContent side="right">
              {currentOrganization?.name || 'Select Organization'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    )
  }

  return (
    <div className="px-3 py-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Building2 className="h-4 w-4 shrink-0" />
              <span className="truncate">{currentOrganization?.name || 'Select Organization'}</span>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[220px]">
          <DropdownMenuLabel>Organizations</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {organizations.map((org) => (
            <DropdownMenuItem
              key={org.id}
              onClick={() => setSelectedOrganization(org.id)}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate">{org.name}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Badge variant={getRoleBadgeVariant(org.role)} className="text-xs">
                  {getRoleLabel(org.role)}
                </Badge>
                {org.id === currentOrganization?.id && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </div>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/dashboard/team" className="flex items-center">
              <Plus className="mr-2 h-4 w-4" />
              Create Organization
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// ============================================================================
// Sidebar Navigation
// ============================================================================

function SidebarNav() {
  const pathname = usePathname()
  const { isCollapsed } = useSidebar()
  const { count: unreadNotifications } = useUnreadNotificationCount()

  const isActive = (href: string) => {
    // Exact match for dashboard home
    if (href === '/dashboard') {
      return pathname === '/dashboard'
    }
    // For team page, don't match if on analytics subpage
    if (href === '/dashboard/team') {
      return pathname === '/dashboard/team' || pathname === '/dashboard/team/workload'
    }
    // Exact match or starts with href followed by /
    return pathname === href || pathname.startsWith(href + '/')
  }

  // Create navigation items with dynamic badge for notifications
  const navItemsWithBadges = navigationItems.map((item) => ({
    ...item,
    badge: item.href === '/dashboard/notifications' ? unreadNotifications : item.badge,
  }))

  return (
    <nav className="px-3 py-2" aria-label="Sidebar navigation">
      <div className="space-y-1">
        {navItemsWithBadges.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)
          const hasBadge = item.badge !== undefined && item.badge > 0

          if (isCollapsed) {
            return (
              <TooltipProvider key={item.href}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href={item.href}
                      className={cn(
                        'relative flex h-10 w-10 items-center justify-center rounded-md transition-colors',
                        active
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      )}
                      aria-current={active ? 'page' : undefined}
                      aria-label={hasBadge ? `${item.label} (${item.badge} unread)` : item.label}
                    >
                      <Icon className="h-5 w-5" />
                      {hasBadge && (
                        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
                          {item.badge! > 9 ? '9+' : item.badge}
                        </span>
                      )}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="flex items-center gap-2">
                    <span>{item.label}</span>
                    {hasBadge && (
                      <Badge variant="destructive" className="h-4 px-1 text-[10px]">
                        {item.badge! > 9 ? '9+' : item.badge}
                      </Badge>
                    )}
                    {item.shortcut && (
                      <kbd className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {item.shortcut}
                      </kbd>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="truncate">{item.label}</span>
              {item.shortcut && !hasBadge && (
                <kbd className="ml-auto rounded bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {item.shortcut}
                </kbd>
              )}
              {hasBadge && (
                <Badge variant="destructive" className="ml-auto h-5 px-1.5 text-[10px]">
                  {item.badge! > 99 ? '99+' : item.badge}
                </Badge>
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

// ============================================================================
// Sidebar Quick Stats
// ============================================================================

interface QuickStatsProps {
  totalTasks?: number
  completedTasks?: number
  inProgressTasks?: number
  blockedTasks?: number
}

function SidebarQuickStats({
  totalTasks = 0,
  completedTasks = 0,
  inProgressTasks = 0,
  blockedTasks = 0,
}: QuickStatsProps) {
  const { isCollapsed } = useSidebar()

  if (isCollapsed) {
    return null
  }

  const todoTasks = totalTasks - completedTasks - inProgressTasks - blockedTasks

  return (
    <div className="px-3 py-2">
      <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Quick Stats
      </h3>
      <div className="space-y-1">
        <div className="flex items-center justify-between rounded-md px-3 py-1.5 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Circle className="h-3.5 w-3.5" />
            <span>To Do</span>
          </div>
          <span className="font-medium">{todoTasks}</span>
        </div>
        <div className="flex items-center justify-between rounded-md px-3 py-1.5 text-sm">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <Clock className="h-3.5 w-3.5" />
            <span>In Progress</span>
          </div>
          <span className="font-medium">{inProgressTasks}</span>
        </div>
        <div className="flex items-center justify-between rounded-md px-3 py-1.5 text-sm">
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Completed</span>
          </div>
          <span className="font-medium">{completedTasks}</span>
        </div>
        {blockedTasks > 0 && (
          <div className="flex items-center justify-between rounded-md px-3 py-1.5 text-sm">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>Blocked</span>
            </div>
            <span className="font-medium">{blockedTasks}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Sidebar Recent Projects
// ============================================================================

function SidebarRecentProjects() {
  const { isCollapsed } = useSidebar()
  const { currentOrganizationId } = useOrganizationContext()
  const { data, isLoading } = useProjects({
    organizationId: currentOrganizationId,
    limit: 5,
  })

  if (isCollapsed) {
    return null
  }

  return (
    <div className="px-3 py-2">
      <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Recent Projects
      </h3>
      <div className="space-y-1">
        {isLoading ? (
          <>
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </>
        ) : data?.projects && data.projects.length > 0 ? (
          data.projects.slice(0, 5).map((project) => (
            <Link
              key={project.id}
              href={`/dashboard/projects/${project.id}`}
              className="flex h-8 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <FolderKanban className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{project.name}</span>
            </Link>
          ))
        ) : (
          <p className="px-3 text-sm text-muted-foreground">No projects yet</p>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Sidebar Team Status
// ============================================================================

interface TeamMemberStatus {
  id: string
  name: string
  email: string
  isOnline: boolean
  workingOn?: string
}

interface SidebarTeamStatusProps {
  members?: TeamMemberStatus[]
}

function SidebarTeamStatus({ members = [] }: SidebarTeamStatusProps) {
  const { isCollapsed } = useSidebar()

  if (isCollapsed || members.length === 0) {
    return null
  }

  const onlineMembers = members.filter((m) => m.isOnline)

  return (
    <div className="px-3 py-2">
      <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Team ({onlineMembers.length} online)
      </h3>
      <div className="space-y-1">
        {members.slice(0, 5).map((member) => (
          <div
            key={member.id}
            className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm"
          >
            <div className="relative">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-[10px]">
                  {getInitials(member.name)}
                </AvatarFallback>
              </Avatar>
              <span
                className={cn(
                  'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background',
                  member.isOnline ? 'bg-green-500' : 'bg-gray-400'
                )}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{member.name}</p>
              {member.workingOn && (
                <p className="truncate text-xs text-muted-foreground">
                  Working on: {member.workingOn}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Sidebar Collapse Toggle
// ============================================================================

function SidebarCollapseToggle() {
  const { isCollapsed, setIsCollapsed } = useSidebar()

  return (
    <div className="px-3 py-2">
      <Button
        variant="ghost"
        size="sm"
        className={cn('w-full', isCollapsed ? 'justify-center px-2' : 'justify-start')}
        onClick={() => setIsCollapsed(!isCollapsed)}
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <>
            <ChevronLeft className="h-4 w-4 mr-2" />
            <span>Collapse</span>
          </>
        )}
      </Button>
    </div>
  )
}

// ============================================================================
// Sidebar Theme Toggle
// ============================================================================

function SidebarThemeToggle() {
  const { isCollapsed } = useSidebar()
  const { setTheme, theme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
  }

  const getThemeLabel = () => {
    if (theme === 'light') return 'Light'
    if (theme === 'dark') return 'Dark'
    return 'System'
  }

  if (isCollapsed) {
    return (
      <div className="px-3 py-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                onClick={cycleTheme}
                aria-label="Toggle theme"
              >
                <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              Theme: {getThemeLabel()}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    )
  }

  return (
    <div className="px-3 py-2">
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start"
        onClick={cycleTheme}
        aria-label="Toggle theme"
      >
        <Sun className="h-4 w-4 mr-2 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute ml-0 h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="ml-6">{getThemeLabel()} Mode</span>
      </Button>
    </div>
  )
}

// ============================================================================
// Sidebar User Section
// ============================================================================

function SidebarUser() {
  const { isCollapsed } = useSidebar()
  const { user } = useAuthStore()

  if (!user) return null

  if (isCollapsed) {
    return (
      <div className="px-3 py-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/dashboard/settings/profile"
                className="flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:bg-accent"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    )
  }

  return (
    <div className="px-3 py-2">
      <Link
        href="/dashboard/settings/profile"
        className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-accent"
      >
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
            {getInitials(user.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
      </Link>
    </div>
  )
}

// ============================================================================
// Main Sidebar Content
// ============================================================================

interface SidebarContentProps {
  quickStats?: QuickStatsProps
  teamMembers?: TeamMemberStatus[]
}

function SidebarContent({ quickStats, teamMembers }: SidebarContentProps) {
  const { isCollapsed } = useSidebar()

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className={cn('flex h-16 items-center border-b px-3', isCollapsed ? 'justify-center' : 'px-6')}>
        <Link
          href="/"
          className="flex items-center gap-2"
          aria-label="PlanFlow - Go to home page"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary" aria-hidden="true">
            <span className="text-sm font-bold text-primary-foreground">P</span>
          </div>
          {!isCollapsed && <span className="text-xl font-bold">PlanFlow</span>}
        </Link>
      </div>

      {/* Scrollable Content */}
      <ScrollArea className="flex-1">
        <div className="py-2">
          {/* Organization Switcher */}
          <SidebarOrgSwitcher />

          <Separator className="my-2" />

          {/* Navigation */}
          <SidebarNav />

          {!isCollapsed && (
            <>
              <Separator className="my-2" />

              {/* Quick Stats */}
              {quickStats && (
                <>
                  <SidebarQuickStats {...quickStats} />
                  <Separator className="my-2" />
                </>
              )}

              {/* Recent Projects */}
              <SidebarRecentProjects />

              <Separator className="my-2" />

              {/* Team Status */}
              <SidebarTeamStatus members={teamMembers} />
            </>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t">
        <SidebarUser />
        <Separator />
        <SidebarThemeToggle />
        <Separator />
        <SidebarCollapseToggle />
      </div>
    </div>
  )
}

// ============================================================================
// Mobile Sidebar (Sheet)
// ============================================================================

interface MobileSidebarProps {
  quickStats?: QuickStatsProps
  teamMembers?: TeamMemberStatus[]
}

function MobileSidebar({ quickStats, teamMembers }: MobileSidebarProps) {
  const { isMobileOpen, setIsMobileOpen } = useSidebar()

  return (
    <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
      <SheetContent
        side="left"
        className="w-[280px] p-0"
        aria-describedby="mobile-sidebar-description"
      >
        <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
        <SheetDescription id="mobile-sidebar-description" className="sr-only">
          Main navigation sidebar with links to dashboard, projects, team, and settings.
        </SheetDescription>
        <SidebarProvider defaultCollapsed={false}>
          <SidebarContent quickStats={quickStats} teamMembers={teamMembers} />
        </SidebarProvider>
      </SheetContent>
    </Sheet>
  )
}

// ============================================================================
// Sidebar Provider
// ============================================================================

interface SidebarProviderProps {
  children: React.ReactNode
  defaultCollapsed?: boolean
}

function SidebarProvider({ children, defaultCollapsed = false }: SidebarProviderProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed)
  const [isMobileOpen, setIsMobileOpen] = React.useState(false)

  // Persist collapsed state
  React.useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved !== null) {
      setIsCollapsed(saved === 'true')
    }
  }, [])

  const handleSetCollapsed = React.useCallback((value: boolean) => {
    setIsCollapsed(value)
    localStorage.setItem('sidebar-collapsed', String(value))
  }, [])

  return (
    <SidebarContext.Provider
      value={{
        isCollapsed,
        setIsCollapsed: handleSetCollapsed,
        isMobileOpen,
        setIsMobileOpen,
      }}
    >
      {children}
    </SidebarContext.Provider>
  )
}

// ============================================================================
// Main Dashboard Sidebar Component
// ============================================================================

export interface DashboardSidebarProps {
  quickStats?: QuickStatsProps
  teamMembers?: TeamMemberStatus[]
  className?: string
}

export function DashboardSidebar({
  quickStats,
  teamMembers,
  className,
}: DashboardSidebarProps) {
  // Check if we're already inside a SidebarProvider
  const existingContext = useSidebarSafe()

  // If already in context, render directly
  if (existingContext) {
    return (
      <DashboardSidebarInner
        quickStats={quickStats}
        teamMembers={teamMembers}
        className={className}
      />
    )
  }

  // Otherwise, wrap with provider (standalone usage)
  return (
    <SidebarProvider>
      <DashboardSidebarInner
        quickStats={quickStats}
        teamMembers={teamMembers}
        className={className}
      />
    </SidebarProvider>
  )
}

function DashboardSidebarInner({
  quickStats,
  teamMembers,
  className,
}: DashboardSidebarProps) {
  const { isCollapsed, setIsCollapsed } = useSidebar()

  // Enable keyboard shortcuts and get active state
  const { isShortcutModeActive } = useKeyboardShortcuts()

  // Listen for sidebar toggle events from keyboard shortcuts
  React.useEffect(() => {
    function handleSidebarToggle(event: CustomEvent<{ collapse: boolean }>) {
      setIsCollapsed(event.detail.collapse)
    }

    window.addEventListener('sidebar-toggle', handleSidebarToggle as EventListener)
    return () => {
      window.removeEventListener('sidebar-toggle', handleSidebarToggle as EventListener)
    }
  }, [setIsCollapsed])

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden lg:fixed lg:inset-y-0 lg:z-40 lg:flex lg:flex-col',
          'border-r bg-background transition-all duration-300',
          isCollapsed ? 'lg:w-16' : 'lg:w-64',
          className
        )}
        aria-label="Sidebar"
      >
        <SidebarContent quickStats={quickStats} teamMembers={teamMembers} />
      </aside>

      {/* Mobile Sidebar */}
      <MobileSidebar quickStats={quickStats} teamMembers={teamMembers} />

      {/* Keyboard Shortcuts Indicator */}
      <KeyboardShortcutsIndicator isActive={isShortcutModeActive} />
    </>
  )
}

// ============================================================================
// Sidebar Trigger (for mobile)
// ============================================================================

export function SidebarTrigger({ className }: { className?: string }) {
  const { setIsMobileOpen } = useSidebar()

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('lg:hidden', className)}
      onClick={() => setIsMobileOpen(true)}
      aria-label="Open navigation menu"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <line x1="4" x2="20" y1="12" y2="12" />
        <line x1="4" x2="20" y1="6" y2="6" />
        <line x1="4" x2="20" y1="18" y2="18" />
      </svg>
    </Button>
  )
}

// ============================================================================
// Export hooks for external use
// ============================================================================

export { useSidebar, useSidebarSafe, SidebarProvider }
export type { TeamMemberStatus, QuickStatsProps }
