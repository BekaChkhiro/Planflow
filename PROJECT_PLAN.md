# PlanFlow - Project Plan

> AI-Native Project Management for Claude Code

**Created:** 2026-01-28
**Last Updated:** 2026-02-25
**Analysis Date:** 2026-02-21
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

**Overall:** 99% complete (164/165 tasks)

| Phase                          | Status      | Progress | Tasks |
| ------------------------------ | ----------- | -------- | ----- |
| Phase 1: Foundation            | DONE        | 100%     | 19/19 |
| Phase 2: MCP Server            | DONE        | 100%     | 17/17 |
| Phase 3: Web Dashboard         | DONE        | 100%     | 20/20 |
| Phase 4: Polish & Content      | DONE        | 100%     | 13/13 |
| Phase 5: Backend Infrastructure| DONE        | 100%     | 12/12 ✅ |
| Phase 6: Real-time Features    | DONE        | 100%     | 8/8   ✅ |
| Phase 7: Web Dashboard Team UI | DONE        | 100%     | 12/12 ✅ |
| Phase 8: External Integrations | DONE        | 100%     | 11/11 ✅ |
| Phase 9: Production & Launch   | DONE        | 100%     | 7/7   ✅ |
| Phase 10: Security & Stability | DONE        | 100%     | 10/10 ✅ |
| Phase 11: Code Refactoring     | DONE        | 100%     | 8/8   ✅ |
| Phase 12: UX/UI Improvements   | DONE        | 100%     | 12/12 ✅ |
| Phase 13: Performance          | DONE        | 100%     | 8/8   ✅ |
| Phase 14: New Features         | DONE        | 100%     | 7/7   ✅ |

### Current Focus
🎉 **Completed**: Phase 14 (New Features) ✅
✅ **Just Completed**: T14.6 (Bulk task operations)
📊 **Total Tasks**: 165 (164 დასრულებული, 1 დარჩენილი)
🏆 **All Phases Complete!**

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

## Phase 4: Polish & Content (Sprint 4)

**Goal:** Landing page, documentation, and testing ✅

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
| T4.14 | Collect beta user feedback            | Medium     | DONE ✅ | T4.11        |

---

## Phase 5: Backend Infrastructure (Sprint 5)

**Goal:** API endpoints და WebSocket infrastructure გუნდური ფუნქციებისთვის

### Tasks

