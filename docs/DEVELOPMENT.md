# PlanFlow Development Guide

> Local development setup and common workflows

**Last Updated:** 2026-02-25

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Repository Setup](#repository-setup)
4. [Environment Configuration](#environment-configuration)
5. [Database Setup](#database-setup)
6. [Running the Development Servers](#running-the-development-servers)
7. [Project Structure](#project-structure)
8. [Development Workflows](#development-workflows)
9. [Testing](#testing)
10. [Code Quality](#code-quality)
11. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have the following installed:

### Required

| Software | Version | Installation |
|----------|---------|--------------|
| **Node.js** | 20.0.0+ | [nodejs.org](https://nodejs.org/) or use nvm |
| **pnpm** | 9.15.0+ | `npm install -g pnpm` |
| **Git** | Latest | [git-scm.com](https://git-scm.com/) |

### Recommended

| Software | Purpose | Installation |
|----------|---------|--------------|
| **nvm** | Node version management | [nvm-sh/nvm](https://github.com/nvm-sh/nvm) |
| **Docker** | Local Redis (optional) | [docker.com](https://www.docker.com/) |
| **VS Code** | IDE with extensions | [code.visualstudio.com](https://code.visualstudio.com/) |

### External Services (Free Tiers Available)

| Service | Purpose | Setup |
|---------|---------|-------|
| **Neon** | PostgreSQL database | [console.neon.tech](https://console.neon.tech) |
| **Resend** | Email (optional) | [resend.com](https://resend.com) |
| **GitHub OAuth** | GitHub integration (optional) | [github.com/settings/developers](https://github.com/settings/developers) |

---

## Quick Start

For experienced developers who want to get running quickly:

```bash
# 1. Clone and install
git clone https://github.com/planflow/planflow.git
cd planflow
pnpm install

# 2. Set up environment files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 3. Configure minimum required variables in apps/api/.env:
#    - DATABASE_URL (from Neon)
#    - JWT_SECRET (run: openssl rand -base64 48)

# 4. Run database migrations
pnpm db:migrate

# 5. Start development servers
pnpm dev

# 6. Open in browser
#    - Web: http://localhost:3000
#    - API: http://localhost:3001
```

---

## Repository Setup

### 1. Clone the Repository

```bash
git clone https://github.com/planflow/planflow.git
cd planflow
```

### 2. Install Node.js (if needed)

The project requires Node.js 20+. Check your version:

```bash
node --version
# Should be v20.0.0 or higher
```

If using nvm:

```bash
# The repo includes .nvmrc
nvm install
nvm use
```

### 3. Install pnpm

PlanFlow uses pnpm for package management:

```bash
# Install pnpm globally
npm install -g pnpm

# Verify installation
pnpm --version
# Should be 9.15.0 or higher
```

### 4. Install Dependencies

```bash
pnpm install
```

This installs dependencies for all workspaces:
- Root dev dependencies (Turborepo, TypeScript, ESLint)
- `apps/api` - Backend API server
- `apps/web` - Next.js frontend
- `packages/mcp` - MCP server for Claude Code
- `packages/shared` - Shared types and utilities

---

## Environment Configuration

PlanFlow uses separate environment files for each application.

### API Configuration (`apps/api/.env`)

Create the file:

```bash
cp apps/api/.env.example apps/api/.env
```

**Minimum Required Variables:**

```bash
# =============================================================================
# REQUIRED - The API will not start without these
# =============================================================================

# Database connection (get from Neon dashboard)
DATABASE_URL=postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/planflow?sslmode=require

# JWT secret (MUST be at least 32 characters)
# Generate: openssl rand -base64 48
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters-long
```

**Optional Variables for Full Functionality:**

```bash
# =============================================================================
# OPTIONAL - Enable additional features
# =============================================================================

# Server configuration
PORT=3001
NODE_ENV=development

# Application URLs
APP_URL=http://localhost:3000
API_URL=http://localhost:3001

# Email (Resend) - for notifications, invitations
RESEND_API_KEY=re_xxxx
RESEND_FROM_EMAIL=PlanFlow <notifications@planflow.tools>

# GitHub Integration
GITHUB_CLIENT_ID=Iv1.xxxx
GITHUB_CLIENT_SECRET=xxxx
GITHUB_REDIRECT_URI=http://localhost:3000/auth/github/callback

# Redis (for rate limiting, caching)
# Falls back to in-memory if not set
REDIS_URL=redis://localhost:6379

# Error tracking (Sentry)
SENTRY_DSN=https://xxxx@sentry.io/xxxx
```

### Web Configuration (`apps/web/.env.local`)

Create the file:

```bash
cp apps/web/.env.example apps/web/.env.local
```

**Minimum Required Variables:**

```bash
# =============================================================================
# REQUIRED
# =============================================================================

# API server URL
NEXT_PUBLIC_API_URL=http://localhost:3001

# Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Application name
NEXT_PUBLIC_APP_NAME=PlanFlow
```

**Optional Variables:**

```bash
# =============================================================================
# OPTIONAL
# =============================================================================

# WebSocket URL for real-time features
NEXT_PUBLIC_WS_URL=ws://localhost:3001

# Analytics (PostHog)
NEXT_PUBLIC_POSTHOG_KEY=phc_xxxx
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com

# Error tracking (Sentry)
NEXT_PUBLIC_SENTRY_DSN=https://xxxx@sentry.io/xxxx

# Payments (LemonSqueezy)
NEXT_PUBLIC_LEMONSQUEEZY_STORE_ID=xxxx
```

### Environment File Summary

| File | Purpose | Git Ignored |
|------|---------|-------------|
| `apps/api/.env` | API development config | Yes |
| `apps/api/.env.example` | API template | No |
| `apps/web/.env.local` | Web development config | Yes |
| `apps/web/.env.example` | Web template | No |

---

## Database Setup

PlanFlow uses PostgreSQL hosted on Neon (serverless).

### 1. Create a Neon Account

1. Go to [console.neon.tech](https://console.neon.tech)
2. Sign up for a free account
3. Create a new project (e.g., "planflow-dev")

### 2. Get Your Connection String

1. In Neon dashboard, go to your project
2. Click "Connection string"
3. Copy the connection string (looks like `postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require`)
4. Paste it as `DATABASE_URL` in `apps/api/.env`

**Note:** For local development, use the direct connection string. For production, use the pooled connection (`-pooler` endpoint).

### 3. Run Migrations

```bash
# From project root
pnpm db:migrate
```

This applies all database migrations and creates the required tables.

### 4. Verify Database Connection

```bash
# Check if database is accessible
pnpm --filter @planflow/api db:check
```

### Useful Database Commands

```bash
# Generate new migration after schema changes
pnpm --filter @planflow/api db:generate

# Push schema changes directly (development only)
pnpm --filter @planflow/api db:push

# Open Drizzle Studio (database GUI)
pnpm --filter @planflow/api db:studio
```

---

## Running the Development Servers

### Start All Services

The easiest way to start development:

```bash
pnpm dev
```

This runs Turborepo which starts:
- **API Server** at `http://localhost:3001`
- **Web App** at `http://localhost:3000`

### Start Services Individually

```bash
# API server only
pnpm --filter @planflow/api dev

# Web app only
pnpm --filter @planflow/web dev

# MCP server (for Claude Code integration)
pnpm --filter @planflow/mcp dev
```

### Using Docker for Redis (Optional)

If you want Redis for rate limiting and caching:

```bash
# Start Redis container
pnpm docker:up

# Stop Redis container
pnpm docker:down

# View logs
pnpm docker:logs
```

Or manually:

```bash
docker run -d --name planflow-redis -p 6379:6379 redis:alpine
```

Then add to `apps/api/.env`:

```bash
REDIS_URL=redis://localhost:6379
```

---

## Project Structure

```
planflow/
├── apps/
│   ├── api/                      # Backend API (Hono + Node.js)
│   │   ├── src/
│   │   │   ├── db/               # Database schema (Drizzle ORM)
│   │   │   │   ├── schema/       # Table definitions
│   │   │   │   └── client.ts     # DB client
│   │   │   ├── routes/           # API route handlers
│   │   │   ├── services/         # Business logic
│   │   │   ├── repositories/     # Data access layer
│   │   │   ├── middleware/       # Auth, security, logging
│   │   │   ├── websocket/        # WebSocket server
│   │   │   └── index.ts          # Entry point
│   │   ├── .env.example
│   │   └── package.json
│   │
│   └── web/                      # Frontend (Next.js 14)
│       ├── src/
│       │   ├── app/              # App Router pages
│       │   ├── components/       # React components
│       │   │   ├── ui/           # shadcn/ui components
│       │   │   └── features/     # Feature components
│       │   ├── hooks/            # Custom React hooks
│       │   ├── lib/              # Utilities, API client
│       │   └── stores/           # Zustand state
│       ├── .env.example
│       └── package.json
│
├── packages/
│   ├── mcp/                      # MCP Server for Claude Code
│   │   ├── src/
│   │   │   ├── tools/            # MCP tool implementations
│   │   │   ├── api-client.ts     # API client
│   │   │   └── server.ts         # MCP server
│   │   └── package.json
│   │
│   └── shared/                   # Shared types & utilities
│       └── src/
│           └── types/            # TypeScript types
│
├── docs/                         # Documentation
├── e2e/                          # End-to-end tests (Playwright)
├── scripts/                      # Build & deployment scripts
│
├── turbo.json                    # Turborepo config
├── pnpm-workspace.yaml           # Workspace config
└── package.json                  # Root package.json
```

---

## Development Workflows

### Adding a New API Endpoint

1. **Create route handler** in `apps/api/src/routes/`:

```typescript
// apps/api/src/routes/example.routes.ts
import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'

const app = new Hono()

app.use('/*', authMiddleware)

app.get('/', async (c) => {
  const userId = c.get('userId')
  return c.json({ success: true, data: { userId } })
})

export default app
```

2. **Register route** in `apps/api/src/index.ts`:

```typescript
import exampleRoutes from './routes/example.routes.js'

app.route('/example', exampleRoutes)
```

3. **Add service layer** if needed in `apps/api/src/services/`

### Adding a New Frontend Page

1. **Create page** in `apps/web/src/app/`:

```typescript
// apps/web/src/app/dashboard/new-page/page.tsx
export default function NewPage() {
  return (
    <div>
      <h1>New Page</h1>
    </div>
  )
}
```

2. **Add data fetching** with React Query:

```typescript
// apps/web/src/hooks/use-data.ts
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useData() {
  return useQuery({
    queryKey: ['data'],
    queryFn: () => api.get('/example'),
  })
}
```

### Database Schema Changes

1. **Modify schema** in `apps/api/src/db/schema/`:

```typescript
// apps/api/src/db/schema/example.ts
import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core'

export const examples = pgTable('examples', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})
```

2. **Generate migration**:

```bash
pnpm --filter @planflow/api db:generate
```

3. **Apply migration**:

```bash
pnpm --filter @planflow/api db:migrate
```

### Adding a New MCP Tool

1. **Create tool** in `packages/mcp/src/tools/`:

```typescript
// packages/mcp/src/tools/example.ts
import { z } from 'zod'
import type { Tool } from '../types.js'

export const exampleTool: Tool = {
  name: 'planflow_example',
  description: 'Example tool description',
  inputSchema: z.object({
    param: z.string().describe('Parameter description'),
  }),
  handler: async ({ param }, context) => {
    // Implementation
    return { success: true, data: { param } }
  },
}
```

2. **Register tool** in `packages/mcp/src/tools/index.ts`

---

## Testing

### Unit Tests

```bash
# Run all unit tests
pnpm --filter @planflow/api test
pnpm --filter @planflow/mcp test

# Watch mode
pnpm --filter @planflow/api test:watch

# With coverage
pnpm --filter @planflow/api test:coverage
```

### End-to-End Tests

E2E tests use Playwright:

```bash
# Run all E2E tests
pnpm test:e2e

# Run in UI mode (visual debugging)
pnpm test:e2e:ui

# Run in headed mode (see browser)
pnpm test:e2e:headed

# Debug mode
pnpm test:e2e:debug
```

**Note:** E2E tests require the development servers to be running.

### Performance Tests

Performance tests use k6:

```bash
# Seed test data
pnpm --filter @planflow/api perf:seed

# Run smoke test
pnpm --filter @planflow/api test:perf

# Run load test
pnpm --filter @planflow/api test:perf:load

# Run stress test
pnpm --filter @planflow/api test:perf:stress
```

---

## Code Quality

### Linting

```bash
# Lint all packages
pnpm lint

# Lint specific package
pnpm --filter @planflow/api lint
pnpm --filter @planflow/web lint
```

### Type Checking

```bash
# Type check all packages
pnpm typecheck

# Type check specific package
pnpm --filter @planflow/api typecheck
```

### Formatting

```bash
# Format all files
pnpm format

# Check formatting (CI)
pnpm format:check
```

### Pre-commit Checks

Before committing, ensure:

```bash
pnpm lint && pnpm typecheck && pnpm format:check
```

### Recommended VS Code Extensions

- **ESLint** - Linting
- **Prettier** - Formatting
- **Tailwind CSS IntelliSense** - Tailwind autocomplete
- **TypeScript Importer** - Auto-import
- **Prisma** (or Drizzle extension) - Schema highlighting

---

## Troubleshooting

### Common Issues

#### "Server won't start"

**Symptoms:** API server fails to start with error messages.

**Solutions:**

1. Check `DATABASE_URL` is correct:
   ```bash
   # Test connection
   pnpm --filter @planflow/api db:check
   ```

2. Verify `JWT_SECRET` is at least 32 characters:
   ```bash
   # Generate new secret
   openssl rand -base64 48
   ```

3. Check if port 3001 is in use:
   ```bash
   lsof -i :3001
   # Kill process if needed
   kill -9 <PID>
   ```

#### "API calls failing from frontend"

**Symptoms:** 404 or CORS errors in browser console.

**Solutions:**

1. Verify `NEXT_PUBLIC_API_URL` in `apps/web/.env.local`:
   ```bash
   NEXT_PUBLIC_API_URL=http://localhost:3001
   ```

2. Check API server is running:
   ```bash
   curl http://localhost:3001/health
   ```

3. Verify CORS in API:
   ```bash
   # In apps/api/.env
   CORS_ORIGINS=http://localhost:3000
   ```

#### "Database migration errors"

**Symptoms:** `pnpm db:migrate` fails.

**Solutions:**

1. Ensure database exists in Neon
2. Check `DATABASE_URL` format includes `?sslmode=require`
3. Try pushing schema directly (development only):
   ```bash
   pnpm --filter @planflow/api db:push
   ```

#### "WebSocket connection issues"

**Symptoms:** Real-time features not working.

**Solutions:**

1. Check `NEXT_PUBLIC_WS_URL` in `apps/web/.env.local`:
   ```bash
   NEXT_PUBLIC_WS_URL=ws://localhost:3001
   ```

2. Ensure no firewall blocking WebSocket connections

3. Check browser console for WebSocket errors

#### "MCP server not working with Claude Code"

**Symptoms:** Claude Code can't find PlanFlow tools.

**Solutions:**

1. Build the MCP package:
   ```bash
   pnpm --filter @planflow/mcp build
   ```

2. Check Claude Code MCP configuration

3. Verify API token is set:
   ```bash
   cat ~/.config/claude/plan-plugin-config.json
   ```

### Getting Help

- Check existing [GitHub Issues](https://github.com/planflow/planflow/issues)
- Create a new issue with:
  - Node.js version (`node --version`)
  - pnpm version (`pnpm --version`)
  - Error messages and stack traces
  - Steps to reproduce

---

## Related Documentation

- [Architecture Overview](./ARCHITECTURE.md) - System design and components
- [API Reference](./API_REFERENCE.md) - REST API documentation
- [MCP Installation](./MCP_INSTALLATION.md) - Claude Code setup
- [Contributing Guide](./CONTRIBUTING.md) - How to contribute

---

*Happy coding!*
