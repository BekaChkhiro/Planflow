'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Calendar, Clock, MoreVertical, Archive, ArchiveRestore, Trash2, Loader2, Search, X } from 'lucide-react'

import {
  useProjectsInfinite,
  useArchiveProject,
  useRestoreProject,
  useCreateProject,
  ProjectLimitError,
  isAtProjectLimit,
  PROJECTS_PAGE_SIZE,
  type Project,
  type PaginationMeta,
  type ArchiveFilter,
} from '@/hooks/use-projects'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useOrganizationContext } from '@/hooks/use-organization-context'
import { Input } from '@/components/ui/input'
import { useProjectAnalytics } from '@/hooks/use-analytics'
import { OrganizationSelector } from '@/components/organization-selector'
import { CreateProjectRequestSchema, type CreateProjectRequest, type ProjectLimits } from '@planflow/shared'
import { UpgradePrompt, ProjectLimitBadge } from '@/components/upgrade-prompt'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorIllustration } from '@/components/ui/empty-state'
import { ValidatedInput } from '@/components/ui/validated-input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(dateString)
}

function ProjectCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-8 w-8 rounded" />
        </div>
        <Skeleton className="mt-2 h-4 w-full" />
        <Skeleton className="mt-1 h-4 w-3/4" />
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 text-sm">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-24" />
        </div>
      </CardContent>
    </Card>
  )
}

