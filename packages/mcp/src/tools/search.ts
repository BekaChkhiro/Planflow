/**
 * PlanFlow MCP Server - Search Tool
 *
 * Hybrid semantic search across a project's indexed codebase.
 * Combines vector similarity (Voyage-code-3 embeddings) with BM25 keyword search.
 *
 * T21.3 — planflow_search
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

const SearchInputSchema = z.object({
  projectId: z
    .string()
    .uuid('Project ID must be a valid UUID')
    .optional()
    .describe('Project ID to search within. Uses current project from planflow_use() if omitted.'),
  query: z
    .string()
    .min(1, 'Query cannot be empty')
    .describe('Search query — natural language or keywords'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe('Maximum results to return (default: 10, max: 50)'),
  language: z
    .string()
    .optional()
    .describe('Optional: filter by programming language (e.g., "typescript", "python")'),
  kind: z
    .string()
    .optional()
    .describe('Optional: filter by code kind (e.g., "function", "class", "interface")'),
  source: z
    .enum(['code', 'docs', 'all'])
    .default('all')
    .describe('Source filter: code, docs, or all (default: all)'),
  previewOnly: z
    .boolean()
    .default(false)
    .describe(
      'When true, return only short content previews (300 chars). When false (default), return full chunk content — recommended for LLM consumers so they can reason over real code without re-fetching.'
    ),
})

type SearchInput = z.infer<typeof SearchInputSchema>

/**
 * planflow_search tool implementation
 *
 * Search a project's indexed codebase using hybrid semantic + keyword search.
 */
export const searchTool: ToolDefinition<SearchInput> = {
  name: 'planflow_search',

  description: `Hybrid semantic + keyword search across a PlanFlow project's indexed codebase and documentation.

Combines:
  • Vector similarity (Voyage-code-3 embeddings — semantic meaning)
  • BM25 keyword search (exact term matching)
Fused with Reciprocal Rank Fusion (RRF) into a single ranked list.

Each result returns the full chunk content (a complete function/class/section)
unless previewOnly:true is set. The chunk is the unit you should reason over —
do not assume it is partial.

Output is structured (key:value blocks per result) so you can extract:
  file, lines, kind, name, language, match (vector|keyword|hybrid), score, chunkId

Use when:
  • Looking up where/how something is implemented
  • Discovering the right file before editing
  • Finding examples of a pattern in the codebase

Do NOT use when:
  • You just want to know if the project is indexed → planflow_index_status()
  • You want a single file's full surrounding context → planflow_recall()  (coming)
  • You need recent changes / activity → planflow_changes() / planflow_activity()

Parameters:
  - projectId (optional): Project UUID. Uses current project from planflow_use().
  - query (required): Natural language or keyword query
  - limit (optional): Max results (default 10, max 50)
  - language (optional): Filter by programming language
  - kind (optional): Filter by code kind (function, class, method, interface, type)
  - source (optional): code | docs | all (default all)
  - previewOnly (optional): true → 300-char previews. false (default) → full chunks.

Prerequisites:
  • Logged in via planflow_login()
  • Project indexed via planflow_index()`,

  inputSchema: SearchInputSchema,

  async execute(input: SearchInput): Promise<ReturnType<typeof createSuccessResult>> {
    const projectId = input.projectId || getCurrentProjectId()

    if (!projectId) {
      return createErrorResult(
        '❌ No project ID provided and no current project set.\n\n' +
          'Either:\n' +
          '  1. Pass projectId: planflow_search(projectId: "uuid", query: "...")\n' +
          '  2. Set current project: planflow_use(projectId: "uuid")'
      )
    }

    logger.info('Search tool called', { projectId, query: input.query })

    if (!isAuthenticated()) {
      return createErrorResult(
        '❌ Not logged in.\n\n' +
          'Please authenticate first using:\n' +
          '  planflow_login(token: "your-api-token")\n\n' +
          'Get your token at: https://planflow.tools/settings/api-tokens'
      )
    }

    try {
      const client = getApiClient()

      logger.info('Searching project', {
        projectId: input.projectId,
        query: input.query,
        limit: input.limit,
      })

      const response = await client.searchProject(projectId, input.query, {
        limit: input.limit,
        language: input.language,
        kind: input.kind,
        source: input.source,
      })

      const total = response.total ?? response.results.length
      logger.info('Search completed', { total })

      if (total === 0) {
        return createSuccessResult(
          `No results for "${input.query}"\n\n` +
            'Try:\n' +
            '  • Different keywords or phrasing\n' +
            '  • Broader terms\n' +
            '  • Check index status: planflow_index_status()\n' +
            '  • Remove filters (language, kind) if applied'
        )
      }

      const lines: string[] = [
        `Search: "${input.query}"`,
        `${total} result${total === 1 ? '' : 's'}`,
        '',
      ]

      for (let i = 0; i < response.results.length; i++) {
        const r = response.results[i]!
        const chunk = r.chunk
        const isCode = 'filePath' in chunk
        const rank = i + 1

        // Numeric score is more honest than a percentage — RRF / cosine
        // distance scores aren't naturally a probability.
        const scoreFmt = r.score.toFixed(3)

        const content = input.previewOnly && chunk.content.length > 300
          ? chunk.content.slice(0, 300) + '\n... [truncated, set previewOnly:false for full chunk]'
          : chunk.content

        lines.push(`━━━ #${rank} ━━━━━━━━━━━━━━━━━━━━━━━━━━`)

        if (isCode) {
          lines.push(`file:      ${chunk.filePath}`)
          lines.push(`lines:     ${chunk.startLine}-${chunk.endLine}`)
          lines.push(`kind:      ${chunk.kind}`)
          lines.push(`name:      ${chunk.name}`)
          lines.push(`language:  ${chunk.language}`)
        } else {
          lines.push(`source:    ${chunk.source}`)
          lines.push(`title:     ${chunk.title}`)
        }

        lines.push(`match:     ${r.source}`)
        lines.push(`score:     ${scoreFmt}`)
        lines.push(`chunkId:   ${chunk.id}`)
        lines.push('')
        lines.push('content:')
        lines.push(content)
        lines.push('')
      }

      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      lines.push('Next steps:')
      lines.push('  • Refine: add language/kind filters or rephrase query')
      lines.push('  • Wider: increase limit (max 50)')
      lines.push('  • Compact: previewOnly:true for shorter previews')

      return createSuccessResult(lines.join('\n'))
    } catch (error) {
      logger.error('Search failed', { error: String(error) })

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
        if (error.statusCode === 503) {
          return createErrorResult(
            '❌ Embedding service is not configured.\n\n' +
              'The RAG search backend is temporarily unavailable. Please try again later.'
          )
        }
        return createErrorResult(`❌ API error: ${error.message}`)
      }

      const message = error instanceof Error ? error.message : String(error)
      return createErrorResult(`❌ Search failed: ${message}`)
    }
  },
}
