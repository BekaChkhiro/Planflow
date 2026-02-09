/**
 * @mentions parsing and resolution utilities
 *
 * Supports two mention formats:
 * 1. @email format: @john@example.com
 * 2. @username format: @john.doe or @JohnDoe (matches user's name)
 *
 * The parsing extracts mentions from text, and resolution
 * converts them to user IDs for notification purposes.
 */

import { eq, and, or, ilike, sql } from 'drizzle-orm'
import type { DbClient } from '../db/client'
import * as schema from '../db/schema'

/**
 * Regex patterns for @mention detection
 *
 * Email pattern: @followed by valid email
 * Name pattern: @followed by alphanumeric, dots, underscores, hyphens (2-50 chars)
 */
const MENTION_EMAIL_PATTERN = /@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g
const MENTION_NAME_PATTERN = /@([a-zA-Z][a-zA-Z0-9._-]{1,49})(?=\s|$|[.,!?;:])/g

export interface ParsedMention {
  /** The raw mention string (without @) */
  raw: string
  /** Whether this looks like an email */
  isEmail: boolean
  /** Start position in original text */
  startIndex: number
  /** End position in original text */
  endIndex: number
}

export interface ResolvedMention extends ParsedMention {
  /** Resolved user ID (null if not found) */
  userId: string | null
  /** User's email (if resolved) */
  userEmail: string | null
  /** User's name (if resolved) */
  userName: string | null
}

export interface MentionableUser {
  id: string
  email: string
  name: string | null
  role?: string
}

/**
 * Parse @mentions from text content
 *
 * Extracts all @mention patterns from the given text.
 * Supports both @email and @name formats.
 *
 * @param content - The text content to parse
 * @returns Array of parsed mentions with positions
 *
 * @example
 * parseMentions("Hey @john@example.com and @jane.doe, check this out!")
 * // Returns:
 * // [
 * //   { raw: "john@example.com", isEmail: true, startIndex: 4, endIndex: 20 },
 * //   { raw: "jane.doe", isEmail: false, startIndex: 25, endIndex: 34 }
 * // ]
 */
export function parseMentions(content: string): ParsedMention[] {
  const mentions: ParsedMention[] = []
  const seenRaw = new Set<string>()

  // Find email mentions first (more specific pattern)
  let match: RegExpExecArray | null
  const emailRegex = new RegExp(MENTION_EMAIL_PATTERN.source, 'g')

  while ((match = emailRegex.exec(content)) !== null) {
    const raw = match[1]
    if (!seenRaw.has(raw.toLowerCase())) {
      seenRaw.add(raw.toLowerCase())
      mentions.push({
        raw,
        isEmail: true,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      })
    }
  }

  // Find name mentions (excluding already matched emails)
  const nameRegex = new RegExp(MENTION_NAME_PATTERN.source, 'g')

  while ((match = nameRegex.exec(content)) !== null) {
    const raw = match[1]
    // Skip if this looks like it's part of an email we already captured
    if (!seenRaw.has(raw.toLowerCase()) && !raw.includes('@')) {
      // Check it's not overlapping with an email mention
      const isOverlapping = mentions.some(
        (m) => match!.index >= m.startIndex && match!.index < m.endIndex
      )
      if (!isOverlapping) {
        seenRaw.add(raw.toLowerCase())
        mentions.push({
          raw,
          isEmail: false,
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        })
      }
    }
  }

  // Sort by position in text
  return mentions.sort((a, b) => a.startIndex - b.startIndex)
}

/**
 * Resolve parsed mentions to user IDs
 *
 * Takes parsed mentions and looks up users in the database.
 * For email mentions, does exact match.
 * For name mentions, does case-insensitive partial match.
 *
 * @param db - Database client
 * @param mentions - Array of parsed mentions
 * @param projectId - Project ID (for scoping to project members in future)
 * @param organizationId - Organization ID (for scoping to org members)
 * @returns Array of resolved mentions with user info
 */
