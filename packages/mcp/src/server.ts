/**
 * PlanFlow MCP Server - Server Implementation
 *
 * Main MCP server class that handles tool registration and request processing.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js'
import { APP_NAME, APP_VERSION } from '@planflow/shared'
import { PlanFlowError, ToolError } from './errors.js'
import { logger } from './logger.js'
import { tools } from './tools/index.js'
import type { ToolDefinition } from './tools/types.js'

/**
 * Format error for MCP tool response
 */
function formatErrorResponse(error: unknown): CallToolResult {
  let message: string

  if (error instanceof PlanFlowError) {
    message = `Error [${error.code}]: ${error.message}`
    if (error.details) {
      message += `\nDetails: ${JSON.stringify(error.details, null, 2)}`
    }
  } else if (error instanceof Error) {
    message = `Error: ${error.message}`
  } else {
    message = `Error: ${String(error)}`
  }

  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  }
}

/**
 * Convert Zod schema to JSON Schema for MCP protocol
 */
function zodToJsonSchema(schema: ToolDefinition['inputSchema']): Record<string, unknown> {
  // For now, return a basic object schema
  // In production, use zod-to-json-schema library
  if ('shape' in schema && schema.shape) {
    const shape = schema.shape as Record<string, unknown>
    const properties: Record<string, unknown> = {}
    const required: string[] = []

    for (const [key, value] of Object.entries(shape)) {
      const zodField = value as { _def?: { typeName?: string; description?: string }; isOptional?: () => boolean }

      // Determine the JSON Schema type
      let type = 'string'
      const typeName = zodField._def?.typeName
      if (typeName === 'ZodNumber') type = 'number'
      if (typeName === 'ZodBoolean') type = 'boolean'
      if (typeName === 'ZodArray') type = 'array'

      properties[key] = {
        type,
        description: zodField._def?.description,
      }

      // Check if field is required (not optional)
      if (typeof zodField.isOptional !== 'function' || !zodField.isOptional()) {
        required.push(key)
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    }
  }

  // Fallback for non-object schemas
  return { type: 'object', properties: {} }
}

/**
 * Create and configure the MCP server
 */
export function createServer(): Server {
  const server = new Server(
    {
      name: APP_NAME,
      version: APP_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  )

  // Handle list_tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.debug('Listing tools', { count: tools.length })

    return {
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: zodToJsonSchema(tool.inputSchema),
      })),
    }
  })

  // Handle call_tool request
  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params
    logger.info('Tool called', { name })

    const tool = tools.find((t) => t.name === name)

    if (!tool) {
      logger.warn('Unknown tool requested', { name })
      return formatErrorResponse(new ToolError(`Unknown tool: ${name}`, name))
    }

    try {
      // Validate input against schema
      const parseResult = tool.inputSchema.safeParse(args)

      if (!parseResult.success) {
        logger.warn('Tool input validation failed', {
          name,
          errors: parseResult.error.errors,
        })
        return formatErrorResponse(
          new PlanFlowError(
            `Invalid input: ${parseResult.error.errors.map((e) => e.message).join(', ')}`,
            'VALIDATION_ERROR',
            { errors: parseResult.error.errors }
          )
        )
      }

      // Execute the tool
      const result = await tool.execute(parseResult.data)
      logger.debug('Tool executed successfully', { name })

      return result
    } catch (error) {
      logger.error('Tool execution failed', {
        name,
        error: error instanceof Error ? error.message : String(error),
      })
      return formatErrorResponse(error)
    }
  })

  return server
}

/**
 * Start the MCP server with stdio transport
 */
export async function startServer(): Promise<void> {
  logger.info('Starting PlanFlow MCP Server', { version: APP_VERSION })

  const server = createServer()
  const transport = new StdioServerTransport()

  // Handle server errors
  server.onerror = (error) => {
    logger.error('Server error', { error: String(error) })
  }

  // Handle process signals for graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down server...')
    await server.close()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  // Connect and start
  await server.connect(transport)
  logger.info('Server connected and ready')
}
