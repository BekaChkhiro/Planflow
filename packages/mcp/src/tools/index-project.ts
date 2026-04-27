/**
 * PlanFlow MCP Server — Index Tool
 *
 * Index file contents into the project's vector database (LanceDB)
 * for semantic search. The client sends file paths and contents;
 * the API chunks, embeds (Voyage-code-3), and stores them.
 *
 * T21.3 — planflow_index
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

const IndexInputSchema = z.object({
  projectId: z
    .string()
    .uuid('Project ID must be a valid UUID')
    .describe('Project ID to index files for'),
  files: z
    .array(
      z.object({
        path: z.string().min(1).describe('Relative file path (e.g., "src/index.ts")'),
        content: z.string().describe('File content as string'),
        language: z.string().optional().describe('Programming language (optional, auto-detected from extension)'),
      })
    )
    .min(1)
    .max(500)
    .describe('Array of files to index. Max 500 files per call.'),
})

type IndexInput = z.infer<typeof IndexInputSchema>

/**
 * planflow_index tool implementation
 */
export const indexTool: ToolDefinition<IndexInput> = {
  name: 'planflow_index',

  description: `Index file contents into a PlanFlow project's vector database.

The files are chunked (Tree-sitter AST), embedded (Voyage-code-3),
and stored in LanceDB for fast semantic + keyword search.

Usage:
  planflow_index(projectId: "uuid", files: [
    { path: "src/index.ts", content: "..." },
    { path: "src/utils.ts", content: "..." }
  ])

Parameters:
  - projectId (required): Project UUID
  - files (required): Array of file objects
      • path: relative file path (e.g., "src/index.ts")
      • content: full file content as string
      • language (optional): auto-detected from extension if omitted

Limits:
  • Max 500 files per call
  • Max 1 MB content per file
  • Use multiple calls for large codebases

Prerequisites:
  • Logged in with planflow_login()`,

  inputSchema: IndexInputSchema,

  async execute(input: IndexInput): Promise<ReturnType<typeof createSuccessResult>> {
    logger.info('Index tool called', {
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

      logger.info('Indexing files', {
        projectId: input.projectId,
        fileCount: input.files.length,
      })

      const result = await client.indexProject(input.projectId, input.files)

      logger.info('Indexing completed', {
        filesIndexed: result.filesIndexed,
        chunksIndexed: result.chunksIndexed,
        durationMs: result.durationMs,
      })

      const durationSec = (result.durationMs / 1000).toFixed(1)

      return createSuccessResult(
        `✅ Indexing complete\n\n` +
          `📁 Files indexed: ${result.filesIndexed}\n` +
          `🧩 Chunks created: ${result.chunksIndexed}\n` +
          `⏱️  Duration: ${durationSec}s\n\n` +
          `💡 Next steps:\n` +
          `  • planflow_search(projectId: "${input.projectId}", query: "your query")\n` +
          `  • planflow_context(projectId: "${input.projectId}", query: "...")`
      )
    } catch (error) {
      logger.error('Indexing failed', { error: String(error) })

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
            '❌ Embedding service is not configured.\n\n' +
              'The RAG backend is temporarily unavailable. Please try again later.'
          )
        }
        if (error.statusCode === 400) {
          return createErrorResult(`❌ Invalid request: ${error.message}`)
        }
        return createErrorResult(`❌ API error: ${error.message}`)
      }

      const message = error instanceof Error ? error.message : String(error)
      return createErrorResult(`❌ Indexing failed: ${message}`)
    }
  },
}
