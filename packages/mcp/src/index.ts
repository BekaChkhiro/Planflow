#!/usr/bin/env node

/**
 * PlanFlow MCP Server
 *
 * This server provides tools for Claude Code to interact with PlanFlow,
 * enabling project management directly from the terminal.
 *
 * Available tools:
 * - planflow_login    - Authenticate with PlanFlow
 * - planflow_logout   - Clear stored credentials
 * - planflow_whoami   - Show current user info
 * - planflow_projects - List all projects
 * - planflow_create   - Create a new project
 * - planflow_sync     - Sync project plan with cloud
 * - planflow_task_list   - List tasks in a project
 * - planflow_task_update - Update task status
 * - planflow_task_next   - Get next recommended task
 * - planflow_notifications - View notifications
 */

import { startServer } from './server.js'
import { logger } from './logger.js'

// Set log level based on environment
if (process.env['PLANFLOW_DEBUG'] === 'true') {
  logger.setLevel('debug')
}

// Start the MCP server
startServer().catch((error) => {
  logger.error('Failed to start server', {
    error: error instanceof Error ? error.message : String(error),
  })
  process.exit(1)
})
