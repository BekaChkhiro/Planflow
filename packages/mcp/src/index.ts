#!/usr/bin/env node

/**
 * PlanFlow MCP entry point.
 *
 * Default mode (no args): starts the MCP server over stdio for Claude /
 * IDE clients.
 *
 * CLI mode (with args): dispatches a one-shot subcommand and exits —
 * see ./cli.ts for the subcommand catalogue. Lets us reuse the same
 * binary for git hooks ("planflow-mcp index") without forcing a second
 * package install.
 */

import { startServer } from './server.js'
import { logger } from './logger.js'
import { dispatchCli } from './cli.js'

// Set log level based on environment
if (process.env['PLANFLOW_DEBUG'] === 'true') {
  logger.setLevel('debug')
}

const args = process.argv.slice(2)

;(async () => {
  // CLI subcommand path — dispatchCli calls process.exit() itself when
  // it matches, so anything below this only runs in MCP server mode.
  const handled = await dispatchCli(args)
  if (handled) return

  // Default: start the MCP server
  try {
    await startServer()
  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  }
})()
