# Contributing to PlanFlow

Thank you for your interest in contributing to PlanFlow! This document provides guidelines and instructions for contributing to the project.

**Last Updated:** 2026-02-25

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Setup](#development-setup)
4. [Project Structure](#project-structure)
5. [Code Style Guidelines](#code-style-guidelines)
6. [Git Workflow](#git-workflow)
7. [Pull Request Process](#pull-request-process)
8. [Testing Guidelines](#testing-guidelines)
9. [Documentation Guidelines](#documentation-guidelines)
10. [Architecture Guidelines](#architecture-guidelines)
11. [Issue Reporting](#issue-reporting)

---

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment. We expect all contributors to:

- Be respectful and considerate in all communications
- Welcome newcomers and help them get started
- Focus on constructive feedback
- Accept responsibility for mistakes and learn from them
- Prioritize the community's well-being over individual interests

---

## Getting Started

### Prerequisites

Before contributing, ensure you have:

- **Node.js** 20.0.0 or higher
- **pnpm** 9.15.0 or higher
- **PostgreSQL** (local or Neon account)
- **Redis** (local or cloud instance)
- **Git** 2.30+

### Quick Start

```bash
# 1. Fork the repository on GitHub

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/planflow.git
cd planflow

# 3. Add upstream remote
git remote add upstream https://github.com/planflow/planflow.git

# 4. Install dependencies
pnpm install

# 5. Set up environment variables
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 6. Start development servers
pnpm dev
```

---

## Development Setup

### Environment Variables

#### API (`apps/api/.env`)

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/planflow

# Authentication
JWT_SECRET=your-secure-jwt-secret-min-32-chars

# Redis
REDIS_URL=redis://localhost:6379

# Optional: External Services
RESEND_API_KEY=re_xxx
SENTRY_DSN=https://xxx@sentry.io/xxx
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
```

#### Web (`apps/web/.env.local`)

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

### Running Services

```bash
# Start all services (API + Web)
pnpm dev

# Start specific service
pnpm --filter @planflow/api dev
pnpm --filter @planflow/web dev

# Start with Docker (PostgreSQL + Redis)
pnpm docker:up
```

### Database Setup

```bash
# Run migrations
pnpm db:migrate

# Seed test data (if available)
pnpm --filter @planflow/api db:seed
```

---

## Project Structure

```
planflow/
├── apps/
│   ├── api/              # Backend API (Hono + Node.js)
│   │   ├── src/
│   │   │   ├── routes/   # API route handlers
│   │   │   ├── services/ # Business logic
│   │   │   ├── repositories/ # Data access
│   │   │   ├── middleware/   # Auth, security
│   │   │   └── db/       # Database schema
│   │   └── package.json
│   │
│   └── web/              # Frontend (Next.js 14)
│       ├── src/
│       │   ├── app/      # App Router pages
│       │   ├── components/   # UI components
│       │   ├── hooks/    # Custom hooks
│       │   └── lib/      # Utilities
│       └── package.json
│
├── packages/
│   ├── mcp/              # MCP Server for Claude Code
│   └── shared/           # Shared types & utilities
│
├── docs/                 # Documentation
├── scripts/              # Build & deployment scripts
└── tests/                # E2E tests
```

---

## Code Style Guidelines

### TypeScript

We use TypeScript throughout the project. Follow these conventions:

```typescript
// Use explicit types for function parameters and return values
function createProject(data: CreateProjectInput): Promise<Project> {
  // ...
}

// Use interfaces for object shapes
interface User {
  id: string
  email: string
  name: string | null
  createdAt: Date
}

// Use type for unions and computed types
type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'

// Prefer const assertions for constants
const ROLES = ['owner', 'admin', 'editor', 'viewer'] as const
type Role = (typeof ROLES)[number]

// Avoid `any` - use `unknown` and narrow types
function parseJson(data: unknown): Record<string, unknown> {
  if (typeof data === 'object' && data !== null) {
    return data as Record<string, unknown>
  }
  throw new Error('Invalid JSON')
}
```

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Files (components) | PascalCase | `ProjectCard.tsx` |
| Files (utilities) | kebab-case | `api-client.ts` |
| Variables/Functions | camelCase | `getUserById` |
| Constants | UPPER_SNAKE | `MAX_RETRIES` |
| Types/Interfaces | PascalCase | `CreateProjectInput` |
| Database tables | snake_case | `organization_members` |
| API routes | kebab-case | `/api/project-tasks` |

### File Organization

```typescript
// 1. External imports
import { Hono } from 'hono'
import { z } from 'zod'

// 2. Internal imports (absolute)
import { authMiddleware } from '@/middleware/auth'
import { projectService } from '@/services/project.service'

// 3. Types
import type { Project, User } from '@planflow/shared'

// 4. Constants
const MAX_PROJECTS_PER_USER = 100

// 5. Type definitions
interface CreateProjectRequest {
  name: string
  description?: string
}

// 6. Implementation
export function createProjectRoute() {
  // ...
}
```

### Formatting

We use Prettier for consistent formatting:

```bash
# Format all files
pnpm format

# Check formatting
pnpm format:check
```

Key formatting rules:
- 2 spaces for indentation
- Single quotes for strings
- No semicolons
- Trailing commas
- 100 character line width

### Linting

ESLint enforces code quality:

```bash
# Run linter
pnpm lint

# Fix auto-fixable issues
pnpm lint --fix
```

---

## Git Workflow

### Branch Naming

```
feature/T1.1-add-user-authentication
bugfix/T2.3-fix-websocket-reconnection
docs/T15.11-contributing-guide
refactor/T11.2-split-services
hotfix/critical-security-patch
```

Format: `<type>/<task-id>-<short-description>`

### Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

#### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `style` | Code style (formatting, semicolons) |
| `refactor` | Code refactoring |
| `perf` | Performance improvements |
| `test` | Adding or updating tests |
| `chore` | Build process, dependencies |
| `ci` | CI/CD changes |

#### Examples

```bash
# Feature
feat(api): add task assignment endpoint

# Bug fix
fix(web): resolve websocket reconnection race condition

Fixes #123

# Documentation
docs: update API reference with new endpoints

# Refactor
refactor(api): split index.ts into route modules

T11.1 - Reduces file size from 10k to 50 lines
```

### Keeping Your Fork Updated

```bash
# Fetch upstream changes
git fetch upstream

# Rebase your branch
git checkout feature/your-feature
git rebase upstream/main

# Force push if needed (only for your branches!)
git push origin feature/your-feature --force-with-lease
```

---

## Pull Request Process

### Before Opening a PR

1. **Ensure tests pass locally**
   ```bash
   pnpm lint
   pnpm typecheck
   pnpm build
   pnpm test:e2e
   ```

2. **Update documentation** if your changes affect:
   - API endpoints
   - Configuration options
   - User-facing features

3. **Add tests** for new functionality

4. **Keep PRs focused** - One feature/fix per PR

### PR Template

When creating a PR, include:

```markdown
## Summary

Brief description of changes.

## Task Reference

Closes #123 or Relates to T1.2

## Changes Made

- Added X endpoint
- Updated Y component
- Fixed Z bug

## Testing

- [ ] Unit tests added/updated
- [ ] E2E tests added/updated
- [ ] Manually tested locally

## Screenshots (if UI changes)

[Add screenshots here]

## Checklist

- [ ] Code follows project style guidelines
- [ ] Self-reviewed the code
- [ ] Documentation updated
- [ ] No new warnings
```

### Review Process

1. **Automated checks** must pass (CI/CD)
2. **Code review** by at least one maintainer
3. **Address feedback** by pushing new commits
4. **Squash and merge** when approved

### After Merge

```bash
# Delete local branch
git branch -d feature/your-feature

# Delete remote branch
git push origin --delete feature/your-feature

# Update local main
git checkout main
git pull upstream main
```

---

## Testing Guidelines

### Test Structure

```
tests/
├── e2e/                  # End-to-end tests (Playwright)
│   ├── auth.spec.ts
│   ├── projects.spec.ts
│   └── tasks.spec.ts
│
├── integration/          # API integration tests
│   ├── auth.test.ts
│   └── projects.test.ts
│
└── unit/                 # Unit tests (if applicable)
    └── utils.test.ts
```

### Running Tests

```bash
# Run all E2E tests
pnpm test:e2e

# Run with UI mode
pnpm test:e2e:ui

# Run specific test file
pnpm test:e2e tests/e2e/auth.spec.ts

# Run headed (see browser)
pnpm test:e2e:headed

# Debug mode
pnpm test:e2e:debug
```

### Writing E2E Tests

```typescript
// tests/e2e/auth.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('should login successfully', async ({ page }) => {
    await page.goto('/login')

    await page.fill('[data-testid="email-input"]', 'test@example.com')
    await page.fill('[data-testid="password-input"]', 'password123')
    await page.click('[data-testid="login-button"]')

    await expect(page).toHaveURL('/dashboard')
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible()
  })

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login')

    await page.fill('[data-testid="email-input"]', 'wrong@example.com')
    await page.fill('[data-testid="password-input"]', 'wrongpassword')
    await page.click('[data-testid="login-button"]')

    await expect(page.locator('[data-testid="error-message"]')).toContainText(
      'Invalid credentials'
    )
  })
})
```

### Test Conventions

1. **Use `data-testid`** for test selectors
2. **One assertion per test** when possible
3. **Descriptive test names** - "should [expected behavior] when [condition]"
4. **Clean up test data** after each test
5. **Mock external services** in integration tests

---

## Documentation Guidelines

### When to Update Docs

- Adding new API endpoints
- Changing configuration options
- Adding new features
- Modifying existing behavior
- Deprecating functionality

### Documentation Structure

```
docs/
├── API_REFERENCE.md      # REST API endpoints
├── API_INTEGRATIONS.md   # GitHub, Slack, Discord
├── API_REALTIME.md       # WebSocket events
├── API_NOTIFICATIONS.md  # Notifications
├── ARCHITECTURE.md       # System architecture
├── CONTRIBUTING.md       # This file
├── DEVELOPMENT.md        # Local setup
├── GETTING_STARTED.md    # Quick start
├── MCP_INSTALLATION.md   # MCP setup
├── MCP_TOOLS.md          # MCP tools reference
├── PLUGIN_COMMANDS.md    # CLI commands
└── USER_GUIDE.md         # Dashboard features
```

### Markdown Conventions

```markdown
# Main Title (H1) - One per file

## Section (H2)

### Subsection (H3)

#### Minor heading (H4)

**Bold** for emphasis
`code` for inline code
```code block``` for code examples

| Table | Header |
|-------|--------|
| Data  | Here   |

- Bullet points
1. Numbered lists

> Blockquotes for notes

[Link text](URL)
```

### API Documentation Format

```markdown
### Endpoint Name

Brief description of what this endpoint does.

**Endpoint:** `POST /api/resource`

**Authentication:** Required (Bearer token)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Resource name |
| description | string | No | Optional description |

**Example Request:**

```bash
curl -X POST https://api.planflow.tools/resource \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Example"}'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Example"
  }
}
```

**Error Responses:**

| Status | Description |
|--------|-------------|
| 400 | Invalid request body |
| 401 | Unauthorized |
| 404 | Resource not found |
```

---

## Architecture Guidelines

### Layered Architecture

Follow the established layered architecture pattern:

```
Routes → Services → Repositories → Database
```

#### Routes (`apps/api/src/routes/`)

- Handle HTTP requests/responses
- Validate input with Zod
- Call services for business logic
- Format responses

```typescript
// routes/projects.routes.ts
app.post('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json()

  // Validate
  const input = createProjectSchema.parse(body)

  // Delegate to service
  const project = await projectService.createProject(userId, input)

  // Return response
  return c.json({ success: true, data: { project } })
})
```

#### Services (`apps/api/src/services/`)

- Contain business logic
- Orchestrate multiple repositories
- Handle transactions
- Trigger side effects (notifications, webhooks)

```typescript
// services/project.service.ts
export class ProjectService {
  async createProject(userId: string, input: CreateProjectInput) {
    // Business validation
    await this.validateUserQuota(userId)

    // Create via repository
    const project = await projectRepository.create({
      ...input,
      ownerId: userId,
    })

    // Side effects
    await activityLogService.log({
      type: 'project_created',
      projectId: project.id,
      userId,
    })

    return project
  }
}
```

#### Repositories (`apps/api/src/repositories/`)

- Pure data access layer
- No business logic
- Database queries only

```typescript
// repositories/project.repository.ts
export class ProjectRepository {
  async findByUserId(userId: string) {
    return db
      .select()
      .from(projects)
      .where(eq(projects.ownerId, userId))
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

### Error Handling

Use consistent error handling:

```typescript
// Custom error classes
export class NotFoundError extends Error {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`)
    this.name = 'NotFoundError'
  }
}

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

// Error middleware
app.onError((err, c) => {
  if (err instanceof NotFoundError) {
    return c.json({ success: false, error: err.message }, 404)
  }
  if (err instanceof UnauthorizedError) {
    return c.json({ success: false, error: err.message }, 401)
  }
  // Log unexpected errors
  logger.error(err)
  return c.json({ success: false, error: 'Internal server error' }, 500)
})
```

### Validation

Use Zod for runtime validation:

```typescript
import { z } from 'zod'

export const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  organizationId: z.string().uuid().optional(),
})

export type CreateProjectInput = z.infer<typeof createProjectSchema>
```

---

## Issue Reporting

### Bug Reports

When reporting bugs, include:

1. **Description** - What happened?
2. **Expected behavior** - What should happen?
3. **Steps to reproduce** - How can we replicate it?
4. **Environment** - OS, Node version, browser
5. **Logs/Screenshots** - Any relevant output

### Feature Requests

When requesting features:

1. **Problem** - What problem does this solve?
2. **Solution** - How do you envision it working?
3. **Alternatives** - Other solutions you've considered
4. **Additional context** - Mockups, examples

### Issue Labels

| Label | Description |
|-------|-------------|
| `bug` | Something isn't working |
| `feature` | New feature request |
| `docs` | Documentation update |
| `good first issue` | Good for newcomers |
| `help wanted` | Extra attention needed |
| `priority:high` | Critical issue |
| `priority:low` | Nice to have |

---

## Questions?

- Open a [GitHub Discussion](https://github.com/planflow/planflow/discussions)
- Check existing issues and PRs
- Read the [Architecture Guide](./ARCHITECTURE.md)

Thank you for contributing to PlanFlow!
