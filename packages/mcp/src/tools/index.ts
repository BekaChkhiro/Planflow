/**
 * PlanFlow MCP Server - Tool Registry
 *
 * Central registry for all MCP tools. Import and register tools here.
 */

import type { ToolDefinition } from './types.js'

// Tool implementations
import { loginTool } from './login.js'
import { logoutTool } from './logout.js'
import { whoamiTool } from './whoami.js'
import { projectsTool } from './projects.js'
import { createTool } from './create.js'
import { syncTool } from './sync.js'
import { taskListTool } from './task-list.js'
import { taskUpdateTool } from './task-update.js'
import { taskNextTool } from './task-next.js'
import { notificationsTool } from './notifications.js'
import { activityTool } from './activity.js'
import { commentsTool } from './comments.js'
import { commentTool } from './comment.js'

/**
 * Registry of all available tools
 *
 * Tools will be added here as they are implemented:
 * - planflow_login (T2.5)
 * - planflow_logout (T2.6)
 * - planflow_whoami (T2.7)
 * - planflow_projects (T2.8)
 * - planflow_create (T2.9)
 * - planflow_sync (T2.10)
 * - planflow_task_list (T2.11)
 * - planflow_task_update (T2.12)
 * - planflow_task_next (T2.13)
 * - planflow_notifications (T2.14)
 * - planflow_activity (T6.4)
 * - planflow_comments (T6.5)
 * - planflow_comment (T6.5)
 */
export const tools: ToolDefinition[] = [
  loginTool,
  logoutTool,
  whoamiTool,
  projectsTool,
  createTool,
  syncTool,
  taskListTool,
  taskUpdateTool,
  taskNextTool,
  notificationsTool,
  activityTool,
  commentsTool,
  commentTool,
]

/**
 * Get a tool by name
 */
export function getTool(name: string): ToolDefinition | undefined {
  return tools.find((tool) => tool.name === name)
}

/**
 * Get all tool names
 */
export function getToolNames(): string[] {
  return tools.map((tool) => tool.name)
}

/**
 * Register a new tool (used for dynamic registration if needed)
 */
export function registerTool(tool: ToolDefinition): void {
  const existing = getTool(tool.name)
  if (existing) {
    throw new Error(`Tool '${tool.name}' is already registered`)
  }
  tools.push(tool)
}

// Re-export types for convenience
export * from './types.js'
