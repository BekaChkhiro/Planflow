/**
 * PlanFlow MCP Server — Context Tool
 *
 * Unified project context combining knowledge base, vector search results,
 * real-time state (active work, recent changes), and activity history.
 *
 * T21.3 — planflow_context
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
import { coerceNumber } from './_coerce.js'

const ContextInputSchema = z.object({
  projectId: z
    .string()
    .uuid('Project ID must be a valid UUID')
    .optional()
    .describe('Project ID to get context for. Uses current project from planflow_use() if omitted.'),
  query: z
    .string()
    .optional()
    .describe('Optional semantic search query for the vector layer'),
  layers: z
    .array(z.enum(['knowledge', 'vector', 'realtime', 'activity']))
    .optional()
    .describe('Which layers to include (default: all except vector unless query is provided)'),
  knowledgeLimit: coerceNumber()
    .int()
    .min(1)
    .max(200)
    .default(50)
    .describe('Max knowledge entries (default: 50)'),
  changesLimit: coerceNumber()
    .int()
    .min(1)
    .max(200)
    .default(30)
    .describe('Max recent changes (default: 30)'),
  activityLimit: coerceNumber()
    .int()
    .min(1)
    .max(200)
    .default(30)
    .describe('Max activity entries (default: 30)'),
  knowledgeType: z
    .string()
    .optional()
    .describe('Filter knowledge by type (architecture, pattern, convention, decision, dependency)'),
})

type ContextInput = z.infer<typeof ContextInputSchema>

/**
 * planflow_context tool implementation
 *
 * Returns aggregated project context from all data layers.
 */
