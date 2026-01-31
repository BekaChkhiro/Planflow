'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, FolderOpen, Calendar, Clock, MoreVertical, Trash2, Loader2 } from 'lucide-react'

import {
  useProjects,
  useDeleteProject,
  useCreateProject,
  ProjectLimitError,
  isAtProjectLimit,
  type Project,
} from '@/hooks/use-projects'
import { CreateProjectRequestSchema, type CreateProjectRequest, type ProjectLimits } from '@planflow/shared'
import { UpgradePrompt, ProjectLimitBadge } from '@/components/upgrade-prompt'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
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

function EmptyState({ onCreateClick, canCreate }: { onCreateClick: () => void; canCreate: boolean }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-16">
        <div className="rounded-full bg-gray-100 p-4">
          <FolderOpen className="h-8 w-8 text-gray-400" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-gray-900">No projects yet</h3>
        <p className="mt-2 max-w-sm text-center text-sm text-gray-500">
          Get started by creating your first project. You can sync your PROJECT_PLAN.md files
          from the terminal using the MCP integration.
        </p>
        <Button className="mt-6" onClick={onCreateClick} disabled={!canCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Create Project
        </Button>
      </CardContent>
    </Card>
  )
}

function CreateProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const createProject = useCreateProject()
  const [apiError, setApiError] = useState<string | null>(null)
  const [isLimitError, setIsLimitError] = useState(false)

  const form = useForm<CreateProjectRequest>({
    resolver: zodResolver(CreateProjectRequestSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  })

  const onSubmit = async (data: CreateProjectRequest) => {
    setApiError(null)
    setIsLimitError(false)
    try {
      const project = await createProject.mutateAsync({
        name: data.name,
        description: data.description || undefined,
      })
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
      <DialogContent className="sm:max-w-[425px]">
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
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="My Awesome Project"
                      disabled={createProject.isPending}
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
        <div className="rounded-full bg-red-100 p-4">
          <FolderOpen className="h-8 w-8 text-red-400" />
        </div>
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

function ProjectCard({ project, onDelete }: { project: Project; onDelete: (id: string) => void }) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  return (
    <>
      <Card className="transition-shadow hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <Link href={`/dashboard/projects/${project.id}`} className="flex-1">
              <CardTitle className="text-lg hover:text-primary">{project.name}</CardTitle>
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
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/projects/${project.id}/settings`}>Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-600 focus:bg-red-50 focus:text-red-600"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {project.description && (
            <CardDescription className="line-clamp-2">{project.description}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>Created {formatDate(project.createdAt)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>Updated {formatRelativeTime(project.updatedAt)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{project.name}&quot;? This action cannot be
              undone and will permanently delete all project data including tasks and plans.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => onDelete(project.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default function ProjectsPage() {
  const { data, isLoading, error, refetch } = useProjects()
  const deleteProject = useDeleteProject()
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const projects = data?.projects
  const limits = data?.limits

  const handleDelete = async (projectId: string) => {
    try {
      await deleteProject.mutateAsync(projectId)
    } catch (err) {
      console.error('Failed to delete project:', err)
    }
  }

  const canCreate = limits ? limits.canCreate : true
  const showUpgradePrompt = limits && isAtProjectLimit(limits)

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage your projects and sync plans from your local development environment.
            </p>
          </div>
          {limits && <ProjectLimitBadge limits={limits} />}
        </div>
        <Button onClick={() => setShowCreateDialog(true)} disabled={!canCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </div>

      {/* Upgrade Prompt */}
      {showUpgradePrompt && limits && <UpgradePrompt limits={limits} />}

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ProjectCardSkeleton />
          <ProjectCardSkeleton />
          <ProjectCardSkeleton />
        </div>
      ) : error ? (
        <ErrorState error={error as Error} onRetry={() => refetch()} />
      ) : projects && projects.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} onDelete={handleDelete} />
          ))}
        </div>
      ) : (
        <EmptyState onCreateClick={() => setShowCreateDialog(true)} canCreate={canCreate} />
      )}

      {/* Create Project Modal */}
      <CreateProjectDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
    </div>
  )
}
