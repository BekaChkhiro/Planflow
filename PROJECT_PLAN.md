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

**Overall:** 58% complete (Phases 1-4) | Phases 5-9 planned

| Phase                          | Status      | Progress | Tasks |
| ------------------------------ | ----------- | -------- | ----- |
| Phase 1: Foundation            | DONE        | 100%     | 19/19 |
| Phase 2: MCP Server            | DONE        | 100%     | 17/17 |
| Phase 3: Web Dashboard         | DONE        | 100%     | 20/20 |
| Phase 4: Polish & Launch       | IN_PROGRESS | 65%      | 13/20 |
| Phase 5: Backend Infrastructure| PLANNED     | 0%       | 0/12  |
| Phase 6: Plugin Commands       | PLANNED     | 0%       | 0/10  |
| Phase 7: Real-time Features    | PLANNED     | 0%       | 0/8   |
| Phase 8: Web Dashboard Team UI | PLANNED     | 0%       | 0/12  |
| Phase 9: External Integrations | PLANNED     | 0%       | 0/12  |

### Current Focus
📍 **Current**: Phase 4 completion (T4.13-T4.20)
🎯 **Next**: Phase 5 - Backend Infrastructure (12 tasks)
📊 **Total Tasks**: 130 (76 existing + 54 new)

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

## Phase 5: Backend Infrastructure (Sprint 5)

**Goal:** API endpoints და WebSocket infrastructure გუნდური ფუნქციებისთვის

### Tasks

