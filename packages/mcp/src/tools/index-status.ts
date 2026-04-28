/**
 * PlanFlow MCP Server — Index Status Tool
 *
 * Reports the current state of a project's vector index so an LLM can decide
 * whether the index is fresh enough to trust, whether it covers the languages
 * it's about to query, and whether re-indexing is warranted.
 *
 * Pairs with planflow_search / planflow_context — call this first when you
 * are unsure if the project has been indexed.
 */

import { z } from 'zod'
import { getApiClient } from '../api-client.js'
import { isAuthenticated } from '../config.js'
import { AuthError, ApiError } from '../errors.js'
import { logger } from '../logger.js'
import {
  type ToolDefinition,
  createSuccessResult,
  createErrorResult,
} from './types.js'
import { getCurrentProjectId } from './use.js'

const IndexStatusInputSchema = z.object({
  projectId: z
    .string()
    .uuid('Project ID must be a valid UUID')
    .optional()
    .describe('Project ID. Uses current project from planflow_use() if omitted.'),
})

type IndexStatusInput = z.infer<typeof IndexStatusInputSchema>

// Human-friendly age bucket from a millisecond duration.
function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

// Map an age in days to a coarse staleness bucket. Thresholds are
// deliberately conservative — code moves fast, so anything over a week is
// likely stale enough that an LLM should warn the user.
function staleness(ageMs: number | null): {
  bucket: 'fresh' | 'recent' | 'moderate' | 'stale'
  hint: string
} {
  if (ageMs === null) {
    return {
      bucket: 'stale',
      hint: 'No timestamp available. Treat as stale and consider re-indexing.',
    }
  }
  const days = ageMs / 86_400_000
  if (days < 1) return { bucket: 'fresh', hint: 'Indexed within the last day.' }
  if (days < 3) return { bucket: 'recent', hint: 'A few days old — usually fine.' }
  if (days < 7) {
    return {
      bucket: 'moderate',
      hint: 'About a week old — re-index if the codebase has changed.',
    }
  }
  return {
    bucket: 'stale',
    hint: 'Over a week old. Re-index before relying on results.',
  }
}

function bucketEmoji(bucket: 'fresh' | 'recent' | 'moderate' | 'stale'): string {
  switch (bucket) {
    case 'fresh':
      return '🟢'
    case 'recent':
      return '🟢'
    case 'moderate':
      return '🟡'
    case 'stale':
      return '🔴'
  }
}

/**
 * planflow_index_status tool implementation
 */
export const indexStatusTool: ToolDefinition<IndexStatusInput> = {
  name: 'planflow_index_status',

  description: `Report the current state of a PlanFlow project's vector index.

Returns:
  • Whether the project has been indexed at all
  • Total chunks and unique files indexed
  • Per-language and per-source (code | docs) breakdown
  • When the project was last indexed (and a staleness bucket)

Use this BEFORE planflow_search() or planflow_context() when you are not
sure the project has been indexed — it lets you avoid empty / misleading
search results, and lets you tell the user up front whether to re-index.

Usage:
  planflow_index_status()
  planflow_index_status(projectId: "uuid")

Prerequisites:
  • Logged in via planflow_login()`,

  inputSchema: IndexStatusInputSchema,

  async execute(input: IndexStatusInput): Promise<ReturnType<typeof createSuccessResult>> {
    const projectId = input.projectId || getCurrentProjectId()

    if (!projectId) {
      return createErrorResult(
        '❌ No project ID provided and no current project set.\n\n' +
          'Either:\n' +
          '  1. Pass projectId: planflow_index_status(projectId: "uuid")\n' +
          '  2. Set current project: planflow_use(projectId: "uuid")'
      )
    }

    if (!isAuthenticated()) {
      return createErrorResult(
        '❌ Not logged in.\n\n' +
          'Please authenticate first using:\n' +
          '  planflow_login(token: "your-api-token")'
      )
    }

    logger.info('Index status tool called', { projectId })

    try {
      const client = getApiClient()
      const status = await client.getIndexStatus(projectId)

      if (!status.indexed) {
        return createSuccessResult(
          `📊 Index Status\n\n` +
            `🔴 Indexed: no\n\n` +
            `This project has no indexed content yet.\n\n` +
            `Index a directory:\n` +
            `  planflow_index(directory: "/path/to/project")\n\n` +
            `Or pass files explicitly:\n` +
            `  planflow_index(files: [{ path, content }, ...])`
        )
      }

      // Compute staleness from lastIndexedAt
      const ageMs = status.lastIndexedAt
        ? Date.now() - new Date(status.lastIndexedAt).getTime()
        : null
      const stale = staleness(ageMs)
      const ageStr = ageMs !== null ? formatAge(ageMs) : 'unknown'
      const lastIndexedStr = status.lastIndexedAt
        ? `${ageStr} (${status.lastIndexedAt})`
        : 'unknown'

      // Sort language breakdown by count (descending)
      const languageEntries = Object.entries(status.byLanguage).sort(
        (a, b) => b[1] - a[1]
      )
      const sourceEntries = Object.entries(status.bySource).sort(
        (a, b) => b[1] - a[1]
      )

      const lines: string[] = [
        `📊 Index Status`,
        ``,
        `🟢 Indexed:        yes`,
        `📦 Chunks:         ${status.chunks.toLocaleString()}`,
        `📁 Files:          ${status.indexedFiles.toLocaleString()}`,
        `🕐 Last indexed:   ${lastIndexedStr}`,
        `${bucketEmoji(stale.bucket)} Staleness:      ${stale.bucket} — ${stale.hint}`,
        ``,
      ]

      if (sourceEntries.length > 0) {
        lines.push(`Sources:`)
        for (const [source, count] of sourceEntries) {
          lines.push(`  ${source.padEnd(12)} ${count.toLocaleString()} chunks`)
        }
        lines.push(``)
      }

      if (languageEntries.length > 0) {
        lines.push(`Languages:`)
        for (const [lang, count] of languageEntries) {
          lines.push(`  ${lang.padEnd(12)} ${count.toLocaleString()} chunks`)
        }
        lines.push(``)
      }

      lines.push(`Next steps:`)
      if (stale.bucket === 'stale' || stale.bucket === 'moderate') {
        lines.push(`  • Re-index (recommended): planflow_index(directory: ".")`)
      }
      lines.push(`  • Search:  planflow_search(query: "...")`)
      lines.push(`  • Context: planflow_context(query: "...")`)

      return createSuccessResult(lines.join('\n'))
    } catch (error) {
      logger.error('Index status fetch failed', { error: String(error) })

      if (error instanceof AuthError) {
        return createErrorResult(
          '❌ Authentication error. Please log out and log in again.\n' +
            '  planflow_logout()\n' +
            '  planflow_login(token: "your-new-token")'
        )
      }

      if (error instanceof ApiError) {
        if (error.statusCode === 404) {
          return createErrorResult(
            `❌ Project not found: ${projectId}\n\n` +
              'Use planflow_projects() to list your available projects.'
          )
        }
        return createErrorResult(`❌ API error: ${error.message}`)
      }

      const message = error instanceof Error ? error.message : String(error)
      return createErrorResult(`❌ Failed to get index status: ${message}`)
    }
  },
}
