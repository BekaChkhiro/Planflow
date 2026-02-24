# PlanFlow API Reference

> Complete API documentation for PlanFlow - AI-Native Project Management for Claude Code

**Version:** 0.0.1
**Base URL:** `https://api.planflow.tools` (Production) | `http://localhost:3001` (Development)

---

## Table of Contents

- [Authentication](#authentication)
- [Response Format](#response-format)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [Endpoints](#endpoints)
  - [Health](#health)
  - [Auth](#auth)
  - [API Tokens](#api-tokens)
  - [Projects](#projects)
  - [Tasks](#tasks)
  - [Organizations](#organizations)
  - [Team Members](#team-members)
  - [Invitations](#invitations)
  - [Activity Log](#activity-log)
- [Schemas](#schemas)

---

## Authentication

PlanFlow supports two authentication methods:

### JWT Authentication (Web Dashboard)

Used by the web dashboard for user sessions.

1. Obtain tokens via `POST /auth/login`
2. Include in header: `Authorization: Bearer <jwt_token>`
3. Access tokens expire in **15 minutes**
4. Use `POST /auth/refresh` with the refresh token to get new access tokens
5. Refresh tokens expire in **30 days**

```bash
# Login and get tokens
curl -X POST https://api.planflow.tools/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "yourpassword"}'

# Use access token
curl https://api.planflow.tools/projects \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

### API Token Authentication (MCP/CLI)

Used by the MCP server and CLI tools for programmatic access.

1. Create tokens via `POST /api-tokens` (requires JWT auth first)
2. Tokens are prefixed with `pf_`
3. Include in header: `Authorization: Bearer pf_<token>`
4. Tokens can be set to expire or be permanent

```bash
# Create an API token (requires JWT auth)
curl -X POST https://api.planflow.tools/api-tokens \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "MCP Token"}'

# Use API token
curl https://api.planflow.tools/projects \
  -H "Authorization: Bearer pf_abc123..."
```

---

## Response Format

All API endpoints return a consistent JSON structure:

### Success Response

```json
{
  "success": true,
  "data": {
    // Response data varies by endpoint
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": "Error message describing what went wrong",
  "details": {
    "fieldName": ["Validation error for this field"]
  }
}
```

---

## Error Handling

### HTTP Status Codes

| Code | Description |
|------|-------------|
| `200` | Success |
| `201` | Created |
| `400` | Bad Request - Invalid input or validation error |
| `401` | Unauthorized - Missing or invalid authentication |
| `403` | Forbidden - Insufficient permissions |
| `404` | Not Found - Resource doesn't exist |
| `409` | Conflict - Resource already exists |
| `429` | Too Many Requests - Rate limit exceeded |
| `500` | Internal Server Error |
| `503` | Service Unavailable |

### Common Error Examples

**Validation Error (400)**
```json
{
  "success": false,
  "error": "Validation failed",
  "details": {
    "email": ["Invalid email format"],
    "password": ["Password must be at least 8 characters"]
  }
}
```

**Authentication Error (401)**
```json
{
  "success": false,
  "error": "Invalid or expired token"
}
```

**Not Found Error (404)**
```json
{
  "success": false,
  "error": "Project not found"
}
```

---

## Rate Limiting

| Tier | Requests/Minute | Requests/Day |
|------|-----------------|--------------|
| Free | 60 | 1,000 |
| Pro | 300 | 10,000 |
| Team | 600 | 50,000 |
| Enterprise | Custom | Custom |

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining in window
- `X-RateLimit-Reset`: Unix timestamp when limit resets

---

## Endpoints

### Health

Health check endpoints for monitoring.

---

#### GET /

Returns basic API information and status.

**Authentication:** None required

**Response**
```json
{
  "name": "PlanFlow API",
  "version": "0.0.1",
  "status": "ok"
}
```

**Example**
```bash
curl https://api.planflow.tools/
```

---

#### GET /health

Basic health check endpoint.

**Authentication:** None required

**Response**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-30T12:00:00.000Z"
}
```

**Example**
```bash
curl https://api.planflow.tools/health
```

---

#### GET /health/db

Check database connectivity and return connection info.

**Authentication:** None required

**Success Response (200)**
```json
{
  "status": "healthy",
  "database": {
    "connected": true,
    "latencyMs": 5.2,
    "version": "PostgreSQL 15.4",
    "database": "planflow"
  },
  "timestamp": "2026-01-30T12:00:00.000Z"
}
```

**Error Response (503)**
```json
{
  "success": false,
  "error": "Database connection failed"
}
```

**Example**
```bash
curl https://api.planflow.tools/health/db
```

---

### Auth

Authentication endpoints for user management.

---

#### POST /auth/register

Create a new user account.

**Authentication:** None required

**Request Body**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Valid email address |
| `password` | string | Yes | 8-72 characters |
| `name` | string | Yes | 1-100 characters |

**Request**
```json
{
  "email": "user@example.com",
  "password": "securepassword123",
  "name": "John Doe"
}
```

**Success Response (201)**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "name": "John Doe",
      "createdAt": "2026-01-30T12:00:00.000Z",
      "updatedAt": "2026-01-30T12:00:00.000Z"
    }
  }
}
```

**Error Responses**
- `400` - Validation error
- `409` - User already exists

**Example**
```bash
curl -X POST https://api.planflow.tools/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123",
    "name": "John Doe"
  }'
```

---

#### POST /auth/login

Authenticate and receive JWT + refresh tokens.

**Authentication:** None required

**Request Body**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | User's email |
| `password` | string | Yes | User's password |

**Request**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Success Response (200)**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "name": "John Doe",
      "createdAt": "2026-01-30T12:00:00.000Z",
      "updatedAt": "2026-01-30T12:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 900,
    "refreshExpiresIn": 2592000
  }
}
```

**Error Responses**
- `400` - Validation error
- `401` - Invalid credentials

**Example**
```bash
curl -X POST https://api.planflow.tools/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123"
  }'
```

---

#### POST /auth/refresh

Use a refresh token to obtain a new access token.

**Authentication:** None required

**Request Body**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `refreshToken` | string | Yes | The refresh token from login |

**Request**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Success Response (200)**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 900
  }
}
```

**Error Responses**
- `401` - Invalid or expired refresh token

**Example**
```bash
curl -X POST https://api.planflow.tools/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

---

#### POST /auth/logout

Revoke the refresh token.

**Authentication:** None required

**Request Body**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `refreshToken` | string | Yes | The refresh token to revoke |

**Request**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Success Response (200)**
```json
{
  "success": true,
  "data": {
    "message": "Successfully logged out"
  }
}
```

**Error Responses**
- `400` - Invalid or already revoked token

**Example**
```bash
curl -X POST https://api.planflow.tools/auth/logout \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

---

#### GET /auth/me

Get the authenticated user's information.

**Authentication:** Required (JWT or API Token)

**Success Response (200)**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "name": "John Doe",
      "createdAt": "2026-01-30T12:00:00.000Z",
      "updatedAt": "2026-01-30T12:00:00.000Z"
    },
    "authType": "jwt"
  }
}
```

**Error Responses**
- `401` - Not authenticated

**Example**
```bash
curl https://api.planflow.tools/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

---

### API Tokens

API token management for MCP integration.

---

#### POST /api-tokens

Create a new API token for MCP integration.

**Authentication:** Required (JWT only)

**Request Body**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Token name (1-100 chars) |
| `expiresInDays` | integer | No | Expiration in days (1-365). If omitted, token never expires |

**Request**
```json
{
  "name": "MCP Token",
  "expiresInDays": 90
}
```

**Success Response (201)**
```json
{
  "success": true,
  "data": {
    "token": "pf_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz",
    "id": "660e8400-e29b-41d4-a716-446655440000",
    "name": "MCP Token",
    "expiresAt": "2026-04-30T12:00:00.000Z",
    "createdAt": "2026-01-30T12:00:00.000Z"
  },
  "message": "Save this token securely - it will not be shown again!"
}
```

> **Important:** The full token value is only returned once. Store it securely!

**Error Responses**
- `400` - Validation error
- `401` - Not authenticated (requires JWT)

**Example**
```bash
curl -X POST https://api.planflow.tools/api-tokens \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MCP Token",
    "expiresInDays": 90
  }'
```

---

#### GET /api-tokens

List all non-revoked API tokens for the authenticated user.

**Authentication:** Required (JWT only)

**Success Response (200)**
```json
{
  "success": true,
  "data": {
    "tokens": [
      {
        "id": "660e8400-e29b-41d4-a716-446655440000",
        "name": "MCP Token",
        "lastUsedAt": "2026-01-30T10:00:00.000Z",
        "expiresAt": "2026-04-30T12:00:00.000Z",
        "isRevoked": false,
        "createdAt": "2026-01-30T12:00:00.000Z"
      }
    ]
  }
}
```

> **Note:** Token values are never returned in list responses.

**Error Responses**
- `401` - Not authenticated

**Example**
```bash
curl https://api.planflow.tools/api-tokens \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

---

#### DELETE /api-tokens/{id}

Revoke an API token.

**Authentication:** Required (JWT only)

**Path Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | uuid | API token ID |

**Success Response (200)**
```json
{
  "success": true,
  "data": {
    "message": "API token revoked successfully"
  }
}
```

**Error Responses**
- `401` - Not authenticated
- `404` - Token not found or already revoked

**Example**
```bash
curl -X DELETE https://api.planflow.tools/api-tokens/660e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

---

#### POST /api-tokens/verify

Verify an API token and get user information. Used by MCP server for authentication.

**Authentication:** None required (token is in body)

**Request Body**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | string | Yes | The API token to verify |

**Request**
```json
{
  "token": "pf_abc123def456ghi789..."
}
```

**Success Response (200)**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "name": "John Doe"
    },
    "tokenName": "MCP Token"
  }
}
```

**Error Responses**
- `400` - Token is required
- `401` - Invalid, expired, or revoked token

**Example**
```bash
curl -X POST https://api.planflow.tools/api-tokens/verify \
  -H "Content-Type: application/json" \
  -d '{
    "token": "pf_abc123def456ghi789..."
  }'
```

---

### Projects

Project CRUD operations.

---

#### GET /projects

Get all projects for the authenticated user.

**Authentication:** Required

**Success Response (200)**
```json
{
  "success": true,
  "data": {
    "projects": [
      {
        "id": "770e8400-e29b-41d4-a716-446655440000",
        "name": "My Project",
        "description": "A description of my project",
        "plan": "# Project Plan\n\n## Phase 1...",
        "createdAt": "2026-01-30T12:00:00.000Z",
        "updatedAt": "2026-01-30T12:00:00.000Z"
      }
    ]
  }
}
```

**Error Responses**
- `401` - Not authenticated

**Example**
```bash
curl https://api.planflow.tools/projects \
  -H "Authorization: Bearer pf_abc123..."
```

---

#### POST /projects

Create a new project.

**Authentication:** Required

**Request Body**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Project name (1-255 chars) |
| `description` | string | No | Description (max 2000 chars) |
| `plan` | string | No | Markdown content of the project plan |

**Request**
```json
{
  "name": "My New Project",
  "description": "A description of my project",
  "plan": "# My Project Plan\n\n## Overview\n..."
}
```

**Success Response (201)**
```json
{
  "success": true,
  "data": {
    "project": {
      "id": "770e8400-e29b-41d4-a716-446655440000",
      "name": "My New Project",
      "description": "A description of my project",
      "plan": "# My Project Plan\n\n## Overview\n...",
      "createdAt": "2026-01-30T12:00:00.000Z",
      "updatedAt": "2026-01-30T12:00:00.000Z"
    }
  }
}
```

**Error Responses**
- `400` - Validation error
- `401` - Not authenticated

**Example**
```bash
curl -X POST https://api.planflow.tools/projects \
  -H "Authorization: Bearer pf_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My New Project",
    "description": "A description of my project"
  }'
```

---

#### PUT /projects/{id}

Update a project (partial updates supported).

**Authentication:** Required

**Path Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | uuid | Project ID |

**Request Body**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | Project name (1-255 chars) |
| `description` | string | No | Description (max 2000 chars), null to clear |
| `plan` | string | No | Plan content, null to clear |

**Request**
```json
{
  "name": "Updated Project Name",
  "description": "Updated description"
}
```

**Success Response (200)**
```json
{
  "success": true,
  "data": {
    "project": {
      "id": "770e8400-e29b-41d4-a716-446655440000",
      "name": "Updated Project Name",
      "description": "Updated description",
      "plan": "# Project Plan...",
      "createdAt": "2026-01-30T12:00:00.000Z",
      "updatedAt": "2026-01-30T12:30:00.000Z"
    }
  }
}
```

**Error Responses**
- `400` - Validation error or invalid project ID
- `401` - Not authenticated
- `404` - Project not found

**Example**
```bash
curl -X PUT https://api.planflow.tools/projects/770e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer pf_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Project Name"
  }'
```

---

#### DELETE /projects/{id}

Delete a project and all its tasks.

**Authentication:** Required

**Path Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | uuid | Project ID |

**Success Response (200)**
```json
{
  "success": true,
  "data": {
    "message": "Project deleted successfully"
  }
}
```

**Error Responses**
- `400` - Invalid project ID format
- `401` - Not authenticated
- `404` - Project not found

**Example**
```bash
curl -X DELETE https://api.planflow.tools/projects/770e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer pf_abc123..."
```

---

#### GET /projects/{id}/plan

Get the project plan content (markdown).

**Authentication:** Required

**Path Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | uuid | Project ID |

**Success Response (200)**
```json
{
  "success": true,
  "data": {
    "projectId": "770e8400-e29b-41d4-a716-446655440000",
    "projectName": "My Project",
    "plan": "# Project Plan\n\n## Phase 1: Foundation\n\n### Tasks\n\n| ID | Task | Status |\n|---|---|---|\n| T1.1 | Setup | DONE |",
    "updatedAt": "2026-01-30T12:00:00.000Z"
  }
}
```

**Error Responses**
- `400` - Invalid project ID format
- `401` - Not authenticated
- `404` - Project not found

**Example**
```bash
curl https://api.planflow.tools/projects/770e8400-e29b-41d4-a716-446655440000/plan \
  -H "Authorization: Bearer pf_abc123..."
```

---

#### PUT /projects/{id}/plan

Update the project plan content.

**Authentication:** Required

**Path Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | uuid | Project ID |

**Request Body**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `plan` | string | Yes | Markdown content of the plan (null to clear) |

**Request**
```json
{
  "plan": "# Updated Project Plan\n\n## Phase 1: Foundation\n..."
}
```

**Success Response (200)**
```json
{
  "success": true,
  "data": {
    "projectId": "770e8400-e29b-41d4-a716-446655440000",
    "projectName": "My Project",
    "plan": "# Updated Project Plan\n\n## Phase 1: Foundation\n...",
    "updatedAt": "2026-01-30T12:30:00.000Z"
  }
}
```

**Error Responses**
- `400` - Validation error
- `401` - Not authenticated
- `404` - Project not found

**Example**
```bash
curl -X PUT https://api.planflow.tools/projects/770e8400-e29b-41d4-a716-446655440000/plan \
  -H "Authorization: Bearer pf_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "plan": "# Updated Project Plan\n\n## Phase 1: Foundation\n..."
  }'
```

---

### Tasks

Task management endpoints.

---

#### GET /projects/{id}/tasks

Get all tasks for a project.

**Authentication:** Required

**Path Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | uuid | Project ID |

**Success Response (200)**
```json
{
  "success": true,
  "data": {
    "projectId": "770e8400-e29b-41d4-a716-446655440000",
    "projectName": "My Project",
    "tasks": [
      {
        "id": "880e8400-e29b-41d4-a716-446655440000",
        "taskId": "T1.1",
        "name": "Project Setup",
        "description": "Initialize the project structure",
        "status": "DONE",
        "complexity": "Low",
        "estimatedHours": 2,
        "dependencies": [],
        "createdAt": "2026-01-30T12:00:00.000Z",
        "updatedAt": "2026-01-30T14:00:00.000Z"
      },
      {
        "id": "880e8400-e29b-41d4-a716-446655440001",
        "taskId": "T1.2",
        "name": "Database Setup",
        "description": "Configure PostgreSQL database",
        "status": "IN_PROGRESS",
        "complexity": "Medium",
        "estimatedHours": 4,
        "dependencies": ["T1.1"],
        "createdAt": "2026-01-30T12:00:00.000Z",
        "updatedAt": "2026-01-30T15:00:00.000Z"
      }
    ]
  }
}
```

**Error Responses**
- `400` - Invalid project ID format
- `401` - Not authenticated
- `404` - Project not found

**Example**
```bash
curl https://api.planflow.tools/projects/770e8400-e29b-41d4-a716-446655440000/tasks \
  -H "Authorization: Bearer pf_abc123..."
```

---

#### PUT /projects/{id}/tasks

Update multiple tasks at once (partial updates supported).

**Authentication:** Required

**Path Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | uuid | Project ID |

**Request Body**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tasks` | array | Yes | Array of task updates (min 1 item) |

**Task Update Object**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | uuid | Yes | Task UUID |
| `taskId` | string | No | Human-readable ID (e.g., "T1.1") |
| `name` | string | No | Task name (1-255 chars) |
| `description` | string | No | Description (max 2000 chars) |
| `status` | string | No | `TODO`, `IN_PROGRESS`, `DONE`, or `BLOCKED` |
| `complexity` | string | No | `Low`, `Medium`, or `High` |
| `estimatedHours` | number | No | Estimated hours |
| `dependencies` | array | No | Array of task IDs |

**Request**
```json
{
  "tasks": [
    {
      "id": "880e8400-e29b-41d4-a716-446655440000",
      "status": "DONE"
    },
    {
      "id": "880e8400-e29b-41d4-a716-446655440001",
      "status": "IN_PROGRESS"
    }
  ]
}
```

**Success Response (200)**
```json
{
  "success": true,
  "data": {
    "projectId": "770e8400-e29b-41d4-a716-446655440000",
    "projectName": "My Project",
    "updatedCount": 2,
    "tasks": [
      {
        "id": "880e8400-e29b-41d4-a716-446655440000",
        "taskId": "T1.1",
        "name": "Project Setup",
        "status": "DONE",
        "complexity": "Low",
        "estimatedHours": 2,
        "dependencies": [],
        "createdAt": "2026-01-30T12:00:00.000Z",
        "updatedAt": "2026-01-30T16:00:00.000Z"
      }
    ]
  }
}
```

**Error Responses**
- `400` - Validation error or invalid task IDs
- `401` - Not authenticated
- `404` - Project not found

**Example**
```bash
curl -X PUT https://api.planflow.tools/projects/770e8400-e29b-41d4-a716-446655440000/tasks \
  -H "Authorization: Bearer pf_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "tasks": [
      {"id": "880e8400-e29b-41d4-a716-446655440000", "status": "DONE"},
      {"id": "880e8400-e29b-41d4-a716-446655440001", "status": "IN_PROGRESS"}
    ]
  }'
```

---

### Organizations

Organization management for team collaboration.

---

#### POST /organizations

Create a new organization. The creator automatically becomes the owner.

**Authentication:** Required (JWT or API Token)

**Request Body**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Organization name (1-255 chars) |
| `slug` | string | No | URL-friendly identifier (auto-generated from name if omitted) |
| `description` | string | No | Description (max 2000 chars) |

**Request**
```json
{
  "name": "My Team",
  "slug": "my-team",
  "description": "Our development team"
}
```

**Success Response (201)**
```json
{
  "success": true,
  "data": {
    "organization": {
      "id": "990e8400-e29b-41d4-a716-446655440000",
      "name": "My Team",
      "slug": "my-team",
      "description": "Our development team",
      "createdBy": "550e8400-e29b-41d4-a716-446655440000",
      "createdAt": "2026-01-30T12:00:00.000Z",
      "updatedAt": "2026-01-30T12:00:00.000Z"
    }
  }
}
```

**Error Responses**
- `400` - Validation error
- `401` - Not authenticated
- `409` - Slug already exists

**Example**
```bash
curl -X POST https://api.planflow.tools/organizations \
  -H "Authorization: Bearer pf_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Team",
    "description": "Our development team"
  }'
```

---

#### GET /organizations

List all organizations the authenticated user is a member of.

**Authentication:** Required

**Success Response (200)**
```json
{
  "success": true,
  "data": {
    "organizations": [
      {
        "id": "990e8400-e29b-41d4-a716-446655440000",
        "name": "My Team",
        "slug": "my-team",
        "description": "Our development team",
        "createdBy": "550e8400-e29b-41d4-a716-446655440000",
        "createdAt": "2026-01-30T12:00:00.000Z",
        "updatedAt": "2026-01-30T12:00:00.000Z",
        "role": "owner"
      },
      {
        "id": "990e8400-e29b-41d4-a716-446655440001",
        "name": "Another Team",
        "slug": "another-team",
        "description": null,
        "createdBy": "550e8400-e29b-41d4-a716-446655440001",
        "createdAt": "2026-01-30T10:00:00.000Z",
        "updatedAt": "2026-01-30T10:00:00.000Z",
        "role": "editor"
      }
    ]
  }
}
```

**Error Responses**
- `401` - Not authenticated

**Example**
```bash
curl https://api.planflow.tools/organizations \
  -H "Authorization: Bearer pf_abc123..."
```

---

#### GET /organizations/{id}

Get organization details.

**Authentication:** Required

**Path Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | uuid | Organization ID |

**Success Response (200)**
```json
{
  "success": true,
  "data": {
    "organization": {
      "id": "990e8400-e29b-41d4-a716-446655440000",
      "name": "My Team",
      "slug": "my-team",
      "description": "Our development team",
      "createdBy": "550e8400-e29b-41d4-a716-446655440000",
      "createdAt": "2026-01-30T12:00:00.000Z",
      "updatedAt": "2026-01-30T12:00:00.000Z",
      "role": "owner"
    }
  }
}
```

**Error Responses**
- `401` - Not authenticated
- `404` - Organization not found or user is not a member

**Example**
```bash
curl https://api.planflow.tools/organizations/990e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer pf_abc123..."
```

---

#### PUT /organizations/{id}

Update an organization (partial updates supported).

**Authentication:** Required

**Path Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | uuid | Organization ID |

**Request Body**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | Organization name (1-255 chars) |
| `slug` | string | No | URL-friendly identifier |
| `description` | string | No | Description (max 2000 chars), null to clear |

> **Note:** At least one field must be provided.

**Request**
```json
{
  "name": "Updated Team Name",
  "description": "Updated description"
}
```

**Success Response (200)**
```json
{
  "success": true,
  "data": {
    "organization": {
      "id": "990e8400-e29b-41d4-a716-446655440000",
      "name": "Updated Team Name",
      "slug": "my-team",
      "description": "Updated description",
      "createdBy": "550e8400-e29b-41d4-a716-446655440000",
      "createdAt": "2026-01-30T12:00:00.000Z",
      "updatedAt": "2026-01-30T14:00:00.000Z"
    }
  }
}
```

**Error Responses**
- `400` - Validation error or no fields provided
- `401` - Not authenticated
- `403` - Insufficient permissions (only owner/admin can update)
- `404` - Organization not found
- `409` - Slug already exists

**Example**
```bash
curl -X PUT https://api.planflow.tools/organizations/990e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer pf_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Team Name"
  }'
```

---

#### DELETE /organizations/{id}

Delete an organization. This cascades to all members, invitations, and related data.

**Authentication:** Required

**Path Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | uuid | Organization ID |

**Success Response (200)**
```json
{
  "success": true,
  "data": {
    "message": "Organization deleted successfully"
  }
}
```

**Error Responses**
- `401` - Not authenticated
- `403` - Insufficient permissions (only owner can delete)
- `404` - Organization not found

**Example**
```bash
curl -X DELETE https://api.planflow.tools/organizations/990e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer pf_abc123..."
```

---

### Team Members

Manage organization members and their roles.

**Role Hierarchy:**
| Role | Permissions |
|------|-------------|
| `owner` | Full control - manage org, all members, invitations |
| `admin` | Manage members (except owners), manage invitations |
| `editor` | View organization, contribute to projects |
| `viewer` | Read-only access |

---

#### GET /organizations/{id}/members

List all members of an organization with pagination.

**Authentication:** Required

**Path Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | uuid | Organization ID |

**Query Parameters**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number (min: 1) |
| `limit` | integer | 20 | Items per page (max: 100) |

**Success Response (200)**
```json
{
  "success": true,
  "data": {
    "members": [
      {
        "id": "aa0e8400-e29b-41d4-a716-446655440000",
        "organizationId": "990e8400-e29b-41d4-a716-446655440000",
        "userId": "550e8400-e29b-41d4-a716-446655440000",
        "role": "owner",
        "createdAt": "2026-01-30T12:00:00.000Z",
        "updatedAt": "2026-01-30T12:00:00.000Z",
        "userName": "John Doe",
        "userEmail": "john@example.com"
      },
      {
        "id": "aa0e8400-e29b-41d4-a716-446655440001",
        "organizationId": "990e8400-e29b-41d4-a716-446655440000",
        "userId": "550e8400-e29b-41d4-a716-446655440001",
        "role": "editor",
        "createdAt": "2026-01-30T14:00:00.000Z",
        "updatedAt": "2026-01-30T14:00:00.000Z",
        "userName": "Jane Smith",
        "userEmail": "jane@example.com"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalCount": 2,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
}
```

**Error Responses**
- `401` - Not authenticated
- `404` - Organization not found or user is not a member

**Example**
```bash
curl "https://api.planflow.tools/organizations/990e8400-e29b-41d4-a716-446655440000/members?page=1&limit=20" \
  -H "Authorization: Bearer pf_abc123..."
```

---

#### PATCH /organizations/{id}/members/{memberId}

Update a member's role within the organization.

**Authentication:** Required

**Path Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | uuid | Organization ID |
| `memberId` | uuid | Member ID (organization_members.id) |

**Request Body**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `role` | string | Yes | New role: `admin`, `editor`, or `viewer` |

> **Note:** Cannot change a member to `owner` role. Owner is assigned only at organization creation.

**Request**
```json
{
  "role": "admin"
}
```

**Success Response (200)**
```json
{
  "success": true,
  "data": {
    "member": {
      "id": "aa0e8400-e29b-41d4-a716-446655440001",
      "organizationId": "990e8400-e29b-41d4-a716-446655440000",
      "userId": "550e8400-e29b-41d4-a716-446655440001",
      "role": "admin",
      "createdAt": "2026-01-30T14:00:00.000Z",
      "updatedAt": "2026-01-30T16:00:00.000Z",
      "userName": "Jane Smith",
      "userEmail": "jane@example.com"
    }
  }
}
```

**Error Responses**
- `400` - Invalid role
- `401` - Not authenticated
- `403` - Insufficient permissions (only owner can change roles) or cannot change owner's role
- `404` - Organization or member not found

**Example**
```bash
curl -X PATCH https://api.planflow.tools/organizations/990e8400-e29b-41d4-a716-446655440000/members/aa0e8400-e29b-41d4-a716-446655440001 \
  -H "Authorization: Bearer pf_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "role": "admin"
  }'
```

---

#### DELETE /organizations/{id}/members/{memberId}

Remove a member from the organization.

**Authentication:** Required

**Path Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | uuid | Organization ID |
| `memberId` | uuid | Member ID (organization_members.id) |

**Permission Rules:**
- Users can remove themselves (leave organization), except owners
- Owners and admins can remove other members
- Admins cannot remove owners or other admins
- Owners cannot leave their organization (must delete it or transfer ownership)

**Success Response (200)**
```json
{
  "success": true,
  "data": {
    "message": "Member removed successfully"
  }
}
```

Or when removing yourself:
```json
{
  "success": true,
  "data": {
    "message": "You have left the organization"
  }
}
```

**Error Responses**
- `401` - Not authenticated
- `403` - Insufficient permissions or owner trying to leave
- `404` - Organization or member not found

**Example**
```bash
curl -X DELETE https://api.planflow.tools/organizations/990e8400-e29b-41d4-a716-446655440000/members/aa0e8400-e29b-41d4-a716-446655440001 \
  -H "Authorization: Bearer pf_abc123..."
```

---

### Invitations

Manage team invitations for organizations.

---

#### POST /organizations/{id}/invitations

Create a new invitation to join the organization. Automatically sends an invitation email.

**Authentication:** Required

**Path Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | uuid | Organization ID |

**Request Body**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Email address of the invitee |
| `role` | string | No | Role for the invitee: `admin`, `editor` (default), or `viewer` |

**Request**
```json
{
  "email": "newmember@example.com",
  "role": "editor"
}
```

**Success Response (201)**
```json
{
  "success": true,
  "data": {
    "invitation": {
      "id": "bb0e8400-e29b-41d4-a716-446655440000",
      "organizationId": "990e8400-e29b-41d4-a716-446655440000",
      "email": "newmember@example.com",
      "role": "editor",
      "invitedBy": "550e8400-e29b-41d4-a716-446655440000",
      "token": "a1b2c3d4e5f6...",
      "expiresAt": "2026-02-06T12:00:00.000Z",
      "acceptedAt": null,
      "createdAt": "2026-01-30T12:00:00.000Z"
    }
  }
}
```

**Error Responses**
- `400` - Invalid email format
- `401` - Not authenticated
- `403` - Insufficient permissions (only owner/admin can invite)
- `404` - Organization not found
- `409` - User is already a member or has a pending invitation

**Example**
```bash
curl -X POST https://api.planflow.tools/organizations/990e8400-e29b-41d4-a716-446655440000/invitations \
  -H "Authorization: Bearer pf_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newmember@example.com",
    "role": "editor"
  }'
```

---

#### GET /organizations/{id}/invitations

List all pending invitations for the organization.

**Authentication:** Required

**Path Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | uuid | Organization ID |

**Success Response (200)**
```json
{
  "success": true,
  "data": {
    "invitations": [
      {
        "id": "bb0e8400-e29b-41d4-a716-446655440000",
        "organizationId": "990e8400-e29b-41d4-a716-446655440000",
        "email": "newmember@example.com",
        "role": "editor",
        "invitedBy": "550e8400-e29b-41d4-a716-446655440000",
        "token": "a1b2c3d4e5f6...",
        "expiresAt": "2026-02-06T12:00:00.000Z",
        "acceptedAt": null,
        "createdAt": "2026-01-30T12:00:00.000Z",
        "inviterName": "John Doe"
      }
    ]
  }
}
```

> **Note:** Only shows non-accepted, non-expired invitations. Sorted by creation date (newest first).

**Error Responses**
- `401` - Not authenticated
- `404` - Organization not found or user is not a member

**Example**
```bash
curl https://api.planflow.tools/organizations/990e8400-e29b-41d4-a716-446655440000/invitations \
  -H "Authorization: Bearer pf_abc123..."
```

---

#### DELETE /organizations/{id}/invitations/{invitationId}

Revoke a pending invitation.

**Authentication:** Required

**Path Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | uuid | Organization ID |
| `invitationId` | uuid | Invitation ID |

**Success Response (200)**
```json
{
  "success": true,
  "data": {
    "message": "Invitation revoked successfully"
  }
}
```

**Error Responses**
- `401` - Not authenticated
- `403` - Insufficient permissions (only owner/admin can revoke)
- `404` - Invitation not found or already accepted

**Example**
```bash
curl -X DELETE https://api.planflow.tools/organizations/990e8400-e29b-41d4-a716-446655440000/invitations/bb0e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer pf_abc123..."
```

---

#### POST /invitations/{token}/accept

Accept an invitation and join the organization.

**Authentication:** Required

**Path Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `token` | string | Invitation token (64-character hex string) |

**Validation Rules:**
- Token must exist and not be expired
- Invitation must not already be accepted
- Authenticated user's email must match the invitation email

**Success Response (200)**
```json
{
  "success": true,
  "data": {
    "organization": {
      "id": "990e8400-e29b-41d4-a716-446655440000",
      "name": "My Team",
      "slug": "my-team",
      "description": "Our development team",
      "createdBy": "550e8400-e29b-41d4-a716-446655440000",
      "createdAt": "2026-01-30T12:00:00.000Z",
      "updatedAt": "2026-01-30T12:00:00.000Z"
    }
  }
}
```

**Error Responses**
- `400` - Invalid token format
- `401` - Not authenticated or email mismatch
- `404` - Invitation not found
- `409` - Invitation already accepted
- `410` - Invitation expired

**Example**
```bash
curl -X POST https://api.planflow.tools/invitations/a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2/accept \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

---

#### POST /invitations/{token}/decline

Decline an invitation.

**Authentication:** Required

**Path Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `token` | string | Invitation token |

**Success Response (200)**
```json
{
  "success": true,
  "data": {
    "message": "Invitation declined successfully"
  }
}
```

**Error Responses**
- `401` - Not authenticated or email mismatch
- `404` - Invitation not found

**Example**
```bash
curl -X POST https://api.planflow.tools/invitations/a1b2c3d4e5f6.../decline \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

---

### Activity Log

Track organization activity for audit and monitoring.

---

#### GET /organizations/{id}/activity

Get the activity log for an organization.

**Authentication:** Required

**Path Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | uuid | Organization ID |

**Query Parameters**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 50 | Items per page (1-100) |
| `offset` | integer | 0 | Number of items to skip |
| `action` | string | - | Filter by action type |
| `entityType` | string | - | Filter by entity type |
| `actorId` | uuid | - | Filter by actor (user) |

**Action Types:**
- `member_invited` - When an invitation is created
- `member_joined` - When an invitation is accepted
- `member_removed` - When a member is removed
- `member_role_changed` - When a member's role is updated

**Entity Types:**
- `organization`
- `member`
- `invitation`

**Success Response (200)**
```json
{
  "success": true,
  "data": {
    "activities": [
      {
        "id": "cc0e8400-e29b-41d4-a716-446655440000",
        "action": "member_joined",
        "entityType": "member",
        "entityId": "aa0e8400-e29b-41d4-a716-446655440001",
        "taskId": null,
        "organizationId": "990e8400-e29b-41d4-a716-446655440000",
        "projectId": null,
        "taskUuid": null,
        "metadata": {
          "role": "editor"
        },
        "description": "Jane Smith joined the organization",
        "createdAt": "2026-01-30T14:00:00.000Z",
        "actor": {
          "id": "550e8400-e29b-41d4-a716-446655440001",
          "email": "jane@example.com",
          "name": "Jane Smith"
        }
      },
      {
        "id": "cc0e8400-e29b-41d4-a716-446655440001",
        "action": "member_invited",
        "entityType": "invitation",
        "entityId": "bb0e8400-e29b-41d4-a716-446655440000",
        "taskId": null,
        "organizationId": "990e8400-e29b-41d4-a716-446655440000",
        "projectId": null,
        "taskUuid": null,
        "metadata": {
          "email": "jane@example.com",
          "role": "editor"
        },
        "description": "Invited jane@example.com as editor",
        "createdAt": "2026-01-30T12:00:00.000Z",
        "actor": {
          "id": "550e8400-e29b-41d4-a716-446655440000",
          "email": "john@example.com",
          "name": "John Doe"
        }
      }
    ],
    "pagination": {
      "total": 2,
      "limit": 50,
      "offset": 0,
      "hasMore": false
    }
  }
}
```

**Error Responses**
- `401` - Not authenticated
- `404` - Organization not found or user is not a member

**Example**
```bash
# Get all activity
curl "https://api.planflow.tools/organizations/990e8400-e29b-41d4-a716-446655440000/activity?limit=50&offset=0" \
  -H "Authorization: Bearer pf_abc123..."

# Filter by action
curl "https://api.planflow.tools/organizations/990e8400-e29b-41d4-a716-446655440000/activity?action=member_joined" \
  -H "Authorization: Bearer pf_abc123..."

# Filter by actor
curl "https://api.planflow.tools/organizations/990e8400-e29b-41d4-a716-446655440000/activity?actorId=550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer pf_abc123..."
```

---

## Schemas

### User

```typescript
interface User {
  id: string;          // UUID
  email: string;       // Valid email
  name: string;        // User's display name
  createdAt: string;   // ISO 8601 datetime
  updatedAt: string;   // ISO 8601 datetime
}
```

### Project

```typescript
interface Project {
  id: string;              // UUID
  name: string;            // 1-255 characters
  description?: string;    // Max 2000 characters
  plan?: string;           // Markdown content
  createdAt: string;       // ISO 8601 datetime
  updatedAt: string;       // ISO 8601 datetime
}
```

### Task

```typescript
interface Task {
  id: string;              // UUID
  taskId: string;          // Human-readable (e.g., "T1.1")
  name: string;            // Task name
  description?: string;    // Task description
  status: TaskStatus;      // See below
  complexity: Complexity;  // See below
  estimatedHours?: number; // Estimated hours
  dependencies: string[];  // Array of taskIds
  createdAt: string;       // ISO 8601 datetime
  updatedAt: string;       // ISO 8601 datetime
}

type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
type Complexity = 'Low' | 'Medium' | 'High';
```

### ApiToken

```typescript
interface ApiToken {
  id: string;              // UUID
  name: string;            // Token name
  lastUsedAt?: string;     // ISO 8601 datetime
  expiresAt?: string;      // ISO 8601 datetime (null = never)
  isRevoked: boolean;      // Whether token is revoked
  createdAt: string;       // ISO 8601 datetime
}
```

### Organization

```typescript
interface Organization {
  id: string;              // UUID
  name: string;            // 1-255 characters
  slug: string;            // URL-friendly identifier (alphanumeric + hyphens)
  description?: string;    // Max 2000 characters
  createdBy: string;       // UUID of the creator
  createdAt: string;       // ISO 8601 datetime
  updatedAt: string;       // ISO 8601 datetime
  role?: OrgMemberRole;    // User's role (included when listing)
}
```

### OrganizationMember

```typescript
interface OrganizationMember {
  id: string;              // UUID (membership record ID)
  organizationId: string;  // UUID
  userId: string;          // UUID
  role: OrgMemberRole;     // Member's role
  createdAt: string;       // ISO 8601 datetime
  updatedAt: string;       // ISO 8601 datetime
  userName: string;        // User's display name
  userEmail: string;       // User's email
}

type OrgMemberRole = 'owner' | 'admin' | 'editor' | 'viewer';
```

### Invitation

```typescript
interface Invitation {
  id: string;              // UUID
  organizationId: string;  // UUID
  email: string;           // Invitee's email
  role: OrgMemberRole;     // Role to assign (not 'owner')
  invitedBy: string;       // UUID of inviter
  token: string;           // 64-character hex token
  expiresAt: string;       // ISO 8601 datetime (7 days from creation)
  acceptedAt?: string;     // ISO 8601 datetime (null until accepted)
  createdAt: string;       // ISO 8601 datetime
  inviterName?: string;    // Inviter's display name (in list response)
}
```

### ActivityLog

```typescript
interface ActivityLog {
  id: string;              // UUID
  action: ActivityAction;  // Action type
  entityType: ActivityEntity; // Entity type
  entityId?: string;       // UUID of affected entity
  taskId?: string;         // Human-readable task ID (e.g., "T1.1")
  actorId: string;         // UUID of user who performed action
  organizationId?: string; // UUID (for org-level activities)
  projectId?: string;      // UUID (for project-level activities)
  taskUuid?: string;       // UUID (for task-level activities)
  metadata?: object;       // Additional context (JSON)
  description?: string;    // Human-readable description
  createdAt: string;       // ISO 8601 datetime
  actor: {                 // Actor details
    id: string;
    email: string;
    name: string;
  };
}

type ActivityAction =
  | 'member_invited'
  | 'member_joined'
  | 'member_removed'
  | 'member_role_changed'
  | 'task_created'
  | 'task_updated'
  | 'task_assigned'
  | 'comment_created';

type ActivityEntity =
  | 'organization'
  | 'member'
  | 'invitation'
  | 'project'
  | 'task'
  | 'comment';
```

### Pagination

```typescript
interface Pagination {
  page?: number;           // Current page (1-indexed)
  limit: number;           // Items per page
  totalCount?: number;     // Total items
  totalPages?: number;     // Total pages
  hasNextPage?: boolean;   // More items available
  hasPrevPage?: boolean;   // Previous items available
  offset?: number;         // Items skipped (alternative to page)
  total?: number;          // Total items (alternative to totalCount)
  hasMore?: boolean;       // More items available (alternative)
}
```

### Error

```typescript
interface ErrorResponse {
  success: false;
  error: string;           // Error message
  details?: {              // Field-level validation errors
    [field: string]: string[];
  };
}
```

---

## Interactive Documentation

For interactive API exploration, visit:

- **Swagger UI:** `https://api.planflow.tools/docs`
- **OpenAPI JSON:** `https://api.planflow.tools/openapi.json`

---

## SDK & Tools

### MCP Server

Install the PlanFlow MCP server for Claude Code integration:

```bash
npm install -g @planflow/mcp
```

See [MCP Installation Guide](./MCP_INSTALLATION.md) for configuration.

### curl Examples

All examples in this documentation use curl. Replace:
- `https://api.planflow.tools` with `http://localhost:3001` for local development
- `Bearer pf_abc123...` with your actual API token

---

## Support

- **Documentation:** [docs.planflow.tools](https://docs.planflow.tools)
- **GitHub Issues:** [github.com/planflow/planflow/issues](https://github.com/planflow/planflow/issues)
- **Email:** support@planflow.tools
