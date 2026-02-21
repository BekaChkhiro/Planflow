'use client'

import { useState, useRef, useCallback } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useTypingIndicator } from '@/hooks/use-comments'

interface CommentInputProps {
  projectId: string
  taskId: string
  taskDisplayId: string
  onSubmit: (content: string) => Promise<void>
  isSubmitting?: boolean
  placeholder?: string
  autoFocus?: boolean
  onCancel?: () => void
  showCancel?: boolean
}

export function CommentInput({
  projectId,
  taskId,
  taskDisplayId,
  onSubmit,
  isSubmitting = false,
  placeholder = 'Write a comment...',
  autoFocus = false,
  onCancel,
  showCancel = false,
}: CommentInputProps) {
  const [content, setContent] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { startTyping, stopTyping } = useTypingIndicator(projectId, taskId, taskDisplayId)

  const handleSubmit = useCallback(async () => {
    const trimmedContent = content.trim()
    if (!trimmedContent || isSubmitting) return

    stopTyping()
    await onSubmit(trimmedContent)
    setContent('')

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [content, isSubmitting, onSubmit, stopTyping])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Submit on Cmd/Ctrl + Enter
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSubmit()
      }
      // Cancel on Escape
      if (e.key === 'Escape' && onCancel) {
        e.preventDefault()
        onCancel()
      }
    },
    [handleSubmit, onCancel]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setContent(e.target.value)
      startTyping()

      // Auto-resize textarea
      const textarea = e.target
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    },
    [startTyping]
  )

  const handleBlur = useCallback(() => {
    stopTyping()
  }, [stopTyping])

  const canSubmit = content.trim().length > 0 && !isSubmitting

  return (
    <div className="space-y-2">
      <Textarea
        ref={textareaRef}
        value={content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={isSubmitting}
        className="min-h-[80px] resize-none"
        rows={3}
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Press <kbd className="rounded border px-1 text-xs">Cmd</kbd>+
          <kbd className="rounded border px-1 text-xs">Enter</kbd> to submit
        </p>
        <div className="flex gap-2">
          {showCancel && onCancel && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
