'use client'

import {
  PlusCircle,
  Edit,
  Trash2,
  RefreshCw,
  UserPlus,
  UserMinus,
  MessageSquare,
  FolderPlus,
  FileText,
  Mail,
  UserCheck,
  UserX,
  Shield,
  Activity as ActivityIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import type { Activity, ActivityAction } from '@/hooks/use-activity'
import { getActivityDescription, getActivityColor } from '@/hooks/use-activity'

// Icon mapping for activity types
const iconMap: Record<string, typeof ActivityIcon> = {
  'plus-circle': PlusCircle,
  edit: Edit,
  'trash-2': Trash2,
  'refresh-cw': RefreshCw,
  'user-plus': UserPlus,
  'user-minus': UserMinus,
  'message-square': MessageSquare,
  'folder-plus': FolderPlus,
  'file-text': FileText,
  mail: Mail,
  'user-check': UserCheck,
  'user-x': UserX,
  shield: Shield,
  activity: ActivityIcon,
}

function getIconComponent(action: ActivityAction): typeof ActivityIcon {
  const iconName = getActivityIconName(action)
  return iconMap[iconName] || ActivityIcon
}

function getActivityIconName(action: ActivityAction): string {
  switch (action) {
    case 'task_created':
      return 'plus-circle'
    case 'task_updated':
    case 'project_updated':
      return 'edit'
    case 'task_deleted':
    case 'project_deleted':
    case 'comment_deleted':
      return 'trash-2'
    case 'task_status_changed':
      return 'refresh-cw'
    case 'task_assigned':
      return 'user-plus'
    case 'task_unassigned':
      return 'user-minus'
    case 'comment_created':
    case 'comment_updated':
      return 'message-square'
    case 'project_created':
      return 'folder-plus'
    case 'plan_updated':
      return 'file-text'
    case 'member_invited':
      return 'mail'
    case 'member_joined':
      return 'user-check'
    case 'member_removed':
      return 'user-x'
    case 'member_role_changed':
      return 'shield'
    default:
      return 'activity'
  }
}

interface ActivityItemProps {
  activity: Activity
  isNew?: boolean
  className?: string
}

export function ActivityItem({ activity, isNew = false, className }: ActivityItemProps) {
  const Icon = getIconComponent(activity.action)
  const colorClass = getActivityColor(activity.action)
  const description = getActivityDescription(activity)
  const timeAgo = formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })

  return (
    <div
      className={cn(
        'flex items-start gap-3 py-3 px-4 transition-colors duration-300',
        isNew && 'bg-blue-50 dark:bg-blue-950/20',
        className
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          'flex-shrink-0 rounded-full p-2',
          colorClass.replace('text-', 'bg-').replace('500', '100'),
          'dark:bg-opacity-20'
        )}
      >
        <Icon className={cn('h-4 w-4', colorClass)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground">{description}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground">{timeAgo}</span>
          {activity.taskId && (
            <span className="text-xs font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
              {activity.taskId}
            </span>
          )}
        </div>
      </div>

      {/* New indicator */}
      {isNew && (
        <div className="flex-shrink-0">
          <span className="inline-flex h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
        </div>
      )}
    </div>
  )
}

/**
 * Compact variant for sidebar display
 */
export function ActivityItemCompact({ activity, isNew = false }: ActivityItemProps) {
  const Icon = getIconComponent(activity.action)
  const colorClass = getActivityColor(activity.action)
  const actorName = activity.actor.name || activity.actor.email.split('@')[0]
  const timeAgo = formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })

  // Get short action label
  const actionLabel = getShortActionLabel(activity.action)

  return (
    <div
      className={cn(
        'flex items-center gap-2 py-2 px-3 text-sm transition-colors duration-300',
        isNew && 'bg-blue-50 dark:bg-blue-950/20'
      )}
    >
      <Icon className={cn('h-3.5 w-3.5 flex-shrink-0', colorClass)} />
      <span className="font-medium truncate">{actorName}</span>
      <span className="text-muted-foreground truncate">{actionLabel}</span>
      {activity.taskId && (
        <span className="text-xs font-medium text-primary">{activity.taskId}</span>
      )}
      <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">{timeAgo}</span>
    </div>
  )
}

function getShortActionLabel(action: ActivityAction): string {
  switch (action) {
    case 'task_created':
      return 'created'
    case 'task_updated':
      return 'updated'
    case 'task_deleted':
      return 'deleted'
    case 'task_status_changed':
      return 'changed status of'
    case 'task_assigned':
      return 'assigned'
    case 'task_unassigned':
      return 'unassigned'
    case 'comment_created':
      return 'commented on'
    case 'comment_updated':
      return 'edited comment on'
    case 'comment_deleted':
      return 'deleted comment on'
    case 'project_created':
      return 'created project'
    case 'project_updated':
      return 'updated project'
    case 'project_deleted':
      return 'deleted project'
    case 'plan_updated':
      return 'updated plan'
    case 'member_invited':
      return 'invited member'
    case 'member_joined':
      return 'joined'
    case 'member_removed':
      return 'removed member'
    case 'member_role_changed':
      return 'changed role'
    default:
      return 'performed action'
  }
}
