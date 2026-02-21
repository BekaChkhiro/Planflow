'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'
import { authApi } from '@/lib/auth-api'
import { useProjectWebSocket } from './use-websocket'

// Types
export interface CommentAuthor {
  id: string
  email: string
  name: string | null
}

export interface Comment {
  id: string
  taskId: string
  content: string
  parentId: string | null
  mentions: string[]
  createdAt: string
  updatedAt: string
  author: CommentAuthor
  replies?: Comment[]
}

export interface CreateCommentRequest {
  content: string
  parentId?: string
  mentions?: string[]
}

export interface UpdateCommentRequest {
  content?: string
  mentions?: string[]
}

// Response types
interface CommentsResponse {
  success: boolean
  data: {
    taskId: string
    comments: Comment[]
    totalCount: number
  }
}

interface CommentResponse {
  success: boolean
  data: {
    comment: Comment
  }
}

// Query keys
export const commentsQueryKey = (projectId: string, taskId: string) =>
  ['projects', projectId, 'tasks', taskId, 'comments']

/**
 * Fetch comments for a task
 */
export function useComments(projectId: string, taskId: string | undefined) {
  return useQuery({
    queryKey: commentsQueryKey(projectId, taskId || ''),
    queryFn: async () => {
      if (!taskId) return { comments: [], totalCount: 0 }
      const response = await authApi.get<CommentsResponse>(
        `/projects/${projectId}/tasks/${taskId}/comments`
      )
      return response.data
    },
    enabled: !!projectId && !!taskId,
  })
}

/**
 * Create a new comment
 */
export function useCreateComment(projectId: string, taskId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateCommentRequest) => {
      const response = await authApi.post<CommentResponse>(
        `/projects/${projectId}/tasks/${taskId}/comments`,
        data
      )
      return response.data.comment
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentsQueryKey(projectId, taskId) })
    },
  })
}

/**
 * Update a comment
 */
export function useUpdateComment(projectId: string, taskId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ commentId, data }: { commentId: string; data: UpdateCommentRequest }) => {
      const response = await authApi.patch<CommentResponse>(
        `/projects/${projectId}/tasks/${taskId}/comments/${commentId}`,
        data
      )
      return response.data.comment
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentsQueryKey(projectId, taskId) })
    },
  })
}

/**
 * Delete a comment
 */
export function useDeleteComment(projectId: string, taskId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (commentId: string) => {
      await authApi.delete(`/projects/${projectId}/tasks/${taskId}/comments/${commentId}`)
      return commentId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentsQueryKey(projectId, taskId) })
    },
  })
}

/**
 * Hook to handle real-time comment updates via WebSocket
 */
export function useCommentsWebSocket(
  projectId: string,
  taskId: string | undefined,
  _enabled: boolean = true
) {
  const queryClient = useQueryClient()

  // Handle incoming WebSocket messages for comments
  const handleCommentCreated = useCallback(
    (data: Record<string, unknown>) => {
      const comment = data['comment'] as Comment | undefined
      if (comment && taskId && comment.taskId === taskId) {
        queryClient.invalidateQueries({ queryKey: commentsQueryKey(projectId, taskId) })
      }
    },
    [projectId, taskId, queryClient]
  )

  const handleCommentUpdated = useCallback(
    (data: Record<string, unknown>) => {
      const comment = data['comment'] as Comment | undefined
      if (comment && taskId && comment.taskId === taskId) {
        queryClient.invalidateQueries({ queryKey: commentsQueryKey(projectId, taskId) })
      }
    },
    [projectId, taskId, queryClient]
  )

  const handleCommentDeleted = useCallback(
    (data: Record<string, unknown>) => {
      const deletedTaskId = data['taskId'] as string | undefined
      if (taskId && deletedTaskId === taskId) {
        queryClient.invalidateQueries({ queryKey: commentsQueryKey(projectId, taskId) })
      }
    },
    [projectId, taskId, queryClient]
  )

  return {
    handleCommentCreated,
    handleCommentUpdated,
    handleCommentDeleted,
  }
}

/**
 * Hook to manage typing indicators
 */
export function useTypingIndicator(
  projectId: string,
  taskId: string | undefined,
  taskDisplayId: string | undefined
) {
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isTypingRef = useRef(false)

  const { sendTypingStart, sendTypingStop, isConnected } = useProjectWebSocket({
    projectId,
    enabled: !!projectId && !!taskId,
  })

  const startTyping = useCallback(() => {
    if (!taskId || !taskDisplayId || !isConnected) return

    // Send typing start if not already typing
    if (!isTypingRef.current) {
      isTypingRef.current = true
      sendTypingStart(taskId, taskDisplayId)
    }

    // Reset the timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Auto-stop typing after 3 seconds of no activity
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping()
    }, 3000)
  }, [taskId, taskDisplayId, isConnected, sendTypingStart])

  const stopTyping = useCallback(() => {
    if (!isConnected) return

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = null
    }

    if (isTypingRef.current) {
      isTypingRef.current = false
      sendTypingStop()
    }
  }, [isConnected, sendTypingStop])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
      if (isTypingRef.current) {
        sendTypingStop()
      }
    }
  }, [sendTypingStop])

  return { startTyping, stopTyping }
}

/**
 * Get initials from name or email
 */
export function getAuthorInitials(author: CommentAuthor): string {
  if (author.name) {
    const parts = author.name.trim().split(' ').filter(Boolean)
    if (parts.length >= 2) {
      const first = parts[0]?.[0] || ''
      const last = parts[parts.length - 1]?.[0] || ''
      return `${first}${last}`.toUpperCase()
    }
    return author.name.slice(0, 2).toUpperCase()
  }
  return author.email.slice(0, 2).toUpperCase()
}

/**
 * Format relative time for comments
 */
export function formatCommentTime(dateString: string): string {
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

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}
