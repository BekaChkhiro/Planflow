'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useTypingIndicator } from '@/hooks/use-comments'
import { MentionAutocomplete } from './mention-autocomplete'
import { getMentionAtCursor, parseMentionIds, type MentionableUser } from '@/hooks/use-mention-search'

interface CommentInputProps {
  projectId: string
  taskId: string
  taskDisplayId: string
  onSubmit: (content: string, mentions?: string[]) => Promise<void>
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
  placeholder = 'Write a comment... Use @ to mention team members',
  autoFocus = false,
  onCancel,
  showCancel = false,
}: CommentInputProps) {
  const [content, setContent] = useState('')
  const [cursorPosition, setCursorPosition] = useState(0)
  const [showMentions, setShowMentions] = useState(false)
  const [mentionedUsers, setMentionedUsers] = useState<MentionableUser[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { startTyping, stopTyping } = useTypingIndicator(projectId, taskId, taskDisplayId)

  // Check if we should show mention autocomplete
  useEffect(() => {
    const mentionInfo = getMentionAtCursor(content, cursorPosition)
    setShowMentions(!!mentionInfo)
  }, [content, cursorPosition])

  const handleSubmit = useCallback(async () => {
    const trimmedContent = content.trim()
    if (!trimmedContent || isSubmitting) return

    stopTyping()

    // Extract mention IDs from the content
    const mentionIds = parseMentionIds(trimmedContent, mentionedUsers)

    await onSubmit(trimmedContent, mentionIds.length > 0 ? mentionIds : undefined)
    setContent('')
    setMentionedUsers([])

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [content, isSubmitting, onSubmit, stopTyping, mentionedUsers])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Don't handle these keys if mention autocomplete is open
      if (showMentions) {
        if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
          // Let the autocomplete handle these
          return
        }
      }

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
    [handleSubmit, onCancel, showMentions]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setContent(e.target.value)
      setCursorPosition(e.target.selectionStart)
      startTyping()

      // Auto-resize textarea
      const textarea = e.target
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    },
    [startTyping]
  )

  const handleSelect = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement
    setCursorPosition(target.selectionStart)
  }, [])

  const handleClick = useCallback((e: React.MouseEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement
    setCursorPosition(target.selectionStart)
  }, [])

  const handleBlur = useCallback(() => {
    stopTyping()
    // Delay hiding mentions to allow click on dropdown
    setTimeout(() => {
      if (document.activeElement !== textareaRef.current) {
        setShowMentions(false)
      }
    }, 200)
  }, [stopTyping])

  const handleMentionSelect = useCallback(
    (result: { newText: string; newCursorPosition: number; mentionId: string }) => {
      setContent(result.newText)
      setCursorPosition(result.newCursorPosition)
      setShowMentions(false)

      // Track mentioned user for ID extraction
      // We need to fetch the user again or pass it from autocomplete
      // For now, we'll re-parse on submit

      // Set cursor position in textarea
      if (textareaRef.current) {
        textareaRef.current.focus()
        // Need to set cursor position after React updates
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = result.newCursorPosition
            textareaRef.current.selectionEnd = result.newCursorPosition
          }
        })
      }
    },
    []
  )

  const handleMentionClose = useCallback(() => {
    setShowMentions(false)
  }, [])

  // Track mentioned users when they're selected
  const handleMentionSelectWithUser = useCallback(
    (result: { newText: string; newCursorPosition: number; mentionId: string }, user?: MentionableUser) => {
      handleMentionSelect(result)
      if (user) {
        setMentionedUsers((prev) => {
          if (prev.find((u) => u.id === user.id)) return prev
          return [...prev, user]
        })
      }
    },
    [handleMentionSelect]
  )

  const canSubmit = content.trim().length > 0 && !isSubmitting

  return (
    <div className="relative space-y-2">
      <Textarea
        ref={textareaRef}
        value={content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onSelect={handleSelect}
        onClick={handleClick}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={isSubmitting}
        className="min-h-[80px] resize-none"
        rows={3}
      />

      {showMentions && (
        <MentionAutocomplete
          projectId={projectId}
          textareaRef={textareaRef}
          value={content}
          cursorPosition={cursorPosition}
          onSelect={handleMentionSelect}
          onClose={handleMentionClose}
        />
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          <kbd className="rounded border px-1 text-xs">@</kbd> to mention{' '}
          <span className="text-muted-foreground/70">|</span>{' '}
          <kbd className="rounded border px-1 text-xs">Cmd</kbd>+
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
