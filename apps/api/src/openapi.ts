import type { OpenAPIV3 } from 'openapi-types'

export const openApiSpec: OpenAPIV3.Document = {
  openapi: '3.0.3',
  info: {
    title: 'PlanFlow API',
    description: `
PlanFlow is an AI-native project management tool built for Claude Code, enabling developers to manage tasks without leaving the terminal.

## Authentication

The API supports two authentication methods:

### JWT Authentication (Web Dashboard)
- Obtain tokens via \`POST /auth/login\`
- Include in header: \`Authorization: Bearer <jwt_token>\`
- Tokens expire in 15 minutes (configurable)
- Use \`POST /auth/refresh\` to get new access tokens

### API Token Authentication (MCP/CLI)
- Create tokens via \`POST /api-tokens\` (requires JWT auth)
- Tokens are prefixed with \`pf_\`
- Include in header: \`Authorization: Bearer pf_<token>\`
- Tokens can be set to expire or be permanent

## Response Format

All endpoints return a consistent JSON structure:

\`\`\`json
{
  "success": true,
  "data": { ... },
  "error": "Error message (only on failure)"
}
\`\`\`
    `.trim(),
    version: '0.0.1',
    contact: {
      name: 'PlanFlow',
      url: 'https://github.com/planflow/planflow',
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
  },
  servers: [
    {
      url: 'http://localhost:3001',
      description: 'Local development server',
    },
  ],
  tags: [
    { name: 'Health', description: 'Health check endpoints' },
    { name: 'Auth', description: 'Authentication endpoints' },
    { name: 'API Tokens', description: 'API token management for MCP integration' },
    { name: 'Projects', description: 'Project CRUD operations' },
    { name: 'Tasks', description: 'Task management endpoints' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token or API token (prefixed with pf_)',
      },
    },
    schemas: {
      // Common schemas
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: { type: 'string', example: 'Error message' },
          details: {
            type: 'object',
            additionalProperties: {
              type: 'array',
              items: { type: 'string' },
            },
            description: 'Field-level validation errors',
          },
        },
        required: ['success', 'error'],
      },

      // User schemas
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          name: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'email', 'name', 'createdAt', 'updatedAt'],
      },

      RegisterRequest: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          password: { type: 'string', minLength: 8, maxLength: 72, example: 'securepassword123' },
          name: { type: 'string', minLength: 1, maxLength: 100, example: 'John Doe' },
        },
        required: ['email', 'password', 'name'],
      },

      LoginRequest: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          password: { type: 'string', example: 'securepassword123' },
        },
        required: ['email', 'password'],
      },

      AuthResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              user: { $ref: '#/components/schemas/User' },
              token: { type: 'string', description: 'JWT access token' },
              refreshToken: { type: 'string', description: 'Refresh token for obtaining new access tokens' },
              expiresIn: { type: 'integer', description: 'Access token expiration in seconds', example: 900 },
              refreshExpiresIn: { type: 'integer', description: 'Refresh token expiration in seconds', example: 2592000 },
            },
          },
        },
      },

      RefreshTokenRequest: {
        type: 'object',
        properties: {
          refreshToken: { type: 'string', description: 'The refresh token obtained from login' },
        },
        required: ['refreshToken'],
      },

      // API Token schemas
      ApiToken: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
          expiresAt: { type: 'string', format: 'date-time', nullable: true },
          isRevoked: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },

      CreateApiTokenRequest: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100, example: 'MCP Token' },
          expiresInDays: { type: 'integer', minimum: 1, maximum: 365, description: 'Optional expiration in days' },
        },
        required: ['name'],
      },

      CreateApiTokenResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              token: { type: 'string', description: 'The API token (only shown once!)', example: 'pf_abc123...' },
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              expiresAt: { type: 'string', format: 'date-time', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
          message: { type: 'string' },
        },
      },

      VerifyApiTokenRequest: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'The API token to verify', example: 'pf_abc123...' },
        },
        required: ['token'],
      },

      // Project schemas
      Project: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          description: { type: 'string', nullable: true },
          plan: { type: 'string', nullable: true, description: 'Markdown content of the project plan' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'name', 'createdAt', 'updatedAt'],
      },

      CreateProjectRequest: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255, example: 'My Project' },
          description: { type: 'string', maxLength: 2000, example: 'A description of my project' },
          plan: { type: 'string', description: 'Markdown content of the project plan' },
        },
        required: ['name'],
      },

      UpdateProjectRequest: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          description: { type: 'string', maxLength: 2000, nullable: true },
          plan: { type: 'string', nullable: true },
        },
      },

      // Task schemas
      Task: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          taskId: { type: 'string', description: 'Human-readable task ID', example: 'T1.1' },
          name: { type: 'string' },
          description: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'] },
          complexity: { type: 'string', enum: ['Low', 'Medium', 'High'] },
          estimatedHours: { type: 'number', nullable: true },
          dependencies: { type: 'array', items: { type: 'string' }, description: 'Array of task IDs this task depends on' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'taskId', 'name', 'status', 'complexity', 'dependencies', 'createdAt', 'updatedAt'],
      },

      BulkUpdateTasksRequest: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid', description: 'Task UUID (required)' },
                taskId: { type: 'string' },
                name: { type: 'string', minLength: 1, maxLength: 255 },
                description: { type: 'string', maxLength: 2000, nullable: true },
                status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'] },
                complexity: { type: 'string', enum: ['Low', 'Medium', 'High'] },
                estimatedHours: { type: 'number', nullable: true },
                dependencies: { type: 'array', items: { type: 'string' } },
              },
              required: ['id'],
            },
            minItems: 1,
          },
        },
        required: ['tasks'],
      },
    },
  },
  paths: {
    // Health endpoints
    '/': {
      get: {
        tags: ['Health'],
        summary: 'API Status',
        description: 'Returns basic API information and status',
        responses: {
          '200': {
            description: 'API is running',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', example: 'PlanFlow API' },
                    version: { type: 'string', example: '0.0.1' },
                    status: { type: 'string', example: 'ok' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health Check',
        description: 'Basic health check endpoint',
        responses: {
          '200': {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'healthy' },
                    timestamp: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/health/db': {
      get: {
        tags: ['Health'],
        summary: 'Database Health Check',
        description: 'Check database connectivity and return connection info',
        responses: {
          '200': {
            description: 'Database is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'healthy' },
                    database: {
                      type: 'object',
                      properties: {
                        connected: { type: 'boolean' },
                        latencyMs: { type: 'number' },
                        version: { type: 'string' },
                        database: { type: 'string' },
                      },
                    },
                    timestamp: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          '503': {
            description: 'Database is unhealthy',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },

    // Auth endpoints
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new user',
        description: 'Create a new user account',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RegisterRequest' },
            },
          },
        },
        responses: {
          '201': {
            description: 'User created successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        user: { $ref: '#/components/schemas/User' },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Validation error',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '409': {
            description: 'User already exists',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login',
        description: 'Authenticate and receive JWT + refresh tokens',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthResponse' },
              },
            },
          },
          '400': {
            description: 'Validation error',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '401': {
            description: 'Invalid credentials',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Refresh access token',
        description: 'Use a refresh token to obtain a new access token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RefreshTokenRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Token refreshed',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        token: { type: 'string' },
                        expiresIn: { type: 'integer', example: 900 },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Invalid or expired refresh token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Logout',
        description: 'Revoke the refresh token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RefreshTokenRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Logged out successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        message: { type: 'string', example: 'Successfully logged out' },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Invalid or already revoked token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get current user',
        description: 'Get the authenticated user\'s information',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': {
            description: 'User information',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        user: { $ref: '#/components/schemas/User' },
                        authType: { type: 'string', enum: ['jwt', 'api-token'] },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },

    // API Token endpoints
    '/api-tokens': {
      post: {
        tags: ['API Tokens'],
        summary: 'Create API token',
        description: 'Create a new API token for MCP integration. Requires JWT authentication.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateApiTokenRequest' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Token created. Save the token securely - it will not be shown again.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateApiTokenResponse' },
              },
            },
          },
          '400': {
            description: 'Validation error',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '401': {
            description: 'Not authenticated (requires JWT)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      get: {
        tags: ['API Tokens'],
        summary: 'List API tokens',
        description: 'List all non-revoked API tokens for the authenticated user. Requires JWT authentication.',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': {
            description: 'List of API tokens (token values are not returned)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        tokens: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/ApiToken' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/api-tokens/{id}': {
      delete: {
        tags: ['API Tokens'],
        summary: 'Revoke API token',
        description: 'Revoke an API token. Requires JWT authentication.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'API token ID',
          },
        ],
        responses: {
          '200': {
            description: 'Token revoked',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        message: { type: 'string', example: 'API token revoked successfully' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '404': {
            description: 'Token not found or already revoked',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/api-tokens/verify': {
      post: {
        tags: ['API Tokens'],
        summary: 'Verify API token',
        description: 'Verify an API token and get user information. Used by MCP server for authentication.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/VerifyApiTokenRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Token is valid',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        user: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                            email: { type: 'string', format: 'email' },
                            name: { type: 'string' },
                          },
                        },
                        tokenName: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Token is required',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '401': {
            description: 'Invalid, expired, or revoked token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },

    // Project endpoints
    '/projects': {
      get: {
        tags: ['Projects'],
        summary: 'List projects',
        description: 'Get all projects for the authenticated user',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': {
            description: 'List of projects',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        projects: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Project' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      post: {
        tags: ['Projects'],
        summary: 'Create project',
        description: 'Create a new project',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateProjectRequest' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Project created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        project: { $ref: '#/components/schemas/Project' },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Validation error',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/projects/{id}': {
      put: {
        tags: ['Projects'],
        summary: 'Update project',
        description: 'Update a project (partial updates supported)',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'Project ID',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateProjectRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Project updated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        project: { $ref: '#/components/schemas/Project' },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Validation error or invalid project ID',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '404': {
            description: 'Project not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      delete: {
        tags: ['Projects'],
        summary: 'Delete project',
        description: 'Delete a project and all its tasks',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'Project ID',
          },
        ],
        responses: {
          '200': {
            description: 'Project deleted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        message: { type: 'string', example: 'Project deleted successfully' },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Invalid project ID format',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '404': {
            description: 'Project not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/projects/{id}/plan': {
      get: {
        tags: ['Projects'],
        summary: 'Get project plan',
        description: 'Get the project plan content (markdown)',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'Project ID',
          },
        ],
        responses: {
          '200': {
            description: 'Project plan',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        projectId: { type: 'string', format: 'uuid' },
                        projectName: { type: 'string' },
                        plan: { type: 'string', nullable: true },
                        updatedAt: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Invalid project ID format',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '404': {
            description: 'Project not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      put: {
        tags: ['Projects'],
        summary: 'Update project plan',
        description: 'Update the project plan content',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'Project ID',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  plan: { type: 'string', nullable: true, description: 'Markdown content of the project plan' },
                },
                required: ['plan'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Plan updated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        projectId: { type: 'string', format: 'uuid' },
                        projectName: { type: 'string' },
                        plan: { type: 'string', nullable: true },
                        updatedAt: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Validation error',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '404': {
            description: 'Project not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/projects/{id}/tasks': {
      get: {
        tags: ['Tasks'],
        summary: 'List project tasks',
        description: 'Get all tasks for a project',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'Project ID',
          },
        ],
        responses: {
          '200': {
            description: 'List of tasks',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        projectId: { type: 'string', format: 'uuid' },
                        projectName: { type: 'string' },
                        tasks: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Task' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Invalid project ID format',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '404': {
            description: 'Project not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      put: {
        tags: ['Tasks'],
        summary: 'Bulk update tasks',
        description: 'Update multiple tasks at once (partial updates supported)',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'Project ID',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BulkUpdateTasksRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Tasks updated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        projectId: { type: 'string', format: 'uuid' },
                        projectName: { type: 'string' },
                        updatedCount: { type: 'integer' },
                        tasks: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Task' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Validation error or invalid task IDs',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '404': {
            description: 'Project not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
  },
}
