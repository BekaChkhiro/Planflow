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
})

type SearchInput = z.infer<typeof SearchInputSchema>

/**
 * planflow_search tool implementation
 *
 * Search a project's indexed codebase using hybrid semantic + keyword search.
 */
export const searchTool: ToolDefinition<SearchInput> = {
  name: 'planflow_search',

  description: `Search a PlanFlow project's indexed codebase.

Performs hybrid search combining:
  • Vector similarity (semantic meaning via Voyage-code-3 embeddings)
  • BM25 keyword search (exact term matching)

Results are fused with Reciprocal Rank Fusion for optimal ranking.

Usage:
  planflow_search(projectId: "uuid", query: "authentication middleware")
  planflow_search(projectId: "uuid", query: "user login flow", limit: 5)
  planflow_search(projectId: "uuid", query: "database connection", language: "typescript")
  planflow_search(projectId: "uuid", query: "payment handler", kind: "function")

Parameters:
  - projectId (required): Project UUID
  - query (required): Natural language or keyword search query
  - limit (optional): Max results (default: 10, max: 50)
  - language (optional): Filter by language (typescript, python, go, rust, etc.)
  - kind (optional): Filter by code kind (function, class, method, interface, type)
  - source (optional): Filter source type — code | docs | all (default: all)

Prerequisites:
  • The project must be indexed first with planflow_index()
  • You must be logged in with planflow_login()`,

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
          `🔍 No results found for "${input.query}"\n\n` +
            '💡 Try:\n' +
            '  • Using different keywords or phrasing\n' +
            '  • Searching with broader terms\n' +
            '  • Ensuring the project is indexed (planflow_index)\n' +
            '  • Removing filters (language, kind) if applied'
        )
      }

      // Format results
      const lines: string[] = [
        `🔍 Search Results for "${input.query}"`,
        `${total} result${total === 1 ? '' : 's'} found\n`,
      ]

      for (let i = 0; i < response.results.length; i++) {
        const r = response.results[i]!
        const chunk = r.chunk
        const score = Math.round(r.score * 100)
        const sourceIcon = r.source === 'vector' ? '🧠' : r.source === 'keyword' ? '🔤' : '⚡'

        // Truncate content preview
        const preview = chunk.content.length > 300
          ? chunk.content.slice(0, 300) + '...'
          : chunk.content

        // Handle both CodeChunk and DocChunk
        const isCode = 'filePath' in chunk
        if (isCode) {
          lines.push(
            `${sourceIcon} #${i + 1}  ${chunk.filePath}:${chunk.startLine}-${chunk.endLine}  (score: ${score}%)`,
            `   kind: ${chunk.kind} | name: ${chunk.name} | lang: ${chunk.language}`,
            `   ${preview.replace(/\n/g, '\n   ')}`,
            ''
          )
        } else {
          lines.push(
            `${sourceIcon} #${i + 1}  📄 ${chunk.source} — ${chunk.title}  (score: ${score}%)`,
            `   ${preview.replace(/\n/g, '\n   ')}`,
            ''
          )
        }
      }

      lines.push(
        '💡 Tips:',
        '  • planflow_search(projectId: "...", query: "...", limit: 20) — more results',
        '  • planflow_search(projectId: "...", query: "...", language: "typescript") — filter by language',
        '  • planflow_context(projectId: "...", query: "...", layers: ["vector"]) — get context with vector results'
      )

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
