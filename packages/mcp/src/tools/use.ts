/**
 * PlanFlow MCP Server — Use Tool
 *
 * Set the "current project" for all subsequent tool calls.
 * Eliminates the need to pass projectId to every tool.
 *
 * Usage:
 *   planflow_use(projectId: "uuid")           — set current project
 *   planflow_use()                            — show current project
 *   planflow_use(clear: true)                 — clear current project
 */

import { z } from 'zod'
import { getApiClient } from '../api-client.js'
import {
  isAuthenticated,
  getStoredCurrentProjectId,
  setStoredCurrentProjectId,
} from '../config.js'
import { AuthError, ApiError } from '../errors.js'
import { logger } from '../logger.js'
import {
  type ToolDefinition,
  createSuccessResult,
  createErrorResult,
} from './types.js'

// ---------------------------------------------------------------------------
// Current project state (persisted)
//
// Source of truth is the on-disk config file (~/.config/planflow/config.json),
// so the selection survives MCP server restarts (every new Claude session
// spawns a fresh server). We keep an in-memory mirror to avoid re-reading
// the file on every getCurrentProjectId() call — write-through caching:
// reads use cache (hydrating from disk on first call), writes update both.
// ---------------------------------------------------------------------------

let currentProjectId: string | null | undefined = undefined
let currentProjectName: string | null = null

/**
 * Hydrate the in-memory cache from disk on first access.
 * Subsequent calls hit the cache.
 */
function hydrateFromDisk(): void {
  if (currentProjectId === undefined) {
    currentProjectId = getStoredCurrentProjectId()
  }
}

export function getCurrentProjectId(): string | null {
  hydrateFromDisk()
  return currentProjectId ?? null
}

export function getCurrentProjectName(): string | null {
  hydrateFromDisk()
  return currentProjectName
}

export function clearCurrentProject(): void {
  currentProjectId = null
  currentProjectName = null
  setStoredCurrentProjectId(null)
}

const UseInputSchema = z.object({
  projectId: z
    .string()
    .uuid()
    .optional()
    .describe('Project UUID to set as current. Omit to show current project.'),
  clear: z
    .boolean()
    .default(false)
    .describe('Clear the current project setting'),
})

type UseInput = z.infer<typeof UseInputSchema>

export const useTool: ToolDefinition<UseInput> = {
  name: 'planflow_use',

  description: `Set the current PlanFlow project for all subsequent tool calls.

When you set a current project, other tools like planflow_search,
planflow_context, planflow_index, etc. will automatically use it
without requiring projectId on every call.

Usage:
  planflow_use(projectId: "uuid")     # Set current project
  planflow_use()                       # Show current project
  planflow_use(clear: true)            # Clear current project

This is useful for ad-hoc coding sessions where you don't want to
specify projectId for every single tool call.`,

  inputSchema: UseInputSchema,

  async execute(input: UseInput): Promise<ReturnType<typeof createSuccessResult>> {
    logger.info('Use tool called', { projectId: input.projectId, clear: input.clear })

    // Show current project
    if (!input.projectId && !input.clear) {
      hydrateFromDisk()
      if (!currentProjectId) {
        return createSuccessResult(
          `ℹ️ No current project set.\n\n` +
            `Set one with:\n` +
            `  planflow_use(projectId: "your-project-uuid")\n\n` +
            `Or use planflow_projects() to list available projects.`
        )
      }

      return createSuccessResult(
        `📌 Current project:\n` +
          `   ID: ${currentProjectId}\n` +
          `   Name: ${currentProjectName || 'unknown'}\n\n` +
          `Tools will use this project automatically.\n` +
          `To clear: planflow_use(clear: true)`
      )
    }

    // Clear current project
    if (input.clear) {
      clearCurrentProject()
      return createSuccessResult(`✅ Current project cleared.`)
    }

    // Set current project
    if (!isAuthenticated()) {
      return createErrorResult(
        '❌ Not logged in.\n\n' +
          'Please authenticate first:\n' +
          '  planflow_login(token: "your-api-token")'
      )
    }

    try {
      const client = getApiClient()
      const project = await client.getProject(input.projectId!)

      currentProjectId = input.projectId!
      currentProjectName = project.name
      // Persist so a fresh MCP session (new terminal / Claude restart)
      // still knows which project is current.
      setStoredCurrentProjectId(currentProjectId)

      logger.info('Current project set', { projectId: currentProjectId, name: currentProjectName })

      return createSuccessResult(
        `✅ Current project set:\n` +
          `   ${project.name}\n` +
          `   ID: ${input.projectId}\n\n` +
          `Persisted across sessions. Now you can use tools without projectId:\n` +
          `  planflow_search(query: "auth middleware")\n` +
          `  planflow_context(query: "how does routing work")\n` +
          `  planflow_index(directory: ".")`
      )
    } catch (error) {
      logger.error('Failed to set current project', { error: String(error) })

      if (error instanceof AuthError) {
        return createErrorResult('❌ Authentication error.')
      }

      if (error instanceof ApiError && error.statusCode === 404) {
        return createErrorResult(
          `❌ Project not found: ${input.projectId}\n\n` +
            'Use planflow_projects() to list your available projects.'
        )
      }

      return createErrorResult(`❌ Failed to set project: ${error instanceof Error ? error.message : String(error)}`)
    }
  },
}
