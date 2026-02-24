'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ListTodo,
  CheckCircle2,
  Circle,
  Loader2,
  LayoutGrid,
  List,
  Ban,
  ChevronRight,
  Search,
  X,
  ArrowUpDown,
  GripVertical,
  ChevronDown,
} from 'lucide-react'

import { useDebouncedValue } from '@/hooks/use-debounced-value'
import type { Task, TaskAssignee } from '@/hooks/use-projects'
import { useAssignTask, useDuplicateTask, useReorderTasks, type TaskReorderItem } from '@/hooks/use-projects'
import { useOrganizations, useTeamMembers, type TeamMember } from '@/hooks/use-team'
import { useUpdateTask, useUndoKeyboardShortcut } from '@/hooks/use-task-undo'
import { TaskAssigneeSelector, TaskDetailSheet, type TaskDetail, type TaskStatus, BulkActionsToolbar } from '@/components/tasks'
import { useBulkStatusUpdate, useBulkAssign, useBulkDelete } from '@/hooks/use-bulk-tasks'
import { Checkbox } from '@/components/ui/checkbox'
import type { PresenceStatus } from '@/hooks/use-presence'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'
import type { DisplayTask } from './types'
import { statusConfig, complexityConfig } from './types'
import { toDisplayTasks, computeTaskStats } from './utils'

// Status icon mapping
const statusIcons = {
  TODO: Circle,
  IN_PROGRESS: Loader2,
  DONE: CheckCircle2,
  BLOCKED: Ban,
}

interface TaskCardProps {
  task: DisplayTask
  view: 'kanban' | 'list'
  teamMembers?: TeamMember[]
  onAssign?: (taskId: string, userId: string | null) => void
  isAssigning?: boolean
  assigningTaskId?: string | null
  onClick?: (task: DisplayTask) => void
  getPresenceStatus?: (userId: string) => PresenceStatus | undefined
  isDragging?: boolean
  // Selection props (T14.6)
  isSelected?: boolean
  onSelectionChange?: (taskId: string, selected: boolean) => void
  selectionMode?: boolean
}