| ID    | Task                                          | Complexity | Status | Dependencies |
| ----- | --------------------------------------------- | ---------- | ------ | ------------ |
| T5.1  | Create organizations CRUD endpoints           | Medium     | DONE ✅ | T1.14        |
| T5.2  | Implement team invitations API                | Medium     | DONE ✅ | T5.1         |
| T5.3  | Create roles/permissions system (Owner/Admin/Editor/Viewer) | High | DONE ✅ | T5.1 |
| T5.4  | Implement task assignment endpoints           | Medium     | DONE ✅ | T5.3         |
| T5.5  | Create comments API (CRUD + threads)          | Medium     | DONE ✅ | T1.18        |
| T5.6  | Implement activity log endpoints              | Medium     | DONE ✅        | T5.1         |
| T5.7  | Set up WebSocket server (Socket.io/ws)        | High       | DONE ✅ | T1.1         |
| T5.8  | Implement real-time task updates via WS       | High       | DONE ✅ | T5.7         |
| T5.9  | Create presence system (who's online)         | Medium     | DONE ✅ | T5.7         |
| T5.10 | Implement notifications table + API           | Medium     | DONE ✅ | T5.1         |
| T5.11 | Create email notification service (Resend)    | Medium     | DONE ✅ | T5.10        |
| T5.12 | Implement @mentions parsing and notifications | Medium     | DONE ✅ | T5.5, T5.10  |

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

## Phase 6: Real-time Features (Sprint 6)

**Goal:** Live presence, instant updates, collaborative editing

### Tasks

| ID    | Task                                          | Complexity | Status | Dependencies |
| ----- | --------------------------------------------- | ---------- | ------ | ------------ |
| T6.1  | Implement "Currently Working On" status       | Medium     | DONE ✅ | T5.9         |
| T6.2  | Auto-update status from Claude Code activity  | High       | DONE ✅ | T6.1         |
| T6.3  | Create live activity feed component           | Medium     | DONE ✅ | T5.8         |
| T6.4  | Implement task update broadcasting            | Medium     | DONE ✅ | T5.8         |
| T6.5  | Add typing indicators for comments            | Low        | DONE ✅ | T5.7         |
| T6.6  | Implement conflict prevention (task locking)  | High       | DONE ✅ | T6.4         |
| T6.7  | Create notification toast system              | Low        | DONE ✅ | T5.8         |
| T6.8  | Add browser push notifications                | Medium     | DONE ✅ | T6.7         |

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

## Phase 7: Web Dashboard Team UI (Sprint 7)

**Goal:** ვებ ინტერფეისი გუნდის მართვისთვის

### Tasks

| ID    | Task                                          | Complexity | Status | Dependencies |
| ----- | --------------------------------------------- | ---------- | ------ | ------------ |
| T7.1  | Create team members page                      | Medium     | DONE ✅ | T5.1         |
| T7.2  | Implement invite modal with role selection    | Medium     | DONE ✅ | T5.2         |
| T7.3  | Create role management UI                     | Medium     | DONE ✅ | T5.3         |
| T7.4  | Add assignee selector to task cards           | Low        | DONE ✅ | T5.4         |
| T7.5  | Create comments section in task detail        | Medium     | DONE ✅ | T5.5         |
| T7.6  | Implement threaded comments UI                | Medium     | DONE ✅ | T7.5         |
| T7.7  | Create activity feed sidebar                  | Medium     | DONE ✅ | T5.6         |
| T7.8  | Add online presence indicators (avatars)      | Low        | DONE ✅ | T6.1         |
| T7.9  | Create workload/capacity dashboard            | High       | DONE ✅ | T5.4         |
| T7.10 | Implement notification center (bell icon)     | Medium     | DONE ✅ | T5.10        |
| T7.11 | Create team analytics page                    | High       | DONE ✅ | T5.6         |
| T7.12 | Add @mention autocomplete in comment input    | Medium     | DONE ✅ | T5.12        |

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

## Phase 8: External Integrations (Sprint 8)

**Goal:** GitHub, Slack, Discord ინტეგრაციები

### Tasks

| ID    | Task                                          | Complexity | Status | Dependencies |
| ----- | --------------------------------------------- | ---------- | ------ | ------------ |
| T8.1  | Create integrations settings page             | Medium     | DONE ✅ | T3.13        |
| T8.2  | Implement GitHub OAuth flow                   | High       | DONE ✅ | T8.1         |
| T8.3  | Link tasks to GitHub issues                   | Medium     | DONE ✅        | T8.2         |
| T8.4  | Link tasks to Pull Requests                   | Medium     | DONE ✅ | T8.2         |
| T8.5  | Auto-update task status on PR merge           | High       | DONE ✅ | T8.4         |
| T8.6  | Generate branch names from tasks              | Low        | DONE ✅        | T8.2         |
| T8.7  | Implement Slack webhook integration           | Medium     | DONE ✅ | T8.1         |
| T8.8  | Create Slack notification preferences         | Low        | DONE ✅ | T8.7         |
| T8.9  | Implement Discord webhook integration         | Medium     | DONE ✅ | T8.1         |
| T8.10 | Add "Create PR" button in task detail         | Medium     | DONE ✅ | T8.4         |
| T8.11 | Implement daily/weekly digest emails          | Medium     | DONE ✅        | T5.11        |

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
| Phase 6: Real-time Features | 8 | Live presence, instant sync |
| Phase 7: Web Dashboard Team UI | 12 | Team UI, notifications |
| Phase 8: External Integrations | 11 | GitHub, Slack, Discord |
| Phase 9: Production & Launch | 7 | Deployment, monitoring, launch |
| **Total** | **50** | |

> **Note:** Plugin commands (/team, /assign, /comment, etc.) are tracked in claude-plan-plugin repository.

**Success Criteria:**
- [x] Users can create and manage teams
- [x] Team members can be invited with specific roles
- [x] Tasks can be assigned to team members
- [x] Comments and discussions work on tasks
- [x] Real-time presence shows who's online
- [x] Task updates sync instantly to all team members
- [x] GitHub integration auto-updates task status
- [x] Slack/Discord notifications work
- [x] All features work via CLI and Web

### Improvement & Polish Summary (Phases 10-14)

| Phase | Tasks | Focus Area |
| ----- | ----- | ---------- |
| Phase 10: Security & Stability | 10 | Critical security fixes, stability |
| Phase 11: Code Refactoring | 8 | Architecture, code quality |
| Phase 12: UX/UI Improvements | 12 | Accessibility, error handling |
| Phase 13: Performance | 8 | Caching, pagination, optimization |
| Phase 14: New Features | 7 | Search, bulk ops, archiving |
| **Total** | **45** | |

> **Note:** ეს ფაზები დაემატა კოდბაზის დეტალური ანალიზის შემდეგ (2026-02-21)

**Priority Order:**
1. Phase 10 (Security) - MUST before production traffic increases
2. Phase 11 (Refactoring) - Enables faster future development
3. Phase 12 (UX) - Improves user retention
4. Phase 13 (Performance) - Handles scale
5. Phase 14 (Features) - Competitive advantage

**Success Criteria:**
- [ ] No critical security vulnerabilities
- [ ] Code is modular and testable
- [ ] All async operations show loading/error states
- [ ] WCAG 2.1 AA accessibility compliance
- [ ] P95 API response time < 200ms
- [ ] Search functionality works across projects/tasks
- [ ] Bulk operations available for common actions

---

## Phase 9: Production & Launch (Sprint 9)

**Goal:** Production deployment, monitoring, and public launch

### Tasks

| ID    | Task                                  | Complexity | Status         | Dependencies |
| ----- | ------------------------------------- | ---------- | -------------- | ------------ |
| T9.1  | Run performance testing               | Medium     | DONE ✅         | T4.11        |
| T9.2  | Configure production deployment       | Medium     | DONE ✅        | T4.14        |
| T9.3  | Set up monitoring (Sentry)            | Medium     | DONE ✅        | T9.2         |
| T9.4  | Set up analytics (Plausible/PostHog)  | Medium     | DONE ✅        | T9.2         |
| T9.5  | Prepare Product Hunt submission       | Medium     | DONE ✅        | T9.4         |
| T9.6  | Create social media announcements     | Low        | DONE ✅        | T9.5         |
| T9.7  | Launch!                               | Low        | DONE ✅        | T9.6         |

> **Note:** ეს თასქები Phase 4-დან გადმოვიტანეთ (T4.13, T4.15-T4.20) რადგან launch-ისთვის მოსამზადებელი სამუშაოები ცალკე ფაზად გამოვყავით.

---

## Phase 10: Security & Stability (Sprint 10)

**Goal:** კრიტიკული უსაფრთხოების და სტაბილურობის პრობლემების გადაჭრა

### Tasks

| ID     | Task                                          | Complexity | Status | Dependencies |
| ------ | --------------------------------------------- | ---------- | ------ | ------------ |
| T10.1  | Move WebSocket token from URL to subprotocol  | High       | DONE ✅ | -            |
| T10.2  | Fix CORS validation (proper domain matching)  | Medium     | DONE ✅ | -            |
| T10.3  | Add JWT_SECRET startup validation             | Low        | DONE ✅ | -            |
| T10.4  | Implement Redis-based rate limiting           | High       | DONE ✅ | -            |
| T10.5  | Fix WebSocket reconnection race condition     | Medium     | DONE ✅ | T10.1        |
| T10.6  | Fix memory leaks (intervals/timers cleanup)   | Medium     | DONE ✅ | -            |
| T10.7  | Implement proper logout (invalidate refresh)  | Medium     | DONE ✅ | -            |
| T10.8  | Add database transactions for multi-ops       | High       | DONE ✅ | -            |
| T10.9  | Fix lock timers persistence across restarts   | Medium     | DONE ✅ | T10.4        |
| T10.10 | Add environment variable validation at startup| Low        | DONE ✅ | T10.3        |

**Security Fixes:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Security Improvements                            │
└─────────────────────────────────────────────────────────────────────┘

T10.1: WebSocket Token (CRITICAL)
  Before: ws://host/ws?token=JWT_HERE    ← Exposed in logs/history
  After:  ws://host/ws + subprotocol     ← Token hidden

T10.2: CORS Validation (CRITICAL)
  Before: origin.includes('.railway.app') ← Bypassable
  After:  /^https:\/\/[a-z0-9-]+\.up\.railway\.app$/  ← Strict regex

T10.4: Rate Limiting
  Before: In-memory Map  ← Single instance only
  After:  Redis store    ← Works across instances

T10.8: Database Transactions
  Before: INSERT user; INSERT subscription;  ← Partial failure risk
  After:  BEGIN; INSERT user; INSERT subscription; COMMIT;
```

---

## Phase 11: Code Refactoring (Sprint 11)

**Goal:** კოდის ხარისხის გაუმჯობესება და Technical Debt-ის შემცირება

### Tasks

| ID     | Task                                          | Complexity | Status | Dependencies |
| ------ | --------------------------------------------- | ---------- | ------ | ------------ |
| T11.1  | Split index.ts into route modules             | High       | DONE ✅ | -            |
| T11.2  | Create service layer for business logic       | High       | DONE ✅ | T11.1        |
| T11.3  | Deduplicate auth middleware code              | Medium     | DONE ✅ | T11.1        |
| T11.4  | Centralize JWT verification logic             | Medium     | DONE ✅ | T11.3        |
| T11.5  | Add structured logging (replace console.log)  | Medium     | DONE ✅ | -            |
| T11.6  | Create repository pattern for DB access       | High       | DONE ✅ | T11.2        |
| T11.7  | Split WebSocket connection manager concerns   | Medium     | DONE ✅ | -            |
| T11.8  | Add unit tests for core business logic        | High       | DONE ✅ | T11.2        |

**Proposed Architecture:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                     New Project Structure                            │
└─────────────────────────────────────────────────────────────────────┘

apps/api/src/
├── index.ts (50 lines - app setup only)
├── routes/
│   ├── auth.routes.ts
│   ├── projects.routes.ts
│   ├── tasks.routes.ts
│   ├── teams.routes.ts
│   ├── integrations.routes.ts
│   └── webhooks.routes.ts
├── services/
│   ├── auth.service.ts
│   ├── project.service.ts
│   ├── task.service.ts
│   └── notification.service.ts
├── repositories/
│   ├── user.repository.ts
│   ├── project.repository.ts
│   └── task.repository.ts
├── middleware/
│   ├── auth.ts (deduplicated)
│   └── security.ts
└── utils/
    ├── jwt.ts (centralized)
    └── logger.ts (structured)

Current: index.ts = 10,734 lines
Target:  index.ts = ~50 lines (imports + app.route() calls)
```

---

## Phase 12: UX/UI Improvements (Sprint 12)

**Goal:** მომხმარებლის გამოცდილების გაუმჯობესება

### Tasks

| ID     | Task                                           | Complexity | Status | Dependencies |
| ------ | ---------------------------------------------- | ---------- | ------ | ------------ |
| T12.1  | Add toast notifications for all API errors     | Medium     | DONE ✅ | -            |
| T12.2  | Add loading states for async operations        | Medium     | DONE ✅ | -            |
| T12.3  | Implement accessibility (ARIA attributes)      | High       | DONE ✅        | -            |
| T12.4  | Add keyboard navigation support                | Medium     | DONE ✅ | T12.3        |
| T12.5  | Improve form validation with real-time feedback| Medium     | DONE ✅ | -            |
| T12.6  | Add password strength indicator                | Low        | DONE ✅ | T12.5        |
| T12.7  | Add confirmation dialogs for destructive actions| Low       | DONE ✅ | -            |
| T12.8  | Implement undo functionality for task ops      | High       | DONE ✅ | -            |
| T12.9  | Add empty state illustrations                  | Low        | DONE ✅ | -            |
| T12.10 | Improve mobile responsive design               | Medium     | DONE ✅ | -            |
| T12.11 | Add dark mode improvements                     | Low        | DONE ✅ | -            |
| T12.12 | Create .env.example with documentation         | Low        | DONE ✅ | -            |

**UX Improvements:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Error Handling Flow                              │
└─────────────────────────────────────────────────────────────────────┘

Current State:
  API Error → console.error() → User sees nothing ❌

Target State:
  API Error → toast.error() → User sees message ✅
           → Sentry.capture() → Team gets alert ✅
           → retry option → User can retry ✅

Accessibility Targets:
  • ARIA labels on all interactive elements
  • Keyboard navigation (Tab, Enter, Escape)
  • Screen reader support
  • Focus management in modals
  • Color contrast ratio ≥ 4.5:1
```

---

## Phase 13: Performance Optimization (Sprint 13)

**Goal:** აპლიკაციის სიჩქარის და ეფექტურობის გაუმჯობესება

### Tasks

| ID     | Task                                          | Complexity | Status | Dependencies |
| ------ | --------------------------------------------- | ---------- | ------ | ------------ |
| T13.1  | Configure React Query caching (staleTime)     | Medium     | DONE ✅ | -            |
| T13.2  | Add pagination for projects list              | Medium     | DONE ✅ | -            |
| T13.3  | Add pagination for team members               | Low        | DONE ✅ | T13.2        |
| T13.4  | Add pagination for notifications              | Low        | DONE ✅ | T13.2        |
| T13.5  | Implement code splitting for large pages      | Medium     | DONE ✅ | -            |
| T13.6  | Split project detail page into components     | Medium     | DONE ✅ | T13.5        |
| T13.7  | Add database indexes for common queries       | Medium     | DONE ✅ | -            |
| T13.8  | Implement ETag caching for API responses      | High       | DONE ✅ | -            |

**Performance Targets:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Performance Improvements                         │
└─────────────────────────────────────────────────────────────────────┘

React Query Caching:
  Current:  staleTime = 0 (always refetch)
  Target:   staleTime = 5 min, gcTime = 30 min

Pagination:
  Current:  Load all items at once
  Target:   20 items per page + infinite scroll

Code Splitting:
  Current:  projects/[id]/page.tsx = 1,433 lines
  Target:   Split into 5-10 smaller components

Database Indexes:
  • tasks.project_id + tasks.status
  • activity_log.project_id + created_at
  • notifications.user_id + read_at

API Response Times:
  Current:  P95 ~500ms
  Target:   P95 < 200ms
```

---

## Phase 14: New Features & Enhancements (Sprint 14)

**Goal:** ახალი ფუნქციების დამატება და არსებულის გაფართოება

### Tasks

| ID     | Task                                          | Complexity | Status | Dependencies |
| ------ | --------------------------------------------- | ---------- | ------ | ------------ |
| T14.1  | Add project search functionality              | Medium     | DONE ✅ | -            |
| T14.2  | Add task search and advanced filters          | High       | DONE ✅ | T14.1        |
| T14.3  | Implement task drag-and-drop reordering       | High       | DONE ✅ | -            |
| T14.4  | Add task duplication feature                  | Low        | DONE ✅ | -            |
| T14.5  | Implement project archiving (soft delete)     | Medium     | DONE ✅ | -            |
| T14.6  | Add bulk task operations                      | High       | DONE ✅ | -            |
| T14.7  | Enable "Sync from Terminal" feature           | Medium     | DONE ✅ | -            |

**Feature Details:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                     New Features Overview                            │
└─────────────────────────────────────────────────────────────────────┘

Search & Filters (T14.1, T14.2):
  ┌─────────────────────────────────────────────────────────────┐
  │ 🔍 Search tasks...          [Status ▾] [Assignee ▾] [Phase ▾]│
  └─────────────────────────────────────────────────────────────┘

Drag & Drop (T14.3):
  • Reorder tasks within a phase
  • Move tasks between phases
  • Update dependencies automatically

Bulk Operations (T14.6):
  • Select multiple tasks with checkboxes
  • Bulk status change (TODO → IN_PROGRESS → DONE)
  • Bulk assignment
  • Bulk delete with confirmation

Project Archiving (T14.5):
  • Soft delete (archived_at timestamp)
  • Filter: Active | Archived | All
  • Restore from archive
```

---

---

### Codebase Analysis Summary (2026-02-21)

> **Note:** ეს ფაზები (10-14) დაემატა კოდბაზის დეტალური ანალიზის შემდეგ

**Issues Found by Category:**

| Category              | Critical | High | Medium | Low | Total |
| --------------------- | -------- | ---- | ------ | --- | ----- |
| Security              | 4        | 2    | 1      | 0   | 7     |
| Memory/Performance    | 1        | 2    | 3      | 0   | 6     |
| Code Quality          | 0        | 3    | 5      | 2   | 10    |
| UX/Accessibility      | 0        | 2    | 6      | 4   | 12    |
| Missing Features      | 0        | 1    | 4      | 2   | 7     |
| **Total**             | **5**    | **10** | **19** | **8** | **42** |

**Key Files Requiring Attention:**

| File                                                  | Lines  | Issue                        |
| ----------------------------------------------------- | ------ | ---------------------------- |
| `apps/api/src/index.ts`                               | 10,734 | Monolithic, needs splitting  |
| `apps/api/src/middleware/auth.ts`                     | ~400   | Code duplication (3x)        |
| `apps/web/src/hooks/use-websocket.ts`                 | ~450   | Security + race conditions   |
| `apps/api/src/middleware/security.ts`                 | ~150   | CORS + rate limiting issues  |
| `apps/web/src/app/dashboard/projects/[id]/page.tsx`   | 1,433  | Too large, needs splitting   |

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
- Total Tasks: 165 (Original: 120, New Phases 10-14: 45)
- Critical Path: T1.1 → T1.3 → T1.5 → T1.11 → T1.14 → T1.15 → T2.4 → T2.10 → T3.7 → T9.7
- **Post-Launch Path**: T10.1 → T10.2 → T10.4 → T11.1 → T11.2 → T12.1 → T13.1 → T14.1

### Task Distribution

| Phase Range | Focus | Tasks |
| ----------- | ----- | ----- |
| Phases 1-4  | Core MVP | 69 |
| Phases 5-8  | Team Collaboration | 43 |
| Phase 9     | Production & Launch | 7 |
| Phase 10    | Security & Stability | 10 |
| Phase 11    | Code Refactoring | 8 |
| Phase 12    | UX/UI Improvements | 12 |
| Phase 13    | Performance | 8 |
| Phase 14    | New Features | 7 |
| **Total**   | | **165** |

---

_Generated from specification: PRODUCT_VISION.md_
