'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Calendar,
  Clock,
  FileText,
  ListTodo,
  LayoutDashboard,
  Settings,
  MoreVertical,
  Pencil,
  Trash2,
  Activity,
  PanelRight,
  PanelRightClose,
  Users,
} from 'lucide-react'

import { useProject, useDeleteProject, useUpdateProject, useProjectTasks } from '@/hooks/use-projects'
import { useProjectWebSocket } from '@/hooks/use-websocket'
import { useNotificationToasts } from '@/hooks/use-notification-toasts'
import { usePresence } from '@/hooks/use-presence'
import { ConnectionIndicator } from '@/components/ui/connection-indicator'
import { PresenceAvatarStack } from '@/components/presence'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { ActivityFeed, ActivityFeedSidebar } from '@/components/activity'

// Import non-lazy-loaded components
import {
  ProjectDetailSkeleton,
  ErrorState,
  NotFoundState,
  formatDate,
  formatRelativeTime,
  computeTaskStats,
} from './components'

// Lazy load heavy tab components with loading skeletons
const OverviewTab = dynamic(
  () => import('./components/overview-tab').then((mod) => ({ default: mod.OverviewTab })),
  {
    loading: () => <OverviewTabSkeleton />,
    ssr: false,
  }
)

const PlanTab = dynamic(
  () => import('./components/plan-tab').then((mod) => ({ default: mod.PlanTab })),
  {
    loading: () => <PlanTabSkeleton />,
    ssr: false,
  }
)

const TasksTab = dynamic(
  () => import('./components/tasks-tab').then((mod) => ({ default: mod.TasksTab })),
  {
    loading: () => <TasksTabSkeleton />,
    ssr: false,
  }
)

const TeamTab = dynamic(
  () => import('./components/team-tab').then((mod) => ({ default: mod.TeamTab })),
  {
    loading: () => <TeamTabSkeleton />,
    ssr: false,
  }
)

// Lazy load edit dialog (only needed when editing)
const EditProjectDialog = dynamic(
  () => import('./components/edit-project-dialog').then((mod) => ({ default: mod.EditProjectDialog })),
  { ssr: false }
)

