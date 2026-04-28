/**
 * PlanFlow MCP Server — planflow_chunk
 *
 * Fetch the full content of a single indexed chunk by its ID.
 *
 * Search responses include a `chunkId` for every result, and the auto-cap
 * fallback in planflow_search tells the LLM to "request the chunk by
 * chunkId for full content." This tool is that follow-through — a
 * dedicated, single-purpose call so the LLM doesn't have to spin up the
 * heavier planflow_recall flow just to read one chunk's body.
 *
 * The chunkId format produced by the indexer is `<filePath>:<startLine>`,
 * so we extract the file path, fetch every chunk for that file, and
 * return the one whose ID matches.
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

const ChunkInputSchema = z.object({
  projectId: z
    .string()
    .uuid('Project ID must be a valid UUID')
    .optional()
    .describe('Project ID. Uses current project from planflow_use() if omitted.'),
  chunkId: z
    .string()
    .min(1)
    .describe(
      'The chunkId from a planflow_search result, e.g. "src/foo.ts:14". Format is `<filePath>:<startLine>`.'
    ),
})

type ChunkInput = z.infer<typeof ChunkInputSchema>

function fileFromChunkId(chunkId: string): { filePath: string; startLine: number | null } {
  const idx = chunkId.lastIndexOf(':')
  if (idx === -1) return { filePath: chunkId, startLine: null }
  const filePath = chunkId.slice(0, idx)
  const lineStr = chunkId.slice(idx + 1)
  const line = parseInt(lineStr, 10)
  return { filePath, startLine: Number.isFinite(line) ? line : null }
}

export const chunkTool: ToolDefinition<ChunkInput> = {
  name: 'planflow_chunk',

  description: `Fetch the full content of a single indexed chunk by ID.

Use this when planflow_search returned a result you want to read in full
but the response was auto-capped to previews (or you set previewOnly:true).
Pass the chunkId from the search result.

Output is a single structured block:
  file, lines, kind, name, language, indexedAt, then the full content body.

Use this when:
  ✅ You have a chunkId from a previous planflow_search call
  ✅ You want full content for one specific chunk without re-running search
  ✅ Search auto-capped responses and you need the body of one hit

Do NOT use this when:
  ❌ You want every chunk in a file → planflow_recall(filePath: "...")
  ❌ You want broader context (related knowledge, activity) → planflow_recall
  ❌ You want to read the WHOLE file source — use Read directly

Prerequisites:
  • Logged in via planflow_login()
  • Project indexed via planflow_index() and the chunkId came from there`,

  inputSchema: ChunkInputSchema,

  async execute(input: ChunkInput): Promise<ReturnType<typeof createSuccessResult>> {
    const projectId = input.projectId || getCurrentProjectId()

    if (!projectId) {
      return createErrorResult(
        '❌ No project ID provided and no current project set.\n\n' +
          'Either:\n' +
          '  1. Pass projectId: planflow_chunk(projectId: "uuid", chunkId: "...")\n' +
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

    const { filePath, startLine } = fileFromChunkId(input.chunkId)
    if (!filePath) {
      return createErrorResult(
        `❌ Could not parse chunkId: ${input.chunkId}\n\n` +
          'Expected format: "<filePath>:<startLine>" (e.g. "src/foo.ts:14")'
      )
    }

    logger.info('Chunk tool called', { projectId, chunkId: input.chunkId, filePath, startLine })

    try {
      const client = getApiClient()
      const result = await client.getFileChunks(projectId, filePath)

      if (result.chunks.length === 0) {
        return createErrorResult(
          `❌ File not found in index: ${filePath}\n\n` +
            'The file might not be indexed, or its chunkId may be stale (e.g. after a re-index).\n' +
            'Re-run planflow_search to get fresh chunkIds.'
        )
      }

      // Try exact ID match first; fall back to startLine match in case the
      // chunkId formatting changes in the future. Both should converge for
      // current outputs.
      const chunk =
        result.chunks.find((c) => c.id === input.chunkId) ??
        (startLine !== null ? result.chunks.find((c) => c.startLine === startLine) : undefined)

      if (!chunk) {
        const available = result.chunks
          .slice(0, 10)
          .map((c) => `  ${c.id} (${c.kind} ${c.name}, lines ${c.startLine}-${c.endLine})`)
          .join('\n')
        return createErrorResult(
          `❌ Chunk not found: ${input.chunkId}\n\n` +
            `Available chunks in ${filePath} (${result.chunks.length} total):\n${available}` +
            (result.chunks.length > 10 ? `\n  ... and ${result.chunks.length - 10} more` : '')
        )
      }

      const lines: string[] = [
        `Chunk: ${chunk.id}`,
        '',
        `file:       ${chunk.filePath}`,
        `lines:      ${chunk.startLine}-${chunk.endLine}`,
        `kind:       ${chunk.kind}`,
        `name:       ${chunk.name}`,
        `language:   ${chunk.language}`,
        `source:     ${chunk.source}`,
      ]
      if (chunk.indexedAt) {
        lines.push(`indexedAt:  ${chunk.indexedAt}`)
      }
      lines.push('')
      lines.push('content:')
      lines.push(chunk.content)

      return createSuccessResult(lines.join('\n'))
    } catch (error) {
      logger.error('Chunk fetch failed', { error: String(error) })

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
      return createErrorResult(`❌ Failed to fetch chunk: ${message}`)
    }
  },
}
