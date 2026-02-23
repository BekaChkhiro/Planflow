'use client'

import { useState, useCallback } from 'react'
import { CommentItem } from './comment-item'
import { CommentListSkeleton } from '@/components/ui/loading-skeletons'
import { EmptyState } from '@/components/ui/empty-state'
import type { Comment } from '@/hooks/use-comments'
import type { PresenceStatus } from '@/hooks/use-presence'

interface CommentListProps {
  comments: Comment[]
  projectId: string
  taskId: string
  taskDisplayId: string
  currentUserId: string
  isProjectOwner?: boolean
  onCreateComment: (content: string, parentId?: string, mentions?: string[]) => Promise<void>
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
    async (content: string, parentId: string, mentions?: string[]) => {
      await onCreateComment(content, parentId, mentions)
      setReplyingTo(null)
    },
    [onCreateComment]
  )

  if (isLoading) {
    return <CommentListSkeleton count={3} />
  }

  // Filter to only show top-level comments (no parentId)
  // Replies are nested within their parent comments
  const topLevelComments = comments.filter((c) => !c.parentId)

  return (
    <div className="space-y-6">
      {topLevelComments.length === 0 ? (
        <EmptyState
          illustration="comments"
          title="No comments yet"
          description="Be the first to comment on this task!"
          size="sm"
        />
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
