/**
 * PlanFlow MCP Server — Tool Registry
 *
 * Central registry for all MCP tools. Add new tools here.
 */

import type { ToolDefinition } from './types.js'

// Auth
import { loginTool } from './login.js'
import { logoutTool } from './logout.js'
import { whoamiTool } from './whoami.js'

// Projects & tasks
import { projectsTool } from './projects.js'
import { createTool } from './create.js'
import { useTool } from './use.js'
import { syncTool } from './sync.js'
import { taskListTool } from './task-list.js'
import { taskUpdateTool } from './task-update.js'
import { taskNextTool } from './task-next.js'
import { taskStartTool } from './task-start.js'
import { taskDoneTool } from './task-done.js'
import { taskProgressTool } from './task-progress.js'
import { workingOnTool } from './working-on.js'

// Activity / collaboration
import { activityTool } from './activity.js'
import { changesTool } from './changes.js'
import { commentsTool } from './comments.js'
import { commentTool } from './comment.js'
import { notificationsTool } from './notifications.js'

// Intelligence layer (RAG)
import { indexTool } from './index-project.js'
import { indexStatusTool } from './index-status.js'
import { searchTool } from './search.js'
import { contextTool } from './context.js'
import { exploreTool } from './explore.js'
import { recallTool } from './recall.js'
import { chunkTool } from './chunk.js'
import { rememberTool } from './remember.js'

export const tools: ToolDefinition[] = [
  // Auth
  loginTool,
  logoutTool,
  whoamiTool,

  // Projects & tasks
  projectsTool,
  createTool,
  useTool,
  syncTool,
  taskListTool,
  taskUpdateTool,
  taskNextTool,
  taskStartTool,
  taskDoneTool,
  taskProgressTool,
  workingOnTool,

  // Activity / collaboration
  activityTool,
  changesTool,
  commentsTool,
  commentTool,
  notificationsTool,

  // Intelligence layer
  indexTool,
  indexStatusTool,
  exploreTool,
  searchTool,
  contextTool,
  recallTool,
  chunkTool,
  rememberTool,
]

export function getTool(name: string): ToolDefinition | undefined {
  return tools.find((tool) => tool.name === name)
}

export function getToolNames(): string[] {
  return tools.map((tool) => tool.name)
}

export function registerTool(tool: ToolDefinition): void {
  const existing = getTool(tool.name)
  if (existing) {
    throw new Error(`Tool '${tool.name}' is already registered`)
  }
  tools.push(tool)
}

export * from './types.js'