export async function resolveMentions(
  db: DbClient,
  mentions: ParsedMention[],
  projectId?: string,
  organizationId?: string
): Promise<ResolvedMention[]> {
  if (mentions.length === 0) {
    return []
  }

  const resolved: ResolvedMention[] = []

  for (const mention of mentions) {
    let user: { id: string; email: string; name: string | null } | null = null

    if (mention.isEmail) {
      // Exact email match
      const [found] = await db
        .select({
          id: schema.users.id,
          email: schema.users.email,
          name: schema.users.name,
        })
        .from(schema.users)
        .where(eq(schema.users.email, mention.raw.toLowerCase()))
        .limit(1)

      user = found || null
    } else {
      // Name match - try exact first, then partial
      // First try exact name match (case-insensitive)
      const [exactMatch] = await db
        .select({
          id: schema.users.id,
          email: schema.users.email,
          name: schema.users.name,
        })
        .from(schema.users)
        .where(ilike(schema.users.name, mention.raw))
        .limit(1)

      if (exactMatch) {
        user = exactMatch
      } else {
        // Try matching with dots/underscores replaced by spaces
        const nameVariant = mention.raw.replace(/[._-]/g, ' ')
        const [variantMatch] = await db
          .select({
            id: schema.users.id,
            email: schema.users.email,
            name: schema.users.name,
          })
          .from(schema.users)
          .where(ilike(schema.users.name, `%${nameVariant}%`))
          .limit(1)

        user = variantMatch || null
      }
    }

    // If organizationId provided, verify user is a member
    if (user && organizationId) {
      const [membership] = await db
        .select({ id: schema.organizationMembers.id })
        .from(schema.organizationMembers)
        .where(
          and(
            eq(schema.organizationMembers.organizationId, organizationId),
            eq(schema.organizationMembers.userId, user.id)
          )
        )
        .limit(1)

      if (!membership) {
        // User exists but is not in the organization
        user = null
      }
    }

    resolved.push({
      ...mention,
      userId: user?.id || null,
      userEmail: user?.email || null,
      userName: user?.name || null,
    })
  }

  return resolved
}

/**
 * Parse and resolve mentions in one step
 *
 * Convenience function that combines parsing and resolution.
 *
 * @param db - Database client
 * @param content - Text content to parse
 * @param projectId - Optional project ID for scoping
 * @param organizationId - Optional organization ID for scoping
 * @returns Array of resolved mentions
 */
export async function parseAndResolveMentions(
  db: DbClient,
  content: string,
  projectId?: string,
  organizationId?: string
): Promise<ResolvedMention[]> {
  const parsed = parseMentions(content)
  return resolveMentions(db, parsed, projectId, organizationId)
}

/**
 * Extract just the user IDs from resolved mentions
 *
 * Filters out unresolved mentions and returns unique user IDs.
 *
 * @param resolved - Array of resolved mentions
 * @returns Array of unique user IDs
 */
export function extractUserIds(resolved: ResolvedMention[]): string[] {
  const ids = resolved.filter((m) => m.userId !== null).map((m) => m.userId as string)

  return [...new Set(ids)]
}

/**
 * Search for mentionable users
 *
 * Search users by email or name for mention autocomplete.
 * Can be scoped to organization members.
 *
 * @param db - Database client
 * @param query - Search query (partial email or name)
 * @param organizationId - Optional org ID to scope results
 * @param excludeUserId - Optional user ID to exclude (e.g., current user)
 * @param limit - Maximum results to return (default 10)
 * @returns Array of mentionable users
 */
export async function searchMentionableUsers(
  db: DbClient,
  query: string,
  organizationId?: string,
  excludeUserId?: string,
  limit: number = 10
): Promise<MentionableUser[]> {
  const searchTerm = `%${query.toLowerCase()}%`

  if (organizationId) {
    // Search within organization members
    const results = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        role: schema.organizationMembers.role,
      })
      .from(schema.organizationMembers)
      .innerJoin(schema.users, eq(schema.organizationMembers.userId, schema.users.id))
      .where(
        and(
          eq(schema.organizationMembers.organizationId, organizationId),
          excludeUserId ? sql`${schema.users.id} != ${excludeUserId}` : undefined,
          or(ilike(schema.users.email, searchTerm), ilike(schema.users.name, searchTerm))
        )
      )
      .limit(limit)

    return results.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role,
    }))
  } else {
    // Global user search (should be restricted in production)
    const results = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
      })
      .from(schema.users)
      .where(
        and(
          excludeUserId ? sql`${schema.users.id} != ${excludeUserId}` : undefined,
          or(ilike(schema.users.email, searchTerm), ilike(schema.users.name, searchTerm))
        )
      )
      .limit(limit)

    return results
  }
}

/**
 * Format mention for display
 *
 * Creates a display string for a mention.
 *
 * @param user - User info
 * @returns Formatted mention string
 */
export function formatMention(user: { email: string; name: string | null }): string {
  if (user.name) {
    return `@${user.name}`
  }
  return `@${user.email}`
}

/**
 * Highlight mentions in text
 *
 * Wraps @mentions in text with a highlight wrapper.
 * Useful for rendering mentions in UI.
 *
 * @param content - Original text content
 * @param mentions - Resolved mentions
 * @param wrapper - Function to wrap mention text
 * @returns Text with highlighted mentions
 */
export function highlightMentions(
  content: string,
  mentions: ResolvedMention[],
  wrapper: (mention: ResolvedMention, text: string) => string
): string {
  if (mentions.length === 0) {
    return content
  }

  // Sort mentions by position (descending) to replace from end
  const sortedMentions = [...mentions].sort((a, b) => b.startIndex - a.startIndex)

  let result = content
  for (const mention of sortedMentions) {
    const originalText = content.substring(mention.startIndex, mention.endIndex)
    const wrapped = wrapper(mention, originalText)
    result = result.substring(0, mention.startIndex) + wrapped + result.substring(mention.endIndex)
  }

  return result
}
