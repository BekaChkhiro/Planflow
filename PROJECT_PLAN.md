# PlanFlow - Project Plan

> AI-Native Project Management for Claude Code

**Created:** 2026-01-28
**Last Updated:** 2026-01-30
**Status:** In Progress
**Plugin Version:** 1.1.1

---

## Project Overview

| Field            | Value                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Project Name** | PlanFlow                                                                                                                     |
| **Project Type** | Full-Stack SaaS Web Application                                                                                              |
| **Description**  | An AI-native project management tool built for Claude Code, enabling developers to manage tasks without leaving the terminal |
| **Target Users** | AI-Native Developers, Tech Leads, Indie Hackers                                                                              |

---

## Tech Stack

| Layer            | Technology                                                                |
| ---------------- | ------------------------------------------------------------------------- |
| **Frontend**     | Next.js 14+ (App Router), Tailwind CSS, shadcn/ui, Zustand/TanStack Query |
| **Backend**      | Node.js 20+, Hono framework                                               |
| **Database**     | PostgreSQL (Neon - serverless), Drizzle ORM                               |
| **Auth**         | Better-Auth or Lucia                                                      |
| **Validation**   | Zod                                                                       |
| **MCP Server**   | Node.js, @modelcontextprotocol/sdk                                        |
| **Monorepo**     | Turborepo + pnpm                                                          |
| **API Hosting**  | Railway                                                                   |
| **Web Hosting**  | Vercel                                                                    |
| **Payments**     | LemonSqueezy                                                              |
| **Cache/PubSub** | Redis                                                                     |

---

## Progress

**Overall:** 91% complete

| Phase                    | Status      | Progress |
| ------------------------ | ----------- | -------- |
| Phase 1: Foundation      | DONE        | 100%     |
| Phase 2: MCP Server      | DONE        | 100%     |
| Phase 3: Web Dashboard   | DONE        | 100%     |
| Phase 4: Polish & Launch | IN_PROGRESS | 65%      |

---

## Phase 1: Foundation (Sprint 1)

**Goal:** Backend API skeleton + Database

### Tasks

| ID    | Task                                            | Complexity | Status         | Dependencies |
| ----- | ----------------------------------------------- | ---------- | -------------- | ------------ |
| T1.1  | Initialize monorepo with Turborepo + pnpm       | Medium     | DONE ✅        | -            |
| T1.2  | Set up PostgreSQL database (Neon)               | Low        | DONE ✅        | -            |
| T1.3  | Configure Drizzle ORM                           | Medium     | DONE ✅        | T1.2         |
| T1.4  | Set up basic CI/CD (GitHub Actions)             | Medium     | DONE ✅        | T1.1         |
| T1.5  | Create database schema - Users table            | Medium     | DONE ✅        | T1.3         |
| T1.6  | Create database schema - Projects table         | Medium     | DONE ✅        | T1.3         |
| T1.7  | Create database schema - Tasks table            | Medium     | DONE ✅        | T1.3         |
| T1.8  | Create database schema - API Tokens table       | Medium     | DONE ✅        | T1.3         |
| T1.9  | Create database schema - Subscriptions table    | Low        | DONE ✅        | T1.3         |
| T1.10 | Implement user registration endpoint            | High       | DONE ✅        | T1.5         |
| T1.11 | Implement user login endpoint (JWT)             | High       | DONE ✅        | T1.5         |
| T1.12 | Implement token refresh mechanism               | Medium     | DONE ✅        | T1.11        |
| T1.13 | Implement API token generation                  | Medium     | DONE ✅        | T1.8         |
| T1.14 | Create auth middleware                          | Medium     | DONE ✅        | T1.11        |
| T1.15 | Implement GET/POST /projects endpoints          | Medium     | DONE ✅        | T1.6, T1.14  |
| T1.16 | Implement PUT/DELETE /projects endpoints        | Medium     | DONE ✅        | T1.15        |
| T1.17 | Implement GET/PUT /projects/:id/plan endpoints  | Medium     | DONE ✅        | T1.15        |
| T1.18 | Implement GET/PUT /projects/:id/tasks endpoints | Medium     | DONE ✅        | T1.7, T1.15  |
| T1.19 | Generate OpenAPI documentation                  | Low        | DONE ✅        | T1.18        |

---

## Phase 2: MCP Server (Sprint 2)

**Goal:** Fully functional MCP server for Claude Code integration

### Tasks

