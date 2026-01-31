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
