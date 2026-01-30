'use client'

import { useMutation } from '@tanstack/react-query'
import { authApi } from '@/lib/auth-api'
import type { FeedbackCategory } from '@planflow/shared'

export interface Feedback {
  id: string
  category: FeedbackCategory
  rating: number
  message: string
  createdAt: string
}

interface CreateFeedbackData {
  category: FeedbackCategory
  rating: number
  message: string
  pageUrl?: string
}

interface CreateFeedbackResponse {
  success: boolean
  data: {
    feedback: Feedback
    message: string
  }
}

export function useCreateFeedback() {
  return useMutation({
    mutationFn: async (data: CreateFeedbackData) => {
      const response = await authApi.post<CreateFeedbackResponse>('/feedback', {
        ...data,
        pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
      })
      return response.data
    },
  })
}