| ID    | Task                                        | Complexity | Status  | Dependencies |
| ----- | ------------------------------------------- | ---------- | ------- | ------------ |
| T2.1  | Set up MCP SDK project structure            | Medium     | DONE ✅ | T1.1         |
| T2.2  | Create MCP server scaffolding               | Medium     | DONE ✅ | T2.1         |
| T2.3  | Implement config management (token storage) | Medium     | DONE ✅ | T2.2         |
| T2.4  | Create API client wrapper                   | Medium     | DONE ✅ | T2.3         |
| T2.5  | Implement planflow_login tool               | Medium     | DONE ✅ | T2.4         |
| T2.6  | Implement planflow_logout tool              | Low        | DONE ✅ | T2.5         |
| T2.7  | Implement planflow_whoami tool              | Low        | DONE ✅ | T2.5         |
| T2.8  | Implement planflow_projects tool            | Medium     | DONE ✅ | T2.4         |
| T2.9  | Implement planflow_create tool              | Medium     | DONE ✅ | T2.8         |
| T2.10 | Implement planflow_sync tool (push/pull)    | High       | DONE ✅ | T2.8, T1.17  |
| T2.11 | Implement planflow_task_list tool           | Medium     | DONE ✅ | T2.4         |
| T2.12 | Implement planflow_task_update tool         | Medium     | DONE ✅ | T2.11        |
| T2.13 | Implement planflow_task_next tool           | Medium     | DONE ✅ | T2.11        |
| T2.14 | Implement planflow_notifications tool       | Medium     | DONE ✅ | T2.4         |
| T2.15 | Write integration tests for MCP tools       | High       | DONE ✅ | T2.14        |
| T2.16 | Set up npm package configuration            | Medium     | DONE ✅ | T2.15        |
| T2.17 | Write installation documentation            | Low        | DONE ✅ | T2.16        |

---

## Phase 3: Web Dashboard (Sprint 3)

**Goal:** Functional web interface with auth and payments

### Tasks

| ID    | Task                                    | Complexity | Status | Dependencies |
| ----- | --------------------------------------- | ---------- | ------ | ------------ |
| T3.1  | Set up Next.js project with App Router  | Medium     | DONE ✅ | T1.1         |
| T3.2  | Configure Tailwind CSS and shadcn/ui    | Medium     | DONE ✅ | T3.1         |
| T3.3  | Create login page                       | Medium     | DONE ✅ | T3.2, T1.11  |
| T3.4  | Create registration page                | Medium     | DONE ✅ | T3.2, T1.10  |
| T3.5  | Create forgot password page             | Medium     | DONE ✅ | T3.2         |
| T3.6  | Implement auth state management         | Medium     | DONE ✅ | T3.3         |
| T3.7  | Create projects list page               | Medium     | DONE ✅ | T3.6, T1.15  |
| T3.8  | Create project detail page              | High       | DONE ✅ | T3.7         |
| T3.9  | Implement plan viewer (markdown)        | Medium     | DONE ✅ | T3.8         |
| T3.10 | Implement tasks kanban/list view        | High       | DONE ✅ | T3.8         |
| T3.11 | Implement progress visualization        | Medium     | DONE ✅ | T3.8         |
| T3.12 | Create project creation modal           | Medium     | DONE ✅ | T3.7         |
| T3.13 | Create profile settings page            | Medium     | DONE ✅ | T3.6         |
| T3.14 | Create API tokens management page       | Medium     | DONE ✅ | T3.13, T1.13 |
| T3.15 | Add MCP setup instructions page         | Low        | DONE ✅ | T3.14        |
| T3.16 | Create pricing page                     | Medium     | DONE ✅ | T3.2         |
| T3.17 | Integrate LemonSqueezy checkout         | High       | DONE ✅ | T3.16        |
| T3.18 | Create billing portal                   | Medium     | DONE ✅ | T3.17        |
| T3.19 | Implement webhook handlers for payments | High       | DONE ✅ | T3.17        |
| T3.20 | Implement feature gating based on plan  | Medium     | DONE ✅ | T3.19        |

---

## Phase 4: Polish & Launch (Sprint 4)

**Goal:** Production-ready product launch

### Tasks

