/**
 * PlanFlow MCP Server — Index Docs Tool
 *
 * Index documentation files (markdown, text) into the project's
 * vector database for semantic search.
 *
 * T21.3 — planflow_index_docs
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

const IndexDocsInputSchema = z.object({
  projectId: z
    .string()
    .uuid('Project ID must be a valid UUID')
    .describe('Project ID to index docs for'),
  files: z
    .array(
      z.object({
        path: z.string().min(1).describe('Relative file path (e.g., "README.md", "docs/api.md")'),
        content: z.string().describe('File content as string'),
      })
    )
    .min(1)
    .max(200)
    .describe('Array of documentation files to index. Max 200 files per call.'),
})

type IndexDocsInput = z.infer<typeof IndexDocsInputSchema>

/**
 * planflow_index_docs tool implementation
 */
export const indexDocsTool: ToolDefinition<IndexDocsInput> = {
  name: 'planflow_index_docs',

  description: `Index documentation files into a PlanFlow project's vector database.

Use this for markdown files, READMEs, API docs, architecture decision records (ADRs),
and any other text-based documentation you want searchable.

Usage:
  planflow_index_docs(projectId: "uuid", files: [
    { path: "README.md", content: "# Project..." },
    { path: "docs/architecture.md", content: "..." }
  ])

Parameters:
  - projectId (required): Project UUID
  - files (required): Array of doc file objects
      • path: relative file path
      • content: full file content

Limits:
  • Max 200 files per call
  • Max 1 MB content per file

Prerequisites:
  • Logged in with planflow_login()`,

  inputSchema: IndexDocsInputSchema,

  async execute(input: IndexDocsInput): Promise<ReturnType<typeof createSuccessResult>> {
    logger.info('Index docs tool called', {
      projectId: input.projectId,
      fileCount: input.files.length,
    })

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

      // Mark all files as docs by using .md/.txt extensions
      const filesWithLang = input.files.map((f) => ({
        path: f.path,
        content: f.content,
        language: f.path.endsWith('.md') || f.path.endsWith('.mdx')
          ? 'markdown'
          : 'text',
      }))

      const result = await client.indexProject(input.projectId, filesWithLang)

      logger.info('Docs indexing completed', {
        filesIndexed: result.filesIndexed,
        chunksIndexed: result.chunksIndexed,
      })

      return createSuccessResult(
        `✅ Documentation indexed\n\n` +
          `📄 Files indexed: ${result.filesIndexed}\n` +
          `🧩 Chunks created: ${result.chunksIndexed}\n\n` +
          `💡 Search docs with:\n` +
          `  planflow_search(projectId: "${input.projectId}", query: "...", source: "docs")`
      )
    } catch (error) {
      logger.error('Docs indexing failed', { error: String(error) })

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
            `❌ Project not found: ${input.projectId}\n\n` +
              'Use planflow_projects() to list your available projects.'
          )
        }
        if (error.statusCode === 503) {
          return createErrorResult(
            '❌ Embedding service is not configured. Please try again later.'
          )
        }
        return createErrorResult(`❌ API error: ${error.message}`)
      }

      const message = error instanceof Error ? error.message : String(error)
      return createErrorResult(`❌ Docs indexing failed: ${message}`)
    }
  },
}
