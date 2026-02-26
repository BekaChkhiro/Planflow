# PlanFlow - Product Vision & Implementation Guide

> AI-Native Project Management for Claude Code

**Version:** 1.0.0
**Last Updated:** 2026-01-28
**Status:** Planning Phase

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Architecture](#2-architecture)
3. [Team Collaboration Scenarios](#3-team-collaboration-scenarios)
4. [Real-time Synchronization](#4-real-time-synchronization)
5. [Code Review System](#5-code-review-system)
6. [Backend API Design](#6-backend-api-design)
7. [MCP Server Implementation](#7-mcp-server-implementation)
8. [Business Model & Pricing](#8-business-model--pricing)
9. [MVP Implementation Plan](#9-mvp-implementation-plan)
10. [Code Examples](#10-code-examples)
11. [Deployment & Infrastructure](#11-deployment--infrastructure)
12. [Payment Alternatives (Non-Stripe)](#12-payment-alternatives)

---

## 1. Product Overview

### 1.1 Problem Statement

```
┌─────────────────────────────────────────────────────────────────┐
│  Developer Pain Points                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  😩 Jira/Linear/Asana = Context Switching                       │
│     Code writing → Browser → Task update → Back to code         │
│                                                                 │
│  😩 AI Assistants Don't Know Project Context                    │
│     Have to explain to ChatGPT every time what you're working on│
│                                                                 │
│  😩 Plans and Code are Separated                                │
│     Plan in Notion, code in GitHub, discussion in Slack         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Solution: PlanFlow

```
┌─────────────────────────────────────────────────────────────────┐
│  PlanFlow - AI-Native Project Management                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ✅ AI-Native Project Management                                │
│     Integrated in Claude Code, no context switching             │
│                                                                 │
│  ✅ Code-First Workflow                                         │
│     Never leave the terminal, everything in one place           │
│                                                                 │
│  ✅ Intelligent Planning                                        │
│     AI helps with planning, not just tracking                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 Unique Selling Proposition (USP)

> "The only project management tool built FOR AI-assisted development, not adapted to it."

### 1.4 Target Audience

| Persona             | Description                                          | Pain Point         |
| ------------------- | ---------------------------------------------------- | ------------------ |
| AI-Native Developer | 25-35, uses Claude/Copilot daily, startup/freelancer | Context switching  |
| Tech Lead           | 30-40, manages 3-10 person team                      | Overhead, meetings |
| Indie Hacker        | Side projects, fast iteration                        | Needs simplicity   |

---

## 2. Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│    ┌─────────────┐       ┌─────────────┐       ┌─────────────────────────┐  │
│    │             │       │             │       │                         │  │
│    │ Claude Code │◄─MCP─►│ MCP Server  │◄─HTTP─►│     Backend API        │  │
│    │             │       │ (Local)     │       │   (api.planflow.io)    │  │
│    └─────────────┘       └─────────────┘       └───────────┬─────────────┘  │
│                                                            │                │
│                                                            │                │
│                                ┌───────────────────────────┼───────────────┐│
│                                │                           ▼               ││
│                                │  ┌─────────────┐    ┌──────────┐          ││
│                                │  │  PostgreSQL │    │  Redis   │          ││
│                                │  │  (Data)     │    │ (Cache/  │          ││
│                                │  │             │    │  PubSub) │          ││
│                                │  └─────────────┘    └──────────┘          ││
│                                │         Database Layer                    ││
│                                └───────────────────────────────────────────┘│
│                                                            ▲                │
│                                                            │                │
│                                                   ┌────────┴────────┐       │
│                                                   │   Frontend      │       │
│                                                   │   (React/Vue)   │       │
│                                                   │   planflow.io   │       │
│                                                   └─────────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Technology Stack

```
┌─────────────────────────────────────────────────────────────────┐
│  Recommended Stack                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🖥️ BACKEND                                                     │
│  ├── Runtime:      Node.js 20+                                  │
│  ├── Framework:    Hono (lightweight, fast)                     │
│  ├── Database:     PostgreSQL (Neon - serverless)               │
│  ├── ORM:          Drizzle ORM (type-safe)                      │
│  ├── Auth:         Better-Auth or Lucia                         │
│  ├── Validation:   Zod                                          │
│  └── Hosting:      Railway or Render                            │
│                                                                 │
│  🌐 FRONTEND                                                    │
│  ├── Framework:    Next.js 14+ (App Router)                     │
│  ├── Styling:      Tailwind CSS                                 │
│  ├── Components:   shadcn/ui                                    │
│  ├── State:        Zustand or TanStack Query                    │
│  └── Hosting:      Vercel                                       │
│                                                                 │
│  🔌 MCP SERVER                                                  │
│  ├── Runtime:      Node.js                                      │
│  ├── SDK:          @modelcontextprotocol/sdk                    │
│  └── Distribution: npm package                                  │
│                                                                 │
│  📦 MONOREPO                                                    │
│  └── Turborepo + pnpm                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Project Structure

```
planflow/
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
│
├── apps/
│   ├── api/                      # Backend API
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts          # Entry point
│   │   │   ├── app.ts            # Hono app setup
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── projects.ts
│   │   │   │   ├── tasks.ts
│   │   │   │   ├── tokens.ts
│   │   │   │   └── webhooks.ts
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts
│   │   │   │   └── rateLimit.ts
│   │   │   ├── services/
│   │   │   │   ├── plan-parser.ts
│   │   │   │   └── payment.ts
│   │   │   └── lib/
│   │   │       └── db.ts
│   │   └── drizzle/
│   │       ├── schema.ts
│   │       └── migrations/
│   │
│   ├── web/                      # Next.js Frontend
│   │   ├── package.json
│   │   ├── app/
│   │   │   ├── (marketing)/      # Landing page
│   │   │   │   ├── page.tsx
│   │   │   │   └── pricing/
│   │   │   ├── (auth)/
│   │   │   │   ├── login/
│   │   │   │   └── register/
│   │   │   ├── (dashboard)/
│   │   │   │   ├── projects/
│   │   │   │   ├── settings/
│   │   │   │   └── billing/
│   │   │   └── api/
│   │   ├── components/
│   │   └── lib/
│   │
│   └── mcp/                      # MCP Server
│       ├── package.json
│       ├── src/
│       │   ├── index.ts
│       │   ├── server.ts
│       │   ├── tools/
│       │   ├── api-client.ts
│       │   └── config.ts
│       └── bin/
│           └── planflow-mcp
│
├── packages/
│   ├── db/                       # Shared database schema
│   │   ├── package.json
│   │   ├── schema.ts
│   │   └── index.ts
│   │
│   ├── types/                    # Shared TypeScript types
│   │   ├── package.json
│   │   └── index.ts
│   │
│   └── plan-parser/              # Plan parsing logic
│       ├── package.json
│       ├── parser.ts
│       └── types.ts
│
└── docker-compose.yml            # Local development
```

---

## 3. Team Collaboration Scenarios

### 3.1 Scenario: Project Kickoff (Team Lead)

```
┌─────────────────────────────────────────────────────────────────┐
│  Giorgi (Team Lead) - In Claude Code                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  > /plan:new                                                    │
│  ✓ Project plan created: PROJECT_PLAN.md                        │
│                                                                 │
│  > /plan:push                                                   │
│  ✓ Project uploaded to server                                   │
│  ✓ Link: https://planflow.io/projects/ecommerce-app             │
│                                                                 │
│  > /plan:team invite nino@email.com --role=developer            │
│  ✓ Invitation sent to Nino                                      │
│                                                                 │
│  > /plan:team invite dato@email.com --role=developer            │
│  ✓ Invitation sent to Dato                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Scenario: Developer Daily Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│  Nino (Developer) - Starting work in the morning                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  > /plan:pull                                                   │
│  ✓ Project updated                                              │
│  📋 Assigned to you: 2 tasks                                    │
│     • T2.1 - User Authentication [HIGH]                         │
│     • T2.3 - Password Reset [MEDIUM]                            │
│                                                                 │
│  > /plan:next --mine                                            │
│  💡 Recommendation: T2.1 - User Authentication                  │
│     Reason: High priority, T2.3 depends on this                 │
│                                                                 │
│  > /plan:update T2.1 start                                      │
│  ✓ T2.1 started (IN_PROGRESS)                                   │
│  📡 Team notified                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Scenario: Collaboration and Communication

```
┌─────────────────────────────────────────────────────────────────┐
│  Nino - Encountered a problem                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  > /plan:comment T2.1 "Need help with OAuth integration"        │
│  ✓ Comment added                                                │
│  📡 Team notified                                               │
│                                                                 │
│  > /plan:block T2.1 "Don't have Google OAuth credentials"       │
│  ✓ T2.1 blocked                                                 │
│  ⚠️ Giorgi (Team Lead) notified                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Giorgi - Response                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  > /plan:notifications                                          │
│  🔔 New notifications:                                          │
│     • Nino: comment on T2.1 (5 min ago)                         │
│     • Nino: blocked T2.1 (3 min ago)                            │
│                                                                 │
│  > /plan:comment T2.1 "Sent credentials via Slack"              │
│  ✓ Comment added                                                │
│                                                                 │
│  > /plan:unblock T2.1                                           │
│  ✓ T2.1 unblocked                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.4 Scenario: Progress Tracking (Website Dashboard)

```
┌─────────────────────────────────────────────────────────────────┐
│  Website Dashboard - https://planflow.io/projects/ecommerce     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📊 Progress: ████████░░░░░░░░░░░░ 42%                          │
│                                                                 │
│  👥 Team:                                                       │
│  ┌──────────┬────────────┬───────────────────┬─────────┐        │
│  │ Member   │ Role       │ Current Task      │ Status  │        │
│  ├──────────┼────────────┼───────────────────┼─────────┤        │
│  │ Giorgi   │ Team Lead  │ -                 │ 🟢      │        │
│  │ Nino     │ Developer  │ T2.1 Auth         │ 🔵      │        │
│  │ Dato     │ Developer  │ T1.5 UI           │ 🔵      │        │
│  └──────────┴────────────┴───────────────────┴─────────┘        │
│                                                                 │
│  📈 Activity today:                                             │
│  • 09:15 - Nino started T2.1                                    │
│  • 09:30 - Dato completed T1.4                                  │
│  • 10:00 - Nino blocked T2.1                                    │
│  • 10:15 - Giorgi unblocked T2.1                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.5 Scenario: Sprint Planning

```
┌─────────────────────────────────────────────────────────────────┐
│  Giorgi - Weekly planning (Monday)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  > /plan:sprint create "Sprint 3" --duration=1week              │
│  ✓ Sprint 3 created (Jan 27 - Feb 3)                            │
│                                                                 │
│  > /plan:sprint add T2.3 T2.4 T2.5 T3.1                         │
│  ✓ 4 tasks added to Sprint 3                                    │
│                                                                 │
│  > /plan:assign T2.3 --to=dato                                  │
│  > /plan:assign T2.4 --to=nino                                  │
│  > /plan:assign T2.5 --to=dato                                  │
│  > /plan:assign T3.1 --to=nino                                  │
│  ✓ Tasks distributed                                            │
│                                                                 │
│  📊 Sprint 3 Plan:                                              │
│  ┌────────┬─────────────────────┬────────┬──────────┐           │
│  │ ID     │ Task                │ Member │ Due      │           │
│  ├────────┼─────────────────────┼────────┼──────────┤           │
│  │ T2.3   │ Password Reset      │ Dato   │ Jan 29   │           │
│  │ T2.4   │ Email Verification  │ Nino   │ Jan 30   │           │
│  │ T2.5   │ 2FA                 │ Dato   │ Feb 1    │           │
│  │ T3.1   │ Product Catalog     │ Nino   │ Feb 3    │           │
│  └────────┴─────────────────────┴────────┴──────────┘           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.6 Daily Workflow Diagram

```
        Morning                   Midday                    Evening
          │                        │                          │
          ▼                        ▼                          ▼
    ┌──────────┐            ┌──────────┐              ┌──────────┐
    │ /plan:   │            │ Code     │              │ /plan:   │
    │ pull     │───────────►│ writing  │─────────────►│ update   │
    │          │            │          │              │ done     │
    └──────────┘            └──────────┘              └──────────┘
          │                        │                          │
          ▼                        ▼                          ▼
    ┌──────────┐            ┌──────────┐              ┌──────────┐
    │ /plan:   │            │ /plan:   │              │ /plan:   │
    │ next     │            │ comment  │              │ push     │
    │ --mine   │            │ (question)│              │          │
    └──────────┘            └──────────┘              └──────────┘
```

### 3.7 Roles and Permissions

| Role      | Create | Assign | Delete | Add Members |
| --------- | ------ | ------ | ------ | ----------- |
| Owner     | ✅     | ✅     | ✅     | ✅          |
| Team Lead | ✅     | ✅     | ❌     | ✅          |
| Developer | ❌     | ❌     | ❌     | ❌          |
| Viewer    | ❌     | ❌     | ❌     | ❌          |

---

## 4. Real-time Synchronization

### 4.1 Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         WebSocket Server                                │
│                    wss://planflow.io/ws                                 │
└─────────────────────────────────────────────────────────────────────────┘
         ▲                    ▲                    ▲
         │                    │                    │
    ┌────┴────┐          ┌────┴────┐          ┌────┴────┐
    │  Nino   │          │  Dato   │          │ Giorgi  │
    │ Claude  │          │ Website │          │ Claude  │
    │  Code   │          │ Browser │          │  Code   │
    └─────────┘          └─────────┘          └─────────┘
```

### 4.2 Connection Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Nino starts working                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  > /plan:sync --live                                            │
│                                                                 │
│  🔌 Connecting to server...                                     │
│  ✓ Real-time sync enabled                                       │
│  👥 Online: Giorgi, Dato (on website)                           │
│                                                                 │
│  💡 Changes will sync automatically                             │
│  💡 To disable: /plan:sync --stop                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Change Propagation

```
        Nino (Claude Code)              Server                 Dato (Website)
              │                            │                         │
              │  /plan:update T2.1 start   │                         │
              │ ──────────────────────────►│                         │
              │                            │                         │
              │                            │   broadcast: task_updated
              │                            │ ────────────────────────►│
              │                            │                         │
              │                            │                    🔔 Notification:
              │                            │                    "Nino started T2.1"
              │                            │                         │
              │   ack: task_updated        │                         │
              │ ◄──────────────────────────│                         │
              │                            │                         │
         ✓ T2.1 IN_PROGRESS               │                    Kanban updated
              │                            │                         │
```

### 4.4 Event Types

```
┌─────────────────────────────────────────────────────────────────┐
│  WebSocket Events                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📋 Tasks:                                                      │
│     • task_created     - New task created                       │
│     • task_updated     - Status/details changed                 │
│     • task_assigned    - Task assigned to someone               │
│     • task_commented   - Comment added                          │
│     • task_blocked     - Task blocked                           │
│     • task_unblocked   - Task unblocked                         │
│                                                                 │
│  👥 Team:                                                       │
│     • user_online      - Member came online                     │
│     • user_offline     - Member went offline                    │
│     • user_typing      - Member typing comment                  │
│                                                                 │
│  📊 Project:                                                    │
│     • project_updated  - Plan updated                           │
│     • sprint_created   - New sprint                             │
│     • milestone_reached - Milestone completed                   │
│                                                                 │
│  🔍 Code Review:                                                │
│     • review_requested - Review requested                       │
│     • review_submitted - Review completed                       │
│     • pr_merged        - PR merged                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.5 Notifications in Claude Code

```
┌─────────────────────────────────────────────────────────────────┐
│  Nino working, sync enabled                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  > (writing code...)                                            │
│                                                                 │
│  ─────────────────────────────────────────────                  │
│  🔔 [10:15] Dato started T2.5 (2FA)                             │
│  ─────────────────────────────────────────────                  │
│                                                                 │
│  > (continues working...)                                       │
│                                                                 │
│  ─────────────────────────────────────────────                  │
│  🔔 [10:32] Giorgi: comment on T2.1                             │
│     "Change API endpoint name to /auth/login"                   │
│  ─────────────────────────────────────────────                  │
│                                                                 │
│  > /plan:comments T2.1                                          │
│  📝 Comments on T2.1:                                           │
│     [10:32] Giorgi: Change API endpoint name...                 │
│                                                                 │
│  > /plan:reply T2.1 "Got it, changing now"                      │
│  ✓ Reply sent                                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.6 Conflict Resolution

```
┌─────────────────────────────────────────────────────────────────┐
│  Conflict Scenario                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Nino (Claude Code)         Dato (Website)                      │
│       │                          │                              │
│       │   T2.1 done              │   T2.1 blocked               │
│       │─────────┐    ┌───────────│                              │
│       │         ▼    ▼           │                              │
│       │      ⚠️ CONFLICT         │                              │
│       │         │                │                              │
│                 ▼                                                │
│  ┌─────────────────────────────────────────────┐                │
│  │  Server: Conflict Resolution                │                │
│  │                                             │                │
│  │  Rule: Last write wins                      │                │
│  │        (Last-Write-Wins)                    │                │
│  │                                             │                │
│  │  Or: More restrictive status wins           │                │
│  │      (blocked > done)                       │                │
│  └─────────────────────────────────────────────┘                │
│                 │                                                │
│                 ▼                                                │
│  ┌─────────────────────────────────────────────┐                │
│  │  Nino is notified:                          │                │
│  │  ⚠️ T2.1 blocked by Dato (your change       │                │
│  │     was overwritten)                        │                │
│  │  Reason: "API credentials not working"      │                │
│  └─────────────────────────────────────────────┘                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.7 Offline Mode

```
┌─────────────────────────────────────────────────────────────────┐
│  Nino loses connection                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ─────────────────────────────────────────────                  │
│  ⚠️ Connection lost. Offline mode.                              │
│  💾 Changes will be saved locally                               │
│  ─────────────────────────────────────────────                  │
│                                                                 │
│  > /plan:update T2.1 done                                       │
│  ✓ T2.1 completed (locally)                                     │
│  📋 Pending sync: 1 change                                      │
│                                                                 │
│  > /plan:update T2.4 start                                      │
│  ✓ T2.4 started (locally)                                       │
│  📋 Pending sync: 2 changes                                     │
│                                                                 │
│  ─────────────────────────────────────────────                  │
│  ✅ Connection restored                                          │
│  🔄 Syncing: 2 changes...                                       │
│  ✓ All changes synced                                           │
│  ─────────────────────────────────────────────                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Code Review System

### 5.1 GitHub/GitLab Integration

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   PROJECT_PLAN.md ◄────────► Website ◄────────► GitHub/GitLab  │
│   (Tasks)                    (Management)        (Code, PRs)    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Review Workflow - Complete Cycle

#### Step 1: Nino completes task and creates PR

```
┌─────────────────────────────────────────────────────────────────┐
│  Nino - Task completion                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  > git add . && git commit -m "feat: add user authentication"   │
│  > git push origin feature/user-auth                            │
│                                                                 │
│  > /plan:pr T2.1                                                │
│                                                                 │
│  🔗 PR created: #42                                             │
│  📋 Task: T2.1 - User Authentication                            │
│                                                                 │
│  PR description auto-filled:                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ ## Task Reference                                       │    │
│  │ Closes T2.1 - User Authentication                       │    │
│  │                                                         │    │
│  │ ## Changes                                              │    │
│  │ - Added JWT authentication                              │    │
│  │ - Created login/register endpoints                      │    │
│  │ - Added password hashing with bcrypt                    │    │
│  │                                                         │    │
│  │ ## Testing                                              │    │
│  │ - [x] Unit tests passing                                │    │
│  │ - [x] Manual testing done                               │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  👤 Who should review?                                          │
│  > Giorgi (Team Lead)                                           │
│                                                                 │
│  ✓ Review request sent to Giorgi                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Step 2: Giorgi receives notification

```
┌─────────────────────────────────────────────────────────────────┐
│  Giorgi - Review request                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ─────────────────────────────────────────────                  │
│  🔔 Review request: PR #42 (T2.1 - User Auth)                   │
│     Author: Nino                                                │
│     Files: 8 | Added: +342 | Removed: -12                       │
│  ─────────────────────────────────────────────                  │
│                                                                 │
│  > /plan:review #42                                             │
│                                                                 │
│  📋 PR #42 - User Authentication                                │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                │
│                                                                 │
│  📁 Changed files:                                              │
│     src/auth/auth.controller.ts      (+89, -0)                  │
│     src/auth/auth.service.ts         (+124, -0)                 │
│     src/auth/auth.module.ts          (+23, -0)                  │
│     src/auth/jwt.strategy.ts         (+45, -0)                  │
│     src/auth/dto/login.dto.ts        (+18, -0)                  │
│     src/auth/dto/register.dto.ts     (+22, -0)                  │
│     src/users/users.service.ts       (+15, -8)                  │
│     test/auth.e2e-spec.ts            (+6, -4)                   │
│                                                                 │
│  🔗 View on GitHub: https://github.com/repo/pull/42             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Step 3: Code review and comments

```
┌─────────────────────────────────────────────────────────────────┐
│  Giorgi - Code Review                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  > /plan:review #42 --file=src/auth/auth.service.ts             │
│                                                                 │
│  📄 src/auth/auth.service.ts                                    │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                │
│                                                                 │
│   45 │   async validateUser(email: string, password: string) {  │
│   46 │     const user = await this.usersService.findByEmail(    │
│   47 │       email                                              │
│   48 │     );                                                   │
│   49 │     if (user && bcrypt.compare(password, user.password)) │
│   50 │       return user;                                       │
│   51 │     }                                                    │
│   52 │     return null;                                         │
│   53 │   }                                                      │
│                                                                 │
│  > /plan:comment #42 --line=49 "bcrypt.compare is async,        │
│    needs await"                                                 │
│                                                                 │
│  ✓ Comment added on line 49                                     │
│                                                                 │
│  > /plan:comment #42 --line=50 "Use early return pattern        │
│    - if (!user) return null;"                                   │
│                                                                 │
│  ✓ Comment added on line 50                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Step 4: Submit review

```
┌─────────────────────────────────────────────────────────────────┐
│  Giorgi - Submit review                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  > /plan:review #42 --submit                                    │
│                                                                 │
│  Review type:                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  [1] ✅ Approve - Code is good, ready to merge          │    │
│  │  [2] 💬 Comment - Only comments, not blocking           │    │
│  │  [3] 🔄 Request Changes - Changes required              │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  > 3                                                            │
│                                                                 │
│  📝 Overall comment (optional):                                 │
│  > "Good implementation, minor fixes needed"                    │
│                                                                 │
│  ✓ Review submitted: Changes Requested                          │
│  📡 Nino notified                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Step 5: Nino fixes code

```
┌─────────────────────────────────────────────────────────────────┐
│  Nino - View review comments                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ─────────────────────────────────────────────                  │
│  🔔 PR #42: Changes Requested (Giorgi)                          │
│     2 comments                                                  │
│  ─────────────────────────────────────────────                  │
│                                                                 │
│  > /plan:review #42 --comments                                  │
│                                                                 │
│  📋 Comments on PR #42:                                         │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                │
│                                                                 │
│  📄 src/auth/auth.service.ts                                    │
│                                                                 │
│  [Line 49] Giorgi:                                              │
│  │ bcrypt.compare is async, needs await                         │
│  │                                                              │
│  │ > /plan:reply "You're right, fixing"                         │
│  │ ✓ Reply sent                                                 │
│                                                                 │
│  [Line 50] Giorgi:                                              │
│  │ Use early return pattern                                     │
│  │                                                              │
│  │ > /plan:reply "Got it 👍"                                    │
│  │ ✓ Reply sent                                                 │
│                                                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                │
│                                                                 │
│  (Nino fixes the code...)                                       │
│                                                                 │
│  > git add . && git commit -m "fix: add await to bcrypt"        │
│  > git push                                                     │
│                                                                 │
│  > /plan:review #42 --ready                                     │
│  ✓ PR ready for re-review                                       │
│  📡 Giorgi notified                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Step 6: Final approval and merge

```
┌─────────────────────────────────────────────────────────────────┐
│  Giorgi - Final review                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  > /plan:review #42 --diff                                      │
│                                                                 │
│  📋 New changes (+1 commit):                                    │
│                                                                 │
│   49 │-  if (user && bcrypt.compare(password, user.password)) { │
│   49 │+  if (!user) return null;                                │
│   50 │+  const isValid = await bcrypt.compare(password,         │
│      │+    user.password);                                      │
│   51 │+  if (!isValid) return null;                             │
│   52 │+  return user;                                           │
│                                                                 │
│  ✅ Fixes look correct                                          │
│                                                                 │
│  > /plan:approve #42 "LGTM! 🚀"                                 │
│                                                                 │
│  ✓ PR #42 approved                                              │
│                                                                 │
│  Merge method:                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  [1] 🔀 Merge commit                                    │    │
│  │  [2] 🎯 Squash and merge (Recommended)                  │    │
│  │  [3] ⏩ Rebase and merge                                 │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  > 2                                                            │
│                                                                 │
│  ✓ PR #42 merged to main branch                                 │
│  ✓ T2.1 automatically marked as DONE                            │
│  ✓ feature/user-auth branch deleted                             │
│                                                                 │
│  📡 Team notified                                               │
│  ⚡ T2.3, T2.4 unblocked (were dependent on T2.1)               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 Review Statistics

```
┌─────────────────────────────────────────────────────────────────┐
│  Website - Review Dashboard                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📊 Review Metrics (Sprint 3)                                   │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                │
│                                                                 │
│  ⏱️ Average review time: 4.2 hours                              │
│  🔄 Average iterations: 1.3                                     │
│  ✅ First-time approval rate: 68%                               │
│                                                                 │
│  👤 Reviewer activity:                                          │
│  ┌──────────┬────────────┬──────────┬───────────┐               │
│  │ Reviewer │ Reviews    │ Avg Time │ Approval% │               │
│  ├──────────┼────────────┼──────────┼───────────┤               │
│  │ Giorgi   │ 12         │ 3.5h     │ 75%       │               │
│  │ Nino     │ 5          │ 6.2h     │ 60%       │               │
│  │ Dato     │ 8          │ 4.8h     │ 62%       │               │
│  └──────────┴────────────┴──────────┴───────────┘               │
│                                                                 │
│  🏷️ Common comment types:                                      │
│     • Code style (34%)                                          │
│     • Missing tests (28%)                                       │
│     • Performance (18%)                                         │
│     • Security (12%)                                            │
│     • Documentation (8%)                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.4 Review Configuration

```
┌─────────────────────────────────────────────────────────────────┐
│  /plan:settings review                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ⚙️ Review Configuration                                        │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                │
│                                                                 │
│  📋 Required approvals: 1                                       │
│  👤 Auto-assign reviewer: Team Lead                             │
│  🚫 Self-approve: Disabled                                      │
│  ⏰ Review SLA: 24 hours                                         │
│                                                                 │
│  🔒 Branch protection:                                          │
│     • main: 2 approvals required                                │
│     • develop: 1 approval required                              │
│     • feature/*: 1 approval required                            │
│                                                                 │
│  🤖 Automated checks:                                           │
│     ✅ Tests must pass                                          │
│     ✅ No merge conflicts                                       │
│     ✅ Code coverage > 80%                                      │
│     ⬚ Lint errors = 0 (optional)                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Backend API Design

### 6.1 Database Schema

```sql
-- Users
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    avatar_url      VARCHAR(500),
    plan            VARCHAR(50) DEFAULT 'free',
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- Organizations/Teams
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(100) UNIQUE NOT NULL,
    owner_id        UUID REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Organization Members
CREATE TABLE organization_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(50) DEFAULT 'developer',
    joined_at       TIMESTAMP DEFAULT NOW(),
    UNIQUE(organization_id, user_id)
);

-- Projects
CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(100) NOT NULL,
    description     TEXT,
    plan_content    TEXT,
    plan_hash       VARCHAR(64),
    progress        INTEGER DEFAULT 0,
    github_repo     VARCHAR(500),
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(organization_id, slug)
);

-- Tasks
CREATE TABLE tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
    task_id         VARCHAR(20) NOT NULL,
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    status          VARCHAR(20) DEFAULT 'todo',
    priority        VARCHAR(20) DEFAULT 'medium',
    complexity      VARCHAR(20),
    phase           INTEGER DEFAULT 1,
    assigned_to     UUID REFERENCES users(id),
    estimated_hours DECIMAL(5,2),
    actual_hours    DECIMAL(5,2),
    due_date        DATE,
    blocked_reason  TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),
    completed_at    TIMESTAMP,
    UNIQUE(project_id, task_id)
);

-- Task Dependencies
CREATE TABLE task_dependencies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id         UUID REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on_id   UUID REFERENCES tasks(id) ON DELETE CASCADE,
    UNIQUE(task_id, depends_on_id)
);

-- Comments
CREATE TABLE comments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id         UUID REFERENCES tasks(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id),
    content         TEXT NOT NULL,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- Activity Log
CREATE TABLE activity_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id),
    action          VARCHAR(50) NOT NULL,
    entity_type     VARCHAR(50),
    entity_id       UUID,
    metadata        JSONB,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- API Tokens (for MCP)
CREATE TABLE api_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    token_hash      VARCHAR(255) NOT NULL,
    token_prefix    VARCHAR(10) NOT NULL,
    last_used_at    TIMESTAMP,
    expires_at      TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Subscriptions
CREATE TABLE subscriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    plan            VARCHAR(50) NOT NULL,
    status          VARCHAR(50) NOT NULL,
    payment_provider VARCHAR(50),
    external_id     VARCHAR(255),
    current_period_start TIMESTAMP,
    current_period_end   TIMESTAMP,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Sprints
CREATE TABLE sprints (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    status          VARCHAR(20) DEFAULT 'planned',
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Sprint-Tasks Relationship
CREATE TABLE sprint_tasks (
    sprint_id       UUID REFERENCES sprints(id) ON DELETE CASCADE,
    task_id         UUID REFERENCES tasks(id) ON DELETE CASCADE,
    PRIMARY KEY(sprint_id, task_id)
);
```

### 6.2 API Endpoints

```yaml
# ================================
# Auth Endpoints
# ================================

POST /api/auth/register
  Request:
    email: string
    password: string
    name: string
  Response:
    user: User
    accessToken: string
    refreshToken: string

POST /api/auth/login
  Request:
    email: string
    password: string
  Response:
    user: User
    accessToken: string
    refreshToken: string

POST /api/auth/refresh
  Request:
    refreshToken: string
  Response:
    accessToken: string

POST /api/auth/logout
  Headers: Authorization: Bearer {token}

GET /api/auth/me
  Headers: Authorization: Bearer {token}
  Response:
    user: User

# ================================
# API Tokens (for MCP)
# ================================

GET /api/tokens
  → List user's API tokens

POST /api/tokens
  Request:
    name: string
    expiresIn?: "30d" | "90d" | "1y" | "never"
  Response:
    token: string  # Only shown once!
    id: string

DELETE /api/tokens/:id

# ================================
# Projects
# ================================

GET /api/projects
  Query: organizationId?: string
  → List accessible projects

POST /api/projects
  Request:
    organizationId?: string
    name: string
    slug: string
    description?: string
    planContent?: string

GET /api/projects/:id
  → Project details with tasks summary

PUT /api/projects/:id
  Request:
    name?: string
    description?: string
    githubRepo?: string

DELETE /api/projects/:id

# ================================
# Plan Sync (Main MCP endpoints)
# ================================

GET /api/projects/:id/plan
  Response:
    content: string      # PROJECT_PLAN.md
    hash: string         # Content hash
    lastModified: string

PUT /api/projects/:id/plan
  Request:
    content: string
    baseHash?: string    # For conflict detection
  Response:
    hash: string
    conflict?: boolean
    serverContent?: string  # If conflict

POST /api/projects/:id/plan/parse
  Request:
    content: string
  Response:
    tasks: Task[]
    phases: Phase[]
    progress: number

# ================================
# Tasks
# ================================

GET /api/projects/:id/tasks
  Query:
    status?: string
    assignedTo?: string
    phase?: number
    sprint?: string
  → List tasks with filters

GET /api/tasks/:id
  → Task details with comments

PUT /api/tasks/:id
  Request:
    status?: string
    assignedTo?: string
    priority?: string
    dueDate?: string
    blockedReason?: string

POST /api/tasks/:id/comments
  Request:
    content: string

GET /api/tasks/:id/comments
  → List task comments

# ================================
# Sprints
# ================================

GET /api/projects/:id/sprints
  → List project sprints

POST /api/projects/:id/sprints
  Request:
    name: string
    startDate: string
    endDate: string
    taskIds: string[]

PUT /api/sprints/:id
  Request:
    status?: string
    taskIds?: string[]

GET /api/sprints/:id
  → Sprint details with tasks

# ================================
# Activity & Notifications
# ================================

GET /api/projects/:id/activity
  Query:
    limit?: number
    before?: string
  → Activity feed

GET /api/notifications
  → User's notifications

PUT /api/notifications/:id/read

# ================================
# Team & Stats
# ================================

GET /api/projects/:id/team
  → Team members with current tasks

GET /api/projects/:id/stats
  Response:
    totalTasks: number
    completedTasks: number
    progress: number
    byPhase: PhaseStats[]
    byMember: MemberStats[]
    velocity: number  # tasks/week

# ================================
# WebSocket Events (Real-time)
# ================================

WS /api/ws
  # After connection, subscribe:
  → { type: "subscribe", projectId: "..." }

  # Events:
  ← { type: "task_updated", task: Task }
  ← { type: "comment_added", comment: Comment }
  ← { type: "user_online", user: User }
  ← { type: "plan_updated", hash: string }
```

---

## 7. MCP Server Implementation

### 7.1 MCP Tools

```typescript
// Available MCP Tools
const tools = [
  // Auth
  {
    name: 'planflow_login',
    description: 'Log in to PlanFlow with API token',
    inputSchema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'API token (pf_live_...)' },
      },
      required: ['token'],
    },
  },
  {
    name: 'planflow_logout',
    description: 'Log out from PlanFlow',
  },
  {
    name: 'planflow_whoami',
    description: 'Show current user info',
  },

  // Projects
  {
    name: 'planflow_projects',
    description: 'List your projects',
  },
  {
    name: 'planflow_sync',
    description: 'Sync PROJECT_PLAN.md with server',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        direction: { type: 'string', enum: ['push', 'pull'] },
        content: { type: 'string', description: 'Plan content (for push)' },
      },
      required: ['projectId', 'direction'],
    },
  },

  // Tasks
  {
    name: 'planflow_task_update',
    description: 'Update task status',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        taskId: { type: 'string' },
        status: { type: 'string', enum: ['todo', 'in_progress', 'done', 'blocked'] },
      },
      required: ['projectId', 'taskId', 'status'],
    },
  },
  {
    name: 'planflow_task_next',
    description: 'Get recommendation for next task',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
      },
      required: ['projectId'],
    },
  },

  // Team
  {
    name: 'planflow_team',
    description: 'Show team members and their current tasks',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
      },
      required: ['projectId'],
    },
  },

  // Comments
  {
    name: 'planflow_comment',
    description: 'Add comment to a task',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        taskId: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['projectId', 'taskId', 'content'],
    },
  },
]
```

### 7.2 Claude Code MCP Configuration

```json
// ~/.claude/claude_desktop_config.json
{
  "mcpServers": {
    "planflow": {
      "command": "npx",
      "args": ["planflow-mcp"],
      "env": {}
    }
  }
}
```

### 7.3 Usage Example

```
┌─────────────────────────────────────────────────────────────────┐
│  Claude Code - Using MCP Tools                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  > Log me into planflow                                         │
│                                                                 │
│  🤖 Using planflow_login tool...                                │
│                                                                 │
│  You need a token. Go to Settings → API Tokens                  │
│  at https://planflow.io and create a new token.                 │
│                                                                 │
│  > Here's the token: pf_live_abc123xyz                          │
│                                                                 │
│  🤖 [planflow_login]                                            │
│  ✅ Successfully logged in!                                     │
│  👤 Giorgi Bekolozi                                             │
│  📧 giorgi@example.com                                          │
│  📦 Plan: PRO                                                   │
│                                                                 │
│  > Show my projects                                             │
│                                                                 │
│  🤖 [planflow_projects]                                         │
│  📋 Your projects:                                              │
│                                                                 │
│  📁 E-Commerce App (ecommerce)                                  │
│     Progress: 42% | Tasks: 24                                   │
│                                                                 │
│  📁 Mobile App (mobile)                                         │
│     Progress: 15% | Tasks: 18                                   │
│                                                                 │
│  > Mark T2.1 as done                                            │
│                                                                 │
│  🤖 [planflow_task_update] taskId=T2.1, status=done             │
│  ✅ T2.1 updated: DONE                                          │
│  ⚡ Unblocked: T2.3, T2.4                                       │
│  📊 Progress: 42% → 46%                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Business Model & Pricing

### 8.1 Pricing Tiers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   🆓 FREE                  💼 PRO                    🏢 TEAM                │
│   $0/month                 $12/month                 $29/user/month         │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ✅ 3 projects            ✅ Unlimited projects     ✅ Everything in PRO   │
│   ✅ Local plans           ✅ Cloud Sync             ✅ Team management     │
│   ✅ /plan:new             ✅ Real-time Sync         ✅ Role-based access   │
│   ✅ /plan:next            ✅ GitHub Integration     ✅ Code Review flow    │
│   ✅ /plan:update          ✅ Export (all formats)   ✅ Sprint management   │
│   ❌ Cloud Sync            ✅ Activity History       ✅ Analytics dashboard │
│   ❌ Team features         ✅ Priority Support       ✅ SSO/SAML            │
│   ❌ GitHub Integration    ✅ API Access             ✅ Audit logs          │
│                                                      ✅ Custom integrations │
│                                                      ✅ Dedicated support   │
│                                                                             │
│   Ideal for:               Ideal for:               Ideal for:             │
│   Solo developers          Freelancers              Startups, Teams        │
│   Learning/Testing         Indie hackers            Agencies               │
│                            Small projects           Companies              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Enterprise Tier

```
┌─────────────────────────────────────────────────────────────────┐
│  🏛️ ENTERPRISE - Custom Pricing                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Everything in TEAM, plus:                                      │
│                                                                 │
│  ✅ Self-hosted option (on-premise)                             │
│  ✅ SLA guarantee (99.9% uptime)                                │
│  ✅ Dedicated instance                                          │
│  ✅ Custom MCP integrations                                     │
│  ✅ Jira/Linear bi-directional sync                             │
│  ✅ Advanced security (SOC2, GDPR)                              │
│  ✅ Training & onboarding                                       │
│  ✅ Account manager                                             │
│                                                                 │
│  Ideal for: Large companies, Enterprises                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 8.3 Revenue Projection

```
┌─────────────────────────────────────────────────────────────────┐
│  Year 1 Projection (Conservative)                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  FREE users:     5,000  (for funnel)                            │
│  PRO users:        500  × $12 = $6,000/month                    │
│  TEAM users:       100  × $29 = $2,900/month                    │
│                    ─────────────────────────                    │
│  MRR:              ~$9,000/month                                │
│  ARR:              ~$108,000/year                               │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Year 2-3 (Growth)                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PRO users:      2,000  × $12 = $24,000/month                   │
│  TEAM users:       500  × $29 = $14,500/month                   │
│  Enterprise:         5  × $500 = $2,500/month                   │
│                    ─────────────────────────                    │
│  MRR:              ~$41,000/month                               │
│  ARR:              ~$492,000/year                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 8.4 Competitive Analysis

| Feature                 | PlanFlow       | Linear      | Jira        | GitHub Projects |
| ----------------------- | -------------- | ----------- | ----------- | --------------- |
| AI Planning             | ✅ Native      | ⚠️ Limited  | ❌ No       | ❌ No           |
| CLI-First               | ✅ Yes         | ❌ Web only | ❌ Web only | ⚠️ Basic        |
| Claude Code Integration | ✅ Deep        | ❌ No       | ❌ No       | ❌ No           |
| Auto Plan Generation    | ✅ Yes         | ❌ No       | ❌ No       | ❌ No           |
| Price/user              | $12-29         | $10         | $8-16       | $4              |
| Target                  | AI-native devs | Startups    | Enterprise  | Open source     |

---

## 9. MVP Implementation Plan

### 9.1 MVP Scope

```
┌─────────────────────────────────────────────────────────────────┐
│  In MVP                         Not in MVP (Post-MVP)           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ✅ User registration/login     ❌ Real-time WebSocket          │
│  ✅ API token generation        ❌ Team invitations             │
│  ✅ Project CRUD                ❌ Code review flow             │
│  ✅ Plan sync (push/pull)       ❌ GitHub integration           │
│  ✅ Task status updates         ❌ Sprint management            │
│  ✅ Basic web dashboard         ❌ Mobile app                   │
│  ✅ MCP server                  ❌ Jira/Linear import           │
│  ✅ Payment integration         ❌ Analytics dashboard          │
│  ✅ Landing page                ❌ SSO/SAML                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 Sprint-by-Sprint Plan

#### Sprint 1: Foundation (Week 1-2)

```
┌─────────────────────────────────────────────────────────────────┐
│  🎯 Goal: Backend API skeleton + Database                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Day 1-2: Project Setup                                         │
│  ├── Monorepo initialization (Turborepo + pnpm)                 │
│  ├── PostgreSQL setup (Neon)                                    │
│  ├── Drizzle ORM configuration                                  │
│  └── Basic CI/CD (GitHub Actions)                               │
│                                                                 │
│  Day 3-4: Database Schema                                       │
│  ├── Users table                                                │
│  ├── Projects table                                             │
│  ├── Tasks table                                                │
│  ├── API tokens table                                           │
│  └── Subscriptions table                                        │
│                                                                 │
│  Day 5-7: Auth System                                           │
│  ├── Register endpoint                                          │
│  ├── Login endpoint (JWT)                                       │
│  ├── Token refresh                                              │
│  ├── API token generation                                       │
│  └── Auth middleware                                            │
│                                                                 │
│  Day 8-10: Core API Endpoints                                   │
│  ├── GET/POST/PUT/DELETE /projects                              │
│  ├── GET/PUT /projects/:id/plan                                 │
│  ├── GET/PUT /projects/:id/tasks                                │
│  └── API documentation (OpenAPI)                                │
│                                                                 │
│  ✅ Deliverable: Working API with auth                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Sprint 2: MCP Server (Week 3-4)

```
┌─────────────────────────────────────────────────────────────────┐
│  🎯 Goal: Fully functional MCP server                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Day 1-3: MCP Foundation                                        │
│  ├── MCP SDK setup                                              │
│  ├── Server scaffolding                                         │
│  ├── Config management (token storage)                          │
│  └── API client wrapper                                         │
│                                                                 │
│  Day 4-6: Auth & Project Tools                                  │
│  ├── planflow_login                                             │
│  ├── planflow_logout                                            │
│  ├── planflow_whoami                                            │
│  ├── planflow_projects                                          │
│  ├── planflow_create                                            │
│  └── planflow_sync                                              │
│                                                                 │
│  Day 7-9: Task Tools                                            │
│  ├── planflow_task_list                                         │
│  ├── planflow_task_update                                       │
│  ├── planflow_task_next                                         │
│  └── planflow_notifications                                     │
│                                                                 │
│  Day 10: Testing & Packaging                                    │
│  ├── Integration tests                                          │
│  ├── npm package setup                                          │
│  └── Installation documentation                                 │
│                                                                 │
│  ✅ Deliverable: npm install planflow-mcp                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Sprint 3: Web Dashboard (Week 5-6)

```
┌─────────────────────────────────────────────────────────────────┐
│  🎯 Goal: Functional web interface                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Day 1-2: Auth Pages                                            │
│  ├── Login page                                                 │
│  ├── Register page                                              │
│  ├── Forgot password                                            │
│  └── Auth state management                                      │
│                                                                 │
│  Day 3-5: Dashboard                                             │
│  ├── Projects list page                                         │
│  ├── Project detail page                                        │
│  │   ├── Plan viewer (markdown)                                 │
│  │   ├── Tasks kanban/list                                      │
│  │   └── Progress visualization                                 │
│  └── Create project modal                                       │
│                                                                 │
│  Day 6-7: Settings                                              │
│  ├── Profile settings                                           │
│  ├── API tokens management                                      │
│  │   ├── Generate new token                                     │
│  │   ├── List tokens                                            │
│  │   └── Revoke token                                           │
│  └── MCP setup instructions                                     │
│                                                                 │
│  Day 8-10: Payment Integration                                  │
│  ├── Pricing page                                               │
│  ├── Checkout flow                                              │
│  ├── Billing portal                                             │
│  ├── Webhook handlers                                           │
│  └── Feature gating                                             │
│                                                                 │
│  ✅ Deliverable: Full web app with payments                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Sprint 4: Polish & Launch (Week 7-8)

```
┌─────────────────────────────────────────────────────────────────┐
│  🎯 Goal: Production-ready product                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Day 1-3: Landing Page                                          │
│  ├── Hero section                                               │
│  ├── Features showcase                                          │
│  ├── Pricing comparison                                         │
│  ├── Demo video/GIF                                             │
│  ├── Testimonials (beta users)                                  │
│  └── FAQ                                                        │
│                                                                 │
│  Day 4-5: Documentation                                         │
│  ├── Getting started guide                                      │
│  ├── MCP installation                                           │
│  ├── API reference                                              │
│  └── Video tutorials                                            │
│                                                                 │
│  Day 6-7: Testing & QA                                          │
│  ├── End-to-end testing                                         │
│  ├── Security audit                                             │
│  ├── Performance testing                                        │
│  └── Beta user feedback                                         │
│                                                                 │
│  Day 8-10: Launch                                               │
│  ├── Production deployment                                      │
│  ├── Monitoring setup (Sentry)                                  │
│  ├── Analytics (Plausible/PostHog)                              │
│  ├── Product Hunt submission                                    │
│  └── Social media announcements                                 │
│                                                                 │
│  ✅ Deliverable: Live product!                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. Code Examples

### 10.1 Database Schema (Drizzle)

```typescript
// packages/db/schema.ts
import { pgTable, uuid, varchar, text, timestamp, boolean, integer } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  plan: varchar('plan', { length: 50 }).default('free').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  description: text('description'),
  planContent: text('plan_content'),
  planHash: varchar('plan_hash', { length: 64 }),
  progress: integer('progress').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  taskId: varchar('task_id', { length: 20 }).notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 20 }).default('todo').notNull(),
  priority: varchar('priority', { length: 20 }).default('medium'),
  complexity: varchar('complexity', { length: 20 }),
  phase: integer('phase').default(1),
  estimatedHours: integer('estimated_hours'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
})

export const apiTokens = pgTable('api_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  tokenPrefix: varchar('token_prefix', { length: 10 }).notNull(),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

### 10.2 Backend API (Hono)

```typescript
// apps/api/src/app.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { authRoutes } from './routes/auth'
import { projectRoutes } from './routes/projects'
import { taskRoutes } from './routes/tasks'
import { tokenRoutes } from './routes/tokens'
import { authMiddleware } from './middleware/auth'

const app = new Hono()

// Middleware
app.use('*', logger())
app.use(
  '*',
  cors({
    origin: ['http://localhost:3000', 'https://planflow.io'],
    credentials: true,
  })
)

// Public routes
app.route('/api/auth', authRoutes)

// Protected routes
app.use('/api/*', authMiddleware)
app.route('/api/projects', projectRoutes)
app.route('/api/tasks', taskRoutes)
app.route('/api/tokens', tokenRoutes)

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }))

export default app
```

```typescript
// apps/api/src/routes/auth.ts
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../lib/db'
import { users } from '@planflow/db'
import { hashPassword, verifyPassword, generateToken } from '../lib/auth'
import { eq } from 'drizzle-orm'

const authRoutes = new Hono()

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
})

authRoutes.post('/register', zValidator('json', registerSchema), async (c) => {
  const { email, password, name } = c.req.valid('json')

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  })

  if (existing) {
    return c.json({ error: 'Email already registered' }, 400)
  }

  const passwordHash = await hashPassword(password)
  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      name,
    })
    .returning()

  const token = generateToken(user.id)

  return c.json({
    user: { id: user.id, email: user.email, name: user.name },
    token,
  })
})

authRoutes.post(
  '/login',
  zValidator(
    'json',
    z.object({
      email: z.string().email(),
      password: z.string(),
    })
  ),
  async (c) => {
    const { email, password } = c.req.valid('json')

    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    })

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return c.json({ error: 'Invalid credentials' }, 401)
    }

    const token = generateToken(user.id)

    return c.json({
      user: { id: user.id, email: user.email, name: user.name, plan: user.plan },
      token,
    })
  }
)

export { authRoutes }
```

### 10.3 MCP Server

```typescript
// apps/mcp/src/index.ts
#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { tools, handleToolCall } from './tools/index.js';
import { ApiClient } from './api-client.js';
import { ConfigManager } from './config.js';

const server = new Server(
  { name: 'planflow', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

const config = new ConfigManager();
const api = new ApiClient(config);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return handleToolCall(name, args || {}, api, config);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('PlanFlow MCP Server started');
}

main().catch(console.error);
```

```typescript
// apps/mcp/src/api-client.ts
import { ConfigManager } from './config.js'

export class ApiClient {
  constructor(private config: ConfigManager) {}

  private async request(method: string, path: string, body?: unknown) {
    const token = this.config.getToken()
    if (!token) {
      throw new Error('Not logged in. Use planflow_login first.')
    }

    const baseUrl = this.config.getServerUrl()
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error || `API Error: ${response.status}`)
    }

    return response.json()
  }

  get(path: string) {
    return this.request('GET', path)
  }
  post(path: string, body: unknown) {
    return this.request('POST', path, body)
  }
  put(path: string, body: unknown) {
    return this.request('PUT', path, body)
  }
  delete(path: string) {
    return this.request('DELETE', path)
  }
}
```

```typescript
// apps/mcp/src/config.ts
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const CONFIG_DIR = path.join(os.homedir(), '.config', 'planflow')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

interface Config {
  token?: string
  serverUrl: string
}

export class ConfigManager {
  private config: Config

  constructor() {
    this.config = this.load()
  }

  private load(): Config {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
      }
    } catch {}
    return { serverUrl: 'https://api.planflow.io' }
  }

  save() {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true })
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2))
  }

  getToken() {
    return this.config.token
  }
  setToken(token: string) {
    this.config.token = token
  }
  clearToken() {
    delete this.config.token
    this.save()
  }
  getServerUrl() {
    return this.config.serverUrl
  }
}
```

---

## 11. Deployment & Infrastructure

### 11.1 Docker Compose (Local Development)

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: planflow
      POSTGRES_PASSWORD: planflow
      POSTGRES_DB: planflow
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'

volumes:
  postgres_data:
```

### 11.2 GitHub Actions CI/CD

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install
      - run: pnpm build --filter=api

      - name: Deploy to Railway
        uses: bervProject/railway-deploy@v1.0.0
        with:
          railway_token: ${{ secrets.RAILWAY_TOKEN }}
          service: api

  deploy-web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          working-directory: ./apps/web

  publish-mcp:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'

      - run: pnpm install
      - run: pnpm build --filter=mcp
      - run: pnpm publish --filter=mcp --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### 11.3 Cost Estimate (Monthly)

```
┌─────────────────────────────────────────────────────────────────┐
│  Infrastructure Costs (MVP)                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🗄️ Database (Neon):           $0-19/mo (free tier available)   │
│  🚀 API Hosting (Railway):     $5-20/mo                         │
│  🌐 Web Hosting (Vercel):      $0-20/mo (free tier available)   │
│  📧 Email (Resend):            $0-20/mo                         │
│  📊 Analytics (Plausible):     $9/mo                            │
│  🔍 Error Tracking (Sentry):   $0-26/mo                         │
│                                ──────────────                   │
│  Total:                        ~$20-100/month                   │
│                                                                 │
│  💡 Note: Can start with $0 using free tiers!                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 12. Payment Alternatives (Non-Stripe)

Since Stripe is not available in Georgia, here are alternative payment solutions:

### 12.1 Recommended Alternatives

```
┌─────────────────────────────────────────────────────────────────┐
│  Payment Provider Alternatives                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🍋 LemonSqueezy (Recommended)                                  │
│     • Works globally, including Georgia                         │
│     • Built-in subscription management                          │
│     • Handles taxes automatically                               │
│     • Fee: 5% + $0.50 per transaction                          │
│     • URL: https://lemonsqueezy.com                            │
│                                                                 │
│  🏓 Paddle                                                      │
│     • Merchant of Record (handles all taxes)                    │
│     • Works in 200+ countries                                   │
│     • Fee: 5% + $0.50 per transaction                          │
│     • URL: https://paddle.com                                  │
│                                                                 │
│  💳 PayPal                                                      │
│     • Works in Georgia                                          │
│     • Lower trust for SaaS subscriptions                        │
│     • Fee: 2.9% + $0.30                                        │
│                                                                 │
│  🏦 Local Bank Integration                                      │
│     • BOG (Bank of Georgia) - iPay                             │
│     • TBC Bank - TBC Pay                                       │
│     • Best for Georgian customers                               │
│     • Lower fees for local transactions                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 12.2 LemonSqueezy Integration Example

```typescript
// apps/api/src/services/payment.ts
import { lemonSqueezySetup, createCheckout, getSubscription } from '@lemonsqueezy/lemonsqueezy.js'

// Initialize
lemonSqueezySetup({
  apiKey: process.env.LEMONSQUEEZY_API_KEY!,
})

// Product IDs (from LemonSqueezy dashboard)
const PRODUCTS = {
  pro: process.env.LEMONSQUEEZY_PRO_VARIANT_ID!,
  team: process.env.LEMONSQUEEZY_TEAM_VARIANT_ID!,
}

export async function createSubscriptionCheckout(
  userId: string,
  email: string,
  plan: 'pro' | 'team'
) {
  const checkout = await createCheckout({
    storeId: process.env.LEMONSQUEEZY_STORE_ID!,
    variantId: PRODUCTS[plan],
    checkoutData: {
      email,
      custom: {
        user_id: userId,
      },
    },
  })

  return checkout.data?.data.attributes.url
}

export async function handleWebhook(payload: any, signature: string) {
  // Verify webhook signature
  // Process subscription events
  const event = payload.meta.event_name

  switch (event) {
    case 'subscription_created':
      // Activate user subscription
      break
    case 'subscription_updated':
      // Update subscription status
      break
    case 'subscription_cancelled':
      // Handle cancellation
      break
  }
}
```

### 12.3 Hybrid Approach

For Georgian customers, you can offer:

1. **International customers**: LemonSqueezy/Paddle
2. **Georgian customers**: Bank transfer or BOG/TBC integration
3. **Crypto option**: USDT/USDC payments (optional)

```typescript
// apps/api/src/routes/billing.ts
import { Hono } from 'hono'

const billingRoutes = new Hono()

billingRoutes.post('/checkout', async (c) => {
  const { plan, paymentMethod } = await c.req.json()
  const user = c.get('user')

  switch (paymentMethod) {
    case 'card':
      // LemonSqueezy checkout
      const url = await createLemonSqueezyCheckout(user.id, user.email, plan)
      return c.json({ checkoutUrl: url })

    case 'bank_transfer':
      // Generate invoice for bank transfer
      const invoice = await createBankTransferInvoice(user.id, plan)
      return c.json({
        invoiceId: invoice.id,
        bankDetails: {
          bank: 'Bank of Georgia',
          account: 'GE00BG0000000000000000',
          amount: plan === 'pro' ? 12 : 29,
          currency: 'USD',
          reference: invoice.reference,
        },
      })

    default:
      return c.json({ error: 'Invalid payment method' }, 400)
  }
})
```

---

## Summary

This document outlines the complete vision and implementation plan for PlanFlow - an AI-native project management tool for Claude Code. Key points:

1. **Problem**: Developers waste time context-switching between code and project management tools
2. **Solution**: Deep integration with Claude Code via MCP, enabling seamless task management from the terminal
3. **Business Model**: Freemium with PRO ($12/mo) and TEAM ($29/user/mo) tiers
4. **Tech Stack**: Node.js, Hono, PostgreSQL, Next.js, MCP SDK
5. **MVP Timeline**: 8 weeks to production-ready launch
6. **Payment**: LemonSqueezy as primary (Stripe alternative for Georgia)

### Next Steps

1. [ ] Set up monorepo structure
2. [ ] Initialize database with Neon
3. [ ] Build auth system
4. [ ] Create MCP server
5. [ ] Build web dashboard
6. [ ] Integrate LemonSqueezy
7. [ ] Launch on Product Hunt

---

_Document generated: 2026-01-28_
_Version: 1.0.0_
