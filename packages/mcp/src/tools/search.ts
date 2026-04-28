/**
 * PlanFlow MCP Server — planflow_search
 *
 * Hybrid semantic + keyword search across a project's indexed code and docs.
 *
 * Returns full chunk content by default so the LLM can reason without
 * re-fetching, but auto-caps the response if the total would blow past a
 * sensible byte budget — large repos otherwise produce 100KB+ blobs that
 * either spill out of context or have to be saved to disk.
 *
 * Also filters out indexed-but-uninteresting paths (e.g. Prisma generated
 * client) so they don't dominate the top-N. Defaults are tuned for a
 * typical TypeScript / Node monorepo.
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
import { matchesAny } from './_glob.js'
import { coerceNumber, coerceBoolean } from './_coerce.js'

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * Auto-cap the total content payload at this many bytes. When exceeded,
 * the tool falls back to per-chunk previews and tells the LLM why. Tuned
 * to fit comfortably in a single message without dominating the context
 * window.
 */
const DEFAULT_MAX_RESPONSE_BYTES = 30_000
/** Per-chunk slice when previewOnly is on (or auto-cap kicks in). */
const PREVIEW_CHARS = 600

/**
 * Multiplier applied to code-chunk scores after the backend returns them.
 *
 * Why this exists: BM25 over markdown chunks tends to dominate the top
 * because docs paragraphs concentrate keyword terms in dense, short
 * chunks. Code chunks (functions, classes) contain the answer the user
 * usually wants but score lower in pure keyword space. A modest
 * multiplier rebalances this without hiding genuinely-useful docs hits.
 *
 * Tuning: 1.15 was picked empirically — large enough to swap a code
 * chunk in front of a docs chunk when their raw scores are within ~13%,
 * small enough to leave a clearly-better docs chunk on top.
 */
const CODE_BOOST = 1.15

/**
 * Paths that are indexed but rarely useful in search results — auto-
 * generated code, build outputs that slipped through, etc. Caller can
 * override by passing their own `excludePath` array.
 */
const DEFAULT_EXCLUDE_PATHS = [
  '**/generated/**',
  '**/.prisma/**',
  '**/*.generated.ts',
  '**/*.generated.tsx',
  '**/*.gen.ts',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
]

// ---------------------------------------------------------------------------
// Coercible string-or-array helper (mirrors index tool)
// ---------------------------------------------------------------------------

