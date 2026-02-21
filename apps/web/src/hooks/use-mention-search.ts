'use client'

import { useQuery } from '@tanstack/react-query'
import { authApi } from '@/lib/auth-api'

// Types
export interface MentionableUser {
  id: string
  email: string
  name: string | null
  role?: string
}

interface MentionSearchResponse {
  success: boolean
  data: {
    users: MentionableUser[]
  }
}

// Query keys
export const mentionSearchQueryKey = (projectId: string, query: string) =>
  ['projects', projectId, 'mentions', 'search', query]

/**
 * Search for mentionable users in a project
 */
export function useMentionSearch(
  projectId: string,
  query: string,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: mentionSearchQueryKey(projectId, query),
    queryFn: async () => {
      if (!query || query.length < 1) return []

      const response = await authApi.get<MentionSearchResponse>(
        `/projects/${projectId}/mentions/search?q=${encodeURIComponent(query)}&limit=10`
      )
      return response.data.users
    },
    enabled: enabled && !!projectId && query.length >= 1,
    staleTime: 30000, // 30 seconds
    gcTime: 60000, // 1 minute (formerly cacheTime)
  })
}

/**
 * Extract mention info from text at cursor position
 */
export function getMentionAtCursor(
  text: string,
  cursorPosition: number
): { query: string; startIndex: number; endIndex: number } | null {
  // Find the start of the potential mention (look backwards for @)
  let startIndex = cursorPosition - 1

  while (startIndex >= 0) {
    const char = text[startIndex]

    // Found the @ symbol
    if (char === '@') {
      // Make sure @ is at start of text or preceded by whitespace
      if (startIndex === 0 || /\s/.test(text[startIndex - 1] || '')) {
        const query = text.slice(startIndex + 1, cursorPosition)
        // Only valid if query doesn't contain whitespace (except we allow . for email)
        if (!/\s/.test(query)) {
          return {
            query,
            startIndex,
            endIndex: cursorPosition,
          }
        }
      }
      return null
    }

    // Stop if we hit whitespace before finding @
    if (/\s/.test(char || '')) {
      return null
    }

    startIndex--
  }

  return null
}

/**
 * Insert mention at the given position in text
 */
export function insertMention(
  text: string,
  startIndex: number,
  endIndex: number,
  user: MentionableUser
): { newText: string; newCursorPosition: number; mentionId: string } {
  // Use email format for mention
  const mentionText = `@${user.email} `
  const before = text.slice(0, startIndex)
  const after = text.slice(endIndex)
  const newText = before + mentionText + after

  return {
    newText,
    newCursorPosition: startIndex + mentionText.length,
    mentionId: user.id,
  }
}

/**
 * Parse all mentions from text and return user IDs
 */
export function parseMentionIds(
  text: string,
  users: MentionableUser[]
): string[] {
  const mentionPattern = /@([^\s]+)/g
  const mentionIds: string[] = []
  let match

  while ((match = mentionPattern.exec(text)) !== null) {
    const mentionText = match[1]
    // Find user by email (most reliable)
    const user = users.find(
      (u) => u.email.toLowerCase() === mentionText?.toLowerCase()
    )
    if (user && !mentionIds.includes(user.id)) {
      mentionIds.push(user.id)
    }
  }

  return mentionIds
}

/**
 * Get display name for a user
 */
export function getUserDisplayName(user: MentionableUser): string {
  return user.name || user.email.split('@')[0] || user.email
}

/**
 * Get initials for a user
 */
export function getUserInitials(user: MentionableUser): string {
  if (user.name) {
    const parts = user.name.trim().split(' ').filter(Boolean)
    if (parts.length >= 2) {
      const first = parts[0]?.[0] || ''
      const last = parts[parts.length - 1]?.[0] || ''
      return `${first}${last}`.toUpperCase()
    }
    return user.name.slice(0, 2).toUpperCase()
  }
  return user.email.slice(0, 2).toUpperCase()
}
