# PlanFlow User Guide

> Complete guide to using the PlanFlow web dashboard

This guide walks you through all features of the PlanFlow web dashboard. For command-line usage with Claude Code, see the [Getting Started Guide](./GETTING_STARTED.md).

---

## Table of Contents

1. [Dashboard Overview](#dashboard-overview)
2. [Projects](#projects)
   - [Projects List](#projects-list)
   - [Creating a Project](#creating-a-project)
   - [Project Detail Page](#project-detail-page)
   - [Overview Tab](#overview-tab)
   - [Plan Tab](#plan-tab)
   - [Tasks Tab](#tasks-tab)
   - [Activity Feed](#activity-feed)
   - [Archiving Projects](#archiving-projects)
3. [Team Management](#team-management)
   - [Team Members](#team-members)
   - [Inviting Members](#inviting-members)
   - [Roles & Permissions](#roles--permissions)
   - [Workload Dashboard](#workload-dashboard)
   - [Team Analytics](#team-analytics)
   - [Task Assignment](#task-assignment)
   - [Comments & Discussions](#comments--discussions)
   - [@Mentions](#mentions)
   - [CLI Commands for Team Features](#cli-commands-for-team-features)
   - [Real-time Team Collaboration](#real-time-team-collaboration)
   - [Team Collaboration Best Practices](#team-collaboration-best-practices)
4. [Notifications](#notifications)
5. [Settings](#settings)
   - [Profile](#profile)
   - [Security](#security)
   - [API Tokens](#api-tokens)
   - [MCP Setup](#mcp-setup)
   - [Integrations](#integrations)
   - [Notification Preferences](#notification-preferences)
   - [Billing](#billing)
6. [Keyboard Shortcuts](#keyboard-shortcuts)
7. [Real-time Features](#real-time-features)
8. [Tips & Best Practices](#tips--best-practices)

---

## Dashboard Overview

After logging in, you'll be taken to the PlanFlow dashboard. The main navigation includes:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PlanFlow      Projects    Team    Analytics           🔔  👤 Profile ▾    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                          [Dashboard Content]                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Main Navigation Items

| Item | Description |
|------|-------------|
| **Projects** | View and manage all your projects |
| **Team** | Manage team members, invitations, and roles |
| **Analytics** | View team workload and performance metrics |
| **🔔 Notifications** | View and manage notifications |
| **👤 Profile** | Access settings, feedback, and logout |

### Quick Navigation

Use the **g** key followed by a letter to quickly navigate:

- `g` + `p` → Projects
- `g` + `t` → Team
- `g` + `s` → Settings
- `g` + `n` → Notifications

---

## Projects

### Projects List

The Projects page (`/dashboard/projects`) displays all your projects in a card-based layout.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Projects                                                [+ New Project]    │
│  Manage your projects and sync plans from your development environment.    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  🔍 Search projects...              [Active] [Archived (2)] [All]          │
│                                                                             │
│  ┌───────────────────────┐  ┌───────────────────────┐                      │
│  │ My SaaS App        ⋮ │  │ E-commerce Site     ⋮ │                      │
│  │ Building a modern... │  │ Online store for...  │                      │
│  │                      │  │                       │                      │
│  │ 📅 Jan 15, 2026     │  │ 📅 Jan 20, 2026      │                      │
│  │ 🕐 Updated 2h ago   │  │ 🕐 Updated 5d ago    │                      │
│  └───────────────────────┘  └───────────────────────┘                      │
│                                                                             │
│                        [Load More Projects]                                 │
│                        Showing 6 of 12 projects                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Features

- **Search**: Type in the search box to filter projects by name
- **Filter by status**: Switch between Active, Archived, or All projects
- **Pagination**: Projects load incrementally with "Load More" for large lists
- **Project cards**: Show name, description, creation date, and last update time

#### Project Card Actions

Click the ⋮ menu on any project card to:

- **View project** - Open the project detail page
- **Settings** - Go to project settings
- **Archive** - Move to archived projects (soft delete)

### Creating a Project

Click **+ New Project** to open the creation dialog:

```
┌─────────────────────────────────────────────────────────┐
│  Create Project                                     ✕   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Create a new project to start managing your plans     │
│  and tasks.                                            │
│                                                         │
│  Project Name                                          │
│  ┌───────────────────────────────────────────────────┐ │
│  │ My Awesome Project                             ✓  │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  Description (optional)                                │
│  ┌───────────────────────────────────────────────────┐ │
│  │ A brief description of your project...           │ │
│  │                                                   │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│                        [Cancel]  [Create Project]      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Fields:**
- **Project Name** (required): 1-100 characters
- **Description** (optional): Brief description of your project

After creation, you'll be redirected to the project detail page.

> **Note**: Free tier is limited to 3 projects. Upgrade to Pro for unlimited projects.

### Project Detail Page

The project detail page provides a comprehensive view of your project with three main tabs.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← Back    My SaaS App                              ⚙️ Settings    ⋮       │
│            Building a modern SaaS application                              │
│                                                                             │
│  📅 Created Jan 15, 2026   🕐 Updated 2 hours ago                          │
│                                                                             │
│  ● Connection Status: Connected                    👤 👤 👤 Online Users   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [Overview]  [Plan]  [Tasks]                                 📊 Activity ▾ │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│                              [Tab Content]                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Header Elements

- **Back button**: Return to projects list
- **Project name & description**: Editable via Settings
- **Settings gear**: Quick link to project settings
- **More menu (⋮)**: Edit, Delete project options
- **Connection indicator**: Shows WebSocket connection status
- **Presence avatars**: Shows who's currently viewing this project

### Overview Tab

The Overview tab provides a quick summary of project status.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  Progress                                                              │ │
│  │                                                                        │ │
│  │  ████████████████████░░░░░░░░░░  68%                                   │ │
│  │                                                                        │ │
│  │  34 of 50 tasks completed                                              │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │ ✅ Done      │ │ 🔄 Progress  │ │ 📋 To Do     │ │ 🚫 Blocked   │       │
│  │     34       │ │      5       │ │     9        │ │      2       │       │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘       │
│                                                                             │
│  Recent Activity                                                           │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • Task T2.3 completed by John                              2 hours ago    │
│  • Jane assigned to T3.1                                    3 hours ago    │
│  • Comment added on T2.1 by Bob                             Yesterday      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Shows:**
- Overall progress bar with percentage
- Task count breakdown by status (Done, In Progress, To Do, Blocked)
- Recent activity feed

### Plan Tab

The Plan tab displays your PROJECT_PLAN.md content rendered as markdown.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  PROJECT_PLAN.md                              [Sync from Terminal]    │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │                                                                        │ │
│  │  # My SaaS App - Project Plan                                         │ │
│  │                                                                        │ │
│  │  > AI-Native Project Management                                       │ │
│  │                                                                        │ │
│  │  ## Phase 1: Foundation                                               │ │
│  │                                                                        │ │
│  │  | Task | Status | Complexity |                                       │ │
│  │  |------|--------|------------|                                       │ │
│  │  | T1.1 | DONE ✅ | Medium    |                                       │ │
│  │  | T1.2 | DONE ✅ | Low       |                                       │ │
│  │  ...                                                                   │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Features:**
- Full markdown rendering with syntax highlighting
- Code blocks with proper formatting
- Tables rendered correctly
- **Sync from Terminal**: Button to sync your local PROJECT_PLAN.md to cloud

### Tasks Tab

The Tasks tab provides both Kanban board and List views for managing tasks.

#### Kanban View

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🔍 Search tasks...     [Status ▾] [Assignee ▾] [Phase ▾]    📋 │ 🗃️       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  TO DO (9)          IN PROGRESS (5)      DONE (34)         BLOCKED (2)     │
│  ──────────────     ───────────────      ────────────      ────────────    │
│  ┌────────────┐     ┌────────────┐       ┌────────────┐    ┌────────────┐  │
│  │ T3.2       │     │ T2.3       │       │ T1.1       │    │ T4.1       │  │
│  │ Setup DB   │     │ Auth API   │       │ Project... │    │ Deploy...  │  │
│  │ 🏷️ Medium  │     │ 🏷️ High    │       │ 🏷️ Medium  │    │ 🏷️ High    │  │
│  │ 👤 Jane    │     │ 👤 John    │       │ 👤 Bob     │    │ 👤 --      │  │
│  └────────────┘     └────────────┘       └────────────┘    └────────────┘  │
│  ┌────────────┐     ┌────────────┐       ┌────────────┐                    │
│  │ T3.3       │     │ T2.4       │       │ T1.2       │                    │
│  │ ...        │     │ ...        │       │ ...        │                    │
│  └────────────┘     └────────────┘       └────────────┘                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### List View

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🔍 Search tasks...     [Status ▾] [Assignee ▾] [Phase ▾]    📋 │ 🗃️       │
├─────────────────────────────────────────────────────────────────────────────┤
│  ☐  ID      Task                    Status       Assignee   Complexity     │
│  ─────────────────────────────────────────────────────────────────────────  │
│  ☐  T1.1    Project Setup           ✅ Done      Bob        Medium         │
│  ☐  T1.2    Database Config         ✅ Done      Bob        Low            │
│  ☐  T2.1    User Authentication     ✅ Done      John       High           │
│  ☐  T2.3    API Endpoints           🔄 Progress  John       High           │
│  ☐  T3.2    Setup Database          📋 To Do     Jane       Medium         │
│  ☐  T4.1    Deployment              🚫 Blocked   --         High           │
│  ─────────────────────────────────────────────────────────────────────────  │
│  ☐ Select All                      [Mark Done] [Assign] [Delete]           │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Task Features

- **Search**: Filter tasks by name or ID
- **Filters**: Filter by status, assignee, or phase
- **View toggle**: Switch between Kanban (🗃️) and List (📋) views
- **Drag & drop**: Reorder tasks or change status by dragging (Kanban view)
- **Bulk actions**: Select multiple tasks for batch operations (List view)

#### Task Card Details

Click on any task to open the detail panel:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  T2.3: API Endpoints                                                    ✕  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Status: [🔄 In Progress ▾]                                                │
│                                                                             │
│  Assignee: [👤 John Doe ▾]                                                 │
│                                                                             │
│  Complexity: High        Estimated: 6 hours                                │
│                                                                             │
│  Dependencies: T2.1 ✅, T2.2 ✅                                             │
│                                                                             │
│  ── Description ─────────────────────────────────────────────────────────  │
│                                                                             │
│  Implement REST API endpoints for user management including CRUD           │
│  operations and authentication middleware.                                 │
│                                                                             │
│  ── Comments (3) ────────────────────────────────────────────────────────  │
│                                                                             │
│  👤 Jane: @John can you also add rate limiting?              2h ago        │
│     └── 👤 John: Sure, will add it to the scope              1h ago        │
│                                                                             │
│  👤 Bob: Looking good! Ready for review.                     30m ago       │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Add a comment... (use @ to mention)                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  [🌿 Create Branch]  [📋 Create Issue]  [🔀 Create PR]                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Task actions:**
- Change status via dropdown
- Assign/reassign team members
- View and add comments with @mentions
- Create GitHub branch, issue, or PR (requires GitHub integration)

### Activity Feed

Click the **📊 Activity** button to open the activity sidebar:

```
┌──────────────────────────────────┐
│  Activity                    ✕   │
├──────────────────────────────────┤
│                                  │
│  Today                          │
│  ───────────────────────────────│
│  ✅ John completed T2.3         │
│      2 hours ago                │
│                                  │
│  💬 Jane commented on T3.1      │
│      "Need clarification..."    │
│      3 hours ago                │
│                                  │
│  👤 Bob assigned to T4.2        │
│      5 hours ago                │
│                                  │
│  Yesterday                      │
│  ───────────────────────────────│
│  🔄 T2.2 status → In Progress   │
│      by John                    │
│                                  │
│  📝 Plan updated                │
│      by Jane                    │
│                                  │
│  [Load More]                    │
│                                  │
└──────────────────────────────────┘
```

The activity feed shows:
- Task status changes
- Task assignments
- Comments and mentions
- Plan updates
- Team member activity

### Archiving Projects

To archive a project:

1. Click the ⋮ menu on a project card
2. Select **Archive**
3. Confirm in the dialog

Archived projects:
- Are hidden from the active projects list
- Can be viewed in the "Archived" tab
- Can be restored at any time
- Don't count toward your project limit (Free tier)

To restore an archived project:
1. Switch to the "Archived" tab
2. Click the ⋮ menu on the project
3. Select **Restore**

---

## Team Management

PlanFlow provides comprehensive team collaboration features that work seamlessly across both the web dashboard and CLI (Claude Code). This section covers all aspects of team management and collaboration.

### Team Members

The Team page (`/dashboard/team`) shows all members of your organization.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Team                                                      [+ Invite]       │
│  Manage your team members and their roles                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ 🟢 John Doe          john@company.com              Owner        ⋮    │ │
│  │    Currently working on: T2.3 - API Endpoints                        │ │
│  ├───────────────────────────────────────────────────────────────────────┤ │
│  │ 🟢 Jane Smith        jane@company.com              Admin        ⋮    │ │
│  │    Currently working on: T3.1 - Dashboard UI                         │ │
│  ├───────────────────────────────────────────────────────────────────────┤ │
│  │ 🔴 Bob Wilson        bob@company.com               Editor       ⋮    │ │
│  │    Last seen: 2 hours ago                                            │ │
│  ├───────────────────────────────────────────────────────────────────────┤ │
│  │ ⏳ alice@company.com (Pending Invitation)          Editor       ❌   │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ── Role Permissions ────────────────────────────────────────────────────  │
│                                                                             │
│  Owner: Full access, billing, delete organization                          │
│  Admin: Manage members, all project access                                 │
│  Editor: Edit tasks, comments, sync plans                                  │
│  Viewer: Read-only access to projects                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Features:**
- **Online status**: Green (🟢) for online, Red (🔴) for offline
- **Current activity**: Shows what task each member is working on
- **Role badges**: Visual indicator of permission level
- **Quick actions**: Change role, remove member via ⋮ menu

### Inviting Members

Click **+ Invite** to invite new team members:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Invite Team Member                                                     ✕  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Email Address                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ colleague@company.com                                                 │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  Role                                                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ Editor ▾                                                              │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ℹ️ An invitation email will be sent to this address.                      │
│                                                                             │
│                                          [Cancel]  [Send Invitation]       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

The invited user will receive an email with a link to join your organization.

### Roles & Permissions

| Role | Projects | Tasks | Members | Billing | Organization |
|------|----------|-------|---------|---------|--------------|
| **Owner** | Full access | Full access | Manage all | ✅ Access | ✅ Delete |
| **Admin** | Full access | Full access | Manage (not owner) | ❌ | ❌ |
| **Editor** | Full access | Edit & comment | ❌ | ❌ | ❌ |
| **Viewer** | Read only | Read only | ❌ | ❌ | ❌ |

To change a member's role:
1. Click the ⋮ menu next to their name
2. Select **Change Role**
3. Choose the new role from the dropdown

> **Note**: Only Owners and Admins can manage team members.

### Workload Dashboard

Access via **Team → Workload** (`/dashboard/team/workload`):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Team Workload                                                              │
│  Overview of task distribution across team members                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  Workload Distribution                                                 │ │
│  │                                                                        │ │
│  │  John  ████████████░░░░░░░░  12 tasks (4 in progress)                 │ │
│  │  Jane  ████████░░░░░░░░░░░░   8 tasks (2 in progress)                 │ │
│  │  Bob   ██████░░░░░░░░░░░░░░   6 tasks (1 in progress)                 │ │
│  │  Alice ████░░░░░░░░░░░░░░░░   4 tasks (0 in progress)                 │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐ │
│  │ Total Tasks         │  │ Avg per Member      │  │ Unassigned          │ │
│  │       30            │  │       7.5           │  │       5             │ │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Shows:**
- Task count per team member
- In-progress vs total tasks
- Average workload metrics
- Unassigned task count

### Team Analytics

Access via **Team → Analytics** (`/dashboard/team/analytics`):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Team Analytics                                              [This Week ▾] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐ │
│  │ Tasks Completed     │  │ Active Members      │  │ Avg Completion Time │ │
│  │       24            │  │       4/5           │  │      2.3 days       │ │
│  │    ↑ 20% vs last wk │  │                     │  │    ↓ 15% faster     │ │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘ │
│                                                                             │
│  ── Completion Trend ────────────────────────────────────────────────────  │
│  │                                                                         │
│  │        ╭─╮                                                              │
│  │    ╭─╮ │ │    ╭─╮                                                       │
│  │ ╭─╮│ │ │ │╭─╮ │ │╭─╮                                                    │
│  │ │ ││ │ │ ││ │ │ ││ │                                                    │
│  └─Mon─Tue─Wed─Thu─Fri─Sat─Sun────────────────────────────────────────────  │
│                                                                             │
│  ── Top Contributors ────────────────────────────────────────────────────  │
│  1. John Doe        12 tasks completed                                     │
│  2. Jane Smith       8 tasks completed                                     │
│  3. Bob Wilson       4 tasks completed                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Task Assignment

Task assignment is a core team collaboration feature that helps distribute work and track who's responsible for each task.

#### Assigning Tasks via Web Dashboard

1. **From Task Card**: Click on a task to open the detail panel, then use the **Assignee** dropdown
2. **From Kanban View**: Drag tasks between columns or click the task to assign
3. **From List View**: Click the assignee column cell to open the assignment dropdown

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  T2.3: API Endpoints                                                    ✕  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Assignee: [👤 Select Assignee ▾]                                          │
│            ┌─────────────────────────────────────────┐                     │
│            │ 🔍 Search team members...              │                     │
│            ├─────────────────────────────────────────┤                     │
│            │ 👤 John Doe (john@company.com)         │                     │
│            │ 👤 Jane Smith (jane@company.com)       │                     │
│            │ 👤 Bob Wilson (bob@company.com)        │                     │
│            │ ── Unassign ──                         │                     │
│            └─────────────────────────────────────────┘                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Assigning Tasks via CLI (Claude Code)

Use the `/pfAssign` command to assign tasks from your terminal:

```bash
# Assign a task to a team member
/pfAssign T2.3 jane@company.com

# Assign to yourself
/pfAssign T2.3 me

# Unassign a task
/pfUnassign T2.3
```

**Example output:**
```
✅ Task Assigned

Task: T2.3 - API Endpoints
Assigned to: Jane Smith (jane@company.com)
Assigned by: You

📧 Jane has been notified via email and in-app notification.
```

#### Viewing Your Assigned Tasks

**Web Dashboard:**
- Use the **Assignee** filter on the Tasks tab
- Select your name to see only your tasks

**CLI:**
```bash
# View tasks assigned to you
/pfMyTasks

# View all team assignments
/pfWorkload
```

**Example `/pfMyTasks` output:**
```
📋 Your Tasks (4 assigned)

🔄 In Progress:
   T2.3: API Endpoints              Medium    Started 2h ago
   T3.1: Dashboard UI               High      Started 1d ago

📋 To Do:
   T4.2: Testing Setup              Low       Assigned yesterday
   T5.1: Documentation              Medium    Assigned 3d ago

💡 Run /planUpdate T2.3 done when you complete a task
```

#### Assignment Notifications

When you assign a task, the assignee receives:
- **In-app notification**: Visible in the notification center
- **Email notification**: If enabled in their preferences
- **Browser push**: If they have push notifications enabled
- **Slack/Discord**: If team integration is configured

### Comments & Discussions

Comments enable asynchronous communication on tasks, keeping all discussion in context.

#### Adding Comments (Web Dashboard)

1. Open any task by clicking on it
2. Scroll to the **Comments** section
3. Type your comment in the input field
4. Press Enter or click **Post** to submit

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ── Comments (5) ────────────────────────────────────────────────────────── │
│                                                                             │
│  👤 Jane Smith                                              2 hours ago    │
│  Can we add rate limiting to this endpoint?                                │
│     [Reply] [React]                                                         │
│                                                                             │
│     └── 👤 John Doe                                         1 hour ago     │
│         Sure, I'll add it. What limit do you suggest?                      │
│         [Reply] [React]                                                     │
│                                                                             │
│         └── 👤 Jane Smith                                   45 min ago     │
│             100 requests/minute per user should be good.                   │
│             [Reply] [React]                                                 │
│                                                                             │
│  👤 Bob Wilson                                              30 min ago     │
│  @John I reviewed the PR, looks good! 👍                                   │
│     [Reply] [React]                                                         │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Write a comment... (@ to mention, / for commands)                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Adding Comments via CLI

Use the `/pfComment` command:

```bash
# Add a comment to a task
/pfComment T2.3 "The API implementation is complete. Ready for review."

# Add a comment with @mention
/pfComment T2.3 "@jane Can you review this when you have time?"
```

**Example output:**
```
💬 Comment Added

Task: T2.3 - API Endpoints
Comment: "The API implementation is complete. Ready for review."

📝 Your comment has been posted and team members will be notified.
```

#### Viewing Comments via CLI

```bash
# View comments on a task
/pfComments T2.3
```

**Example output:**
```
💬 Comments on T2.3: API Endpoints (3 comments)

─────────────────────────────────────────────────────────────────────
👤 Jane Smith                                           2 hours ago
Can we add rate limiting to this endpoint?

   └── 👤 John Doe                                      1 hour ago
       Sure, I'll add it. 100 req/min per user.

─────────────────────────────────────────────────────────────────────
👤 Bob Wilson                                           30 min ago
@John I reviewed the PR, looks good! 👍

─────────────────────────────────────────────────────────────────────

💡 Add a comment: /pfComment T2.3 "your message"
```

#### Threaded Replies

Comments support threading for organized discussions:

1. Click **Reply** under any comment
2. Your reply will be indented under the parent comment
3. Thread participants are notified of new replies

#### Emoji Reactions

React to comments quickly without adding a new message:

**Web Dashboard:** Click the **React** button and select an emoji

**CLI:**
```bash
# Add a reaction to a comment
/pfReact T2.3 comment-id 👍
```

### @Mentions

Use @mentions to notify specific team members in comments.

#### How to Mention

**Web Dashboard:**
1. Type `@` in the comment input
2. Start typing a name or email
3. Select from the autocomplete dropdown
4. The mention will be highlighted and linked

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Write a comment...                                                         │
│                                                                             │
│  @ja                                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 👤 Jane Smith (jane@company.com)                                    │   │
│  │ 👤 Jack Brown (jack@company.com)                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**CLI:**
```bash
# Mention in a comment
/pfComment T2.3 "@jane @bob Please review when you get a chance"
```

#### Mention Notifications

When mentioned, users receive:
- **High-priority notification**: Mentions appear at the top of the notification list
- **Email**: Immediate email notification (if enabled)
- **Push notification**: Browser/mobile alert

#### Mention Best Practices

- Use mentions sparingly to avoid notification fatigue
- Mention specific people when you need their input
- Use mentions for urgent items or questions
- Avoid mentioning everyone unless truly necessary

### CLI Commands for Team Features

PlanFlow provides a comprehensive set of CLI commands for team collaboration:

#### Team Management Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/team` | View team members and status | `/team` |
| `/pfTeamList` | List all team members | `/pfTeamList` |
| `/pfTeamInvite` | Invite a new member | `/pfTeamInvite alice@company.com editor` |
| `/pfTeamRemove` | Remove a member | `/pfTeamRemove bob@company.com` |
| `/pfTeamRole` | Change member role | `/pfTeamRole jane@company.com admin` |

**Example `/team` output:**
```
👥 Team Members (4)

  🟢 John Doe (Owner)           john@company.com
     Working on: T2.3 - API Endpoints

  🟢 Jane Smith (Admin)         jane@company.com
     Working on: T3.1 - Dashboard UI

  🔴 Bob Wilson (Editor)        bob@company.com
     Last seen: 2 hours ago

  ⏳ Alice Brown (Pending)      alice@company.com
     Invitation sent: Yesterday

💡 Invite someone: /pfTeamInvite email@example.com [role]
```

#### Task Assignment Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/pfAssign` | Assign task to member | `/pfAssign T2.3 jane@company.com` |
| `/pfUnassign` | Remove assignment | `/pfUnassign T2.3` |
| `/pfMyTasks` | View your tasks | `/pfMyTasks` |
| `/pfWorkload` | View team workload | `/pfWorkload` |

**Example `/pfWorkload` output:**
```
📊 Team Workload

Member          Total    In Progress    To Do    Done
─────────────────────────────────────────────────────
John Doe        12       2              3        7
Jane Smith      8        1              2        5
Bob Wilson      6        1              1        4
Unassigned      5        0              5        0

💡 Balance tip: Consider assigning some tasks from John to Bob
```

#### Comment Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/pfComment` | Add comment | `/pfComment T2.3 "Great work!"` |
| `/pfComments` | View comments | `/pfComments T2.3` |
| `/pfReact` | Add reaction | `/pfReact T2.3 c1 👍` |

#### Activity Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/pfActivity` | View recent activity | `/pfActivity` |
| `/pfNotifications` | View notifications | `/pfNotifications` |
| `/pfNotificationsClear` | Mark as read | `/pfNotificationsClear` |

**Example `/pfActivity` output:**
```
📊 Recent Activity (Last 24 hours)

Today
─────────────────────────────────────────────────────
✅ 2h ago    John completed T2.3 (API Endpoints)
💬 3h ago    Jane commented on T3.1
👤 4h ago    Bob assigned to T4.2
🔄 5h ago    T2.2 status → In Progress

Yesterday
─────────────────────────────────────────────────────
✅ 18h ago   Jane completed T2.2 (Auth Module)
📝 20h ago   Plan synced by John
👤 22h ago   Jane assigned to T3.1

💡 View more: /pfActivity --days 7
```

### Real-time Team Collaboration

PlanFlow provides real-time features that keep your team synchronized.

#### Live Presence

See who's online and what they're working on:

**Web Dashboard:**
- Avatar stack in project header shows online users
- Hover to see names and current tasks
- Green dot indicates online status

**CLI:**
```bash
# See who's online
/team

# Output shows presence status:
# 🟢 = Online
# 🔴 = Offline
# ⏳ = Pending invitation
```

#### "Currently Working On" Status

When you start a task, your presence status updates automatically:

```bash
# Start a task - your status broadcasts to team
/planUpdate T2.3 start

# Team members see:
# 🟢 John Doe - Working on: T2.3 - API Endpoints
```

This helps team members:
- Know who's available
- Avoid duplicate work
- Coordinate efforts
- See project momentum

#### Live Task Updates

When connected via WebSocket, changes appear instantly:

- **Status changes**: Task cards update in real-time
- **New comments**: Comments appear without refresh
- **Assignments**: Assignee avatars update immediately
- **Activity feed**: New entries appear live

#### Typing Indicators

In the web dashboard, you'll see when teammates are typing:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Comments                                                                   │
│  ...                                                                        │
│                                                                             │
│  ✍️ Jane is typing...                                                       │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Write a comment...                                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Conflict Prevention

PlanFlow prevents conflicting edits with task locking:

1. **Automatic locking**: When you start editing, the task is locked
2. **Lock indicator**: Others see who's editing
3. **Lock timeout**: Locks release automatically after inactivity
4. **Manual release**: Finish editing to release immediately

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  T2.3: API Endpoints                                        🔒 Locked       │
│                                                                             │
│  ⚠️ Jane Smith is currently editing this task                              │
│     Editing will be available when they're done.                           │
│                                                                             │
│  [View Details]  [Notify Jane]                                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Team Collaboration Best Practices

#### 1. Establish Clear Assignment Ownership

- **One owner per task**: Assign each task to a single person
- **Clear handoffs**: Re-assign explicitly when passing work
- **Avoid unassigned limbo**: Tasks without owners tend to stall

#### 2. Use Comments for Context

- **Document decisions**: Record why choices were made
- **Link resources**: Include links to docs, PRs, designs
- **Update on progress**: Brief status updates help the team

#### 3. Leverage @Mentions Effectively

```bash
# Good: Specific and actionable
/pfComment T2.3 "@jane Could you review the auth middleware by EOD?"

# Avoid: Vague mentions
/pfComment T2.3 "@jane @bob @alice FYI"
```

#### 4. Keep Presence Accurate

```bash
# Start tasks when you begin work
/planUpdate T2.3 start

# Mark done when complete
/planUpdate T2.3 done

# Block if stuck
/planUpdate T2.3 block
```

#### 5. Review Workload Regularly

```bash
# Check team balance weekly
/pfWorkload

# Redistribute if needed
/pfAssign T4.5 bob@company.com  # Move from overloaded member
```

#### 6. Use Activity Feed for Standup

```bash
# Morning standup review
/pfActivity

# See what happened overnight
# Plan your day based on team progress
```

#### 7. Configure Notifications Thoughtfully

- Enable notifications for @mentions and assignments
- Use daily digest for general updates
- Mute during focus time
- Set up Slack/Discord for team awareness

#### 8. Coordinate via Comments Before Major Changes

```bash
# Announce before big refactors
/pfComment T2.3 "Planning to restructure the auth module tomorrow.
@jane @bob please hold off on related changes until I'm done."
```

---

## Notifications

Access via the 🔔 icon or `/dashboard/notifications`:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← Back      Notifications                           [Mark All as Read]    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ 🔵 @mention                                                     ✓    │ │
│  │ Jane mentioned you in T2.3                                           │ │
│  │ "@John can you review this endpoint?"                                │ │
│  │                                                        2 hours ago   │ │
│  ├───────────────────────────────────────────────────────────────────────┤ │
│  │ 🟢 Assignment                                                   ✓    │ │
│  │ You were assigned to T3.1: Dashboard UI                              │ │
│  │                                                        3 hours ago   │ │
│  ├───────────────────────────────────────────────────────────────────────┤ │
│  │    Comment                                                      ✓    │ │
│  │ Bob commented on T2.1                                                │ │
│  │ "The API looks good, merging now."                                   │ │
│  │                                                          Yesterday   │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│                            [Load More]                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Notification Types:**
- **@mention**: Someone mentioned you in a comment
- **Assignment**: You were assigned to a task
- **Comment**: New comment on a task you're watching
- **Status Change**: Task status was updated

**Actions:**
- Click a notification to go to the related task
- Click ✓ to mark as read
- Use "Mark All as Read" to clear all unread notifications

---

## Settings

Access settings via the profile menu or `/dashboard/settings`.

### Profile

Manage your account details:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Profile                                                                    │
│  Manage your account details                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Name                                                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ John Doe                                                              │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  Email                                                                     │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ john@company.com                                                      │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│                                              [Cancel]  [Save Changes]      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Security

Manage sessions and security options:

- **Active Sessions**: View and revoke active sessions
- **Change Password**: Update your password
- **Logout from All Devices**: Sign out everywhere

### API Tokens

Generate and manage tokens for the MCP server:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  API Tokens                                           [+ Generate Token]   │
│  Manage MCP authentication tokens                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ Claude Code - MacBook                                                │ │
│  │ pf_a1b2...c3d4                               Created: Jan 15, 2026   │ │
│  │                                              Last used: 2 hours ago  │ │
│  │                                                            [Revoke]  │ │
│  ├───────────────────────────────────────────────────────────────────────┤ │
│  │ CI/CD Pipeline                                                       │ │
│  │ pf_e5f6...g7h8                               Created: Jan 20, 2026   │ │
│  │                                              Last used: 5 days ago   │ │
│  │                                                            [Revoke]  │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ⚠️ Tokens are only shown once when created. Store them securely.          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Best practices:**
- Create separate tokens for different devices/uses
- Revoke tokens you no longer use
- Never share tokens or commit them to version control

### MCP Setup

Step-by-step guide to connect Claude Code:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  MCP Setup                                                                  │
│  Connect Claude Code to PlanFlow                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Step 1: Install the MCP Server                                            │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ npm install -g @planflow/mcp                                   [Copy]│ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  Step 2: Add to Claude Config                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ {                                                              [Copy]│ │
│  │   "mcpServers": {                                                    │ │
│  │     "planflow": {                                                    │ │
│  │       "command": "planflow-mcp"                                      │ │
│  │     }                                                                │ │
│  │   }                                                                  │ │
│  │ }                                                                    │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  Step 3: Login with Your Token                                             │
│  Generate a token above and tell Claude:                                   │
│  "Login to PlanFlow with token pf_your_token_here"                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Integrations

Connect third-party services:

#### GitHub Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  GitHub                                                    [✅ Connected]  │
│  Link tasks to issues, PRs, and auto-update on merge                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Connected Repository: owner/my-repo                                       │
│                                                                             │
│  Features:                                                                 │
│  ✅ Create branches from tasks                                             │
│  ✅ Link tasks to GitHub issues                                            │
│  ✅ Link tasks to Pull Requests                                            │
│  ✅ Auto-update task status on PR merge                                    │
│                                                                             │
│                                                          [Disconnect]      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Slack Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Slack                                                     [🔗 Connect]    │
│  Send notifications to your Slack workspace                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Webhook URL                                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ https://hooks.slack.com/services/...                                 │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  Notification Events:                                                      │
│  ☑ Task completed                                                          │
│  ☑ Task assigned                                                           │
│  ☐ Comment added                                                           │
│  ☐ Status changed                                                          │
│                                                                             │
│                           [Test Webhook]  [Save Settings]                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Discord Integration

Similar to Slack - paste your Discord webhook URL and configure which events to send.

### Notification Preferences

Control how you receive notifications:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Notification Preferences                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Email Notifications                                                       │
│  ───────────────────────────────────────────────────────────────────────── │
│  ☑ Task assignments                     Immediately                        │
│  ☑ @mentions                            Immediately                        │
│  ☐ Comments on my tasks                 Daily digest                       │
│  ☑ Weekly summary                       Mondays at 9am                     │
│                                                                             │
│  Push Notifications                                                        │
│  ───────────────────────────────────────────────────────────────────────── │
│  ☑ Enable browser notifications                                            │
│  ☑ Task assignments                                                        │
│  ☑ @mentions                                                               │
│  ☐ All task updates                                                        │
│                                                                             │
│                                              [Cancel]  [Save Preferences]  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Billing

Manage your subscription:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Billing                                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Current Plan: Pro                                         $12/month       │
│                                                                             │
│  ✅ Unlimited projects                                                     │
│  ✅ Cloud sync                                                             │
│  ✅ GitHub integration                                                     │
│  ✅ Priority support                                                       │
│                                                                             │
│  Next billing date: February 15, 2026                                      │
│                                                                             │
│  [Manage Subscription]  [View Invoices]  [Upgrade to Team]                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Keyboard Shortcuts

PlanFlow supports keyboard shortcuts for faster navigation:

### Global Shortcuts

| Shortcut | Action |
|----------|--------|
| `g` then `p` | Go to Projects |
| `g` then `t` | Go to Team |
| `g` then `s` | Go to Settings |
| `g` then `n` | Go to Notifications |
| `?` | Show keyboard shortcuts help |

### Project Page Shortcuts

| Shortcut | Action |
|----------|--------|
| `n` | New project |
| `/` | Focus search |
| `Esc` | Clear search / Close dialog |

### Task Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Open selected task |
| `Esc` | Close task detail |
| `c` | Add comment (when task open) |

Access the full shortcuts reference by pressing `?` or clicking **Keyboard Shortcuts** in the profile menu.

---

## Real-time Features

PlanFlow provides real-time collaboration features:

### Connection Status

The connection indicator in the project header shows your WebSocket status:

- **🟢 Connected**: Real-time updates active
- **🟡 Connecting**: Establishing connection
- **🔴 Disconnected**: Offline mode, changes will sync when reconnected

### Presence Indicators

See who's viewing the same project:

- Avatar stack shows online team members
- Hover to see names and current activity
- "Currently working on: T2.3" shows active tasks

### Live Updates

When connected, you'll see:

- **Task updates**: Instant status changes from team members
- **Comments**: New comments appear immediately
- **Activity feed**: Live activity stream
- **Notifications**: Toast notifications for mentions and assignments

### Conflict Prevention

If someone else is editing a task:

- You'll see a lock indicator
- Editing is temporarily disabled
- Lock releases when they're done or after timeout

---

## Tips & Best Practices

### 1. Use Keyboard Navigation

Learn the keyboard shortcuts (`?`) to navigate faster without using the mouse.

### 2. Keep Projects Organized

- Use clear, descriptive project names
- Archive completed projects to keep the list clean
- Use search to quickly find projects

### 3. Leverage Team Features

- Assign tasks to spread workload evenly
- Use @mentions to get attention on specific items
- Check the workload dashboard to prevent burnout

### 4. Stay Synced

- Use "Sync from Terminal" when updating PROJECT_PLAN.md locally
- Enable auto-sync in your MCP config for seamless updates
- Check the connection indicator if updates seem delayed

### 5. Set Up Integrations

- Connect GitHub for automatic branch names and PR linking
- Set up Slack/Discord for team notifications
- Configure email preferences to avoid notification overload

### 6. Use the Activity Feed

- Review activity before starting work each day
- Track what teammates are working on
- Catch up on comments you may have missed

---

## Getting Help

If you need assistance:

- 📖 **Documentation**: [planflow.tools/docs](https://planflow.tools/docs)
- 💬 **Discord Community**: [discord.gg/planflow](https://discord.gg/planflow)
- 📧 **Email Support**: [support@planflow.tools](mailto:support@planflow.tools)
- 🐛 **Report Issues**: [github.com/planflow/planflow/issues](https://github.com/planflow/planflow/issues)

---

**Happy planning!** 🚀
