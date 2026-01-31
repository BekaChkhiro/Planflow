/**
 * PlanFlow MCP Server - Login Tool
 *
 * Authenticates the user with the PlanFlow API using an API token.
 */

import { z } from 'zod'
import { createApiClient, resetApiClient } from '../api-client.js'
import { saveConfig, isAuthenticated, loadConfig } from '../config.js'
import { AuthError } from '../errors.js'
import { logger } from '../logger.js'
import {
  type ToolDefinition,
  createSuccessResult,
  createErrorResult,
  formatKeyValue,
} from './types.js'

/**
 * Input schema for planflow_login tool
 */
const LoginInputSchema = z.object({
  token: z.string().min(1, 'API token is required'),
})

type LoginInput = z.infer<typeof LoginInputSchema>

/**
 * planflow_login tool implementation
 *
 * Authenticates the user by verifying an API token and storing credentials.
 */
export const loginTool: ToolDefinition<LoginInput> = {
  name: 'planflow_login',

  description: `Authenticate with PlanFlow using an API token.

Get your API token from the PlanFlow dashboard at https://planflow.tools/settings/api-tokens

Usage:
  planflow_login(token: "your-api-token")

After successful login, you can use other PlanFlow tools to manage your projects and tasks.`,

  inputSchema: LoginInputSchema,

  async execute(input: LoginInput): Promise<ReturnType<typeof createSuccessResult>> {
    const { token } = input

    logger.info('Attempting to authenticate with PlanFlow')

    // Check if already authenticated
    if (isAuthenticated()) {
      const config = loadConfig()
      logger.debug('User already authenticated', { email: config.userEmail })

      return createSuccessResult(
        `⚠️ Already logged in as ${config.userEmail}\n\n` +
          'To switch accounts, run planflow_logout first, then login with the new token.'
      )
    }

    try {
      // Create a fresh API client for verification
      const client = createApiClient()

      // Verify the token with the API
      logger.debug('Verifying API token')
      const verifyResponse = await client.verifyToken(token)

      // Save credentials to config
      saveConfig({
        apiToken: token,
        userId: verifyResponse.user.id,
        userEmail: verifyResponse.user.email,
      })

      // Reset the singleton client so it picks up the new token
      resetApiClient()

      logger.info('Successfully authenticated', { email: verifyResponse.user.email })

      const output = [
        '✅ Successfully logged in to PlanFlow!\n',
        formatKeyValue({
          'User': verifyResponse.user.name,
          'Email': verifyResponse.user.email,
          'Token': verifyResponse.tokenName,
        }),
        '\n\n🎉 You can now use PlanFlow tools:',
        '  • planflow_projects  - List your projects',
        '  • planflow_create    - Create a new project',
        '  • planflow_sync      - Sync project plans',
        '  • planflow_task_list - View project tasks',
        '  • planflow_whoami    - Show current user info',
      ].join('\n')

      return createSuccessResult(output)

    } catch (error) {
      logger.error('Authentication failed', { error: String(error) })

      if (error instanceof AuthError) {
        return createErrorResult(
          '❌ Authentication failed: Invalid or expired API token.\n\n' +
            'Please check your token and try again.\n' +
            'Get a new token at: https://planflow.tools/settings/api-tokens'
        )
      }

      // Network or other errors
      const message = error instanceof Error ? error.message : String(error)
      return createErrorResult(
        `❌ Authentication failed: ${message}\n\n` +
          'Please check your internet connection and try again.'
      )
    }
  },
}
