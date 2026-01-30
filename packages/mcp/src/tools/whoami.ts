/**
 * PlanFlow MCP Server - Whoami Tool
 *
 * Returns information about the currently authenticated user.
 */

import { z } from 'zod'
import { getApiClient } from '../api-client.js'
import { isAuthenticated, loadConfig } from '../config.js'
import { AuthError, ApiError } from '../errors.js'
import { logger } from '../logger.js'
import {
  type ToolDefinition,
  createSuccessResult,
  createErrorResult,
  formatKeyValue,
} from './types.js'

/**
 * Input schema for planflow_whoami tool
 * No inputs required - returns info about current authenticated user
 */
const WhoamiInputSchema = z.object({})

type WhoamiInput = z.infer<typeof WhoamiInputSchema>

/**
 * Format a date for display
 */
function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * planflow_whoami tool implementation
 *
 * Returns information about the currently authenticated user.
 */
export const whoamiTool: ToolDefinition<WhoamiInput> = {
  name: 'planflow_whoami',

  description: `Show information about the currently authenticated PlanFlow user.

Displays your user profile including name, email, account creation date, and authentication method.

Usage:
  planflow_whoami()

No parameters required. You must be logged in first with planflow_login.`,

  inputSchema: WhoamiInputSchema,

  async execute(_input: WhoamiInput): Promise<ReturnType<typeof createSuccessResult>> {
    logger.info('Fetching current user information')

    // Check if authenticated locally first
    if (!isAuthenticated()) {
      logger.debug('No active session found')
      return createErrorResult(
        '❌ Not logged in.\n\n' +
          'Please authenticate first using:\n' +
          '  planflow_login(token: "your-api-token")\n\n' +
          'Get your token at: https://planflow.dev/settings/api-tokens'
      )
    }

    try {
      // Get the API client and fetch current user from API
      const client = getApiClient()
      const response = await client.getCurrentUser()
      const { user, authType } = response

      // Also load local config for additional info
      const config = loadConfig()

      logger.info('Successfully retrieved user info', { email: user.email })

      // Format the output
      const output = [
        '👤 Current User\n',
        formatKeyValue({
          'Name': user.name,
          'Email': user.email,
          'User ID': user.id,
          'Auth Type': authType === 'api-token' ? 'API Token' : 'JWT',
          'Created': formatDate(user.createdAt),
          'Updated': formatDate(user.updatedAt),
        }),
        '\n\n📊 Session Info',
        formatKeyValue({
          'API URL': config.apiUrl,
          'Status': '✅ Connected',
        }),
        '\n\n💡 Available commands:',
        '  • planflow_projects  - List your projects',
        '  • planflow_create    - Create a new project',
        '  • planflow_sync      - Sync project plans',
        '  • planflow_logout    - Log out',
      ].join('\n')

      return createSuccessResult(output)

    } catch (error) {
      logger.error('Failed to fetch user info', { error: String(error) })

      if (error instanceof AuthError) {
        return createErrorResult(
          '❌ Authentication error: Your session may have expired.\n\n' +
            'Please log out and log in again:\n' +
            '  1. planflow_logout()\n' +
            '  2. planflow_login(token: "your-new-token")\n\n' +
            'Get a new token at: https://planflow.dev/settings/api-tokens'
        )
      }

      if (error instanceof ApiError) {
        return createErrorResult(
          `❌ API error: ${error.message}\n\n` +
            'Please check your internet connection and try again.'
        )
      }

      // Generic error
      const message = error instanceof Error ? error.message : String(error)
      return createErrorResult(
        `❌ Failed to fetch user info: ${message}\n\n` +
          'Please try again or check your connection.'
      )
    }
  },
}
