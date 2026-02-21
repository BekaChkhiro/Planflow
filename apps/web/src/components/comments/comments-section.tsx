'use client'

import { useCallback } from 'react'
import { MessageSquare } from 'lucide-react'
import { CommentList } from './comment-list'
import { CommentInput } from './comment-input'
import { TypingIndicators } from '../typing/typing-indicators'
import {
  useComments,
  useCreateComment,
  useUpdateComment,
  useDeleteComment,
} from '@/hooks/use-comments'
import { useAuthStore } from '@/stores/auth-store'
import { useToast } from '@/hooks/use-toast'
import type { PresenceStatus } from '@/hooks/use-presence'

interface CommentsSectionProps {
  projectId: string
  taskId: string
  taskDisplayId: string
  isProjectOwner?: boolean
  /** Function to get presence status for a user (T7.8) */
  getPresenceStatus?: (userId: string) => PresenceStatus | undefined
}

export function CommentsSection({
  projectId,
  taskId,
  taskDisplayId,
  isProjectOwner = false,
  getPresenceStatus,
}: CommentsSectionProps) {
  const { toast } = useToast()
  const user = useAuthStore((state) => state.user)
  const currentUserId = user?.id || ''

  // Fetch comments
  const { data, isLoading, error } = useComments(projectId, taskId)

  // Mutations
  const createComment = useCreateComment(projectId, taskId)
  const updateComment = useUpdateComment(projectId, taskId)
  const deleteComment = useDeleteComment(projectId, taskId)

  // Handle create comment
  const handleCreateComment = useCallback(
    async (content: string, parentId?: string, mentions?: string[]) => {
      try {
        await createComment.mutateAsync({
          content,
          parentId,
          mentions,
        })
      } catch (err) {
        toast({
          title: 'Error',
          description: 'Failed to post comment. Please try again.',
          variant: 'destructive',
        })
        throw err
      }
    },
    [createComment, toast]
  )

  // Handle edit comment
  const handleEditComment = useCallback(
    async (commentId: string, content: string) => {
      try {
        await updateComment.mutateAsync({
          commentId,
          data: { content },
        })
        toast({
          title: 'Comment updated',
          description: 'Your comment has been updated.',
        })
      } catch (err) {
        toast({
          title: 'Error',
          description: 'Failed to update comment. Please try again.',
          variant: 'destructive',
        })
        throw err
      }
    },
    [updateComment, toast]
  )

  // Handle delete comment
  const handleDeleteComment = useCallback(
    async (commentId: string) => {
      try {
        await deleteComment.mutateAsync(commentId)
        toast({
          title: 'Comment deleted',
          description: 'The comment has been deleted.',
        })
      } catch (err) {
        toast({
          title: 'Error',
          description: 'Failed to delete comment. Please try again.',
          variant: 'destructive',
        })
        throw err
      }
    },
    [deleteComment, toast]
  )

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="rounded-full bg-red-100 p-3">
          <MessageSquare className="h-6 w-6 text-red-400" />
        </div>
        <p className="mt-3 text-sm text-red-600">Failed to load comments</p>
        <p className="text-xs text-muted-foreground">Please try again later</p>
      </div>
    )
  }

  const comments = data?.comments || []
  const totalCount = data?.totalCount || 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold">
          Comments
          {totalCount > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({totalCount})
            </span>
          )}
        </h3>
      </div>

      {/* Comment Input */}
      <CommentInput
        projectId={projectId}
        taskId={taskId}
        taskDisplayId={taskDisplayId}
        onSubmit={(content, mentions) => handleCreateComment(content, undefined, mentions)}
        isSubmitting={createComment.isPending}
        placeholder="Write a comment... Use @ to mention team members"
      />

      {/* Typing Indicators */}
      <TypingIndicators projectId={projectId} taskId={taskId} />

      {/* Comments List */}
      <CommentList
        comments={comments}
        projectId={projectId}
        taskId={taskId}
        taskDisplayId={taskDisplayId}
        currentUserId={currentUserId}
        isProjectOwner={isProjectOwner}
        onCreateComment={handleCreateComment}
        onEditComment={handleEditComment}
        onDeleteComment={handleDeleteComment}
        isCreating={createComment.isPending}
        isLoading={isLoading}
        getPresenceStatus={getPresenceStatus}
      />
    </div>
  )
}
