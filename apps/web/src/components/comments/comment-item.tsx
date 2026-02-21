'use client'

import { useState, useCallback, useMemo } from 'react'
import { MoreHorizontal, Pencil, Trash2, Reply, Loader2, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
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
import type { Comment } from '@/hooks/use-comments'
import { getAuthorInitials, formatCommentTime } from '@/hooks/use-comments'
import { type PresenceStatus, getPresenceColor } from '@/hooks/use-presence'
import { CommentInput } from './comment-input'

/**
 * Render comment content with highlighted @mentions
 */
function renderContentWithMentions(content: string): React.ReactNode {
  // Match @mentions (email format: @user@domain.com or simple: @username)
  const mentionPattern = /@([^\s@]+(?:@[^\s@]+\.[^\s@]+)?)/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match

  while ((match = mentionPattern.exec(content)) !== null) {
    // Add text before the mention
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index))
    }

    // Add the mention with highlighting
    const mentionText = match[0]
    parts.push(
      <span
        key={match.index}
        className="inline-flex items-center rounded bg-primary/10 px-1 text-primary font-medium"
      >
        {mentionText}
      </span>
    )

    lastIndex = match.index + mentionText.length
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }

  return parts.length > 0 ? parts : content
}

interface CommentItemProps {
  comment: Comment
  currentUserId: string
  isProjectOwner?: boolean
  onEdit: (commentId: string, content: string) => Promise<void>
  onDelete: (commentId: string) => Promise<void>
  onReply?: (parentId: string) => void
  onSubmitReply?: (content: string, parentId: string, mentions?: string[]) => Promise<void>
  onCancelReply?: () => void
  replyingToId?: string | null
  isCreatingReply?: boolean
  isEditing?: boolean
  isDeleting?: boolean
  depth?: number
  projectId?: string
  taskId?: string
  taskDisplayId?: string
  /** Function to get presence status for a user (T7.8) */
  getPresenceStatus?: (userId: string) => PresenceStatus | undefined
}

