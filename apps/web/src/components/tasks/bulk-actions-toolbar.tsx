'use client'

import { useState } from 'react'
import { CheckSquare, Trash2, UserPlus, ArrowRight, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import type { TaskStatus } from '@/components/tasks'
import type { TeamMember } from '@/hooks/use-team'

interface BulkActionsToolbarProps {
  selectedCount: number
  onClearSelection: () => void
  onStatusChange: (status: TaskStatus) => void
  onAssign: (assigneeId: string | null) => void
  onDelete: () => void
  isUpdatingStatus?: boolean
  isAssigning?: boolean
  isDeleting?: boolean
  teamMembers?: TeamMember[]
}

const statusOptions: { value: TaskStatus; label: string; color: string }[] = [
  { value: 'TODO', label: 'To Do', color: 'bg-slate-100 text-slate-700' },
  { value: 'IN_PROGRESS', label: 'In Progress', color: 'bg-blue-100 text-blue-700' },
  { value: 'BLOCKED', label: 'Blocked', color: 'bg-red-100 text-red-700' },
  { value: 'DONE', label: 'Done', color: 'bg-green-100 text-green-700' },
]

export function BulkActionsToolbar({
  selectedCount,
  onClearSelection,
  onStatusChange,
  onAssign,
  onDelete,
  isUpdatingStatus = false,
  isAssigning = false,
  isDeleting = false,
  teamMembers = [],
}: BulkActionsToolbarProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const isLoading = isUpdatingStatus || isAssigning || isDeleting

  const handleDelete = () => {
    setShowDeleteConfirm(true)
  }

  const confirmDelete = () => {
    onDelete()
    setShowDeleteConfirm(false)
  }

  return (
    <>
      <div
        className="flex items-center gap-3 rounded-lg border bg-primary/5 px-4 py-3 animate-in slide-in-from-top-2 duration-200"
        role="toolbar"
        aria-label="Bulk actions toolbar"
      >
        {/* Selection count */}
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-primary" aria-hidden="true" />
          <span className="font-medium">
            {selectedCount} task{selectedCount > 1 ? 's' : ''} selected
          </span>
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Status change dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={isLoading}
            >
              {isUpdatingStatus ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              Change Status
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Set status to</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {statusOptions.map((status) => (
              <DropdownMenuItem
                key={status.value}
                onClick={() => onStatusChange(status.value)}
              >
                <Badge variant="outline" className={`mr-2 ${status.color}`}>
                  {status.label}
                </Badge>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Assignment dropdown */}
        {teamMembers.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={isLoading}
              >
                {isAssigning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                Assign
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
              <DropdownMenuLabel>Assign to</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onAssign(null)}>
                <span className="text-muted-foreground">Unassign</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {teamMembers.map((member) => (
                <DropdownMenuItem
                  key={member.id}
                  onClick={() => onAssign(member.userId)}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium">
                      {(member.userName || member.userEmail).charAt(0).toUpperCase()}
                    </div>
                    <span>{member.userName || member.userEmail}</span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Delete button */}
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-destructive hover:bg-destructive hover:text-destructive-foreground"
          onClick={handleDelete}
          disabled={isLoading}
        >
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          Delete
        </Button>

        <div className="flex-1" />

        {/* Clear selection */}
        <Button
          variant="ghost"
          size="sm"
          className="gap-1"
          onClick={onClearSelection}
          disabled={isLoading}
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Clear selection
        </Button>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedCount} task{selectedCount > 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected
              task{selectedCount > 1 ? 's' : ''} and all associated comments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