function coercibleStringArray(defaultValue: string[]) {
  return z.preprocess(
    (val) => {
      if (val === undefined || val === null) return defaultValue
      if (typeof val === 'string') return [val]
      if (Array.isArray(val)) return val
      return defaultValue
    },
    z.array(z.string())
  )
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const SearchInputSchema = z.object({
  projectId: z
    .string()
    .uuid('Project ID must be a valid UUID')
    .optional()
    .describe('Project ID to search within. Uses current project from planflow_use() if omitted.'),
  query: z
    .string()
    .min(1, 'Query cannot be empty')
    .describe('Search query — natural language or keywords.'),
  limit: coerceNumber()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe('Maximum results after filters (default 10, max 50).'),
  language: z
    .string()
    .optional()
    .describe('Optional: filter by programming language (e.g. "typescript").'),
  kind: z
    .string()
    .optional()
    .describe('Optional: filter by code kind (function, class, method, interface, type).'),
  source: z
    .enum(['code', 'docs', 'all'])
    .default('all')
    .describe('Source filter: code | docs | all (default all).'),
  excludePath: coercibleStringArray(DEFAULT_EXCLUDE_PATHS).describe(
    'Glob patterns to drop from results (single string or array). Defaults filter out generated/build paths so they do not dominate top-N. Pass [] to disable defaults.'
  ),
  previewOnly: coerceBoolean()
    .default(false)
    .describe(
      'true → 600-char previews per chunk. false (default) → full chunk content. Note: even with false, the tool will auto-switch to previews if the total response would exceed maxResponseBytes.'
    ),
  maxResponseBytes: coerceNumber()
    .int()
    .min(1_000)
    .max(500_000)
    .default(DEFAULT_MAX_RESPONSE_BYTES)
    .describe(
      'Soft byte budget for full-content responses. When exceeded, the tool falls back to previews automatically (and notes it in the output). Default 30KB.'
    ),
})

type SearchInput = z.infer<typeof SearchInputSchema>

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export const searchTool: ToolDefinition<SearchInput> = {
  name: 'planflow_search',

  description: `Hybrid semantic + keyword search across a PlanFlow project's indexed codebase and documentation.

How it works:
  • Vector similarity (Voyage-code-3 embeddings — semantic meaning)
  • BM25 keyword search (exact term matching)
  • Fused with Reciprocal Rank Fusion (RRF) into a single ranked list

Output is structured (key:value blocks per result) so you can extract:
  file, lines, kind, name, language, match (vector|keyword|hybrid), score, chunkId

Use this when:
  ✅ You don't yet know which file the answer lives in
  ✅ "Where is X implemented?" / "How is Y handled across the repo?"
  ✅ Looking for examples of a pattern
  ✅ Cross-source: ranking code AND docs together

Do NOT use this when:
  ❌ You already know the file path → use Read directly (faster, cheaper)
  ❌ You're matching an exact string → use grep / Grep tool
  ❌ You only want the project's index health → planflow_index_status()
  ❌ You have a specific anchor (file/task/chunkId) → planflow_recall()
  ❌ You're starting work on a known task → planflow_task_start auto-runs
     a search for you AND fetches the task / comments / activity in one call

Defaults that prevent common pitfalls:
  • excludePath drops generated/build paths so Prisma client noise doesn't
    crowd out real results. Pass [] to disable.
  • Response is auto-capped (~30KB). If your full chunks would blow past
    that, the tool switches to 300-char previews automatically and tells
    you. Override with maxResponseBytes or set previewOnly:true upfront.

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

    if (!isAuthenticated()) {
      return createErrorResult(
        '❌ Not logged in.\n\n' +
          'Please authenticate first using:\n' +
          '  planflow_login(token: "your-api-token")\n\n' +
          'Get your token at: https://planflow.tools/settings/api-tokens'
      )
    }

    logger.info('Search tool called', { projectId, query: input.query })

    try {
      const client = getApiClient()

      // When excludePath is non-empty we over-fetch so that filtering doesn't
      // shrink the user-visible result set below `limit`. 3× is a heuristic
      // that's plenty for typical exclusion ratios; capped at 50 (server max).
      const overFetchLimit =
        input.excludePath.length > 0
          ? Math.min(50, Math.max(input.limit * 3, input.limit + 5))
          : input.limit

      const response = await client.searchProject(projectId, input.query, {
        limit: overFetchLimit,
        language: input.language,
        kind: input.kind,
        source: input.source,
      })

      // Apply MCP-side excludePath filter, then trim to the requested limit.
      const filtered =
        input.excludePath.length > 0
          ? response.results.filter((r) => {
              const chunk = r.chunk
              const path = 'filePath' in chunk ? chunk.filePath : (chunk as { source?: string }).source
              if (!path) return true
              return !matchesAny(path, input.excludePath)
            })
          : response.results

      // Apply code-chunk score boost to rebalance markdown dominance, then
      // re-sort. The chunk shape exposes `source: 'code' | 'docs'` (set by
      // the backend); we treat anything with a `filePath` as a code chunk
      // by default if `source` is missing on the wire.
      const boosted = filtered
        .map((r) => {
          const chunk = r.chunk as { source?: string }
          const isCode =
            chunk.source === 'code' ||
            (chunk.source === undefined && 'filePath' in r.chunk)
          return {
            ...r,
            score: isCode ? r.score * CODE_BOOST : r.score,
          }
        })
        .sort((a, b) => b.score - a.score)

      const droppedCount = response.results.length - filtered.length
      const trimmed = boosted.slice(0, input.limit)
      const total = trimmed.length

      logger.info('Search completed', {
        rawTotal: response.total ?? response.results.length,
        afterExclude: filtered.length,
        droppedByExclude: droppedCount,
        returned: total,
      })

      if (total === 0) {
        return createSuccessResult(
          `No results for "${input.query}"\n\n` +
            (droppedCount > 0
              ? `(${droppedCount} hits were dropped by excludePath. Pass excludePath: [] to see them.)\n\n`
              : '') +
            'Try:\n' +
            '  • Different keywords or phrasing\n' +
            '  • Broader terms\n' +
            '  • Check index status: planflow_index_status()\n' +
            '  • Remove filters (language, kind) if applied'
        )
      }

      // Decide preview vs full content. Even when previewOnly:false, switch
      // to previews if the total would overflow the byte budget — better UX
      // than dumping 100KB to the LLM (which then has to dump it to disk
      // and re-read it, adding latency).
      const totalContentBytes = trimmed.reduce(
        (sum, r) => sum + Buffer.byteLength(r.chunk.content, 'utf-8'),
        0
      )
      const autoCapped = !input.previewOnly && totalContentBytes > input.maxResponseBytes
      const usePreview = input.previewOnly || autoCapped

      const lines: string[] = [
        `Search: "${input.query}"`,
        `${total} result${total === 1 ? '' : 's'}` +
          (droppedCount > 0 ? ` (${droppedCount} dropped by excludePath)` : ''),
      ]
      if (autoCapped) {
        lines.push(
          `⚠️  Auto-capped: full content would be ${(totalContentBytes / 1024).toFixed(1)} KB — switched to previews.`,
          `   Override with previewOnly:false + maxResponseBytes: ${totalContentBytes + 1000}`
        )
      }
      lines.push('')

      for (let i = 0; i < trimmed.length; i++) {
        const r = trimmed[i]!
        const chunk = r.chunk
        const isCode = 'filePath' in chunk
        const rank = i + 1

        // RRF fusion scores aren't probabilities — show as raw decimal.
        const scoreFmt = r.score.toFixed(3)

        const content = usePreview && chunk.content.length > PREVIEW_CHARS
          ? chunk.content.slice(0, PREVIEW_CHARS) +
            (autoCapped
              ? '\n... [auto-capped — request the chunk by chunkId for full content]'
              : '\n... [truncated, set previewOnly:false for full chunk]')
          : chunk.content

        lines.push(`━━━ #${rank} ━━━━━━━━━━━━━━━━━━━━━━━━━━`)

        if (isCode) {
          lines.push(`file:      ${chunk.filePath}`)
          lines.push(`lines:     ${chunk.startLine}-${chunk.endLine}`)
          lines.push(`kind:      ${chunk.kind}`)
          lines.push(`name:      ${chunk.name}`)
          lines.push(`language:  ${chunk.language}`)
        } else {
          lines.push(`source:    ${(chunk as { source: string }).source}`)
          lines.push(`title:     ${(chunk as { title: string }).title}`)
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
      if (autoCapped) {
        lines.push('  • Larger budget: maxResponseBytes:100000 to fit more full content')
      } else {
        lines.push('  • Compact: previewOnly:true for shorter previews')
      }

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