function ProjectsEmptyState({
  onCreateClick,
  canCreate,
  isSearching,
  searchQuery,
  onClearSearch,
  archiveFilter,
  onShowActive,
}: {
  onCreateClick: () => void
  canCreate: boolean
  isSearching?: boolean
  searchQuery?: string
  onClearSearch?: () => void
  archiveFilter?: ArchiveFilter
  onShowActive?: () => void
}) {
  if (isSearching) {
    return (
      <Card className="border-dashed">
        <CardContent>
          <EmptyState
            illustration="search"
            title="No projects found"
            description={`No projects match "${searchQuery}". Try a different search term or clear the search.`}
            size="lg"
            action={onClearSearch ? {
              label: "Clear Search",
              onClick: onClearSearch,
            } : undefined}
          />
        </CardContent>
      </Card>
    )
  }

  if (archiveFilter === 'archived') {
    return (
      <Card className="border-dashed">
        <CardContent>
          <EmptyState
            illustration="projects"
            title="No archived projects"
            description="You don't have any archived projects. Projects you archive will appear here."
            size="lg"
            action={onShowActive ? {
              label: "View Active Projects",
              onClick: onShowActive,
            } : undefined}
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-dashed">
      <CardContent>
        <EmptyState
          illustration="projects"
          title="No projects yet"
          description="Get started by creating your first project. You can sync your PROJECT_PLAN.md files from the terminal using the MCP integration."
          size="lg"
          action={canCreate ? {
            label: "Create Project",
            onClick: onCreateClick,
          } : undefined}
        />
      </CardContent>
    </Card>
  )
}

function CreateProjectDialog({
  open,
  onOpenChange,
  organizationId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string | null
}) {
  const router = useRouter()
  const createProject = useCreateProject()
  const { trackProjectCreated } = useProjectAnalytics()
  const [apiError, setApiError] = useState<string | null>(null)
  const [isLimitError, setIsLimitError] = useState(false)

  const form = useForm<Omit<CreateProjectRequest, 'organizationId'>>({
    resolver: zodResolver(CreateProjectRequestSchema.omit({ organizationId: true })),
    mode: 'onTouched', // Enable real-time validation after field is touched
    defaultValues: {
      name: '',
      description: '',
    },
  })

  const onSubmit = async (data: Omit<CreateProjectRequest, 'organizationId'>) => {
    if (!organizationId) {
      setApiError('No organization selected')
      return
    }
    setApiError(null)
    setIsLimitError(false)
    try {
      const project = await createProject.mutateAsync({
        name: data.name,
        description: data.description || undefined,
        organizationId,
      })
      // Track project creation
      trackProjectCreated(project.id, project.name)
      form.reset()
      onOpenChange(false)
      router.push(`/dashboard/projects/${project.id}`)
    } catch (error) {
      if (error instanceof ProjectLimitError) {
        setApiError(error.message)
        setIsLimitError(true)
      } else if (error instanceof Error) {
        setApiError(error.message)
      } else {
        setApiError('An unexpected error occurred. Please try again.')
      }
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      form.reset()
      setApiError(null)
      setIsLimitError(false)
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Project</DialogTitle>
          <DialogDescription>
            Create a new project to start managing your plans and tasks.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {apiError && (
              <div className={`rounded-md p-3 text-sm ${isLimitError ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-600'}`}>
                <p>{apiError}</p>
                {isLimitError && (
                  <Link
                    href="/settings/billing"
                    className="mt-2 inline-block font-medium underline hover:no-underline"
                    onClick={() => handleOpenChange(false)}
                  >
                    Upgrade to Pro
                  </Link>
                )}
              </div>
            )}
            <FormField
              control={form.control}
              name="name"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Project Name</FormLabel>
                  <FormControl>
                    <ValidatedInput
                      placeholder="My Awesome Project"
                      disabled={createProject.isPending}
                      isValid={fieldState.isTouched && !fieldState.error && field.value !== ''}
                      isError={!!fieldState.error}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="A brief description of your project..."
                      rows={3}
                      disabled={createProject.isPending}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={createProject.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createProject.isPending}>
                {createProject.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Project'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <Card className="border-red-200 bg-red-50">
      <CardContent className="flex flex-col items-center justify-center py-16">
        <ErrorIllustration className="h-32 w-32" />
        <h3 className="mt-4 text-lg font-semibold text-red-900">Failed to load projects</h3>
        <p className="mt-2 max-w-sm text-center text-sm text-red-600">
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>
        <Button variant="outline" className="mt-6" onClick={onRetry}>
          Try again
        </Button>
      </CardContent>
    </Card>
  )
}

function ProjectCard({
  project,
  onArchive,
  onRestore,
  canManage,
}: {
  project: Project
  onArchive: (id: string, name: string) => void
  onRestore: (id: string, name: string) => void
  canManage: boolean  // true for owner/admin
}) {
  const [showArchiveDialog, setShowArchiveDialog] = useState(false)
  const isArchived = !!project.archivedAt

  return (
    <>
      <Card className={`transition-shadow hover:shadow-md ${isArchived ? 'opacity-75' : ''}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <Link href={`/dashboard/projects/${project.id}`} className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg hover:text-primary">{project.name}</CardTitle>
                {isArchived && (
                  <Badge variant="secondary" className="text-xs">
                    <Archive className="mr-1 h-3 w-3" />
                    Archived
                  </Badge>
                )}
              </div>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                  <MoreVertical className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/projects/${project.id}`}>View project</Link>
                </DropdownMenuItem>
                {!isArchived && (
                  <DropdownMenuItem asChild>
                    <Link href={`/dashboard/projects/${project.id}/settings`}>Settings</Link>
                  </DropdownMenuItem>
                )}
                {canManage && (isArchived ? (
                  <DropdownMenuItem
                    className="text-green-600 focus:bg-green-50 focus:text-green-600"
                    onClick={() => onRestore(project.id, project.name)}
                  >
                    <ArchiveRestore className="mr-2 h-4 w-4" />
                    Restore
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    className="text-orange-600 focus:bg-orange-50 focus:text-orange-600"
                    onClick={() => setShowArchiveDialog(true)}
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    Archive
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {project.description && (
            <CardDescription className="line-clamp-2">{project.description}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>Created {formatDate(project.createdAt)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>Updated {formatRelativeTime(project.updatedAt)}</span>
            </div>
            {isArchived && project.archivedAt && (
              <div className="flex items-center gap-1 text-orange-600">
                <Archive className="h-4 w-4" />
                <span>Archived {formatRelativeTime(project.archivedAt)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive &quot;{project.name}&quot;? The project will be
              hidden from your active projects but can be restored later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange-600 hover:bg-orange-700"
              onClick={() => onArchive(project.id, project.name)}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default function ProjectsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>('active')
  const debouncedSearch = useDebouncedValue(searchQuery, 300)

  // Organization context
  const { currentOrganizationId, isLoading: orgLoading, canEdit, canDelete } = useOrganizationContext()

  const {
    data,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useProjectsInfinite({
    organizationId: currentOrganizationId,
    search: debouncedSearch,
    pageSize: PROJECTS_PAGE_SIZE,
    archived: archiveFilter
  })
  const archiveProject = useArchiveProject()
  const restoreProject = useRestoreProject()
  const { trackProjectDeleted } = useProjectAnalytics()
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  // Flatten all pages of projects into a single array
  const projects = data?.pages.flatMap((page) => page.projects) ?? []
  // Get limits from the first page (they're the same across all pages)
  const limits = data?.pages[0]?.limits
  // Get archived count from the first page
  const archivedCount = data?.pages[0]?.archivedCount ?? 0
  // Get pagination info from the last page
  const pagination = data?.pages[data.pages.length - 1]?.pagination
  // Check if we're searching
  const isSearching = searchQuery.trim() !== ''

  const handleArchive = async (projectId: string, projectName: string) => {
    try {
      await archiveProject.mutateAsync(projectId)
      // Track as "deleted" for analytics (it's a soft delete)
      trackProjectDeleted(projectId, projectName)
    } catch (err) {
      console.error('Failed to archive project:', err)
    }
  }

  const handleRestore = async (projectId: string, _projectName: string) => {
    try {
      await restoreProject.mutateAsync(projectId)
    } catch (err) {
      console.error('Failed to restore project:', err)
    }
  }

  const canCreate = limits ? limits.canCreate && canEdit : canEdit
  const showUpgradePrompt = limits && isAtProjectLimit(limits)

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:mb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Projects</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage your projects and sync plans from your local development environment.
              </p>
            </div>
            {limits && <ProjectLimitBadge limits={limits} />}
          </div>
          <div className="flex items-center gap-3">
            <OrganizationSelector />
            <Button onClick={() => setShowCreateDialog(true)} disabled={!canCreate || !currentOrganizationId}>
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9"
              aria-label="Search projects"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Archive Filter Tabs */}
          <Tabs value={archiveFilter} onValueChange={(v) => setArchiveFilter(v as ArchiveFilter)}>
            <TabsList>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="archived" className="gap-1">
                Archived
                {archivedCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {archivedCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Upgrade Prompt */}
      {showUpgradePrompt && limits && <UpgradePrompt limits={limits} />}

      {/* Content */}
      {isLoading || orgLoading ? (
        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ProjectCardSkeleton />
          <ProjectCardSkeleton />
          <ProjectCardSkeleton />
        </div>
      ) : error ? (
        <ErrorState error={error as Error} onRetry={() => refetch()} />
      ) : projects && projects.length > 0 ? (
        <>
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onArchive={handleArchive}
                onRestore={handleRestore}
                canManage={canDelete}
              />
            ))}
          </div>

          {/* Load More / Pagination */}
          {hasNextPage && (
            <div className="mt-6 flex flex-col items-center gap-2">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="min-w-[200px]"
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Load More Projects'
                )}
              </Button>
              {pagination && (
                <p className="text-xs text-muted-foreground">
                  Showing {projects.length} of {pagination.totalCount} projects
                </p>
              )}
            </div>
          )}

          {/* All loaded indicator */}
          {!hasNextPage && pagination && pagination.totalCount > PROJECTS_PAGE_SIZE && (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              All {pagination.totalCount} projects loaded
            </p>
          )}
        </>
      ) : (
        <ProjectsEmptyState
          onCreateClick={() => setShowCreateDialog(true)}
          canCreate={canCreate}
          isSearching={isSearching}
          searchQuery={searchQuery}
          onClearSearch={() => setSearchQuery('')}
          archiveFilter={archiveFilter}
          onShowActive={() => setArchiveFilter('active')}
        />
      )}

      {/* Create Project Modal */}
      <CreateProjectDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        organizationId={currentOrganizationId}
      />
    </div>
  )
}
