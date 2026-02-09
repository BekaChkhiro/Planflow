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
    { name: 'Notifications', description: 'User notification management' },
    { name: 'Mentions', description: '@mention parsing and user search for autocomplete' },
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

      // Notification schemas (T5.10)
      Notification: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          userId: { type: 'string', format: 'uuid' },
          type: {
            type: 'string',
            enum: ['mention', 'assignment', 'unassignment', 'comment', 'comment_reply', 'status_change', 'task_created', 'task_deleted', 'invitation', 'member_joined', 'member_removed', 'role_changed'],
          },
          title: { type: 'string', maxLength: 255 },
          body: { type: 'string', nullable: true },
          link: { type: 'string', maxLength: 500, nullable: true },
          projectId: { type: 'string', format: 'uuid', nullable: true },
          organizationId: { type: 'string', format: 'uuid', nullable: true },
          actorId: { type: 'string', format: 'uuid', nullable: true },
          taskId: { type: 'string', nullable: true, description: 'Human-readable task ID' },
          readAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          actor: {
            type: 'object',
            nullable: true,
            properties: {
              id: { type: 'string', format: 'uuid' },
              email: { type: 'string', format: 'email' },
              name: { type: 'string', nullable: true },
            },
          },
        },
        required: ['id', 'userId', 'type', 'title', 'createdAt'],
      },

      Pagination: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          limit: { type: 'integer' },
          offset: { type: 'integer' },
          hasMore: { type: 'boolean' },
        },
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

    // Notifications endpoints (T5.10)
    '/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'Get user notifications',
        description: 'Get all notifications for the authenticated user with pagination and filtering',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } },
          { name: 'unreadOnly', in: 'query', schema: { type: 'boolean', default: false } },
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['mention', 'assignment', 'unassignment', 'comment', 'comment_reply', 'status_change', 'task_created', 'task_deleted', 'invitation', 'member_joined', 'member_removed', 'role_changed'] } },
          { name: 'projectId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'List of notifications',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        notifications: { type: 'array', items: { $ref: '#/components/schemas/Notification' } },
                        unreadCount: { type: 'integer' },
                        pagination: { $ref: '#/components/schemas/Pagination' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { description: 'Not authenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      delete: {
        tags: ['Notifications'],
        summary: 'Delete all notifications',
        description: 'Delete all notifications for the authenticated user. Use readOnly=true to only delete read notifications.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'readOnly', in: 'query', schema: { type: 'boolean', default: false }, description: 'Only delete read notifications' },
        ],
        responses: {
          '200': {
            description: 'Notifications deleted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'object', properties: { deletedCount: { type: 'integer' } } },
                  },
                },
              },
            },
          },
          '401': { description: 'Not authenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    '/notifications/unread-count': {
      get: {
        tags: ['Notifications'],
        summary: 'Get unread notification count',
        description: 'Get the count of unread notifications for the authenticated user',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': {
            description: 'Unread count',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'object', properties: { unreadCount: { type: 'integer' } } },
                  },
                },
              },
            },
          },
          '401': { description: 'Not authenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    '/notifications/{id}': {
      get: {
        tags: ['Notifications'],
        summary: 'Get a notification',
        description: 'Get a specific notification by ID',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Notification details',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'object', properties: { notification: { $ref: '#/components/schemas/Notification' } } },
                  },
                },
              },
            },
          },
          '401': { description: 'Not authenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Notification not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      delete: {
        tags: ['Notifications'],
        summary: 'Delete a notification',
        description: 'Delete a specific notification',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Notification deleted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'object', properties: { deleted: { type: 'boolean' } } },
                  },
                },
              },
            },
          },
          '401': { description: 'Not authenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Notification not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    '/notifications/{id}/read': {
      patch: {
        tags: ['Notifications'],
        summary: 'Mark notification as read',
        description: 'Mark a specific notification as read',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Notification marked as read',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'object', properties: { notification: { $ref: '#/components/schemas/Notification' } } },
                  },
                },
              },
            },
          },
          '401': { description: 'Not authenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Notification not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    '/notifications/mark-read': {
      post: {
        tags: ['Notifications'],
        summary: 'Mark multiple notifications as read',
        description: 'Mark multiple notifications as read by providing their IDs',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['notificationIds'],
                properties: {
                  notificationIds: { type: 'array', items: { type: 'string', format: 'uuid' }, minItems: 1, maxItems: 100 },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Notifications marked as read',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'object', properties: { markedCount: { type: 'integer' } } },
                  },
                },
              },
            },
          },
          '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '401': { description: 'Not authenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    '/notifications/mark-all-read': {
      post: {
        tags: ['Notifications'],
        summary: 'Mark all notifications as read',
        description: 'Mark all unread notifications as read for the authenticated user',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': {
            description: 'All notifications marked as read',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'object', properties: { markedCount: { type: 'integer' } } },
                  },
                },
              },
            },
          },
          '401': { description: 'Not authenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // Mentions Routes
    '/projects/{id}/mentions/search': {
      get: {
        tags: ['Mentions'],
        summary: 'Search for users to mention',
        description: 'Search for users by email or name for @mention autocomplete. Returns users that can be mentioned in comments.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Project ID',
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'q',
            in: 'query',
            required: true,
            description: 'Search query (partial email or name, min 1 character)',
            schema: { type: 'string', minLength: 1 },
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            description: 'Maximum results to return (1-20, default 10)',
            schema: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
          },
        ],
        responses: {
          '200': {
            description: 'Matching users',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        users: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              email: { type: 'string', format: 'email' },
                              name: { type: 'string', nullable: true },
                              mention: { type: 'string', description: 'Formatted mention string (e.g., @john.doe)' },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '401': { description: 'Not authenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Project not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/organizations/{id}/mentions/search': {
      get: {
        tags: ['Mentions'],
        summary: 'Search for organization members to mention',
        description: 'Search for organization members by email or name for @mention autocomplete. Only returns members of the specified organization.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Organization ID',
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'q',
            in: 'query',
            required: true,
            description: 'Search query (partial email or name, min 1 character)',
            schema: { type: 'string', minLength: 1 },
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            description: 'Maximum results to return (1-20, default 10)',
            schema: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
          },
        ],
        responses: {
          '200': {
            description: 'Matching organization members',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        users: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              email: { type: 'string', format: 'email' },
                              name: { type: 'string', nullable: true },
                              role: { type: 'string', enum: ['owner', 'admin', 'editor', 'viewer'] },
                              mention: { type: 'string', description: 'Formatted mention string (e.g., @john.doe)' },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '401': { description: 'Not authenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Organization not found or access denied', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/mentions/parse': {
      post: {
        tags: ['Mentions'],
        summary: 'Parse @mentions from text',
        description: 'Parse @mentions from text content and resolve them to user IDs. Supports @email and @name formats.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  content: { type: 'string', description: 'Text content containing @mentions', maxLength: 10000 },
                  organizationId: { type: 'string', format: 'uuid', description: 'Optional organization ID to scope mention resolution' },
                },
                required: ['content'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Parsed and resolved mentions',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        mentions: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              raw: { type: 'string', description: 'The raw mention text (without @)' },
                              isEmail: { type: 'boolean', description: 'Whether the mention is an email format' },
                              startIndex: { type: 'integer', description: 'Start position in original text' },
                              endIndex: { type: 'integer', description: 'End position in original text' },
                              resolved: { type: 'boolean', description: 'Whether the mention was resolved to a user' },
                              user: {
                                type: 'object',
                                nullable: true,
                                properties: {
                                  id: { type: 'string', format: 'uuid' },
                                  email: { type: 'string', format: 'email' },
                                  name: { type: 'string', nullable: true },
                                },
                              },
                            },
                          },
                        },
                        userIds: {
                          type: 'array',
                          items: { type: 'string', format: 'uuid' },
                          description: 'List of resolved user IDs (for use in mentions array)',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '401': { description: 'Not authenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Organization not found or access denied', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
  },
}