// Import skeletons for loading states
import { OverviewTabSkeleton } from './components/overview-tab'
import { PlanTabSkeleton } from './components/plan-tab'
import { TasksTabSkeleton } from './components/tasks-tab'
import { TeamTabSkeleton } from './components/team-tab'

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = params['id'] as string
  const defaultTab = searchParams.get('tab') || 'overview'

  const { data: project, isLoading, error, refetch } = useProject(projectId)
  const { data: tasks = [], isLoading: tasksLoading } = useProjectTasks(projectId)
  const deleteProject = useDeleteProject()
  const updateProject = useUpdateProject()

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showActivitySidebar, setShowActivitySidebar] = useState(true)

  // Notification toasts (T6.7)
  const { showNotificationToast } = useNotificationToasts()

  // Presence tracking (T7.8)
  const {
    onlineUsers,
    onlineCount,
    handlePresenceList,
    handlePresenceJoined,
    handlePresenceLeft,
    handlePresenceUpdated,
    handleWorkingOnChanged,
    clearPresence,
    getPresenceStatus,
  } = usePresence()

  // WebSocket for real-time updates
  const { status: wsStatus } = useProjectWebSocket({
    projectId,
    enabled: !isLoading && !error && !!project,
    onNotificationNew: showNotificationToast,
    // Presence callbacks (T7.8)
    onPresenceList: handlePresenceList,
    onPresenceJoined: handlePresenceJoined,
    onPresenceLeft: handlePresenceLeft,
    onPresenceUpdated: handlePresenceUpdated,
    onWorkingOnChanged: handleWorkingOnChanged,
    onDisconnected: clearPresence,
  })

  const handleDelete = async () => {
    try {
      await deleteProject.mutateAsync(projectId)
      router.push('/dashboard/projects')
    } catch (err) {
      console.error('Failed to delete project:', err)
    }
  }

  const handleEdit = async (data: { name: string; description: string | null }) => {
    try {
      await updateProject.mutateAsync({ projectId, data })
      setShowEditDialog(false)
    } catch (err) {
      console.error('Failed to update project:', err)
    }
  }

  if (isLoading || tasksLoading) {
    return <ProjectDetailSkeleton />
  }

  if (error) {
    // Check if it's a 404 error
    if ((error as { status?: number }).status === 404) {
      return <NotFoundState />
    }
    return <ErrorState error={error as Error} onRetry={() => refetch()} />
  }

  if (!project) {
    return <NotFoundState />
  }

  const stats = computeTaskStats(tasks)
  const progress = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link href="/dashboard/projects">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Link>
        </Button>

        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
              {stats.total > 0 && (
                <Badge variant={progress === 100 ? 'default' : 'secondary'}>{progress}%</Badge>
              )}
              <ConnectionIndicator status={wsStatus} />
              {/* Online team members (T7.8) */}
              {onlineCount > 0 && (
                <div className="flex items-center gap-2">
                  <PresenceAvatarStack
                    users={onlineUsers.map(user => ({
                      userId: user.userId,
                      name: user.name,
                      email: user.email,
                      status: user.status,
                      workingOn: user.workingOn,
                      lastActiveAt: user.lastActiveAt,
                    }))}
                    max={4}
                    size="xs"
                  />
                  <span className="text-xs text-muted-foreground">
                    {onlineCount} online
                  </span>
                </div>
              )}
            </div>
            {project.description && (
              <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Activity Sidebar Toggle */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowActivitySidebar(!showActivitySidebar)}
              title={showActivitySidebar ? 'Hide activity sidebar' : 'Show activity sidebar'}
              className="hidden lg:flex"
            >
              {showActivitySidebar ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRight className="h-4 w-4" />
              )}
              <span className="sr-only">Toggle activity sidebar</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit project
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/projects/${project.id}/settings`}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600 focus:bg-red-50 focus:text-red-600"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            <span>Created {formatDate(project.createdAt)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>Updated {formatRelativeTime(project.updatedAt)}</span>
          </div>
        </div>
      </div>

      <Separator className="mb-6" />

      {/* Main Content with Activity Sidebar */}
      <div className="flex gap-6">
        {/* Main Content Area */}
        <div className={`flex-1 min-w-0 ${showActivitySidebar ? 'lg:pr-0' : ''}`}>
          {/* Tabs */}
          <Tabs defaultValue={defaultTab} className="space-y-6">
            <TabsList>
              <TabsTrigger value="overview" className="gap-2">
                <LayoutDashboard className="h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="plan" className="gap-2">
                <FileText className="h-4 w-4" />
                Plan
              </TabsTrigger>
              <TabsTrigger value="tasks" className="gap-2">
                <ListTodo className="h-4 w-4" />
                Tasks
                {stats.total > 0 && (
                  <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                    {stats.total}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="team" className="gap-2">
                <Users className="h-4 w-4" />
                Team
              </TabsTrigger>
              <TabsTrigger value="activity" className="gap-2 lg:hidden">
                <Activity className="h-4 w-4" />
                Activity
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <OverviewTab tasks={tasks} />
            </TabsContent>

            <TabsContent value="plan">
              <PlanTab
                plan={project.plan}
                projectId={projectId}
                projectName={project.name}
                updatedAt={project.updatedAt}
              />
            </TabsContent>

            <TabsContent value="tasks">
              <TasksTab tasks={tasks} projectId={projectId} getPresenceStatus={getPresenceStatus} />
            </TabsContent>

            <TabsContent value="team">
              <TeamTab projectId={projectId} />
            </TabsContent>

            <TabsContent value="activity" className="lg:hidden">
              <Card>
                <CardHeader>
                  <CardTitle>Activity Feed</CardTitle>
                  <CardDescription>
                    Real-time activity log showing all project events
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <ActivityFeed
                    projectId={projectId}
                    variant="default"
                    maxHeight="600px"
                    showHeader={false}
                    showFilters={true}
                    limit={25}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Activity Sidebar - Only visible on large screens */}
        {showActivitySidebar && (
          <aside className="hidden lg:block w-80 flex-shrink-0">
            <Card className="sticky top-4 h-[calc(100vh-8rem)] overflow-hidden">
              <ActivityFeedSidebar projectId={projectId} />
            </Card>
          </aside>
        )}
      </div>

      {/* Delete Dialog */}
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
              onClick={handleDelete}
              disabled={deleteProject.isPending}
            >
              {deleteProject.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog - Lazy loaded */}
      {showEditDialog && (
        <EditProjectDialog
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          project={project}
          onSave={handleEdit}
          isSaving={updateProject.isPending}
        />
      )}
    </div>
  )
}
