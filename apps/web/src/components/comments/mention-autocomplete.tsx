'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  useMentionSearch,
  getMentionAtCursor,
  insertMention,
  getUserDisplayName,
  getUserInitials,
  type MentionableUser,
} from '@/hooks/use-mention-search'

interface MentionAutocompleteProps {
  projectId: string
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  value: string
  cursorPosition: number
  onSelect: (result: {
    newText: string
    newCursorPosition: number
    mentionId: string
  }) => void
  onClose: () => void
}

export function MentionAutocomplete({
  projectId,
  textareaRef,
  value,
  cursorPosition,
  onSelect,
  onClose,
}: MentionAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  // Get mention info at cursor
  const mentionInfo = getMentionAtCursor(value, cursorPosition)
  const query = mentionInfo?.query || ''

  // Search for users
  const { data: users = [], isLoading } = useMentionSearch(
    projectId,
    query,
    !!mentionInfo
  )

  // Calculate dropdown position relative to textarea
  useEffect(() => {
    if (!textareaRef.current || !mentionInfo) return

    const textarea = textareaRef.current
    const textBeforeCursor = value.slice(0, mentionInfo.startIndex)

    // Create a hidden div to measure text position
    const mirror = document.createElement('div')
    const computed = window.getComputedStyle(textarea)

    // Copy textarea styles to mirror
    const stylesToCopy = [
      'fontFamily',
      'fontSize',
      'fontWeight',
      'letterSpacing',
      'lineHeight',
      'padding',
      'border',
      'boxSizing',
      'whiteSpace',
      'wordWrap',
      'wordBreak',
    ] as const

    stylesToCopy.forEach((style) => {
      mirror.style[style] = computed[style]
    })

    mirror.style.position = 'absolute'
    mirror.style.visibility = 'hidden'
    mirror.style.width = `${textarea.offsetWidth}px`
    mirror.style.whiteSpace = 'pre-wrap'
    mirror.style.wordWrap = 'break-word'

    // Create span for text before @ and a marker span
    const textNode = document.createTextNode(textBeforeCursor)
    const markerSpan = document.createElement('span')
    markerSpan.textContent = '@'

    mirror.appendChild(textNode)
    mirror.appendChild(markerSpan)
    document.body.appendChild(mirror)

    // Get marker position
    const markerRect = markerSpan.getBoundingClientRect()
    const textareaRect = textarea.getBoundingClientRect()

    // Calculate position relative to textarea
    const scrollTop = textarea.scrollTop
    const relativeTop =
      markerRect.top - textareaRect.top + textarea.offsetTop - scrollTop
    const relativeLeft = markerRect.left - textareaRect.left + textarea.offsetLeft

    // Position below the @ character
    setPosition({
      top: relativeTop + parseInt(computed.lineHeight) + 4,
      left: Math.max(0, relativeLeft),
    })

    document.body.removeChild(mirror)
  }, [textareaRef, value, mentionInfo])

  // Reset selected index when users change
  useEffect(() => {
    setSelectedIndex(0)
  }, [users])

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!mentionInfo || users.length === 0) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          e.stopPropagation()
          setSelectedIndex((prev) => (prev + 1) % users.length)
          break
        case 'ArrowUp':
          e.preventDefault()
          e.stopPropagation()
          setSelectedIndex((prev) => (prev - 1 + users.length) % users.length)
          break
        case 'Enter':
        case 'Tab':
          e.preventDefault()
          e.stopPropagation()
          const selectedUser = users[selectedIndex]
          if (selectedUser && mentionInfo) {
            handleSelectUser(selectedUser)
          }
          break
        case 'Escape':
          e.preventDefault()
          e.stopPropagation()
          onClose()
          break
      }
    },
    [mentionInfo, users, selectedIndex, onClose]
  )

  // Attach keyboard listener to textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea || !mentionInfo || users.length === 0) return

    textarea.addEventListener('keydown', handleKeyDown, { capture: true })

    return () => {
      textarea.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [textareaRef, mentionInfo, users, handleKeyDown])

  // Handle clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        textareaRef.current !== e.target
      ) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose, textareaRef])

  const handleSelectUser = (user: MentionableUser) => {
    if (!mentionInfo) return

    const result = insertMention(
      value,
      mentionInfo.startIndex,
      mentionInfo.endIndex,
      user
    )
    onSelect(result)
  }

  // Don't render if no mention is being typed
  if (!mentionInfo) return null

  return (
    <div
      ref={containerRef}
      className="absolute z-50 w-64 rounded-md border bg-popover text-popover-foreground shadow-md"
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      <Command className="border-0">
        <CommandList>
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                Searching...
              </span>
            </div>
          ) : users.length === 0 ? (
            <CommandEmpty>
              {query.length === 0
                ? 'Type to search team members'
                : 'No team members found'}
            </CommandEmpty>
          ) : (
            <CommandGroup heading="Team Members">
              {users.map((user, index) => (
                <CommandItem
                  key={user.id}
                  value={user.email}
                  onSelect={() => handleSelectUser(user)}
                  className={
                    index === selectedIndex ? 'bg-accent' : ''
                  }
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs">
                      {getUserInitials(user)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {getUserDisplayName(user)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
      {users.length > 0 && (
        <div className="border-t px-2 py-1.5">
          <p className="text-xs text-muted-foreground">
            <kbd className="rounded border px-1 text-xs">Tab</kbd> or{' '}
            <kbd className="rounded border px-1 text-xs">Enter</kbd> to select
          </p>
        </div>
      )}
    </div>
  )
}
