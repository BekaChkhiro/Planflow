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
  lookupProjectByPath,
  setProjectLink,
  removeProjectLink,
} from '../config.js'
import { AuthError, ApiError } from '../errors.js'
import { logger } from '../logger.js'
import {
  type ToolDefinition,
  createSuccessResult,
  createErrorResult,
} from './types.js'
import { coerceBoolean } from './_coerce.js'

// ---------------------------------------------------------------------------
// Current project resolution
//
// Three layers, checked in order:
//   1. In-memory cache for this MCP server process (set by `planflow_use`
//      during the session).
//   2. Local project map (~/.config/planflow/project-map.json) — looked up
//      by current working directory. This is the "magic" path: if the user
//      ran `planflow_use` in this repo before, every fresh session here
//      auto-resolves the project without any explicit call.
//   3. Generic fallback: `currentProjectId` field in config.json — the
//      last-used project across any cwd. Useful when a user always works
//      with one project from many directories.
// ---------------------------------------------------------------------------

type Resolution = {
  projectId: string
  source: 'memory' | 'cwd-link' | 'config'
} | null

let currentProjectId: string | null | undefined = undefined
let currentProjectName: string | null = null

/**
 * Resolve the active project ID using the three-layer order. Caches the
 * result in memory so subsequent calls in the same session are cheap.
 */
function resolve(): Resolution {
  if (currentProjectId !== undefined && currentProjectId !== null) {
    return { projectId: currentProjectId, source: 'memory' }
  }

  if (currentProjectId === undefined) {
    // Layer 2: cwd → project map
    const cwd = process.cwd()
    const fromMap = lookupProjectByPath(cwd)
    if (fromMap) {
      currentProjectId = fromMap
      logger.debug('Resolved current project from cwd link', { cwd, projectId: fromMap })
      return { projectId: fromMap, source: 'cwd-link' }
    }

    // Layer 3: global config.json fallback
    const fromConfig = getStoredCurrentProjectId()
    if (fromConfig) {
      currentProjectId = fromConfig
      logger.debug('Resolved current project from config', { projectId: fromConfig })
      return { projectId: fromConfig, source: 'config' }
    }

    // Nothing found — mark cache as "checked, empty" so we don't redo this
    // dance on every call.
    currentProjectId = null
  }

  return null
}

export function getCurrentProjectId(): string | null {
  return resolve()?.projectId ?? null
}

export function getCurrentProjectName(): string | null {
  resolve()
  return currentProjectName
}

/** Returns where the active project came from — for diagnostic surfaces. */
export function getCurrentProjectSource(): 'memory' | 'cwd-link' | 'config' | null {
  return resolve()?.source ?? null
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
  clear: coerceBoolean()
    .default(false)
    .describe('Clear the current project setting (in-memory + global config; cwd link is left alone unless you also pass unlink:true).'),
  link: coerceBoolean()
    .default(true)
    .describe(
      'When true (default), also bind the current working directory to this project. Future MCP sessions started from this directory (or a subdirectory) will auto-resolve the project — no planflow_use needed.'
    ),
  unlink: coerceBoolean()
    .default(false)
    .describe(
      'Remove the cwd → project binding for the current working directory. Used standalone (no projectId) to break a previously-set link.'
    ),
})

type UseInput = z.infer<typeof UseInputSchema>

export const useTool: ToolDefinition<UseInput> = {
  name: 'planflow_use',

  description: `Set or inspect the current PlanFlow project, with automatic cwd linking.

When you set a project with link:true (the default), the binding is saved to
~/.config/planflow/project-map.json. Every future MCP session started from
this directory — or any subdirectory of it — automatically resolves the
project. No planflow_use call required after the first time.

Usage:
  planflow_use(projectId: "uuid")              # Set + auto-link this cwd
  planflow_use(projectId: "uuid", link: false) # Set without binding cwd
  planflow_use()                                # Show current project + source
  planflow_use(clear: true)                     # Clear in-memory selection
  planflow_use(unlink: true)                    # Remove cwd binding

Resolution order (when other tools omit projectId):
  1. In-memory cache for this MCP server session
  2. Project map binding for the current working directory
  3. Last-used project from the global config

Useful when you switch between several PlanFlow projects on the same machine
— each repo can be linked once and never asked again.`,

  inputSchema: UseInputSchema,

  async execute(input: UseInput): Promise<ReturnType<typeof createSuccessResult>> {
    logger.info('Use tool called', {
      projectId: input.projectId,
      clear: input.clear,
      link: input.link,
      unlink: input.unlink,
    })

    // Standalone unlink: just remove the cwd binding, leave selection alone.
    if (input.unlink && !input.projectId) {
      const cwd = process.cwd()
      const removed = removeProjectLink(cwd)
      return createSuccessResult(
        removed
          ? `🔗 Unlinked: ${cwd}\nFuture sessions in this directory will no longer auto-resolve a project.`
          : `ℹ️  No link found for ${cwd}. Nothing to unlink.`
      )
    }

    // Show current project (with source diagnostic)
    if (!input.projectId && !input.clear) {
      const resolution = resolve()
      if (!resolution) {
        return createSuccessResult(
          `ℹ️ No current project set.\n\n` +
            `Set one with:\n` +
            `  planflow_use(projectId: "your-project-uuid")\n\n` +
            `That will also bind ${process.cwd()}\n` +
            `to that project for future sessions (pass link:false to opt out).\n\n` +
            `List projects: planflow_projects()`
        )
      }

      const sourceLabel: Record<typeof resolution.source, string> = {
        'memory': 'this session',
        'cwd-link': `cwd link (${process.cwd()})`,
        'config': 'global config (last-used fallback)',
      }

      return createSuccessResult(
        `📌 Current project:\n` +
          `   ID:     ${resolution.projectId}\n` +
          `   Name:   ${currentProjectName || 'unknown'}\n` +
          `   Source: ${sourceLabel[resolution.source]}\n\n` +
          `Tools use this project automatically.\n` +
          `To clear:  planflow_use(clear: true)\n` +
          `To unlink cwd: planflow_use(unlink: true)`
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

      // Bind cwd → project (default magic). User can pass link:false to opt out.
      let cwdLinked: string | null = null
      if (input.link) {
        cwdLinked = process.cwd()
        setProjectLink(cwdLinked, currentProjectId)
      }

      logger.info('Current project set', {
        projectId: currentProjectId,
        name: currentProjectName,
        cwdLinked,
      })

      const linkBlock = cwdLinked
        ? `\n🔗 Linked: ${cwdLinked}\n   Future MCP sessions started here will auto-resolve this project.\n`
        : `\n(No cwd binding — link:false was passed.)\n`

      return createSuccessResult(
        `✅ Current project set:\n` +
          `   ${project.name}\n` +
          `   ID: ${input.projectId}\n` +
          linkBlock +
          `\nNow you can use tools without projectId:\n` +
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
