/**
 * PlanFlow MCP Server — Remember Tool
 *
 * Save a knowledge entry to the project's knowledge base.
 * Use this to persist architecture decisions, patterns, conventions,
 * or any important context the AI should remember about the project.
 *
 * T21.3 — planflow_remember
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

const RememberInputSchema = z.object({
  projectId: z
    .string()
    .uuid('Project ID must be a valid UUID')
    .optional()
    .describe('Project ID to save knowledge for. Uses current project from planflow_use() if omitted.'),
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title too long (max 200 characters)')
    .describe('Short descriptive title for the knowledge entry'),
  content: z
    .string()
    .min(1, 'Content is required')
    .describe('Full content / description'),
  type: z
    .enum(['architecture', 'pattern', 'convention', 'decision', 'dependency', 'environment', 'other'])
    .default('other')
    .describe('Type of knowledge entry'),
  tags: z
    .array(z.string())
    .optional()
    .describe('Optional tags for categorization'),
})

type RememberInput = z.infer<typeof RememberInputSchema>

/**
 * planflow_remember tool implementation
 */
export const rememberTool: ToolDefinition<RememberInput> = {
  name: 'planflow_remember',

  description: `Save knowledge to a PlanFlow project's knowledge base.

Use this to persist important context so the AI (and your team) can recall it later:
  • Architecture decisions ("We chose PostgreSQL over MongoDB because...")
  • Coding patterns ("Use repository pattern for all data access")
  • Conventions ("Always use kebab-case for file names")
  • Dependencies ("Requires Node.js 20+ and pnpm")
  • Environment setup ("Set DATABASE_URL before running migrations")

Usage:
  planflow_remember(
    projectId: "uuid",
    title: "Auth middleware pattern",
    content: "All protected routes use the auth middleware...",
    type: "pattern"
  )

Parameters:
  - projectId (required): Project UUID
  - title (required): Short title (max 200 chars)
  - content (required): Full description
  - type (optional): architecture | pattern | convention | decision | dependency | environment | other
  - tags (optional): Array of tags (e.g., ["auth", "middleware"])

Prerequisites:
  • Logged in with planflow_login()
  • Editor or admin role in the project`,

  inputSchema: RememberInputSchema,

  async execute(input: RememberInput): Promise<ReturnType<typeof createSuccessResult>> {
    const projectId = input.projectId || getCurrentProjectId()

    if (!projectId) {
      return createErrorResult(
        '❌ No project ID provided and no current project set.\n\n' +
          'Either:\n' +
          '  1. Pass projectId: planflow_remember(projectId: "uuid", title: "...")\n' +
          '  2. Set current project: planflow_use(projectId: "uuid")'
      )
    }

    logger.info('Remember tool called', {
      projectId,
      title: input.title,
      type: input.type,
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

      const result = await client.createKnowledge(projectId, {
        title: input.title,
        content: input.content,
        type: input.type,
        source: 'manual',
        tags: input.tags,
      })

      logger.info('Knowledge saved', { knowledgeId: result.knowledge.id })

      return createSuccessResult(
        `✅ Knowledge saved\n\n` +
          `📌 ${result.knowledge.title}\n` +
          `   Type: ${result.knowledge.type}\n` +
          `   ID: ${result.knowledge.id}\n\n` +
          `💡 This entry will now appear in:\n` +
          `  • planflow_context(projectId: "${projectId}") — aggregated context\n` +
          `  • planflow_search results when relevant`
      )
    } catch (error) {
      logger.error('Remember failed', { error: String(error) })

      if (error instanceof AuthError) {
        return createErrorResult(
          '❌ Authentication error. Please log out and log in again.\n' +
            '  planflow_logout()\n' +
            '  planflow_login(token: "your-new-token")'
        )
      }

      if (error instanceof ApiError) {
        if (error.statusCode === 403) {
          return createErrorResult(
            '❌ You do not have permission to create knowledge entries.\n' +
              'Editors and admins can add knowledge; viewers have read-only access.'
          )
        }
        if (error.statusCode === 404) {
          return createErrorResult(
            `❌ Project not found: ${projectId}\n\n` +
              'Use planflow_projects() to list your available projects.'
          )
        }
        return createErrorResult(`❌ API error: ${error.message}`)
      }

      const message = error instanceof Error ? error.message : String(error)
      return createErrorResult(`❌ Failed to save knowledge: ${message}`)
    }
  },
}
