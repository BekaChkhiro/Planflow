import { Hono } from 'hono'
import { CreateApiTokenRequestSchema } from '@planflow/shared'
import {
  jwtAuth,
  getAuth,
  authRateLimit,
  smallBodyLimit,
} from '../middleware/index.js'
import { apiTokenService, ServiceError } from '../services/index.js'
import { logger } from '../lib/logger.js'

const apiTokensRoutes = new Hono()

// Helper to handle service errors
const handleServiceError = (c: any, error: unknown) => {
  if (error instanceof ServiceError) {
    return c.json({
      success: false,
      error: error.message,
      code: error.code,
    }, error.statusCode as any)
  }

  logger.error({ err: error }, 'API tokens error')
  return c.json({ success: false, error: 'An unexpected error occurred' }, 500)
}

// POST /api-tokens - Create API token
apiTokensRoutes.post('/', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)

    // Parse and validate request body
    const body = await c.req.json()
    const validation = CreateApiTokenRequestSchema.safeParse(body)

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
        },
        400
      )
    }

    const result = await apiTokenService.createToken(user.id, validation.data)

    return c.json(
      {
        success: true,
        data: {
          token: result.token,
          id: result.id,
          name: result.name,
          expiresAt: result.expiresAt,
          createdAt: result.createdAt,
        },
        message: 'API token created. Save this token securely - it will not be shown again.',
      },
      201
    )
  } catch (error) {
    return handleServiceError(c, error)
  }
})

// GET /api-tokens - List API tokens (does not return actual token values)
apiTokensRoutes.get('/', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const tokens = await apiTokenService.listTokens(user.id)

    return c.json({
      success: true,
      data: { tokens },
    })
  } catch (error) {
    return handleServiceError(c, error)
  }
})

// DELETE /api-tokens/:id - Revoke API token
apiTokensRoutes.delete('/:id', jwtAuth, async (c) => {
  try {
    const { user } = getAuth(c)
    const tokenId = c.req.param('id')

    await apiTokenService.revokeToken(user.id, tokenId)

    return c.json({
      success: true,
      data: {
        message: 'API token revoked successfully',
      },
    })
  } catch (error) {
    return handleServiceError(c, error)
  }
})

// POST /api-tokens/verify - Verify API token (for MCP server to validate tokens)
// Rate limited to prevent token enumeration attacks
apiTokensRoutes.post('/verify', authRateLimit, smallBodyLimit, async (c) => {
  try {
    const body = await c.req.json()
    const { token: apiToken } = body

    if (!apiToken || typeof apiToken !== 'string') {
      return c.json(
        {
          success: false,
          error: 'API token is required',
        },
        400
      )
    }

    const result = await apiTokenService.verifyToken(apiToken)

    return c.json({
      success: true,
      data: result,
    })
  } catch (error) {
    return handleServiceError(c, error)
  }
})

export { apiTokensRoutes }