export const contextTool: ToolDefinition<ContextInput> = {
  name: 'planflow_context',

  description: `Get comprehensive project context from PlanFlow.

Combines multiple data layers into a single response:
  📚 Knowledge    — architecture decisions, patterns, conventions, dependencies
  🧠 Vector       — semantic search results from indexed codebase
  ⚡ Real-time    — active workers, recent changes
  📋 Activity     — recent project activity log

Usage:
  planflow_context(projectId: "uuid")
  planflow_context(projectId: "uuid", query: "authentication flow")
  planflow_context(projectId: "uuid", layers: ["knowledge", "realtime"])
  planflow_context(projectId: "uuid", knowledgeLimit: 100, changesLimit: 50)

Parameters:
  - projectId (required): Project UUID
  - query (optional): Semantic search query (enables vector layer)
  - layers (optional): Which layers to fetch
      ["knowledge", "vector", "realtime", "activity"] (default: all)
  - knowledgeLimit (optional): Max knowledge entries (default: 50)
  - changesLimit (optional): Max recent changes (default: 30)
  - activityLimit (optional): Max activity entries (default: 30)
  - knowledgeType (optional): Filter by type (architecture, pattern, etc.)

Prerequisites:
  • Logged in with planflow_login()
  • For vector results: project must be indexed with planflow_index()`,

  inputSchema: ContextInputSchema,

  async execute(input: ContextInput): Promise<ReturnType<typeof createSuccessResult>> {
    const projectId = input.projectId || getCurrentProjectId()

    if (!projectId) {
      return createErrorResult(
        '❌ No project ID provided and no current project set.\n\n' +
          'Either:\n' +
          '  1. Pass projectId: planflow_context(projectId: "uuid")\n' +
          '  2. Set current project: planflow_use(projectId: "uuid")'
      )
    }

    logger.info('Context tool called', { projectId, query: input.query })

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

      logger.info('Fetching project context', {
        projectId: input.projectId,
        query: input.query,
        layers: input.layers,
      })

      const ctx = await client.getProjectContext(projectId, {
        query: input.query,
        layers: input.layers,
        knowledgeLimit: input.knowledgeLimit,
        changesLimit: input.changesLimit,
        activityLimit: input.activityLimit,
        knowledgeType: input.knowledgeType,
      })

      logger.info('Context retrieved', {
        layersLoaded: ctx.summary.layersLoaded,
        layerErrors: ctx.summary.layerErrors,
      })

      const sections: string[] = []
      sections.push(`📊 Project Context`)
      sections.push(`Loaded: ${ctx.summary.layersLoaded.join(', ') || 'none'}`)
      if (ctx.summary.layerErrors.length > 0) {
        sections.push(`⚠️  Layer errors: ${ctx.summary.layerErrors.join(', ')}`)
      }
      sections.push('')

      // ── Knowledge Layer ──
      // Show every entry the API returned — we already passed knowledgeLimit
      // through to the server, so there is no need to clip again here.
      if (ctx.layers.knowledge && ctx.layers.knowledge.entries.length > 0) {
        sections.push(`📚 Knowledge (${ctx.layers.knowledge.total} entries)`)
        for (const entry of ctx.layers.knowledge.entries) {
          const typeIcon = getTypeIcon(entry.type)
          sections.push(`  ${typeIcon} ${entry.title}`)
          sections.push(`     ${entry.content.replace(/\n/g, '\n     ')}`)
        }
        if (ctx.layers.knowledge.total > ctx.layers.knowledge.entries.length) {
          const hidden = ctx.layers.knowledge.total - ctx.layers.knowledge.entries.length
          sections.push(`  ... ${hidden} more (raise knowledgeLimit to fetch them)`)
        }
        sections.push('')
      }

      // ── Vector Layer ──
      // Match the structured format used by planflow_search so an LLM can
      // process both responses with the same parsing rules.
      if (ctx.layers.vector && ctx.layers.vector.results.length > 0) {
        sections.push(`🧠 Vector Search: "${ctx.layers.vector.query}" (${ctx.layers.vector.total} results)`)
        for (let i = 0; i < ctx.layers.vector.results.length; i++) {
          const r = ctx.layers.vector.results[i]!
          const isCode = 'filePath' in r.chunk
          const scoreFmt = r.score.toFixed(3)
          sections.push(`  ━━━ #${i + 1} ━━━`)
          if (isCode) {
            sections.push(`     file:    ${r.chunk.filePath}`)
            sections.push(`     name:    ${r.chunk.name}`)
          } else {
            sections.push(`     source:  ${(r.chunk as { source: string }).source}`)
            sections.push(`     title:   ${(r.chunk as { title: string }).title}`)
          }
          sections.push(`     score:   ${scoreFmt}`)
          sections.push(`     content:`)
          sections.push(`     ${r.chunk.content.replace(/\n/g, '\n     ')}`)
        }
        sections.push('')
      } else if (input.query) {
        sections.push(`🧠 Vector Search: "${input.query}"`)
        sections.push(`  No vector results. The project may not be indexed yet.`)
        sections.push(`  Check status: planflow_index_status()`)
        sections.push('')
      }

      // ── Real-time Layer ──
      if (ctx.layers.realtime) {
        sections.push(`⚡ Real-time`)
        sections.push(`  Active workers: ${ctx.summary.activeWorkers}`)
        if (ctx.layers.realtime.activeWork.length > 0) {
          for (const w of ctx.layers.realtime.activeWork) {
            sections.push(`    👤 ${w.userEmail} working on ${w.taskId}: ${w.taskName}`)
          }
        }
        if (ctx.layers.realtime.recentChanges.length > 0) {
          sections.push(`  Recent changes:`)
          for (const c of ctx.layers.realtime.recentChanges) {
            sections.push(`    • ${c.description || '(no description)'}`)
          }
        }
        sections.push('')
      }

      // ── Activity Layer ──
      if (ctx.layers.activity && ctx.layers.activity.entries.length > 0) {
        sections.push(`📋 Activity (${ctx.layers.activity.total} total)`)
        for (const a of ctx.layers.activity.entries) {
          const actor = a.actorName || 'Unknown'
          const desc = a.description || a.action
          sections.push(`  • ${actor}: ${desc}`)
        }
        if (ctx.layers.activity.total > ctx.layers.activity.entries.length) {
          const hidden = ctx.layers.activity.total - ctx.layers.activity.entries.length
          sections.push(`  ... ${hidden} more (raise activityLimit to fetch them)`)
        }
        sections.push('')
      }

      // Summary footer
      sections.push(
        '─'.repeat(40),
        `Summary: ${ctx.summary.knowledgeCount} knowledge | ${ctx.summary.vectorResultsCount} vector | ${ctx.summary.activeWorkers} active | ${ctx.summary.recentChangesCount} changes | ${ctx.summary.activityCount} activities`
      )

      return createSuccessResult(sections.join('\n'))
    } catch (error) {
      logger.error('Context fetch failed', { error: String(error) })

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
      return createErrorResult(`❌ Failed to get context: ${message}`)
    }
  },
}

function getTypeIcon(type: string): string {
  switch (type) {
    case 'architecture': return '🏗️'
    case 'pattern': return '🧩'
    case 'convention': return '📐'
    case 'decision': return '⚖️'
    case 'dependency': return '📦'
    case 'environment': return '🖥️'
    default: return '📄'
  }
}
