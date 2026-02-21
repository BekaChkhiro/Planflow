'use client'

import { useState, useCallback } from 'react'
import { MessageSquare, Loader2 } from 'lucide-react'
import { CommentItem } from './comment-item'
import type { Comment } from '@/hooks/use-comments'
import type { PresenceStatus } from '@/hooks/use-presence'

interface CommentListProps {
  comments: Comment[]
  projectId: string
  taskId: string
  taskDisplayId: string
  currentUserId: string
  isProjectOwner?: boolean
  onCreateComment: (content: string, parentId?: string) => Promise<void>
  onEditComment: (commentId: string, content: string) => Promise<void>
  onDeleteComment: (commentId: string) => Promise<void>
  isCreating?: boolean
  isLoading?: boolean
  /** Function to get presence status for a user (T7.8) */
  getPresenceStatus?: (userId: string) => PresenceStatus | undefined
}

export function CommentList({
  comments,
  projectId,
  taskId,
  taskDisplayId,
  currentUserId,
  isProjectOwner = false,
  onCreateComment,
  onEditComment,
  onDeleteComment,
  isCreating = false,
  isLoading = false,
  getPresenceStatus,
}: CommentListProps) {
  const [replyingTo, setReplyingTo] = useState<string | null>(null)

  const handleReply = useCallback((parentId: string) => {
    setReplyingTo(parentId)
  }, [])

  const handleCancelReply = useCallback(() => {
    setReplyingTo(null)
  }, [])

  const handleSubmitReply = useCallback(
    async (content: string, parentId: string) => {
      await onCreateComment(content, parentId)
      setReplyingTo(null)
    },
    [onCreateComment]
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Filter to only show top-level comments (no parentId)
  // Replies are nested within their parent comments
  const topLevelComments = comments.filter((c) => !c.parentId)

  return (
    <div className="space-y-6">
      {topLevelComments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="rounded-full bg-gray-100 p-3">
            <MessageSquare className="h-6 w-6 text-gray-400" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            No comments yet. Be the first to comment!
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {topLevelComments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUserId={currentUserId}
              isProjectOwner={isProjectOwner}
              onEdit={onEditComment}
              onDelete={onDeleteComment}
              onReply={handleReply}
              onSubmitReply={handleSubmitReply}
              onCancelReply={handleCancelReply}
              replyingToId={replyingTo}
              isCreatingReply={isCreating}
              depth={0}
              projectId={projectId}
              taskId={taskId}
              taskDisplayId={taskDisplayId}
              getPresenceStatus={getPresenceStatus}
            />
          ))}
        </div>
      )}
    </div>
  )
}