| ID    | Task                                          | Complexity | Status | Dependencies |
| ----- | --------------------------------------------- | ---------- | ------ | ------------ |
| T5.1  | Create organizations CRUD endpoints           | Medium     | TODO   | T1.14        |
| T5.2  | Implement team invitations API                | Medium     | TODO   | T5.1         |
| T5.3  | Create roles/permissions system (Owner/Admin/Editor/Viewer) | High | TODO | T5.1 |
| T5.4  | Implement task assignment endpoints           | Medium     | TODO   | T5.3         |
| T5.5  | Create comments API (CRUD + threads)          | Medium     | TODO   | T1.18        |
| T5.6  | Implement activity log endpoints              | Medium     | TODO   | T5.1         |
| T5.7  | Set up WebSocket server (Socket.io/ws)        | High       | TODO   | T1.1         |
| T5.8  | Implement real-time task updates via WS       | High       | TODO   | T5.7         |
| T5.9  | Create presence system (who's online)         | Medium     | TODO   | T5.7         |
| T5.10 | Implement notifications table + API           | Medium     | TODO   | T5.1         |
| T5.11 | Create email notification service (Resend)    | Medium     | TODO   | T5.10        |
| T5.12 | Implement @mentions parsing and notifications | Medium     | TODO   | T5.5, T5.10  |

**Database Schema Additions:**

```sql
-- Team Invitations
CREATE TABLE team_invitations (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'editor',
  invited_by UUID REFERENCES users(id),
  token VARCHAR(255) UNIQUE,
  expires_at TIMESTAMP,
  accepted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  type VARCHAR(50) NOT NULL, -- 'mention', 'assignment', 'comment', 'status_change'
  title VARCHAR(255) NOT NULL,
  body TEXT,
  link VARCHAR(500),
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Task Assignments
ALTER TABLE tasks ADD COLUMN assignee_id UUID REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN assigned_by UUID REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN assigned_at TIMESTAMP;

-- Task Comments (enhance existing)
ALTER TABLE comments ADD COLUMN parent_id UUID REFERENCES comments(id); -- for threads
ALTER TABLE comments ADD COLUMN mentions UUID[]; -- mentioned user IDs
```

---

---

## Phase 6: Plugin Commands (Sprint 5)

**Goal:** Claude Code პლაგინში გუნდური ბრძანებების დამატება

### Tasks

| ID    | Task                                          | Complexity | Status | Dependencies |
| ----- | --------------------------------------------- | ---------- | ------ | ------------ |
| T6.1  | Create /team command (list members, roles)    | Medium     | TODO   | T5.1         |
| T6.2  | Create /invite command (email + role)         | Medium     | TODO   | T5.2         |
| T6.3  | Create /assign command (assign task to user)  | Medium     | TODO   | T5.4         |
| T6.4  | Create /activity command (show recent activity) | Low      | TODO   | T5.6         |
| T6.5  | Create /comment command (add comment to task) | Medium     | TODO   | T5.5         |
| T6.6  | Create /notifications command (view/clear)    | Low        | TODO   | T5.10        |
| T6.7  | Add @mention support in task descriptions     | Medium     | TODO   | T5.12        |
| T6.8  | Add assignee display in /next output          | Low        | TODO   | T6.3         |
| T6.9  | Create /workload command (team capacity view) | Medium     | TODO   | T6.3         |
| T6.10 | Add MCP tools for team commands               | High       | TODO   | T6.1-9       |

**New Commands Preview:**

```bash
# Team Management
/team                        # List team members and roles
/team add john@email.com     # Invite with default role (editor)
/team add john@email.com admin  # Invite as admin
/team remove john@email.com  # Remove from team
/team role john@email.com viewer  # Change role

# Task Assignment
/assign T1.1 john@email.com  # Assign task
/assign T1.1 me              # Assign to self
/unassign T1.1               # Remove assignment
/my-tasks                    # Show my assigned tasks
/workload                    # Show team workload

# Activity & Comments
/activity                    # Recent activity feed
/activity T1.1               # Activity for specific task
/comment T1.1 "Great progress!"  # Add comment
/comments T1.1               # View task comments

# Notifications
/notifications               # View unread notifications
/notifications clear         # Mark all as read
```

---

## Phase 7: Real-time Features (Sprint 6)

**Goal:** Live presence, instant updates, collaborative editing

### Tasks

| ID    | Task                                          | Complexity | Status | Dependencies |
| ----- | --------------------------------------------- | ---------- | ------ | ------------ |
| T7.1  | Implement "Currently Working On" status       | Medium     | TODO   | T5.9         |
| T7.2  | Auto-update status from Claude Code activity  | High       | TODO   | T7.1         |
| T7.3  | Create live activity feed component           | Medium     | TODO   | T5.8         |
| T7.4  | Implement task update broadcasting            | Medium     | TODO   | T5.8         |
| T7.5  | Add typing indicators for comments            | Low        | TODO   | T5.7         |
| T7.6  | Implement conflict prevention (task locking)  | High       | TODO   | T7.4         |
| T7.7  | Create notification toast system              | Low        | TODO   | T5.8         |
| T7.8  | Add browser push notifications                | Medium     | TODO   | T7.7         |

**Real-time Architecture:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PlanFlow Real-time                           │
└─────────────────────────────────────────────────────────────────────┘

  Claude Code (User A)              Claude Code (User B)
         │                                   │
         │  WebSocket                        │  WebSocket
         ▼                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        WebSocket Server                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │  Presence   │  │  Task Sync  │  │ Notifications│                 │
│  │  Channel    │  │  Channel    │  │  Channel     │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
         │                                   │
         ▼                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Redis Pub/Sub (scaling)                          │
└─────────────────────────────────────────────────────────────────────┘

Events:
• user:online / user:offline
• user:working_on {taskId, projectId}
• task:updated {taskId, changes, userId}
• task:assigned {taskId, assigneeId, assignerId}
• comment:created {taskId, commentId, userId}
• notification:new {userId, notification}
```

---

## Phase 8: Web Dashboard Team UI (Sprint 7)

**Goal:** ვებ ინტერფეისი გუნდის მართვისთვის

### Tasks

| ID    | Task                                          | Complexity | Status | Dependencies |
| ----- | --------------------------------------------- | ---------- | ------ | ------------ |
| T8.1  | Create team members page                      | Medium     | TODO   | T5.1         |
| T8.2  | Implement invite modal with role selection    | Medium     | TODO   | T5.2         |
| T8.3  | Create role management UI                     | Medium     | TODO   | T5.3         |
| T8.4  | Add assignee selector to task cards           | Low        | TODO   | T5.4         |
| T8.5  | Create comments section in task detail        | Medium     | TODO   | T5.5         |
| T8.6  | Implement threaded comments UI                | Medium     | TODO   | T8.5         |
| T8.7  | Create activity feed sidebar                  | Medium     | TODO   | T5.6         |
| T8.8  | Add online presence indicators (avatars)      | Low        | TODO   | T7.1         |
| T8.9  | Create workload/capacity dashboard            | High       | TODO   | T6.9         |
| T8.10 | Implement notification center (bell icon)     | Medium     | TODO   | T5.10        |
| T8.11 | Create team analytics page                    | High       | TODO   | T5.6         |
| T8.12 | Add @mention autocomplete in comment input    | Medium     | TODO   | T5.12        |

**UI Mockups:**

```
┌─────────────────────────────────────────────────────────────────────┐
│  PlanFlow  │  Projects  │  Team  │  Analytics  │      🔔 3  👤 John │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Team Members                                        [+ Invite]      │
│  ────────────────────────────────────────────────────────────────   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 🟢 John Doe          john@company.com       Owner      ⚙️    │   │
│  │    Currently working on: T2.3 - API Integration              │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │ 🟢 Jane Smith        jane@company.com       Admin      ⚙️    │   │
│  │    Currently working on: T3.1 - Dashboard UI                 │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │ 🔴 Bob Wilson        bob@company.com        Editor     ⚙️    │   │
│  │    Last seen: 2 hours ago                                    │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │ ⏳ alice@company.com (Pending Invitation)   Editor     ❌    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  Workload Overview                                                   │
│  ────────────────────────────────────────────────────────────────   │
│  John  ████████░░  8 tasks                                          │
│  Jane  ██████░░░░  6 tasks                                          │
│  Bob   ████░░░░░░  4 tasks                                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 9: External Integrations (Sprint 8)

**Goal:** GitHub, Slack, Discord ინტეგრაციები

### Tasks

| ID    | Task                                          | Complexity | Status | Dependencies |
| ----- | --------------------------------------------- | ---------- | ------ | ------------ |
| T9.1  | Create integrations settings page             | Medium     | TODO   | T3.13        |
| T9.2  | Implement GitHub OAuth flow                   | High       | TODO   | T9.1         |
| T9.3  | Link tasks to GitHub issues                   | Medium     | TODO   | T9.2         |
| T9.4  | Link tasks to Pull Requests                   | Medium     | TODO   | T9.2         |
| T9.5  | Auto-update task status on PR merge           | High       | TODO   | T9.4         |
| T9.6  | Generate branch names from tasks              | Low        | TODO   | T9.2         |
| T9.7  | Implement Slack webhook integration           | Medium     | TODO   | T9.1         |
| T9.8  | Create Slack notification preferences         | Low        | TODO   | T9.7         |
| T9.9  | Implement Discord webhook integration         | Medium     | TODO   | T9.1         |
| T9.10 | Create /github command in plugin              | Medium     | TODO   | T9.2         |
| T9.11 | Add "Create PR" button in task detail         | Medium     | TODO   | T9.4         |
| T9.12 | Implement daily/weekly digest emails          | Medium     | TODO   | T5.11        |

**GitHub Integration Flow:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                      GitHub Integration                              │
└─────────────────────────────────────────────────────────────────────┘

1. Link Repository
   /github link owner/repo

2. Task → Branch (automatic naming)
   Task T2.1: "Implement login"
   → Branch: feature/T2.1-implement-login

3. Task → Issue
   /github issue T2.1
   → Creates GitHub Issue with task details
   → Links issue URL back to task

4. Task → PR
   /github pr T2.1
   → Opens PR creation with pre-filled template

5. PR Merge → Task Done (webhook)
   PR #123 merged (mentions T2.1)
   → Task T2.1 status → DONE ✅
   → Activity log: "T2.1 completed via PR #123"
   → Notification to assignee
```

**Slack/Discord Notifications:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ 📋 PlanFlow                                              just now   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ ✅ Task Completed                                                   │
│                                                                      │
│ *T2.1: Implement user login*                                        │
│ Completed by: John Doe                                              │
│ Project: E-commerce App                                             │
│                                                                      │
│ [View Task] [View Project]                                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Team Collaboration Summary (Phases 5-9)

| Phase | Tasks | Focus Area |
| ----- | ----- | ---------- |
| Phase 5: Backend Infrastructure | 12 | API, WebSocket, Permissions |
| Phase 6: Plugin Commands | 10 | CLI team features |
| Phase 7: Real-time Features | 8 | Live presence, instant sync |
| Phase 8: Web Dashboard | 12 | Team UI, notifications |
| Phase 9: External Integrations | 12 | GitHub, Slack, Discord |
| **Total** | **54** | |

**Priority Order:**
1. Phase 5 (Backend) - Foundation for everything
2. Phase 6 (Plugin) + Phase 8 (Web) - Parallel development
3. Phase 7 (Real-time) - After basic team features work
4. Phase 9 (Integrations) - Can be partially parallel

**Success Criteria:**
- [ ] Users can create and manage teams
- [ ] Team members can be invited with specific roles
- [ ] Tasks can be assigned to team members
- [ ] Comments and discussions work on tasks
- [ ] Real-time presence shows who's online
- [ ] Task updates sync instantly to all team members
- [ ] GitHub integration auto-updates task status
- [ ] Slack/Discord notifications work
- [ ] All features work via CLI and Web

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
- Total Tasks: 76 (Core: 22, Team Collaboration Phases 5-9: 54)
- Critical Path: T1.1 → T1.3 → T1.5 → T1.11 → T1.14 → T1.15 → T2.4 → T2.10 → T3.7 → T4.20

---

_Generated from specification: PRODUCT_VISION.md_
