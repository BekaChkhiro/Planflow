# PlanFlow Architecture

> Technical architecture overview for developers

**Last Updated:** 2026-02-24

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Monorepo Structure](#monorepo-structure)
3. [Backend Architecture](#backend-architecture)
4. [Frontend Architecture](#frontend-architecture)
5. [MCP Server Architecture](#mcp-server-architecture)
6. [Database Design](#database-design)
7. [Real-time Architecture](#real-time-architecture)
8. [Authentication & Security](#authentication--security)
9. [External Integrations](#external-integrations)
10. [Infrastructure & Deployment](#infrastructure--deployment)
11. [Data Flow](#data-flow)

---

## System Overview

PlanFlow is an AI-native project management tool built for Claude Code, enabling developers to manage tasks without leaving the terminal. The system consists of four main components:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PlanFlow Architecture                              │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────┐
                              │   Claude    │
                              │    Code     │
                              └──────┬──────┘
                                     │ MCP Protocol
                                     ▼
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   Web Client    │         │   MCP Server    │         │  Mobile Client  │
│   (Next.js)     │         │   (Node.js)     │         │   (Future)      │
└────────┬────────┘         └────────┬────────┘         └────────┬────────┘
         │                           │                           │
         │ HTTPS                     │ HTTPS                     │
         │                           │                           │
         └───────────────────────────┼───────────────────────────┘
                                     │
                              ┌──────▼──────┐
                              │   API       │
                              │   (Hono)    │
                              ├─────────────┤
                              │  WebSocket  │
                              │  Server     │
                              └──────┬──────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
       ┌──────▼──────┐        ┌──────▼──────┐        ┌──────▼──────┐
       │ PostgreSQL  │        │    Redis    │        │   Resend    │
       │   (Neon)    │        │   (Cache)   │        │   (Email)   │
       └─────────────┘        └─────────────┘        └─────────────┘
```

### Key Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| **API Server** | Hono + Node.js | REST API, WebSocket server, business logic |
| **Web Dashboard** | Next.js 14 | User interface for project management |
| **MCP Server** | Node.js + MCP SDK | Claude Code integration |
| **Database** | PostgreSQL (Neon) | Persistent data storage |
| **Cache/PubSub** | Redis | Rate limiting, caching, real-time pub/sub |
| **Email** | Resend | Transactional emails, notifications |

---

## Monorepo Structure

PlanFlow uses a **Turborepo** monorepo with **pnpm** workspaces for efficient package management and build orchestration.

```
planflow/
├── apps/
│   ├── api/                    # Backend API server
│   │   ├── src/
│   │   │   ├── db/             # Database schema & client
│   │   │   │   ├── schema/     # Drizzle ORM table definitions
│   │   │   │   ├── client.ts   # Database client
│   │   │   │   └── index.ts    # DB exports
│   │   │   ├── routes/         # API route handlers
│   │   │   ├── services/       # Business logic layer
│   │   │   ├── repositories/   # Data access layer
│   │   │   ├── middleware/     # Auth, security, logging
│   │   │   ├── websocket/      # WebSocket server & managers
│   │   │   ├── lib/            # Utilities, integrations
│   │   │   └── index.ts        # Entry point
│   │   └── package.json
│   │
│   └── web/                    # Next.js web application
│       ├── src/
│       │   ├── app/            # Next.js App Router pages
│       │   ├── components/     # Reusable UI components
│       │   ├── hooks/          # Custom React hooks
│       │   ├── lib/            # Utilities, API client
│       │   └── stores/         # Zustand state stores
│       └── package.json
│
├── packages/
│   ├── mcp/                    # MCP Server for Claude Code
│   │   ├── src/
│   │   │   ├── tools/          # MCP tool implementations
│   │   │   ├── api-client.ts   # API client wrapper
│   │   │   ├── config.ts       # Config management
│   │   │   └── server.ts       # MCP server setup
│   │   └── package.json
│   │
│   └── shared/                 # Shared types & utilities
│       ├── src/
│       │   ├── types/          # TypeScript type definitions
│       │   └── constants/      # Shared constants
│       └── package.json
│
├── docs/                       # Documentation
├── scripts/                    # Build & deployment scripts
├── turbo.json                  # Turborepo configuration
├── pnpm-workspace.yaml         # pnpm workspace config
└── package.json                # Root package.json
```

### Turborepo Tasks

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": { "dependsOn": ["^build"] },
    "typecheck": { "dependsOn": ["^build"] },
    "test:e2e": { "dependsOn": ["build"] }
  }
}
```

### Package Dependencies

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   @planflow/web │     │  @planflow/api  │     │  @planflow/mcp  │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                          ┌──────▼──────┐
                          │ @planflow/  │
                          │   shared    │
                          └─────────────┘
```

---

## Backend Architecture

The backend follows a **layered architecture** pattern for maintainability and testability.

### Layer Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                         Routes Layer                             │
│  (Request handling, validation, response formatting)             │
├─────────────────────────────────────────────────────────────────┤
│                        Services Layer                            │
│  (Business logic, orchestration, transactions)                   │
├─────────────────────────────────────────────────────────────────┤
│                      Repositories Layer                          │
│  (Data access, queries, database operations)                     │
├─────────────────────────────────────────────────────────────────┤
│                        Database Layer                            │
│  (Drizzle ORM, PostgreSQL connection)                           │
└─────────────────────────────────────────────────────────────────┘
```

### Routes (`apps/api/src/routes/`)

Route handlers use **Hono** for HTTP handling with middleware composition:

```typescript
// Example: apps/api/src/routes/projects.routes.ts
import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import { projectService } from '../services/project.service.js'

const app = new Hono()

app.use('/*', authMiddleware)

app.get('/', async (c) => {
  const userId = c.get('userId')
  const projects = await projectService.listProjects(userId)
  return c.json({ success: true, data: { projects } })
})

export default app
```

**Route Modules:**
- `auth.routes.ts` - Authentication (login, register, refresh)
- `projects.routes.ts` - Project CRUD, tasks, plan sync
- `organizations.routes.ts` - Team management, invitations
- `notifications.routes.ts` - User notifications
- `integrations.routes.ts` - GitHub, Slack, Discord
- `webhooks.routes.ts` - External webhook handlers

### Services (`apps/api/src/services/`)

Services contain business logic and orchestrate operations:

```typescript
// Example: apps/api/src/services/project.service.ts
export class ProjectService {
  async createProject(userId: string, data: CreateProjectInput) {
    // Business logic validation
    await this.validateUserQuota(userId)

    // Use repository for data access
    const project = await projectRepository.create({
      ...data,
      ownerId: userId,
    })

    // Trigger side effects
    await activityLogService.log({
      type: 'project_created',
      projectId: project.id,
      userId,
    })

    return project
  }
}
```

**Service Modules:**
- `auth.service.ts` - JWT, password hashing, token refresh
- `user.service.ts` - User profile management
- `project.service.ts` - Project operations
- `organization.service.ts` - Team management
- `notification.service.ts` - Notification delivery
- `subscription.service.ts` - Payment/subscription handling
- `webhook.service.ts` - External webhook processing

### Repositories (`apps/api/src/repositories/`)

Repositories abstract database operations:

```typescript
// Example: apps/api/src/repositories/project.repository.ts
export class ProjectRepository extends BaseRepository {
  async findByUserId(userId: string) {
    return db
      .select()
      .from(projects)
      .where(eq(projects.ownerId, userId))
      .orderBy(desc(projects.updatedAt))
  }

  async create(data: NewProject) {
    const [project] = await db
      .insert(projects)
      .values(data)
      .returning()
    return project
  }
}
```

### Middleware (`apps/api/src/middleware/`)

```typescript
// Auth Middleware - JWT verification
export const authMiddleware = async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  const payload = verifyJWT(token)
  c.set('userId', payload.userId)
  await next()
}

// Security Middleware - CORS, rate limiting
export const securityMiddleware = cors({
  origin: (origin) => validateOrigin(origin),
  credentials: true,
})
```

### Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Framework | Hono | Fast, lightweight HTTP framework |
| ORM | Drizzle ORM | Type-safe SQL query builder |
| Validation | Zod | Runtime type validation |
| Auth | JWT + bcrypt | Token-based authentication |
| Logging | Pino | Structured JSON logging |
| Monitoring | Sentry | Error tracking |

---

## Frontend Architecture

The web dashboard is built with **Next.js 14** using the App Router.

### Directory Structure

```
apps/web/src/
├── app/                        # Next.js App Router
│   ├── (auth)/                 # Auth route group
│   │   ├── login/
│   │   ├── register/
│   │   └── forgot-password/
│   ├── dashboard/              # Protected dashboard
│   │   ├── projects/
│   │   │   ├── [id]/           # Dynamic project pages
│   │   │   │   ├── components/ # Page-specific components
│   │   │   │   └── page.tsx
│   │   │   └── page.tsx
│   │   ├── team/
│   │   ├── notifications/
│   │   └── settings/
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Landing page
│   └── providers.tsx           # Context providers
│
├── components/
│   ├── ui/                     # shadcn/ui components
│   ├── layout/                 # Layout components
│   └── features/               # Feature-specific components
│
├── hooks/
│   ├── use-auth.ts             # Authentication hook
│   ├── use-websocket.ts        # WebSocket connection
│   └── use-projects.ts         # Project data hook
│
├── lib/
│   ├── api.ts                  # API client
│   ├── utils.ts                # Utility functions
│   └── constants.ts
│
└── stores/
    ├── auth-store.ts           # Auth state (Zustand)
    └── notification-store.ts   # Notification state
```

### State Management

PlanFlow uses a combination of state management solutions:

```
┌─────────────────────────────────────────────────────────────────┐
│                      State Management                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────┐    ┌───────────────┐    ┌───────────────┐   │
│  │    Zustand    │    │  React Query  │    │   React       │   │
│  │  (Client)     │    │  (Server)     │    │   State       │   │
│  │               │    │               │    │               │   │
│  │ • Auth state  │    │ • API data    │    │ • UI state    │   │
│  │ • UI prefs    │    │ • Caching     │    │ • Form state  │   │
│  │ • Real-time   │    │ • Mutations   │    │ • Local only  │   │
│  └───────────────┘    └───────────────┘    └───────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Zustand** - Client-side global state:
```typescript
// stores/auth-store.ts
export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,
  login: (user) => set({ user, isAuthenticated: true }),
  logout: () => set({ user: null, isAuthenticated: false }),
}))
```

**React Query** - Server state management:
```typescript
// hooks/use-projects.ts
export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects'),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
```

### UI Components

Built with **shadcn/ui** and **Radix UI** primitives:

| Category | Components |
|----------|------------|
| Layout | Dialog, Dropdown, Popover, Tabs |
| Forms | Input, Select, Checkbox, Switch |
| Feedback | Toast, Alert, Tooltip |
| Data | Table (custom), Cards |
| Navigation | Sidebar, Breadcrumb |

### Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Framework | Next.js 14 | React framework with App Router |
| Styling | Tailwind CSS | Utility-first CSS |
| Components | shadcn/ui + Radix | Accessible UI components |
| State | Zustand + React Query | Client & server state |
| Forms | React Hook Form + Zod | Form handling & validation |
| Icons | Lucide React | Icon library |

---

## MCP Server Architecture

The MCP (Model Context Protocol) server enables Claude Code to interact with PlanFlow.

### Structure

```
packages/mcp/src/
├── index.ts            # Entry point
├── server.ts           # MCP server setup
├── config.ts           # Configuration management
├── api-client.ts       # PlanFlow API client
├── errors.ts           # Error handling
├── logger.ts           # Logging
└── tools/
    ├── index.ts        # Tool registration
    ├── types.ts        # Tool type definitions
    ├── login.ts        # planflow_login tool
    ├── logout.ts       # planflow_logout tool
    ├── whoami.ts       # planflow_whoami tool
    ├── projects.ts     # planflow_projects tool
    ├── create.ts       # planflow_create tool
    ├── sync.ts         # planflow_sync tool
    ├── task-list.ts    # planflow_task_list tool
    ├── task-update.ts  # planflow_task_update tool
    ├── task-next.ts    # planflow_task_next tool
    ├── notifications.ts # planflow_notifications tool
    ├── comment.ts      # planflow_comment tool
    ├── comments.ts     # planflow_comments tool
    └── activity.ts     # planflow_activity tool
```

### MCP Protocol Flow

```
┌─────────────────┐                    ┌─────────────────┐
│   Claude Code   │                    │   MCP Server    │
│                 │                    │  (@planflow/mcp)│
└────────┬────────┘                    └────────┬────────┘
         │                                      │
         │  1. Tool Discovery                   │
         │ ─────────────────────────────────────▶
         │                                      │
         │  2. Available Tools Response         │
         │ ◀─────────────────────────────────────
         │                                      │
         │  3. Tool Call (e.g., planflow_sync)  │
         │ ─────────────────────────────────────▶
         │                                      │
         │                              ┌───────▼───────┐
         │                              │  API Client   │
         │                              │  HTTP Request │
         │                              └───────┬───────┘
         │                                      │
         │                              ┌───────▼───────┐
         │                              │ PlanFlow API  │
         │                              └───────┬───────┘
         │                                      │
         │  4. Tool Result                      │
         │ ◀─────────────────────────────────────
         │                                      │
```

### Available Tools

| Tool | Purpose |
|------|---------|
| `planflow_login` | Authenticate with API token |
| `planflow_logout` | Clear stored credentials |
| `planflow_whoami` | Show current user info |
| `planflow_projects` | List user projects |
| `planflow_create` | Create new project |
| `planflow_sync` | Push/pull plan changes |
| `planflow_task_list` | List project tasks |
| `planflow_task_update` | Update task status |
| `planflow_task_next` | Get recommended next task |
| `planflow_notifications` | View notifications |
| `planflow_comment` | Add task comment |
| `planflow_comments` | View task comments |
| `planflow_activity` | View project activity |

### Configuration Storage

```typescript
// Config file: ~/.config/claude/plan-plugin-config.json
{
  "language": "en",
  "cloud": {
    "apiUrl": "https://api.planflow.tools",
    "apiToken": "pf_xxx...",
    "userId": "uuid",
    "userEmail": "user@example.com"
  }
}

// Project-specific: ./.plan-config.json
{
  "cloud": {
    "projectId": "uuid",
    "autoSync": true,
    "lastSyncedAt": "2026-01-01T00:00:00Z"
  }
}
```

---

## Database Design

PlanFlow uses **PostgreSQL** (hosted on Neon) with **Drizzle ORM**.

### Schema Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Database Schema                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│   users     │────▶│ organization_   │────▶│organizations│
│             │     │    members      │     │             │
└──────┬──────┘     └─────────────────┘     └──────┬──────┘
       │                                          │
       │            ┌─────────────────┐           │
       │            │team_invitations │◀──────────┘
       │            └─────────────────┘
       │
       ├───────────▶┌─────────────────┐
       │            │    projects     │
       │            └────────┬────────┘
       │                     │
       │            ┌────────▼────────┐
       │            │     tasks       │
       │            └────────┬────────┘
       │                     │
       │            ┌────────▼────────┐
       │            │    comments     │
       │            └─────────────────┘
       │
       ├───────────▶┌─────────────────┐
       │            │   api_tokens    │
       │            └─────────────────┘
       │
       ├───────────▶┌─────────────────┐
       │            │ subscriptions   │
       │            └─────────────────┘
       │
       ├───────────▶┌─────────────────┐
       │            │ notifications   │
       │            └─────────────────┘
       │
       └───────────▶┌─────────────────┐
                    │ refresh_tokens  │
                    └─────────────────┘
```

### Core Tables

#### Users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Organizations
```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  owner_id UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  user_id UUID REFERENCES users(id),
  role VARCHAR(50) DEFAULT 'editor', -- owner, admin, editor, viewer
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);
```

#### Projects
```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  plan_content TEXT, -- Markdown plan
  owner_id UUID REFERENCES users(id),
  organization_id UUID REFERENCES organizations(id),
  archived_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Tasks
```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  task_id VARCHAR(50) NOT NULL, -- e.g., "T1.1"
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'TODO', -- TODO, IN_PROGRESS, DONE, BLOCKED
  complexity VARCHAR(50), -- Low, Medium, High
  estimated_hours DECIMAL,
  dependencies TEXT[], -- Array of task_ids
  assignee_id UUID REFERENCES users(id),
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, task_id)
);
```

### Indexes

```sql
-- Performance indexes
CREATE INDEX idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX idx_activity_log_project_created ON activity_log(project_id, created_at);
CREATE INDEX idx_notifications_user_read ON notifications(user_id, read_at);
CREATE INDEX idx_projects_owner ON projects(owner_id);
CREATE INDEX idx_org_members_user ON organization_members(user_id);
```

---

## Real-time Architecture

PlanFlow uses **WebSocket** for real-time features with **Redis** for pub/sub scaling.

### WebSocket Server

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WebSocket Architecture                               │
└─────────────────────────────────────────────────────────────────────────────┘

  Client A                 Client B                 Client C
     │                        │                        │
     │  WS + JWT              │  WS + JWT              │  WS + JWT
     │  (subprotocol)         │  (subprotocol)         │  (subprotocol)
     ▼                        ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          WebSocket Server                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     Connection Manager                               │    │
│  │  • Client registry                                                   │    │
│  │  • Project room mapping                                              │    │
│  │  • Message routing                                                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Presence   │  │  Working On  │  │   Typing     │  │  Task Lock   │    │
│  │   Manager    │  │   Manager    │  │   Manager    │  │   Manager    │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                          ┌──────────────────┐
                          │      Redis       │
                          │    Pub/Sub       │
                          │  (Scaling)       │
                          └──────────────────┘
```

### WebSocket Events

| Event | Direction | Purpose |
|-------|-----------|---------|
| `presence:joined` | Server → Client | User joined project |
| `presence:left` | Server → Client | User left project |
| `presence:list` | Server → Client | Current online users |
| `working_on:changed` | Both | Task being worked on |
| `typing:start` | Client → Server | User started typing |
| `typing:stop` | Client → Server | User stopped typing |
| `task:updated` | Server → Client | Task status changed |
| `task:locked` | Server → Client | Task locked by user |
| `task:unlocked` | Server → Client | Task lock released |
| `notification:new` | Server → Client | New notification |

### Authentication (Secure Token via Subprotocol)

```typescript
// Client connection
const ws = new WebSocket(
  `wss://api.planflow.tools/ws?projectId=${projectId}`,
  [`access_token.${jwt}`, 'planflow-v1']
)

// Server extraction
function extractTokenFromProtocol(request) {
  const protocols = request.headers['sec-websocket-protocol']
  for (const protocol of protocols) {
    if (protocol.startsWith('access_token.')) {
      return protocol.substring('access_token.'.length)
    }
  }
  return null
}
```

### Task Locking (Conflict Prevention)

```typescript
// T6.6: Prevent concurrent edits
const lockManager = {
  locks: new Map<string, { userId: string; expiresAt: Date }>(),

  async acquire(taskId: string, userId: string): Promise<boolean> {
    const existing = this.locks.get(taskId)
    if (existing && existing.userId !== userId && existing.expiresAt > new Date()) {
      return false // Locked by another user
    }
    this.locks.set(taskId, {
      userId,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 min
    })
    return true
  },

  async release(taskId: string, userId: string): Promise<void> {
    const lock = this.locks.get(taskId)
    if (lock?.userId === userId) {
      this.locks.delete(taskId)
    }
  }
}
```

---

## Authentication & Security

### JWT Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Authentication Flow                                  │
└─────────────────────────────────────────────────────────────────────────────┘

  1. Login Request                    2. JWT Issued
  ──────────────────────────────      ──────────────────────────────
  POST /auth/login                    {
  { email, password }                   accessToken: "eyJ...",  (15min)
                                        refreshToken: "eyJ...", (7days)
                                      }

  3. API Request                      4. Token Refresh
  ──────────────────────────────      ──────────────────────────────
  Authorization: Bearer {accessToken}  POST /auth/refresh
                                       { refreshToken }
                                       → New accessToken
```

### Token Types

| Token | Lifetime | Storage | Purpose |
|-------|----------|---------|---------|
| Access Token | 15 min | Memory/Cookie | API authentication |
| Refresh Token | 7 days | HttpOnly Cookie | Token refresh |
| API Token | No expiry | Config file | MCP server auth |

### Security Measures

1. **CORS Validation** (T10.2)
   ```typescript
   const ALLOWED_ORIGINS = [
     /^https:\/\/planflow\.tools$/,
     /^https:\/\/[a-z0-9-]+\.up\.railway\.app$/,
     /^http:\/\/localhost:\d+$/
   ]
   ```

2. **Rate Limiting** (T10.4)
   ```typescript
   // Redis-based rate limiting
   const rateLimiter = {
     window: 60 * 1000, // 1 minute
     max: 100, // requests
     keyPrefix: 'ratelimit:'
   }
   ```

3. **Password Hashing**
   ```typescript
   // bcrypt with salt rounds
   const SALT_ROUNDS = 12
   const hash = await bcrypt.hash(password, SALT_ROUNDS)
   ```

4. **Environment Validation** (T10.3, T10.10)
   ```typescript
   const requiredEnvVars = [
     'DATABASE_URL',
     'JWT_SECRET',
     'REDIS_URL',
   ]
   ```

---

## External Integrations

### GitHub Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GitHub Integration                                   │
└─────────────────────────────────────────────────────────────────────────────┘

  1. OAuth Authorization              2. Repository Linking
  ──────────────────────────          ──────────────────────────
  /auth/github → GitHub OAuth         Store: owner/repo mapping
  ← GitHub callback with code         Enable: issue/PR features
  → Exchange for access token

  3. Task → GitHub Issue              4. PR Merge → Task Done
  ──────────────────────────          ──────────────────────────
  POST /integrations/github/issue     Webhook: pull_request.merged
  → Create GitHub Issue               → Parse task ID from PR
  ← Link issue URL to task            → Update task status to DONE
                                      → Log activity
```

### Slack/Discord Webhooks

```typescript
// Notification delivery
async function sendSlackNotification(webhookUrl: string, event: TaskEvent) {
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${event.taskId}* completed by ${event.userName}`
          }
        }
      ]
    })
  })
}
```

---

## Infrastructure & Deployment

### Hosting Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Infrastructure                                     │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────┐
                              │  Cloudflare │
                              │     DNS     │
                              └──────┬──────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
       ┌──────▼──────┐        ┌──────▼──────┐        ┌──────▼──────┐
       │   Vercel    │        │   Railway   │        │   Railway   │
       │ (Frontend)  │        │   (API)     │        │   (Redis)   │
       │             │        │             │        │             │
       │ Next.js     │        │ Node.js     │        │ Redis       │
       │ Static/SSR  │        │ Hono        │        │ Caching     │
       └─────────────┘        └──────┬──────┘        └─────────────┘
                                     │
                              ┌──────▼──────┐
                              │    Neon     │
                              │ PostgreSQL  │
                              │ (Serverless)│
                              └─────────────┘
```

### Environment Configuration

```bash
# API (.env)
DATABASE_URL=postgresql://...
JWT_SECRET=...
REDIS_URL=redis://...
RESEND_API_KEY=...
SENTRY_DSN=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# Web (.env.local)
NEXT_PUBLIC_API_URL=https://api.planflow.tools
NEXT_PUBLIC_WS_URL=wss://api.planflow.tools
NEXT_PUBLIC_POSTHOG_KEY=...
```

### CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm build
      - run: pnpm test:e2e
```

---

## Data Flow

### Plan Sync Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Plan Sync Data Flow                                  │
└─────────────────────────────────────────────────────────────────────────────┘

  Local (PROJECT_PLAN.md)             Cloud (Database)
  ────────────────────────            ────────────────────────

  1. /planUpdate T1.1 done
     │
     ▼
  2. Parse & update local file
     │
     ▼
  3. Check autoSync config
     │
     ├── autoSync: false → Done (local only)
     │
     └── autoSync: true
         │
         ▼
  4. PATCH /projects/:id/tasks/:taskId ──────────▶ 5. Validate & update
     { status: "DONE" }                               │
                                                      ▼
                                               6. Broadcast via WebSocket
                                                      │
  7. ◀─────────────────────────────────────────────────
     Update confirmation
```

### Task Assignment Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Task Assignment Data Flow                               │
└─────────────────────────────────────────────────────────────────────────────┘

  User A (Assigner)                   Server                    User B (Assignee)
  ─────────────────                   ──────                    ─────────────────

  1. POST /tasks/:id/assign
     { assigneeId: userB }
              │
              ▼
              ├──────────────────▶ 2. Validate permissions
              │                       │
              │                       ▼
              │                   3. Update database
              │                       │
              │                       ▼
              │                   4. Create notification
              │                       │
              │                       ├──────────────────▶ 5. Push notification
              │                       │                       (WebSocket)
              │                       │
              │                       ├──────────────────▶ 6. Email notification
              │                       │                       (Resend)
              │                       │
              ◀───────────────────────┤
  7. Success response
```

---

## Related Documentation

- [API Reference](./API_REFERENCE.md) - REST API endpoints
- [Real-time API](./API_REALTIME.md) - WebSocket events
- [MCP Installation](./MCP_INSTALLATION.md) - MCP server setup
- [Development Setup](./DEVELOPMENT.md) - Local development guide
- [Contributing](./CONTRIBUTING.md) - Contribution guidelines

---

*Generated for PlanFlow v0.1.0*
