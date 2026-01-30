# Tutorial 3: Working with Projects

> Create, manage, and organize your projects in PlanFlow

**Duration:** 4-5 minutes
**Audience:** All users
**Prerequisites:** PlanFlow account, MCP configured

---

## Learning Objectives

By the end of this tutorial, viewers will be able to:
- Create new projects from Claude Code
- List and switch between projects
- Understand project structure
- View projects in the web dashboard

---

## Script

### Opening (0:00 - 0:15)

**Visual:** Multiple project cards in dashboard

**Voiceover:**
> "Projects are the heart of PlanFlow. In this tutorial, you'll learn how to create and manage projects directly from Claude Code. Let's get started."

---

### Part 1: Creating a Project (0:15 - 1:15)

#### Method 1: From Claude Code

**Visual:** Terminal with Claude

```
$ claude

You > Create a new PlanFlow project called "E-commerce API"
      with description "RESTful API for online store"

Claude > Calling planflow_create...

✅ Project created successfully!

📁 E-commerce API
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ID:          proj_ecom_123
Description: RESTful API for online store
Created:     Just now
Status:      Active
Tasks:       0
Progress:    0%
```

**Voiceover:**
> "Creating a project is as simple as telling Claude what you want. Give it a name and optionally a description."

#### Method 2: From Web Dashboard

**Visual:** Browser - Dashboard

```
[Click "+ New Project" button]
[Fill form:
  Name: Mobile App
  Description: iOS and Android companion app
]
[Click "Create"]
```

**Voiceover:**
> "You can also create projects from the web dashboard. Click New Project, fill in the details, and you're done."

---

### Part 2: Listing Projects (1:15 - 1:50)

**Visual:** Terminal with Claude

```
You > Show my PlanFlow projects

Claude > Calling planflow_projects...

📁 Your Projects
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
│ Name           │ Progress │ Tasks    │ Updated     │
├────────────────┼──────────┼──────────┼─────────────┤
│ E-commerce API │ 45%      │ 12/27    │ 2 hours ago │
│ Mobile App     │ 20%      │ 5/25     │ Yesterday   │
│ Admin Portal   │ 100%     │ 18/18    │ Last week   │
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Voiceover:**
> "To see all your projects, just ask Claude to show them. You'll see progress, task counts, and when each was last updated."

**Visual:** Filtered view

```
You > Show my active projects

Claude > Filtering by status: active

📁 Active Projects (2)
│ E-commerce API │ 45% │
│ Mobile App     │ 20% │
```

**Voiceover:**
> "You can filter by status to see only active or completed projects."

---

### Part 3: Project Details (1:50 - 2:40)

**Visual:** Terminal with Claude

```
You > Show details for the E-commerce API project

Claude > Calling planflow_projects with id: proj_ecom_123...

📁 E-commerce API
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Progress Overview
   ██████████░░░░░░░░░░ 45%

📈 Statistics
   Total Tasks:     27
   Completed:       12
   In Progress:     3
   Blocked:         1
   Remaining:       11

📋 Phase Progress
   Phase 1: Setup       ████████████ 100%
   Phase 2: Core API    ████████░░░░  67%
   Phase 3: Auth        ████░░░░░░░░  33%
   Phase 4: Testing     ░░░░░░░░░░░░   0%

⏰ Timeline
   Created:         Jan 15, 2026
   Last Updated:    2 hours ago
   Est. Completion: Feb 10, 2026
```

**Voiceover:**
> "Get detailed information about any project by asking for its details. You'll see overall progress, statistics by status, and phase breakdown."

---

### Part 4: PROJECT_PLAN.md Structure (2:40 - 3:30)

**Visual:** Code editor showing PROJECT_PLAN.md

```markdown
# E-commerce API - Project Plan

## Overview
RESTful API for online store with user auth,
product catalog, and order management.

## Tech Stack
- Node.js + Express
- PostgreSQL + Prisma
- JWT Authentication

---

## Phase 1: Setup
**Goal:** Project foundation

| ID   | Task              | Status  | Complexity |
|------|-------------------|---------|------------|
| T1.1 | Initialize repo   | DONE ✅ | Low        |
| T1.2 | Setup database    | DONE ✅ | Medium     |
| T1.3 | Configure CI/CD   | DONE ✅ | Medium     |

---

## Phase 2: Core API
**Goal:** Basic CRUD operations

| ID   | Task              | Status      | Complexity |
|------|-------------------|-------------|------------|
| T2.1 | Product endpoints | DONE ✅     | Medium     |
| T2.2 | Category endpoints| DONE ✅     | Low        |
| T2.3 | Order endpoints   | IN_PROGRESS | High       |
| T2.4 | Cart logic        | TODO        | Medium     |
```

**Voiceover:**
> "PlanFlow works with PROJECT_PLAN.md files. This is a markdown file in your repository that defines your project phases and tasks. Each task has an ID, name, status, and complexity."

**Visual:** Task ID format

```
T[Phase].[Task Number]

T1.1 = Phase 1, Task 1
T2.3 = Phase 2, Task 3
T4.12 = Phase 4, Task 12
```

**Voiceover:**
> "Task IDs follow a simple format: T, phase number, dot, task number. This makes it easy to reference any task."

---

### Part 5: Web Dashboard View (3:30 - 4:20)

**Visual:** Browser - Projects page

```
[Navigate to /dashboard/projects]
[Show project cards with progress rings]
```

**Voiceover:**
> "The web dashboard gives you a visual overview of all your projects."

**Visual:** Project detail page

```
[Click on E-commerce API card]
[Show Overview tab with:
  - Progress ring
  - Statistics cards
  - Phase timeline
  - Activity feed
]
```

**Voiceover:**
> "Click any project to see detailed analytics. The Overview tab shows your progress ring, stats, and recent activity."

**Visual:** Tasks tab - Kanban view

```
[Switch to Tasks tab]
[Show Kanban columns:
  TODO | IN_PROGRESS | BLOCKED | DONE
]
```

**Voiceover:**
> "Switch to the Tasks tab for a Kanban view. Drag and drop to update status, or use Claude Code - they stay in sync."

**Visual:** Plan tab - Markdown viewer

```
[Switch to Plan tab]
[Show rendered PROJECT_PLAN.md]
```

**Voiceover:**
> "The Plan tab shows your rendered PROJECT_PLAN.md. This is the same file Claude reads from your repository."

---

### Closing (4:20 - 4:45)

**Visual:** Split screen - Claude + Dashboard

```
You > Start working on T2.3

[Dashboard updates in background]
```

**Voiceover:**
> "Whether you prefer the terminal or the web, your projects stay perfectly in sync."

**Visual:** End card

```
Project Management:
  ✅ Create projects (CLI or Web)
  ✅ List and filter projects
  ✅ View detailed analytics
  ✅ PROJECT_PLAN.md structure

Next: Tutorial 4 - Task Management
```

**Voiceover:**
> "In the next tutorial, we'll dive deep into managing tasks - updating status, getting recommendations, and tracking progress."

---

## Timestamps for YouTube

```
0:00 - Introduction
0:15 - Creating a Project
1:15 - Listing Projects
1:50 - Project Details
2:40 - PROJECT_PLAN.md Structure
3:30 - Web Dashboard View
4:20 - Summary & Next Steps
```
