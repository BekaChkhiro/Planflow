/**
 * PlanFlow MCP Server - Logout Tool
 *
 * Logs out the current user by clearing stored credentials.
 */

import { z } from 'zod'
import { resetApiClient } from '../api-client.js'
import { clearCredentials, isAuthenticated, loadConfig } from '../config.js'
import { logger } from '../logger.js'
import { type ToolDefinition, createSuccessResult, createErrorResult } from './types.js'

/**
 * Input schema for planflow_logout tool
 * No inputs required - logout clears the current session
 */
const LogoutInputSchema = z.object({})

type LogoutInput = z.infer<typeof LogoutInputSchema>

/**
 * planflow_logout tool implementation
 *
 * Clears stored credentials and logs out the current user.
 */
export const logoutTool: ToolDefinition<LogoutInput> = {
  name: 'planflow_logout',

  description: `Log out from PlanFlow and clear stored credentials.

This will remove your API token from local storage. You will need to login again with planflow_login to use other PlanFlow tools.

Usage:
  planflow_logout()

No parameters required.`,

  inputSchema: LogoutInputSchema,

  async execute(_input: LogoutInput): Promise<ReturnType<typeof createSuccessResult>> {
    logger.info('Attempting to logout from PlanFlow')

    // Check if user is authenticated
    if (!isAuthenticated()) {
      logger.debug('No active session found')
      return createErrorResult(
        '⚠️ Not currently logged in.\n\n' +
          'Use planflow_login to authenticate first.'
      )
    }

    try {
      // Get current user info before clearing
      const config = loadConfig()
      const userEmail = config.userEmail ?? 'unknown'

      // Clear stored credentials
      clearCredentials()

      // Reset the API client singleton
      resetApiClient()

      logger.info('Successfully logged out', { email: userEmail })

      return createSuccessResult(
        `✅ Successfully logged out from PlanFlow!\n\n` +
          `Goodbye, ${userEmail}!\n\n` +
          '🔐 Your API token has been removed from local storage.\n\n' +
          'To login again, use:\n' +
          '  planflow_login(token: "your-api-token")\n\n' +
          'Get your token at: https://planflow.tools/settings/api-tokens'
      )
    } catch (error) {
      logger.error('Logout failed', { error: String(error) })

      const message = error instanceof Error ? error.message : String(error)
      return createErrorResult(
        `❌ Logout failed: ${message}\n\n` +
          'Please try again or manually delete the config file at:\n' +
          '  ~/.config/planflow/config.json'
      )
    }
  },
}
