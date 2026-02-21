'use client'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  CheckCircle2,
  Circle,
  Loader2,
  Ban,
  Clock,
  GitBranch,
  Calendar,
} from 'lucide-react'
import { CommentsSection } from '@/components/comments'
import { GitHubLinkSection } from './github-link-section'
import { GitHubPrSection } from './github-pr-section'
import type { PresenceStatus } from '@/hooks/use-presence'

// Task type from the project page
export interface TaskDetail {
  id: string
  taskId: string
  name: string
  description?: string | null
  complexity: 'Low' | 'Medium' | 'High'
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'
  dependencies: string[]
  phase: number
  updatedAt: string
  estimatedHours?: number | null
  assignee?: {
    id: string
    email: string
    name: string | null
  } | null
  // GitHub link fields (T8.3)
  githubIssueNumber?: number | null
  githubRepository?: string | null
  githubIssueUrl?: string | null
  githubIssueTitle?: string | null
  githubIssueState?: 'open' | 'closed' | null
}

interface TaskDetailSheetProps {
  task: TaskDetail | null
  projectId: string
  isOpen: boolean
  onClose: () => void
  isProjectOwner?: boolean
  /** Function to get presence status for a user (T7.8) */
  getPresenceStatus?: (userId: string) => PresenceStatus | undefined
}

// Status configuration
const statusConfig = {
  TODO: {
    label: 'To Do',
    color: 'bg-slate-100 text-slate-700 border-slate-200',
    icon: Circle,
  },
  IN_PROGRESS: {
    label: 'In Progress',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: Loader2,
  },
  DONE: {
    label: 'Done',
    color: 'bg-green-100 text-green-700 border-green-200',
    icon: CheckCircle2,
  },
  BLOCKED: {
    label: 'Blocked',
    color: 'bg-red-100 text-red-700 border-red-200',
    icon: Ban,
  },
}

const complexityConfig = {
  Low: { color: 'bg-emerald-100 text-emerald-700', label: 'Low' },
  Medium: { color: 'bg-amber-100 text-amber-700', label: 'Medium' },
  High: { color: 'bg-rose-100 text-rose-700', label: 'High' },
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function TaskDetailSheet({
  task,
  projectId,
  isOpen,
  onClose,
  isProjectOwner = false,
  getPresenceStatus,
}: TaskDetailSheetProps) {
  if (!task) return null

  const StatusIcon = statusConfig[task.status].icon

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-4">
          <div className="flex items-start gap-3">
            <div
              className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${statusConfig[task.status].color}`}
            >
              <StatusIcon
                className={`h-4 w-4 ${task.status === 'IN_PROGRESS' ? 'animate-spin' : ''}`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-left text-lg leading-tight">
                {task.name}
              </SheetTitle>
              <SheetDescription className="mt-1 text-left">
                <span className="font-mono">{task.taskId}</span>
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="space-y-6 pb-6">
            {/* Status and Metadata */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={statusConfig[task.status].color}>
                {statusConfig[task.status].label}
              </Badge>
              <Badge variant="outline" className={complexityConfig[task.complexity].color}>
                {task.complexity}
              </Badge>
              <Badge variant="outline">Phase {task.phase}</Badge>
            </div>

            {/* Details Grid */}
            <div className="grid gap-3">
              {/* Dependencies */}
              {task.dependencies.length > 0 && (
                <div className="flex items-start gap-2">
                  <GitBranch className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="text-sm">
                    <span className="text-muted-foreground">Depends on: </span>
                    <span className="font-mono">
                      {task.dependencies.join(', ')}
                    </span>
                  </div>
                </div>
              )}

              {/* Estimated Hours */}
              {task.estimatedHours && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm">
                    <span className="text-muted-foreground">Estimated: </span>
                    {task.estimatedHours} hour{task.estimatedHours !== 1 ? 's' : ''}
                  </span>
                </div>
              )}

              {/* Last Updated */}
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm">
                  <span className="text-muted-foreground">Updated: </span>
                  {formatDate(task.updatedAt)}
                </span>
              </div>

              {/* Assignee */}
              {task.assignee && (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-medium text-primary">
                      {task.assignee.name?.[0]?.toUpperCase() ||
                        task.assignee.email[0]?.toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm">
                    <span className="text-muted-foreground">Assigned to: </span>
                    {task.assignee.name || task.assignee.email}
                  </span>
                </div>
              )}
            </div>

            {/* Description */}
            {task.description && (
              <>
                <Separator />
                <div>
                  <h4 className="mb-2 text-sm font-medium">Description</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {task.description}
                  </p>
                </div>
              </>
            )}

            {/* GitHub Issue Link Section (T8.3) */}
            <Separator />
            <GitHubLinkSection
              projectId={projectId}
              taskId={task.id}
              taskDisplayId={task.taskId}
              taskName={task.name}
            />

            {/* GitHub PR Link Section (T8.4) */}
            <Separator />
            <GitHubPrSection
              projectId={projectId}
              taskId={task.id}
              taskDisplayId={task.taskId}
              taskName={task.name}
              taskDescription={task.description || undefined}
            />

            {/* Comments Section */}
            <Separator />
            <CommentsSection
              projectId={projectId}
              taskId={task.id}
              taskDisplayId={task.taskId}
              isProjectOwner={isProjectOwner}
              getPresenceStatus={getPresenceStatus}
            />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