function TaskCard({ task, view, teamMembers = [], onAssign, isAssigning, assigningTaskId, onClick, getPresenceStatus, isSelected = false, onSelectionChange, selectionMode = false }: TaskCardProps) {
  const StatusIcon = statusIcons[task.status]
  const isThisTaskAssigning = isAssigning && assigningTaskId === task.taskId

  const handleAssign = (userId: string | null) => {
    if (onAssign) {
      onAssign(task.taskId, userId)
    }
  }

  const handleClick = (e: React.MouseEvent) => {
    // If clicking on checkbox area, let the checkbox handle it
    if ((e.target as HTMLElement).closest('[data-checkbox]')) {
      return
    }
    onClick?.(task)
  }

  const handleCheckboxChange = (checked: boolean) => {
    onSelectionChange?.(task.id, checked)
  }

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  if (view === 'list') {
    const statusLabel = statusConfig[task.status].label
    const taskLabel = `${task.taskId}: ${task.name}, Status: ${statusLabel}, Complexity: ${task.complexity}, Phase ${task.phase}${task.assignee ? `, Assigned to ${task.assignee.name || task.assignee.email}` : ', Unassigned'}`

    return (
      <article
        className={`flex items-center gap-4 rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${isSelected ? 'ring-2 ring-primary bg-primary/5' : ''}`}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleClick(e as unknown as React.MouseEvent)
          }
        }}
        tabIndex={0}
        role="button"
        aria-label={taskLabel}
        aria-selected={isSelected}
      >
        {/* Selection checkbox (T14.6) */}
        {(selectionMode || onSelectionChange) && (
          <div data-checkbox onClick={handleCheckboxClick} className="shrink-0">
            <Checkbox
              checked={isSelected}
              onCheckedChange={handleCheckboxChange}
              aria-label={`Select ${task.taskId}`}
            />
          </div>
        )}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted" aria-hidden="true">
          <StatusIcon
            className={`h-4 w-4 ${
              task.status === 'IN_PROGRESS' ? 'animate-spin text-blue-500 dark:text-blue-400' : ''
            } ${task.status === 'DONE' ? 'text-green-500 dark:text-green-400' : ''} ${
              task.status === 'BLOCKED' ? 'text-red-500 dark:text-red-400' : ''
            } ${task.status === 'TODO' ? 'text-muted-foreground' : ''}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{task.taskId}</span>
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <span className="truncate font-medium">{task.name}</span>
          </div>
          {task.dependencies.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Depends on: {task.dependencies.join(', ')}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {teamMembers.length > 0 && onAssign && (
            <TaskAssigneeSelector
              assignee={task.assignee}
              teamMembers={teamMembers}
              onAssign={handleAssign}
              isLoading={isThisTaskAssigning}
              size="md"
              getPresenceStatus={getPresenceStatus}
            />
          )}
          <Badge variant="outline" className={complexityConfig[task.complexity].color}>
            {task.complexity}
          </Badge>
          <Badge className="text-xs" variant="outline">
            Phase {task.phase}
          </Badge>
        </div>
      </article>
    )
  }

  // Kanban card
  const kanbanTaskLabel = `${task.taskId}: ${task.name}, Complexity: ${task.complexity}, Phase ${task.phase}${task.assignee ? `, Assigned to ${task.assignee.name || task.assignee.email}` : ''}`

  return (
    <article
      className={`group rounded-lg border bg-card p-3 shadow-sm transition-all hover:shadow-md cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${isSelected ? 'ring-2 ring-primary bg-primary/5' : ''}`}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick(e as unknown as React.MouseEvent)
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={kanbanTaskLabel}
      aria-selected={isSelected}
    >
      <div className="mb-2 flex items-start justify-between">
        <div className="flex items-center gap-2">
          {/* Selection checkbox (T14.6) */}
          {(selectionMode || onSelectionChange) && (
            <div data-checkbox onClick={handleCheckboxClick} className="shrink-0">
              <Checkbox
                checked={isSelected}
                onCheckedChange={handleCheckboxChange}
                aria-label={`Select ${task.taskId}`}
              />
            </div>
          )}
          <span className="font-mono text-xs text-muted-foreground" aria-hidden="true">{task.taskId}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {teamMembers.length > 0 && onAssign && (
            <TaskAssigneeSelector
              assignee={task.assignee}
              teamMembers={teamMembers}
              onAssign={handleAssign}
              isLoading={isThisTaskAssigning}
              size="sm"
              getPresenceStatus={getPresenceStatus}
            />
          )}
          <Badge variant="outline" className={`text-xs ${complexityConfig[task.complexity].color}`}>
            {task.complexity}
          </Badge>
        </div>
      </div>
      <p className="mb-3 text-sm font-medium leading-snug">{task.name}</p>
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-xs">
          Phase {task.phase}
        </Badge>
        {task.dependencies.length > 0 && (
          <span className="text-xs text-muted-foreground" title={`Depends on: ${task.dependencies.join(', ')}`}>
            {task.dependencies.length} dep{task.dependencies.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
    </article>
  )
}

// Sortable wrapper for TaskCard (T14.3 - Drag and Drop)
interface SortableTaskCardProps extends TaskCardProps {
  isDragging?: boolean
  // Selection props inherited from TaskCardProps
}

function SortableTaskCard(props: SortableTaskCardProps) {
  const { task, isDragging: isOverlayDragging } = props
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  // For the overlay, render without sortable wrapper
  if (isOverlayDragging) {
    return <TaskCard {...props} />
  }

  return (
    <div ref={setNodeRef} style={style} className="relative group/sortable">
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0 top-0 bottom-0 w-6 flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover/sortable:opacity-100 transition-opacity z-10"
        onClick={(e) => e.stopPropagation()}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="pl-2 group-hover/sortable:pl-6 transition-all">
        <TaskCard {...props} />
      </div>
    </div>
  )
}

interface KanbanColumnProps {
  status: DisplayTask['status']
  tasks: DisplayTask[]
  teamMembers?: TeamMember[]
  onAssign?: (taskId: string, userId: string | null) => void
  isAssigning?: boolean
  assigningTaskId?: string | null
  onTaskClick?: (task: DisplayTask) => void
  getPresenceStatus?: (userId: string) => PresenceStatus | undefined
  // Selection props (T14.6)
  selectedTaskIds?: Set<string>
  onSelectionChange?: (taskId: string, selected: boolean) => void
  selectionMode?: boolean
}

function KanbanColumn({
  status,
  tasks,
  teamMembers,
  onAssign,
  isAssigning,
  assigningTaskId,
  onTaskClick,
  getPresenceStatus,
  selectedTaskIds,
  onSelectionChange,
  selectionMode,
}: KanbanColumnProps) {
  const config = statusConfig[status]
  const StatusIcon = statusIcons[status]

  const columnId = `kanban-column-${status.toLowerCase()}`
  const taskIds = tasks.map(t => t.id)

  return (
    <section
      className={`flex min-w-[280px] flex-col rounded-lg ${config.columnColor} p-3`}
      aria-labelledby={columnId}
      data-status={status}
    >
      <div className="mb-3 flex items-center gap-2">
        <StatusIcon
          className={`h-4 w-4 ${status === 'IN_PROGRESS' ? 'animate-spin' : ''}`}
          aria-hidden="true"
        />
        <h3 id={columnId} className="font-semibold">{config.label}</h3>
        <Badge variant="secondary" className="ml-auto" aria-label={`${tasks.length} tasks`}>
          {tasks.length}
        </Badge>
      </div>
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto min-h-[100px]" role="list" aria-label={`${config.label} tasks`}>
          {tasks.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-muted p-4 text-center" role="status">
              <p className="text-sm text-muted-foreground">No tasks</p>
            </div>
          ) : (
            tasks.map((task) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                view="kanban"
                teamMembers={teamMembers}
                onAssign={onAssign}
                isAssigning={isAssigning}
                assigningTaskId={assigningTaskId}
                onClick={onTaskClick}
                getPresenceStatus={getPresenceStatus}
                isSelected={selectedTaskIds?.has(task.id)}
                onSelectionChange={onSelectionChange}
                selectionMode={selectionMode}
              />
            ))
          )}
        </div>
      </SortableContext>
    </section>
  )
}

interface KanbanViewProps {
  tasks: DisplayTask[]
  teamMembers?: TeamMember[]
  onAssign?: (taskId: string, userId: string | null) => void
  isAssigning?: boolean
  assigningTaskId?: string | null
  onTaskClick?: (task: DisplayTask) => void
  getPresenceStatus?: (userId: string) => PresenceStatus | undefined
  onReorder?: (items: TaskReorderItem[]) => void
  // Selection props (T14.6)
  selectedTaskIds?: Set<string>
  onSelectionChange?: (taskId: string, selected: boolean) => void
  selectionMode?: boolean
}

function KanbanView({ tasks, teamMembers, onAssign, isAssigning, assigningTaskId, onTaskClick, getPresenceStatus, onReorder, selectedTaskIds, onSelectionChange, selectionMode }: KanbanViewProps) {
  const [activeTask, setActiveTask] = useState<DisplayTask | null>(null)

  // Sort by displayOrder (primary) then taskId (secondary) for stable ordering
  const sortByOrder = (a: DisplayTask, b: DisplayTask) => {
    const orderDiff = (a.displayOrder ?? 0) - (b.displayOrder ?? 0)
    if (orderDiff !== 0) return orderDiff
    return a.taskId.localeCompare(b.taskId, undefined, { numeric: true })
  }
  const sortByUpdatedAtDesc = (a: DisplayTask, b: DisplayTask) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()

  const tasksByStatus = useMemo(() => ({
    TODO: tasks.filter((t) => t.status === 'TODO').sort(sortByOrder),
    IN_PROGRESS: tasks.filter((t) => t.status === 'IN_PROGRESS').sort(sortByOrder),
    BLOCKED: tasks.filter((t) => t.status === 'BLOCKED').sort(sortByOrder),
    DONE: tasks.filter((t) => t.status === 'DONE').sort(sortByUpdatedAtDesc),
  }), [tasks])

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px movement required before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event
    const task = tasks.find(t => t.id === active.id)
    if (task) {
      setActiveTask(task)
    }
  }, [tasks])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    setActiveTask(null)

    if (!over || !onReorder) return

    const activeTask = tasks.find(t => t.id === active.id)
    if (!activeTask) return

    // Find which column the task is being dropped into
    let targetStatus: DisplayTask['status'] | null = null
    let targetTasks: DisplayTask[] = []

    // Check if dropped over another task
    const overTask = tasks.find(t => t.id === over.id)
    if (overTask) {
      targetStatus = overTask.status
      targetTasks = tasksByStatus[targetStatus]
    } else {
      // Dropped on column itself - check the column data attribute
      const overElement = document.querySelector(`[data-status="${over.id}"]`)
      if (overElement) {
        targetStatus = over.id as DisplayTask['status']
        targetTasks = tasksByStatus[targetStatus] || []
      }
    }

    if (!targetStatus) return

    // If moving within the same column and to a different position, or moving to a new column
    const sourceStatus = activeTask.status
    const isSameColumn = sourceStatus === targetStatus

    if (isSameColumn && active.id === over.id) return // No change needed

    // Calculate new order
    const reorderItems: TaskReorderItem[] = []

    if (isSameColumn) {
      // Reorder within the same column
      const oldIndex = targetTasks.findIndex(t => t.id === active.id)
      const newIndex = targetTasks.findIndex(t => t.id === over.id)

      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

      // Create new array with moved task
      const newTasks = [...targetTasks]
      const [movedTask] = newTasks.splice(oldIndex, 1)
      if (!movedTask) return
      newTasks.splice(newIndex, 0, movedTask)

      // Update displayOrder for all tasks in the column
      newTasks.forEach((task, index) => {
        reorderItems.push({
          taskId: task.taskId,
          displayOrder: (index + 1) * 1000,
        })
      })
    } else {
      // Moving to a different column (status change)
      // Update the moved task's status and order
      const targetIndex = overTask ? targetTasks.findIndex(t => t.id === over.id) : targetTasks.length

      reorderItems.push({
        taskId: activeTask.taskId,
        displayOrder: (targetIndex + 1) * 1000,
        status: targetStatus,
      })

      // Update displayOrder for tasks after the insertion point
      targetTasks.forEach((task, index) => {
        if (index >= targetIndex) {
          reorderItems.push({
            taskId: task.taskId,
            displayOrder: (index + 2) * 1000,
          })
        }
      })
    }

    if (reorderItems.length > 0) {
      onReorder(reorderItems)
    }
  }, [tasks, tasksByStatus, onReorder])

  const totalTasks = tasks.length

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        className="flex gap-4 overflow-x-auto pb-4"
        role="region"
        aria-label={`Kanban board with ${totalTasks} tasks across 4 columns`}
      >
        <KanbanColumn status="TODO" tasks={tasksByStatus.TODO} teamMembers={teamMembers} onAssign={onAssign} isAssigning={isAssigning} assigningTaskId={assigningTaskId} onTaskClick={onTaskClick} getPresenceStatus={getPresenceStatus} selectedTaskIds={selectedTaskIds} onSelectionChange={onSelectionChange} selectionMode={selectionMode} />
        <KanbanColumn status="IN_PROGRESS" tasks={tasksByStatus.IN_PROGRESS} teamMembers={teamMembers} onAssign={onAssign} isAssigning={isAssigning} assigningTaskId={assigningTaskId} onTaskClick={onTaskClick} getPresenceStatus={getPresenceStatus} selectedTaskIds={selectedTaskIds} onSelectionChange={onSelectionChange} selectionMode={selectionMode} />
        <KanbanColumn status="BLOCKED" tasks={tasksByStatus.BLOCKED} teamMembers={teamMembers} onAssign={onAssign} isAssigning={isAssigning} assigningTaskId={assigningTaskId} onTaskClick={onTaskClick} getPresenceStatus={getPresenceStatus} selectedTaskIds={selectedTaskIds} onSelectionChange={onSelectionChange} selectionMode={selectionMode} />
        <KanbanColumn status="DONE" tasks={tasksByStatus.DONE} teamMembers={teamMembers} onAssign={onAssign} isAssigning={isAssigning} assigningTaskId={assigningTaskId} onTaskClick={onTaskClick} getPresenceStatus={getPresenceStatus} selectedTaskIds={selectedTaskIds} onSelectionChange={onSelectionChange} selectionMode={selectionMode} />
      </div>

      {/* Drag overlay for visual feedback */}
      <DragOverlay>
        {activeTask ? (
          <div className="opacity-90 shadow-lg">
            <TaskCard
              task={activeTask}
              view="kanban"
              teamMembers={teamMembers}
              isDragging
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

interface ListViewProps {
  tasks: DisplayTask[]
  groupBy: 'status' | 'phase'
  teamMembers?: TeamMember[]
  onAssign?: (taskId: string, userId: string | null) => void
  isAssigning?: boolean
  assigningTaskId?: string | null
  onTaskClick?: (task: DisplayTask) => void
  getPresenceStatus?: (userId: string) => PresenceStatus | undefined
  // Selection props (T14.6)
  selectedTaskIds?: Set<string>
  onSelectionChange?: (taskId: string, selected: boolean) => void
  selectionMode?: boolean
}

function ListView({
  tasks,
  groupBy,
  teamMembers,
  onAssign,
  isAssigning,
  assigningTaskId,
  onTaskClick,
  getPresenceStatus,
  selectedTaskIds,
  onSelectionChange,
  selectionMode,
}: ListViewProps) {
  if (groupBy === 'status') {
    const statuses: DisplayTask['status'][] = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE']

    return (
      <div className="space-y-6" role="region" aria-label="Tasks grouped by status">
        {statuses.map((status) => {
          const statusTasks = tasks.filter((t) => t.status === status)
          if (statusTasks.length === 0) return null

          const config = statusConfig[status]
          const StatusIcon = statusIcons[status]
          const sectionId = `status-section-${status.toLowerCase()}`

          return (
            <section key={status} aria-labelledby={sectionId}>
              <div className="mb-3 flex items-center gap-2">
                <StatusIcon
                  className={`h-4 w-4 ${status === 'IN_PROGRESS' ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <h3 id={sectionId} className="font-semibold">{config.label}</h3>
                <Badge variant="secondary" aria-label={`${statusTasks.length} tasks`}>{statusTasks.length}</Badge>
              </div>
              <div className="space-y-2" role="list" aria-label={`${config.label} tasks`}>
                {statusTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    view="list"
                    teamMembers={teamMembers}
                    onAssign={onAssign}
                    isAssigning={isAssigning}
                    assigningTaskId={assigningTaskId}
                    onClick={onTaskClick}
                    getPresenceStatus={getPresenceStatus}
                    isSelected={selectedTaskIds?.has(task.id)}
                    onSelectionChange={onSelectionChange}
                    selectionMode={selectionMode}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    )
  }

  // Group by phase
  const phases = [...new Set(tasks.map((t) => t.phase))].sort((a, b) => a - b)

  return (
    <div className="space-y-6" role="region" aria-label="Tasks grouped by phase">
      {phases.map((phase) => {
        const phaseTasks = tasks.filter((t) => t.phase === phase)
        const phaseId = `phase-section-${phase}`
        const completedCount = phaseTasks.filter((t) => t.status === 'DONE').length

        return (
          <section key={phase} aria-labelledby={phaseId}>
            <div className="mb-3 flex items-center gap-2">
              <h3 id={phaseId} className="font-semibold">Phase {phase}</h3>
              <Badge variant="secondary" aria-label={`${phaseTasks.length} tasks`}>{phaseTasks.length}</Badge>
              <span className="ml-2 text-sm text-muted-foreground" aria-label={`${completedCount} of ${phaseTasks.length} completed`}>
                {completedCount}/{phaseTasks.length} completed
              </span>
            </div>
            <div className="space-y-2" role="list" aria-label={`Phase ${phase} tasks`}>
              {phaseTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  view="list"
                  teamMembers={teamMembers}
                  onAssign={onAssign}
                  isAssigning={isAssigning}
                  assigningTaskId={assigningTaskId}
                  onClick={onTaskClick}
                  getPresenceStatus={getPresenceStatus}
                  isSelected={selectedTaskIds?.has(task.id)}
                  onSelectionChange={onSelectionChange}
                  selectionMode={selectionMode}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

type SortOption = 'taskId' | 'name' | 'status' | 'complexity' | 'updatedAt'
type SortDirection = 'asc' | 'desc'
type ComplexityFilter = 'Low' | 'Medium' | 'High'

export function TasksTab({
  tasks: apiTasks,
  projectId,
  isProjectOwner = false,
  getPresenceStatus
}: {
  tasks: Task[]
  projectId: string
  isProjectOwner?: boolean
  getPresenceStatus?: (userId: string) => PresenceStatus | undefined
}) {
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')
  const [groupBy, setGroupBy] = useState<'status' | 'phase'>('status')
  const [filterStatus, setFilterStatus] = useState<DisplayTask['status'] | 'ALL'>('ALL')
  const [filterPhase, setFilterPhase] = useState<number | 'ALL'>('ALL')
  const [assigningTaskId, setAssigningTaskId] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<DisplayTask | null>(null)

  // Bulk selection state (T14.6)
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())

  // Search and advanced filters (T14.2)
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearch = useDebouncedValue(searchQuery, 300)
  const [filterComplexity, setFilterComplexity] = useState<ComplexityFilter[]>([])
  const [filterAssignee, setFilterAssignee] = useState<string | 'ALL' | 'unassigned'>('ALL')
  const [sortBy, setSortBy] = useState<SortOption>('taskId')
  const [sortDir, setSortDir] = useState<SortDirection>('asc')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)

  // Fetch organizations to get team members
  const { data: organizations = [] } = useOrganizations()
  const primaryOrg = organizations[0]
  const { data: teamMembers = [] } = useTeamMembers(primaryOrg?.id)

  // Assignment mutation
  const assignTask = useAssignTask(projectId)

  // Task update mutation with undo support (T12.8)
  const updateTask = useUpdateTask({ projectId })

  // Task duplicate mutation (T14.4)
  const duplicateTask = useDuplicateTask(projectId)

  // Task reorder mutation (T14.3)
  const reorderTasks = useReorderTasks(projectId)

  // Bulk operations mutations (T14.6)
  const bulkStatusUpdate = useBulkStatusUpdate(projectId)
  const bulkAssign = useBulkAssign(projectId)
  const bulkDelete = useBulkDelete(projectId)

  // Keyboard shortcut for undo (Cmd+Z / Ctrl+Z) (T12.8)
  useUndoKeyboardShortcut(projectId)

  const handleAssign = async (taskId: string, userId: string | null) => {
    setAssigningTaskId(taskId)
    try {
      await assignTask.mutateAsync({ taskId, assigneeId: userId })
    } catch (error) {
      console.error('Failed to assign task:', error)
    } finally {
      setAssigningTaskId(null)
    }
  }

  const handleTaskClick = (task: DisplayTask) => {
    setSelectedTask(task)
  }

  // Handle task status change with undo support (T12.8)
  const handleStatusChange = (task: TaskDetail, newStatus: TaskStatus) => {
    const apiTask = apiTasks.find(t => t.id === task.id)
    if (!apiTask) return

    updateTask.mutate({
      task: apiTask,
      updates: { status: newStatus },
    }, {
      onSuccess: (result) => {
        if (selectedTask?.id === task.id) {
          setSelectedTask({
            ...selectedTask,
            status: newStatus,
            updatedAt: result.task.updatedAt,
          })
        }
      },
    })
  }

  // Handle task duplication (T14.4)
  const handleDuplicate = (task: TaskDetail) => {
    duplicateTask.mutate({ taskId: task.taskId }, {
      onSuccess: () => {
        // Close the sheet after successful duplication
        setSelectedTask(null)
      },
    })
  }

  // Handle task reorder (T14.3)
  const handleReorder = useCallback((items: TaskReorderItem[]) => {
    reorderTasks.mutate(items)
  }, [reorderTasks])

  // Bulk selection handlers (T14.6)
  const handleSelectionChange = useCallback((taskId: string, selected: boolean) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev)
      if (selected) {
        next.add(taskId)
      } else {
        next.delete(taskId)
      }
      return next
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedTaskIds(new Set())
  }, [])

  // Bulk status change handler (T14.6)
  const handleBulkStatusChange = useCallback((status: TaskStatus) => {
    const taskIds = Array.from(selectedTaskIds)
    bulkStatusUpdate.mutate({ taskIds, status }, {
      onSuccess: () => {
        clearSelection()
      },
    })
  }, [selectedTaskIds, bulkStatusUpdate, clearSelection])

  // Bulk assign handler (T14.6)
  const handleBulkAssign = useCallback((assigneeId: string | null) => {
    const taskIds = Array.from(selectedTaskIds)
    bulkAssign.mutate({ taskIds, assigneeId }, {
      onSuccess: () => {
        clearSelection()
      },
    })
  }, [selectedTaskIds, bulkAssign, clearSelection])

  // Bulk delete handler (T14.6)
  const handleBulkDelete = useCallback(() => {
    const taskIds = Array.from(selectedTaskIds)
    bulkDelete.mutate({ taskIds }, {
      onSuccess: () => {
        clearSelection()
      },
    })
  }, [selectedTaskIds, bulkDelete, clearSelection])

  // Toggle complexity filter
  const toggleComplexityFilter = (complexity: ComplexityFilter) => {
    setFilterComplexity(prev =>
      prev.includes(complexity)
        ? prev.filter(c => c !== complexity)
        : [...prev, complexity]
    )
  }

  // Clear all filters
  const clearAllFilters = () => {
    setSearchQuery('')
    setFilterStatus('ALL')
    setFilterPhase('ALL')
    setFilterComplexity([])
    setFilterAssignee('ALL')
    setSortBy('taskId')
    setSortDir('asc')
  }

  // Check if any filter is active
  const hasActiveFilters = useMemo(() => {
    return (
      debouncedSearch !== '' ||
      filterStatus !== 'ALL' ||
      filterPhase !== 'ALL' ||
      filterComplexity.length > 0 ||
      filterAssignee !== 'ALL' ||
      sortBy !== 'taskId' ||
      sortDir !== 'asc'
    )
  }, [debouncedSearch, filterStatus, filterPhase, filterComplexity, filterAssignee, sortBy, sortDir])

  const tasks = toDisplayTasks(apiTasks)
  const stats = computeTaskStats(apiTasks)

  if (stats.total === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="rounded-full bg-muted p-4">
            <ListTodo className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-foreground">No tasks found</h3>
          <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
            Tasks will appear here once you sync your PROJECT_PLAN.md file.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Get unique phases for filter
  const phases = [...new Set(tasks.map((t) => t.phase))].sort((a, b) => a - b)

  // Apply filters and sorting (T14.2)
  const filteredTasks = useMemo(() => {
    let result = [...tasks]

    // Search filter (taskId, name)
    if (debouncedSearch) {
      const searchLower = debouncedSearch.toLowerCase()
      result = result.filter(
        (t) =>
          t.taskId.toLowerCase().includes(searchLower) ||
          t.name.toLowerCase().includes(searchLower)
      )
    }

    // Status filter
    if (filterStatus !== 'ALL') {
      result = result.filter((t) => t.status === filterStatus)
    }

    // Phase filter
    if (filterPhase !== 'ALL') {
      result = result.filter((t) => t.phase === filterPhase)
    }

    // Complexity filter
    if (filterComplexity.length > 0) {
      result = result.filter((t) => filterComplexity.includes(t.complexity as ComplexityFilter))
    }

    // Assignee filter
    if (filterAssignee !== 'ALL') {
      if (filterAssignee === 'unassigned') {
        result = result.filter((t) => !t.assignee)
      } else {
        result = result.filter((t) => t.assignee?.id === filterAssignee)
      }
    }

    // Sorting
    result.sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'taskId':
          comparison = a.taskId.localeCompare(b.taskId, undefined, { numeric: true })
          break
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'status':
          const statusOrder = { TODO: 0, IN_PROGRESS: 1, BLOCKED: 2, DONE: 3 }
          comparison = statusOrder[a.status] - statusOrder[b.status]
          break
        case 'complexity':
          const complexityOrder = { Low: 0, Medium: 1, High: 2 }
          comparison = (complexityOrder[a.complexity as keyof typeof complexityOrder] || 0) -
                       (complexityOrder[b.complexity as keyof typeof complexityOrder] || 0)
          break
        case 'updatedAt':
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
          break
      }
      return sortDir === 'asc' ? comparison : -comparison
    })

    return result
  }, [tasks, debouncedSearch, filterStatus, filterPhase, filterComplexity, filterAssignee, sortBy, sortDir])

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card>
        <CardContent className="space-y-4 py-4">
          {/* Top row: Search, View Toggle, Sort */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Search Input (T14.2) */}
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                placeholder="Search tasks by ID or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 pl-9 pr-9"
                aria-label="Search tasks"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* View Toggle */}
            <div className="flex items-center gap-1 rounded-lg border p-1">
              <Button
                variant={viewMode === 'kanban' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 px-3"
                onClick={() => setViewMode('kanban')}
                aria-pressed={viewMode === 'kanban'}
              >
                <LayoutGrid className="mr-2 h-4 w-4" aria-hidden="true" />
                Kanban
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 px-3"
                onClick={() => setViewMode('list')}
                aria-pressed={viewMode === 'list'}
              >
                <List className="mr-2 h-4 w-4" aria-hidden="true" />
                List
              </Button>
            </div>

            {/* Group By (List view only) */}
            {viewMode === 'list' && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Group by:</span>
                <div className="flex items-center gap-1 rounded-lg border p-1">
                  <Button
                    variant={groupBy === 'status' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setGroupBy('status')}
                  >
                    Status
                  </Button>
                  <Button
                    variant={groupBy === 'phase' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setGroupBy('phase')}
                  >
                    Phase
                  </Button>
                </div>
              </div>
            )}

            {/* Sort Dropdown (T14.2) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-2">
                  <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
                  Sort
                  {(sortBy !== 'taskId' || sortDir !== 'asc') && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1 text-xs">
                      {sortBy === 'taskId' ? 'ID' : sortBy === 'updatedAt' ? 'Updated' : sortBy.charAt(0).toUpperCase() + sortBy.slice(1)}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                  <DropdownMenuRadioItem value="taskId">Task ID</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="status">Status</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="complexity">Complexity</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="updatedAt">Last Updated</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Direction</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={sortDir} onValueChange={(v) => setSortDir(v as SortDirection)}>
                  <DropdownMenuRadioItem value="asc">Ascending</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="desc">Descending</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Stats Summary */}
            <div className="ml-auto flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">
                {filteredTasks.length === tasks.length
                  ? `${tasks.length} tasks`
                  : `${filteredTasks.length} of ${tasks.length}`}
              </span>
              <div className="hidden sm:flex items-center gap-2">
                <span className="flex items-center gap-1" title="Done">
                  <span className="h-2 w-2 rounded-full bg-green-500 dark:bg-green-400" />
                  {stats.done}
                </span>
                <span className="flex items-center gap-1" title="In Progress">
                  <span className="h-2 w-2 rounded-full bg-blue-500 dark:bg-blue-400" />
                  {stats.inProgress}
                </span>
                <span className="flex items-center gap-1" title="To Do">
                  <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-500" />
                  {stats.todo}
                </span>
                {stats.blocked > 0 && (
                  <span className="flex items-center gap-1" title="Blocked">
                    <span className="h-2 w-2 rounded-full bg-red-500 dark:bg-red-400" />
                    {stats.blocked}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Filter row (T14.2) */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <label htmlFor="filter-status" className="sr-only">Filter by status</label>
            <select
              id="filter-status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as DisplayTask['status'] | 'ALL')}
              className="h-8 rounded-md border bg-background px-2 text-sm"
            >
              <option value="ALL">All Status</option>
              <option value="TODO">To Do</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="BLOCKED">Blocked</option>
              <option value="DONE">Done</option>
            </select>

            {/* Phase Filter */}
            <label htmlFor="filter-phase" className="sr-only">Filter by phase</label>
            <select
              id="filter-phase"
              value={filterPhase}
              onChange={(e) =>
                setFilterPhase(e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value, 10))
              }
              className="h-8 rounded-md border bg-background px-2 text-sm"
            >
              <option value="ALL">All Phases</option>
              {phases.map((phase) => (
                <option key={phase} value={phase}>
                  Phase {phase}
                </option>
              ))}
            </select>

            {/* Complexity Filter (T14.2) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1">
                  Complexity
                  {filterComplexity.length > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1 text-xs">
                      {filterComplexity.length}
                    </Badge>
                  )}
                  <ChevronDown className="h-3 w-3" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuCheckboxItem
                  checked={filterComplexity.includes('Low')}
                  onCheckedChange={() => toggleComplexityFilter('Low')}
                >
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-green-500 dark:bg-green-400" />
                    Low
                  </span>
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filterComplexity.includes('Medium')}
                  onCheckedChange={() => toggleComplexityFilter('Medium')}
                >
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-yellow-500 dark:bg-yellow-400" />
                    Medium
                  </span>
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filterComplexity.includes('High')}
                  onCheckedChange={() => toggleComplexityFilter('High')}
                >
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-red-500 dark:bg-red-400" />
                    High
                  </span>
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Assignee Filter (T14.2) */}
            {teamMembers.length > 0 && (
              <>
                <label htmlFor="filter-assignee" className="sr-only">Filter by assignee</label>
                <select
                  id="filter-assignee"
                  value={filterAssignee}
                  onChange={(e) => setFilterAssignee(e.target.value)}
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="ALL">All Assignees</option>
                  <option value="unassigned">Unassigned</option>
                  {teamMembers.map((member) => (
                    <option key={member.id} value={member.userId}>
                      {member.userName || member.userEmail}
                    </option>
                  ))}
                </select>
              </>
            )}

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-muted-foreground hover:text-foreground"
                onClick={clearAllFilters}
              >
                <X className="h-3 w-3" aria-hidden="true" />
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions Toolbar (T14.6) */}
      {selectedTaskIds.size > 0 && (
        <BulkActionsToolbar
          selectedCount={selectedTaskIds.size}
          onClearSelection={clearSelection}
          onStatusChange={handleBulkStatusChange}
          onAssign={handleBulkAssign}
          onDelete={handleBulkDelete}
          isUpdatingStatus={bulkStatusUpdate.isPending}
          isAssigning={bulkAssign.isPending}
          isDeleting={bulkDelete.isPending}
          teamMembers={teamMembers}
        />
      )}

      {/* Task Views */}
      {filteredTasks.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-4">
              {debouncedSearch ? (
                <Search className="h-8 w-8 text-muted-foreground" />
              ) : (
                <ListTodo className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <h3 className="mt-4 text-lg font-semibold text-foreground">
              {debouncedSearch ? 'No tasks found' : 'No matching tasks'}
            </h3>
            <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
              {debouncedSearch
                ? `No tasks match "${debouncedSearch}". Try a different search term.`
                : 'Try adjusting your filters to see more tasks.'}
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={clearAllFilters}
            >
              Clear all filters
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === 'kanban' ? (
        <KanbanView
          tasks={filteredTasks}
          teamMembers={teamMembers}
          onAssign={handleAssign}
          isAssigning={assignTask.isPending}
          assigningTaskId={assigningTaskId}
          onTaskClick={handleTaskClick}
          getPresenceStatus={getPresenceStatus}
          onReorder={handleReorder}
          selectedTaskIds={selectedTaskIds}
          onSelectionChange={handleSelectionChange}
          selectionMode={selectedTaskIds.size > 0}
        />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <ListView
              tasks={filteredTasks}
              groupBy={groupBy}
              teamMembers={teamMembers}
              onAssign={handleAssign}
              isAssigning={assignTask.isPending}
              assigningTaskId={assigningTaskId}
              onTaskClick={handleTaskClick}
              getPresenceStatus={getPresenceStatus}
              selectedTaskIds={selectedTaskIds}
              onSelectionChange={handleSelectionChange}
              selectionMode={selectedTaskIds.size > 0}
            />
          </CardContent>
        </Card>
      )}

      {/* Task Detail Sheet with Comments */}
      <TaskDetailSheet
        task={selectedTask}
        projectId={projectId}
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        isProjectOwner={isProjectOwner}
        getPresenceStatus={getPresenceStatus}
        onStatusChange={handleStatusChange}
        isUpdating={updateTask.isPending}
        onDuplicate={handleDuplicate}
        isDuplicating={duplicateTask.isPending}
      />
    </div>
  )
}

// Loading skeleton for code splitting
export function TasksTabSkeleton() {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <div className="h-10 w-40 animate-pulse rounded-lg bg-muted" />
            <div className="h-8 w-px bg-muted" />
            <div className="h-8 w-32 animate-pulse rounded bg-muted" />
            <div className="h-8 w-32 animate-pulse rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
      <div className="flex gap-4 overflow-x-auto">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="min-w-[280px] rounded-lg bg-muted p-3">
            <div className="mb-3 flex items-center gap-2">
              <div className="h-4 w-4 animate-pulse rounded bg-muted-foreground/20" />
              <div className="h-5 w-24 animate-pulse rounded bg-muted-foreground/20" />
            </div>
            <div className="space-y-2">
              {[...Array(3)].map((_, j) => (
                <div key={j} className="h-24 animate-pulse rounded-lg bg-card" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