export function CommentItem({
  comment,
  currentUserId,
  isProjectOwner = false,
  onEdit,
  onDelete,
  onReply,
  onSubmitReply,
  onCancelReply,
  replyingToId,
  isCreatingReply = false,
  isEditing = false,
  isDeleting = false,
  depth = 0,
  projectId,
  taskId,
  taskDisplayId,
  getPresenceStatus,
}: CommentItemProps) {
  const [isEditMode, setIsEditMode] = useState(false)
  const [editContent, setEditContent] = useState(comment.content)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)

  const isAuthor = comment.author.id === currentUserId

  // Count all nested replies recursively
  const countReplies = useCallback((replies?: Comment[]): number => {
    if (!replies || replies.length === 0) return 0
    return replies.reduce((count, reply) => {
      return count + 1 + countReplies(reply.replies)
    }, 0)
  }, [])

  const totalReplies = countReplies(comment.replies)
  const hasReplies = totalReplies > 0
  const canEdit = isAuthor
  const canDelete = isAuthor || isProjectOwner

  const handleEditSubmit = useCallback(async () => {
    const trimmedContent = editContent.trim()
    if (!trimmedContent || trimmedContent === comment.content) {
      setIsEditMode(false)
      setEditContent(comment.content)
      return
    }

    await onEdit(comment.id, trimmedContent)
    setIsEditMode(false)
  }, [editContent, comment.id, comment.content, onEdit])

  const handleEditCancel = useCallback(() => {
    setIsEditMode(false)
    setEditContent(comment.content)
  }, [comment.content])

  const handleDelete = useCallback(async () => {
    await onDelete(comment.id)
    setShowDeleteDialog(false)
  }, [comment.id, onDelete])

  const handleReply = useCallback(() => {
    onReply?.(comment.id)
  }, [comment.id, onReply])

  // Limit nesting depth for UI
  const maxDepth = 3
  const effectiveDepth = Math.min(depth, maxDepth)

  // Color-coded borders for different nesting levels
  const getBorderColor = (depth: number) => {
    switch (depth) {
      case 1: return 'border-blue-200 hover:border-blue-300'
      case 2: return 'border-purple-200 hover:border-purple-300'
      case 3: return 'border-green-200 hover:border-green-300'
      default: return 'border-gray-200 hover:border-gray-300'
    }
  }

  return (
    <>
      <div
        className={`group relative flex gap-3 ${
          effectiveDepth > 0
            ? `ml-8 border-l-2 ${getBorderColor(effectiveDepth)} pl-4 transition-colors`
            : ''
        }`}
      >
        {/* Avatar with presence indicator (T7.8) */}
        <div className="relative shrink-0">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              {getAuthorInitials(comment.author)}
            </AvatarFallback>
          </Avatar>
          {getPresenceStatus && getPresenceStatus(comment.author.id) && (
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 block h-2.5 w-2.5 rounded-full ring-2 ring-white',
                getPresenceColor(getPresenceStatus(comment.author.id)!)
              )}
            />
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Header */}
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">
              {comment.author.name || comment.author.email}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatCommentTime(comment.createdAt)}
            </span>
            {comment.updatedAt !== comment.createdAt && (
              <span className="text-xs text-muted-foreground">(edited)</span>
            )}
          </div>

          {/* Body */}
          {isEditMode ? (
            <div className="mt-2 space-y-2">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="min-h-[80px] resize-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    handleEditSubmit()
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    handleEditCancel()
                  }
                }}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleEditSubmit}
                  disabled={isEditing || !editContent.trim()}
                >
                  {isEditing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Save'
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleEditCancel}
                  disabled={isEditing}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap break-words">
              {renderContentWithMentions(comment.content)}
            </p>
          )}

          {/* Actions */}
          {!isEditMode && (
            <div className="mt-2 flex items-center gap-2">
              {/* Reply button - always show on hover */}
              {depth < maxDepth && onReply && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={handleReply}
                >
                  <Reply className="mr-1 h-3 w-3" />
                  Reply
                </Button>
              )}

              {/* Reply count and collapse toggle - always visible when there are replies */}
              {hasReplies && depth === 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setIsCollapsed(!isCollapsed)}
                >
                  {isCollapsed ? (
                    <>
                      <ChevronDown className="mr-1 h-3 w-3" />
                      Show {totalReplies} {totalReplies === 1 ? 'reply' : 'replies'}
                    </>
                  ) : (
                    <>
                      <ChevronUp className="mr-1 h-3 w-3" />
                      Hide replies
                    </>
                  )}
                </Button>
              )}

              {/* Reply count badge for nested comments (no collapse) */}
              {hasReplies && depth > 0 && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MessageSquare className="h-3 w-3" />
                  {totalReplies}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Menu */}
        {(canEdit || canDelete) && !isEditMode && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100"
              >
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canEdit && (
                <DropdownMenuItem onClick={() => setIsEditMode(true)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem
                  className="text-red-600 focus:bg-red-50 focus:text-red-600"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Inline Reply Input - shows when replying to THIS comment */}
      {replyingToId === comment.id && onSubmitReply && onCancelReply && projectId && taskId && taskDisplayId && (
        <div className={`mt-3 ${effectiveDepth > 0 ? 'ml-8 pl-4' : 'ml-11'}`}>
          <p className="mb-2 text-xs text-muted-foreground">
            Replying to {comment.author.name || comment.author.email}
          </p>
          <CommentInput
            projectId={projectId}
            taskId={taskId}
            taskDisplayId={taskDisplayId}
            onSubmit={(content, mentions) => onSubmitReply(content, comment.id, mentions)}
            isSubmitting={isCreatingReply}
            placeholder="Write a reply... Use @ to mention team members"
            autoFocus
            showCancel
            onCancel={onCancelReply}
          />
        </div>
      )}

      {/* Nested Replies */}
      {comment.replies && comment.replies.length > 0 && !isCollapsed && (
        <div className="mt-4 space-y-4">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              currentUserId={currentUserId}
              isProjectOwner={isProjectOwner}
              onEdit={onEdit}
              onDelete={onDelete}
              onReply={onReply}
              onSubmitReply={onSubmitReply}
              onCancelReply={onCancelReply}
              replyingToId={replyingToId}
              isCreatingReply={isCreatingReply}
              depth={depth + 1}
              projectId={projectId}
              taskId={taskId}
              taskDisplayId={taskDisplayId}
              getPresenceStatus={getPresenceStatus}
            />
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete comment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this comment? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