| ID    | Task                                  | Complexity | Status | Dependencies |
| ----- | ------------------------------------- | ---------- | ------ | ------------ |
| T4.1  | Design and build hero section         | Medium     | DONE ✅ | T3.2         |
| T4.2  | Create features showcase section      | Medium     | DONE ✅ | T4.1         |
| T4.3  | Build pricing comparison section      | Medium     | DONE ✅ | T4.1         |
| T4.4  | Create demo video/GIF                 | Medium     | DONE ✅ | T3.10        |
| T4.5  | Add testimonials section (beta users) | Low        | DONE ✅ | T4.1         |
| T4.6  | Create FAQ section                    | Low        | DONE ✅ | T4.1         |
| T4.7  | Write getting started guide           | Medium     | DONE ✅ | T2.17        |
| T4.8  | Write MCP installation docs           | Medium     | DONE ✅ | T2.17        |
| T4.9  | Generate API reference docs           | Medium     | DONE ✅ | T1.19        |
| T4.10 | Create video tutorials                | High       | DONE ✅ | T4.4         |
| T4.11 | Implement end-to-end tests            | High       | DONE ✅ | T3.20        |
| T4.12 | Perform security audit                | High       | DONE ✅ | T4.11        |
| T4.13 | Run performance testing               | Medium     | IN_PROGRESS 🔄 | T4.11        |
| T4.14 | Collect beta user feedback            | Medium     | DONE ✅ | T4.11        |
| T4.15 | Configure production deployment       | Medium     | TODO   | T4.14        |
| T4.16 | Set up monitoring (Sentry)            | Medium     | TODO   | T4.15        |
| T4.17 | Set up analytics (Plausible/PostHog)  | Medium     | TODO   | T4.15        |
| T4.18 | Prepare Product Hunt submission       | Medium     | TODO   | T4.17        |
| T4.19 | Create social media announcements     | Low        | TODO   | T4.18        |
| T4.20 | Launch!                               | Low        | TODO   | T4.19        |

---

## Original Specification Analysis

**Source Document:** PRODUCT_VISION.md

### Extracted Requirements

**Core Features (MVP):**

- User authentication with JWT
- API token generation for MCP
- Project CRUD operations
- Plan sync (push/pull) between local and cloud
- Task status updates via MCP tools
- Basic web dashboard
- MCP server for Claude Code
- LemonSqueezy payment integration

**Post-MVP Features:**

- Real-time WebSocket synchronization
- Team invitations and management
- Code review flow (GitHub/GitLab)
- Sprint management
- Analytics dashboard
- SSO/SAML
- Mobile app

### Architecture Decisions

1. **Monorepo Structure:** Turborepo + pnpm for managing api, web, mcp, and shared packages
2. **Authentication:** JWT tokens for web, API tokens for MCP
3. **Database:** Serverless PostgreSQL (Neon) with Drizzle ORM for type safety
4. **Payments:** LemonSqueezy (Stripe alternative for Georgia)

### Database Tables

- `users` - User accounts and profiles
- `organizations` - Teams/companies
- `organization_members` - Team membership with roles
- `projects` - Project metadata and plan content
- `tasks` - Individual tasks with status, priority, dependencies
- `task_dependencies` - Task blocking relationships
- `comments` - Task comments
- `activity_log` - Audit trail
- `api_tokens` - MCP authentication tokens
- `subscriptions` - Payment plans
- `sprints` - Sprint management (post-MVP)
- `sprint_tasks` - Sprint-task relationships (post-MVP)

### Business Model

| Tier       | Price          | Key Features                                       |
| ---------- | -------------- | -------------------------------------------------- |
| Free       | $0/month       | 3 projects, local plans only                       |
| Pro        | $12/month      | Unlimited projects, cloud sync, GitHub integration |
| Team       | $29/user/month | Team management, roles, code review, sprints       |
| Enterprise | Custom         | Self-hosted, SLA, custom integrations              |

### Infrastructure Costs (MVP)

- Database (Neon): $0-19/month
- API Hosting (Railway): $5-20/month
- Web Hosting (Vercel): $0-20/month
- Email (Resend): $0-20/month
- Analytics (Plausible): $9/month
- Error Tracking (Sentry): $0-26/month
- **Total:** ~$20-100/month (can start with free tiers)

---

## Notes

- MVP Timeline: 8 weeks (4 sprints of 2 weeks each)
- Total Tasks: 76
- Critical Path: T1.1 → T1.3 → T1.5 → T1.11 → T1.14 → T1.15 → T2.4 → T2.10 → T3.7 → T4.20

---

_Generated from specification: PRODUCT_VISION.md_
