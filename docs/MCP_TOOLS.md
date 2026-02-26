# PlanFlow MCP Server Tools Reference

> Complete reference for all MCP (Model Context Protocol) server tools

**Version:** 1.6.0
**Last Updated:** 2026-02-24

---

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Quick Reference](#quick-reference)
- [Authentication Tools](#authentication-tools)
  - [planflow_login](#planflow_login)
  - [planflow_logout](#planflow_logout)
  - [planflow_whoami](#planflow_whoami)
- [Project Management Tools](#project-management-tools)
  - [planflow_projects](#planflow_projects)
  - [planflow_create](#planflow_create)
  - [planflow_sync](#planflow_sync)
- [Task Management Tools](#task-management-tools)
  - [planflow_task_list](#planflow_task_list)
  - [planflow_task_update](#planflow_task_update)
  - [planflow_task_next](#planflow_task_next)
- [Collaboration Tools](#collaboration-tools)
  - [planflow_notifications](#planflow_notifications)
  - [planflow_activity](#planflow_activity)
  - [planflow_comments](#planflow_comments)
  - [planflow_comment](#planflow_comment)
- [Error Handling](#error-handling)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)

---

## Overview

The PlanFlow MCP Server provides a set of tools that enable Claude Code to interact with PlanFlow's project management features directly from the terminal. These tools are designed for AI-assisted development workflows.

### What is MCP?

The Model Context Protocol (MCP) is an open standard that allows AI assistants like Claude to securely connect to external tools and data sources. PlanFlow's MCP server exposes project management functionality through this protocol.

### Tool Categories

| Category | Tools | Purpose |
|----------|-------|---------|
| **Authentication** | 3 | Login, logout, user info |
| **Project Management** | 3 | List, create, sync projects |
| **Task Management** | 3 | List, update, get next task |
| **Collaboration** | 4 | Notifications, activity, comments |
| **Total** | **13** | |

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Claude Code                            │
└─────────────────────────┬───────────────────────────────────┘
                          │ MCP Protocol (stdio)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   PlanFlow MCP Server                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Auth Tools  │  │Project Tools│  │ Task & Collab Tools │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         └────────────────┼────────────────────┘             │
│                          ▼                                   │
│              ┌───────────────────────┐                      │
│              │    API Client         │                      │
│              │ (HTTP + Auth + Cache) │                      │
│              └───────────┬───────────┘                      │
└──────────────────────────┼──────────────────────────────────┘
                           │ HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────┐
│               PlanFlow Cloud API                             │
│            https://api.planflow.tools                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Installation

### Prerequisites

- Node.js 18+ or Bun
- Claude Code (Claude Desktop or CLI)

### Install via npm

```bash
npm install -g planflow-mcp-server
```

### Configure Claude Code

Add to your Claude Code configuration (`~/.config/claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "planflow": {
      "command": "npx",
      "args": ["-y", "planflow-mcp-server"]
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "planflow": {
      "command": "planflow-mcp"
    }
  }
}
```

### Verify Installation

After restarting Claude Code, you should see PlanFlow tools available. Ask Claude:

> "What PlanFlow tools are available?"

---

## Quick Reference

| Tool | Description | Auth Required |
|------|-------------|---------------|
| `planflow_login` | Authenticate with API token | No |
| `planflow_logout` | Clear stored credentials | No |
| `planflow_whoami` | Show current user info | Yes |
| `planflow_projects` | List all projects | Yes |
| `planflow_create` | Create new project | Yes |
| `planflow_sync` | Sync plan with cloud | Yes |
| `planflow_task_list` | List project tasks | Yes |
| `planflow_task_update` | Update task status | Yes |
| `planflow_task_next` | Get next task recommendation | Yes |
| `planflow_notifications` | View/manage notifications | Yes |
| `planflow_activity` | View project activity | Yes |
| `planflow_comments` | View task comments | Yes |
| `planflow_comment` | Add comment to task | Yes |

---

## Authentication Tools

### planflow_login

Authenticate with PlanFlow using an API token.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `token` | string | Yes | API token from PlanFlow dashboard (starts with `pf_`) |

#### Example

```json
{
  "name": "planflow_login",
  "arguments": {
    "token": "pf_abc123def456..."
  }
}
```

#### Response

**Success:**
```
✅ Login successful!

Welcome, John Doe!
Email: john@example.com
User ID: abc123-def456-...

Your credentials have been saved locally.

💡 Next Steps:
   • planflow_projects    List your projects
   • planflow_create      Create a new project
   • planflow_sync        Sync a local plan to cloud
```

**Error:**
```
❌ Authentication Failed

The API token is invalid or expired.

To get a new token:
1. Visit https://planflow.tools/settings/api-tokens
2. Click "Generate New Token"
3. Copy the token and try again
```

#### Getting Your API Token

1. Visit https://planflow.tools/settings/api-tokens
2. Click "Generate New Token"
3. Give it a descriptive name (e.g., "Claude Code")
4. Copy the token (format: `pf_...`)

**Security Note:** Your token is stored locally at `~/.config/planflow/config.json`. Never share your API token publicly.

---

### planflow_logout

Log out from PlanFlow and clear stored credentials.

#### Parameters

None

#### Example

```json
{
  "name": "planflow_logout",
  "arguments": {}
}
```

#### Response

```
✅ Logged out successfully

Your credentials have been removed from:
~/.config/planflow/config.json

To log in again, use planflow_login with your API token.
```

---

### planflow_whoami

Show information about the currently authenticated user.

#### Parameters

None

#### Example

```json
{
  "name": "planflow_whoami",
  "arguments": {}
}
```

#### Response

```
╭─────────────────────────────────────────────────────╮
│  👤 Current User                                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Name:       John Doe                               │
│  Email:      john@example.com                       │
│  User ID:    abc123-def456-ghi789                   │
│  Auth Type:  API Token                              │
│  Created:    2026-01-15                             │
│                                                     │
│  ── Session Info ────────────────────────────────   │
│  API URL:    https://api.planflow.tools             │
│  Status:     Connected ✅                           │
│                                                     │
╰─────────────────────────────────────────────────────╯
```

---

## Project Management Tools

### planflow_projects

List all your PlanFlow projects.

#### Parameters

None

#### Example

```json
{
  "name": "planflow_projects",
  "arguments": {}
}
```

#### Response

```
╭──────────────────────────────────────────────────────────────────╮
│  📁 Your Projects                                                │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ ID          │ Name              │ Created    │ Updated     │  │
│  ├─────────────┼───────────────────┼────────────┼─────────────┤  │
│  │ abc123...   │ My Awesome App    │ 2026-01-15 │ 2026-02-20  │  │
│  │ def456...   │ Side Project      │ 2026-01-20 │ 2026-02-18  │  │
│  │ ghi789...   │ Team Project      │ 2026-02-01 │ 2026-02-24  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Total: 3 projects                                               │
│                                                                  │
│  💡 Use planflow_sync to sync a project with your local plan     │
│                                                                  │
╰──────────────────────────────────────────────────────────────────╯
```

---

### planflow_create

Create a new PlanFlow project.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Project name (1-255 characters) |
| `description` | string | No | Project description (max 1000 characters) |

#### Example

```json
{
  "name": "planflow_create",
  "arguments": {
    "name": "E-commerce Platform",
    "description": "Full-stack e-commerce platform with Next.js and PostgreSQL"
  }
}
```

#### Response

```
✅ Project Created!

╭─────────────────────────────────────────────────────╮
│  📁 New Project                                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Name:        E-commerce Platform                   │
│  Project ID:  xyz789-abc123-def456                  │
│  Created:     2026-02-24                            │
│                                                     │
╰─────────────────────────────────────────────────────╯

💡 Next Steps:
   • planflow_sync (direction: push) to upload your plan
   • planflow_task_list to view tasks
```

---

### planflow_sync

Sync PROJECT_PLAN.md with PlanFlow cloud (bidirectional).

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `projectId` | string (UUID) | Yes | Project UUID |
| `direction` | enum | Yes | `"push"` (upload) or `"pull"` (download) |
| `content` | string | Conditional | Plan content in markdown (required for push) |

#### Example: Push (Upload)

```json
{
  "name": "planflow_sync",
  "arguments": {
    "projectId": "abc123-def456-ghi789",
    "direction": "push",
    "content": "# Project Plan\n\n## Phase 1\n..."
  }
}
```

**Response:**
```
✅ Plan Pushed Successfully!

╭─────────────────────────────────────────────────────╮
│  ☁️ Sync Complete                                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Direction:   Push (Local → Cloud)                  │
│  Project:     E-commerce Platform                   │
│  File Size:   15.2 KB                               │
│  Lines:       847                                   │
│  Tasks:       42                                    │
│                                                     │
│  Synced at:   2026-02-24 10:30:00                   │
│                                                     │
╰─────────────────────────────────────────────────────╯
```

#### Example: Pull (Download)

```json
{
  "name": "planflow_sync",
  "arguments": {
    "projectId": "abc123-def456-ghi789",
    "direction": "pull"
  }
}
```

**Response:**
```
✅ Plan Pulled Successfully!

╭─────────────────────────────────────────────────────╮
│  ☁️ Sync Complete                                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Direction:   Pull (Cloud → Local)                  │
│  Project:     E-commerce Platform                   │
│  File Size:   15.2 KB                               │
│  Lines:       847                                   │
│                                                     │
╰─────────────────────────────────────────────────────╯

--- Plan Content ---

# E-commerce Platform - Project Plan

## Phase 1: Foundation
...
```

---

## Task Management Tools

### planflow_task_list

List all tasks for a PlanFlow project with optional filtering.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `projectId` | string (UUID) | Yes | Project UUID |
| `status` | enum | No | Filter: `"TODO"`, `"IN_PROGRESS"`, `"DONE"`, `"BLOCKED"` |

#### Example

```json
{
  "name": "planflow_task_list",
  "arguments": {
    "projectId": "abc123-def456-ghi789",
    "status": "TODO"
  }
}
```

#### Response

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  📋 Tasks - E-commerce Platform                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Progress: 🟩🟩🟩🟩🟩🟩⬜⬜⬜⬜ 62% (26/42 tasks)                              │
│                                                                              │
│  ┌────────┬─────────────────────────────────┬────────────┬────────┬───────┐  │
│  │ ID     │ Name                            │ Status     │ Cmplx  │ Est   │  │
│  ├────────┼─────────────────────────────────┼────────────┼────────┼───────┤  │
│  │ T1.1   │ Project Setup                   │ ✅ DONE    │ 🟢 Low │ 2h    │  │
│  │ T1.2   │ Database Schema                 │ ✅ DONE    │ 🟡 Med │ 4h    │  │
│  │ T1.3   │ Authentication                  │ 🔄 IN_PROG │ 🔴 High│ 8h    │  │
│  │ T2.1   │ Product CRUD API                │ 📋 TODO    │ 🟡 Med │ 6h    │  │
│  │ T2.2   │ Cart Functionality              │ 📋 TODO    │ 🟡 Med │ 5h    │  │
│  │ T2.3   │ Checkout Flow                   │ 🚫 BLOCKED │ 🔴 High│ 10h   │  │
│  └────────┴─────────────────────────────────┴────────────┴────────┴───────┘  │
│                                                                              │
│  ── Statistics ──────────────────────────────────────────────────────────    │
│                                                                              │
│  ✅ Done:        26    │  📋 Todo:       12                                   │
│  🔄 In Progress: 3     │  🚫 Blocked:    1                                    │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

---

### planflow_task_update

Update the status of a task in a PlanFlow project.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `projectId` | string (UUID) | Yes | Project UUID |
| `taskId` | string | Yes | Task ID (e.g., "T1.1", "T2.3") |
| `status` | enum | Yes | New status: `"TODO"`, `"IN_PROGRESS"`, `"DONE"`, `"BLOCKED"` |

#### Example

```json
{
  "name": "planflow_task_update",
  "arguments": {
    "projectId": "abc123-def456-ghi789",
    "taskId": "T2.1",
    "status": "IN_PROGRESS"
  }
}
```

#### Response

```
✅ Task Updated!

╭─────────────────────────────────────────────────────╮
│  📋 Task T2.1                                       │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Name:        Product CRUD API                      │
│  Status:      TODO → 🔄 IN_PROGRESS                 │
│  Complexity:  Medium                                │
│  Estimated:   6 hours                               │
│  Dependencies: T1.2, T1.3                           │
│                                                     │
╰─────────────────────────────────────────────────────╯

💡 You're now working on this task!
   Update your progress with planflow_task_update when done.
```

#### Status Transitions

| From | To | Description |
|------|----|-------------|
| TODO | IN_PROGRESS | Start working on task |
| IN_PROGRESS | DONE | Complete the task |
| IN_PROGRESS | BLOCKED | Task is blocked |
| BLOCKED | TODO | Unblock the task |
| BLOCKED | IN_PROGRESS | Resume work |
| ANY | DONE | Mark as complete |

**Note:** When setting status to `IN_PROGRESS` or `DONE`, the tool automatically updates your "Currently Working On" status visible to team members.

---

### planflow_task_next

Get an intelligent recommendation for the next task to work on.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `projectId` | string (UUID) | Yes | Project UUID |

#### Example

```json
{
  "name": "planflow_task_next",
  "arguments": {
    "projectId": "abc123-def456-ghi789"
  }
}
```

#### Response

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🎯 Recommended Next Task                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  T2.1: Product CRUD API                                                      │
│                                                                              │
│  ── Task Details ──────────────────────────────────────────────────────────  │
│                                                                              │
│  📊 Complexity:   Medium                                                     │
│  ⏱️  Estimated:    6 hours                                                   │
│  🎯 Phase:        2 - Core Features                                          │
│  📌 Dependencies: T1.2 ✅, T1.3 ✅ (all satisfied)                            │
│                                                                              │
│  ── Why This Task? ────────────────────────────────────────────────────────  │
│                                                                              │
│  • Unlocks 4 other tasks (T2.2, T2.3, T2.4, T3.1)                            │
│  • All dependencies are complete                                             │
│  • Good complexity balance after high-complexity T1.3                        │
│  • Sequential order (T2.1 is next in Phase 2)                                │
│                                                                              │
│  ── Description ───────────────────────────────────────────────────────────  │
│                                                                              │
│  Implement REST API endpoints for product management:                        │
│  - GET /products (list with pagination)                                      │
│  - GET /products/:id (single product)                                        │
│  - POST /products (create)                                                   │
│  - PUT /products/:id (update)                                                │
│  - DELETE /products/:id (soft delete)                                        │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Ready to start?                                                          │
│     Use planflow_task_update with status "IN_PROGRESS"                       │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯

── Alternative Tasks ────────────────────────────────────────────────────────

1. T2.2: Cart Functionality - Medium - 5 hours
2. T3.1: Dashboard Layout - Low - 3 hours
3. T2.4: Payment Integration - High - 8 hours
```

#### Recommendation Algorithm

The recommendation engine uses a weighted scoring system:

| Factor | Weight | Description |
|--------|--------|-------------|
| **Phase Priority** | 40% | Complete earlier phases first |
| **Dependency Impact** | 30% | Prioritize tasks that unlock others |
| **Complexity Balance** | 20% | Vary difficulty to prevent burnout |
| **Natural Flow** | 10% | Follow sequential task order |

**Special Cases:**

- **All Complete:** Shows congratulations message
- **No Available:** Lists blocked/waiting tasks
- **Many In-Progress:** Suggests finishing current tasks first
- **Only High Complexity:** Warns about complexity with tips

---

## Collaboration Tools

### planflow_notifications

View and manage PlanFlow notifications.

#### Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `action` | enum | No | `"list"` | Action: `"list"`, `"read"`, `"read-all"` |
| `projectId` | string (UUID) | No | - | Filter by project |
| `notificationId` | string (UUID) | Conditional | - | Required for `"read"` action |
| `unreadOnly` | boolean | No | `true` | Show only unread |
| `limit` | number | No | `20` | Max notifications (1-100) |

#### Example: List Notifications

```json
{
  "name": "planflow_notifications",
  "arguments": {
    "action": "list",
    "unreadOnly": true,
    "limit": 10
  }
}
```

**Response:**
```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🔔 Notifications (5 unread)                                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💬 Jane commented on T2.1                               5 min ago    🆕     │
│     "API design looks good! Can we add pagination?"                          │
│                                                                              │
│  👤 You were assigned to T3.1                            1 hour ago   🆕     │
│     Dashboard Layout - E-commerce Platform                                   │
│                                                                              │
│  🔄 T1.3 status changed to DONE                          2 hours ago  🆕     │
│     Authentication - by John Doe                                             │
│                                                                              │
│  📣 Bob mentioned you in T2.3                            3 hours ago  🆕     │
│     "@john can you help with the checkout flow?"                             │
│                                                                              │
│  ✅ T1.2 was unblocked                                   yesterday    🆕     │
│     Database Schema dependencies satisfied                                   │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯

💡 Use action "read-all" to mark all as read
```

#### Example: Mark as Read

```json
{
  "name": "planflow_notifications",
  "arguments": {
    "action": "read",
    "notificationId": "notif-123-456"
  }
}
```

#### Example: Mark All as Read

```json
{
  "name": "planflow_notifications",
  "arguments": {
    "action": "read-all"
  }
}
```

#### Notification Types

| Type | Icon | Description |
|------|------|-------------|
| `comment` | 💬 | Someone commented on a task |
| `status_change` | 🔄 | Task status was updated |
| `task_assigned` | 👤 | Task was assigned to you |
| `task_blocked` | 🚫 | Task was blocked |
| `task_unblocked` | ✅ | Task was unblocked |
| `mention` | 📣 | You were @mentioned |

---

### planflow_activity

View recent activity for a PlanFlow project.

#### Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `projectId` | string (UUID) | Yes | - | Project UUID |
| `taskId` | string | No | - | Filter by task |
| `action` | enum | No | - | Filter by action type |
| `entityType` | enum | No | - | Filter by entity type |
| `limit` | number | No | `20` | Max activities (1-100) |

#### Action Types

| Action | Icon | Description |
|--------|------|-------------|
| `task_created` | ✨ | New task created |
| `task_updated` | 📝 | Task details updated |
| `task_deleted` | 🗑️ | Task deleted |
| `task_status_changed` | 🔄 | Status changed |
| `task_assigned` | 👤 | Task assigned |
| `task_unassigned` | 👤 | Task unassigned |
| `comment_created` | 💬 | Comment added |
| `comment_updated` | 📝 | Comment edited |
| `comment_deleted` | 🗑️ | Comment deleted |
| `project_updated` | 📝 | Project updated |
| `plan_updated` | 📄 | Plan synced |
| `member_invited` | 📧 | Member invited |
| `member_joined` | 🎉 | Member joined |
| `member_removed` | 👋 | Member removed |
| `member_role_changed` | 🔑 | Role changed |

#### Entity Types

- `task` - Task-related activities
- `comment` - Comment-related activities
- `project` - Project-level activities
- `member` - Team member activities
- `invitation` - Invitation activities

#### Example

```json
{
  "name": "planflow_activity",
  "arguments": {
    "projectId": "abc123-def456-ghi789",
    "limit": 10
  }
}
```

#### Response

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  📊 Recent Activity - E-commerce Platform                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ✨ Jane created T3.2: Checkout UI                        5 min ago          │
│                                                                              │
│  🔄 John changed T2.1 status: TODO → IN_PROGRESS          15 min ago         │
│                                                                              │
│  💬 Bob commented on T1.3                                 1 hour ago         │
│     "Auth implementation looks great!"                                       │
│                                                                              │
│  👤 Jane assigned T2.3 to Bob                             2 hours ago        │
│                                                                              │
│  📄 John synced plan (push)                               3 hours ago        │
│     Updated 5 tasks, 2 new tasks added                                       │
│                                                                              │
│  🎉 Alice joined the project                              yesterday          │
│     Role: Editor                                                             │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯

Showing 6 of 47 activities
```

---

### planflow_comments

View comments on a PlanFlow task.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `projectId` | string (UUID) | Yes | Project UUID |
| `taskId` | string | Yes | Task ID (e.g., "T1.1") |

#### Example

```json
{
  "name": "planflow_comments",
  "arguments": {
    "projectId": "abc123-def456-ghi789",
    "taskId": "T2.1"
  }
}
```

#### Response

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  💬 Comments on T2.1: Product CRUD API                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  3 comments                                                                  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ John Doe • 2 hours ago                                                 │  │
│  │                                                                        │  │
│  │ Started working on this. Planning to use the repository pattern       │  │
│  │ for the data access layer.                                             │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Jane Smith • 1 hour ago                                                │  │
│  │                                                                        │  │
│  │ Sounds good! @bob can you review when ready?                           │  │
│  │                                                                        │  │
│  │  └─ Reply from Bob Wilson • 30 min ago                                 │  │
│  │     Sure, I'll keep an eye on the PR!                                  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯

💡 Use planflow_comment to add a new comment
```

---

### planflow_comment

Add a comment to a PlanFlow task.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `projectId` | string (UUID) | Yes | Project UUID |
| `taskId` | string | Yes | Task ID (e.g., "T1.1") |
| `content` | string | Yes | Comment text (1-10000 characters) |
| `parentId` | string (UUID) | No | Reply to specific comment |

#### Example: New Comment

```json
{
  "name": "planflow_comment",
  "arguments": {
    "projectId": "abc123-def456-ghi789",
    "taskId": "T2.1",
    "content": "API endpoints implemented! @jane can you review the pagination logic?"
  }
}
```

#### Response

```
✅ Comment Added!

╭─────────────────────────────────────────────────────╮
│  💬 New Comment on T2.1                             │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Task:    Product CRUD API                          │
│  By:      John Doe                                  │
│  Time:    Just now                                  │
│                                                     │
│  Content:                                           │
│  API endpoints implemented! @jane can you          │
│  review the pagination logic?                       │
│                                                     │
│  📣 1 user will be notified (@jane)                 │
│                                                     │
╰─────────────────────────────────────────────────────╯
```

#### Example: Reply to Comment

```json
{
  "name": "planflow_comment",
  "arguments": {
    "projectId": "abc123-def456-ghi789",
    "taskId": "T2.1",
    "content": "Looks good! Just one small suggestion on line 42.",
    "parentId": "comment-123-456"
  }
}
```

#### @Mentions

Comments support @mentions to notify team members:

- Format: `@username` or `@email@domain.com`
- Mentioned users receive notifications
- Autocomplete available in web dashboard

---

## Error Handling

All tools return consistent error messages with actionable guidance.

### Error Types

| Error | Description | Resolution |
|-------|-------------|------------|
| `AuthError` | Not authenticated | Use `planflow_login` |
| `NotFoundError` | Resource not found | Check ID validity |
| `ValidationError` | Invalid input | Check parameter format |
| `PermissionError` | Insufficient permissions | Contact project admin |
| `NetworkError` | Connection failed | Check internet connection |
| `RateLimitError` | Too many requests | Wait and retry |

### Example Error Response

```
❌ Error: Not Authenticated

You must be logged in to use this tool.

To authenticate:
1. Get your API token from https://planflow.tools/settings/api-tokens
2. Use planflow_login with your token

Example:
  planflow_login with token "pf_your_token_here"
```

---

## Configuration

### Config File Location

Credentials and settings are stored at:
```
~/.config/planflow/config.json
```

### Config Structure

```json
{
  "apiUrl": "https://api.planflow.tools",
  "apiToken": "pf_...",
  "userId": "abc123-...",
  "userEmail": "user@example.com",
  "userName": "John Doe",
  "savedAt": "2026-02-24T10:00:00Z"
}
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PLANFLOW_API_URL` | API endpoint | `https://api.planflow.tools` |
| `PLANFLOW_API_TOKEN` | API token (overrides config) | - |
| `PLANFLOW_DEBUG` | Enable debug logging | `false` |

---

## Troubleshooting

### Common Issues

#### "Not authenticated"

```bash
# Solution: Log in with your API token
planflow_login with token "pf_your_token"
```

#### "Project not found"

```bash
# Solution: List your projects to get correct ID
planflow_projects
```

#### "Task not found"

- Ensure task ID format is correct (e.g., "T1.1", "T2.3")
- Verify task exists in the project
- Check if plan was synced recently

#### "Connection failed"

- Check internet connection
- Verify API URL is correct
- Try again in a few seconds (rate limiting)

### Debug Mode

Enable verbose logging:

```bash
export PLANFLOW_DEBUG=true
```

### Getting Help

- Documentation: https://planflow.tools/docs
- GitHub Issues: https://github.com/planflow/planflow/issues
- Community: https://discord.gg/planflow

---

## Changelog

### v1.6.0 (Current)

- Added `planflow_activity` tool
- Added `planflow_comments` and `planflow_comment` tools
- Enhanced task recommendation algorithm
- Improved error messages with guidance

### v1.5.0

- Added `planflow_notifications` tool
- Added notification filtering options
- Team presence integration

### v1.0.0

- Initial release
- Core authentication, project, and task tools

---

_Generated for PlanFlow MCP Server v1.6.0 • Last updated: 2026-02-24_
