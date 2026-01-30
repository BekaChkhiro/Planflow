# Tutorial 7: Web Dashboard Tour

> Explore the visual interface for project management

**Duration:** 2-3 minutes
**Audience:** All users
**Prerequisites:** PlanFlow account

---

## Learning Objectives

By the end of this tutorial, viewers will be able to:
- Navigate the dashboard layout
- Use the project overview page
- Work with the task kanban board
- Manage settings and API tokens

---

## Script

### Opening (0:00 - 0:10)

**Visual:** Dashboard home page

**Voiceover:**
> "While Claude Code is perfect for staying in flow, the web dashboard gives you a visual overview of your projects. Let's take a tour."

---

### Part 1: Dashboard Overview (0:10 - 0:35)

**Visual:** Dashboard layout

```
┌─────────────────────────────────────────────────────────┐
│ [Logo]  PlanFlow               [Notifications] [Avatar]│
├───────────┬─────────────────────────────────────────────┤
│           │                                             │
│ Dashboard │   Welcome back, Alex!                       │
│           │                                             │
│ Projects  │   ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│           │   │ Project │ │ Project │ │   +     │      │
│ Settings  │   │   1     │ │   2     │ │  New    │      │
│           │   └─────────┘ └─────────┘ └─────────┘      │
│           │                                             │
│           │   Recent Activity                           │
│           │   ─────────────────────                     │
│           │   • Task completed...                       │
│           │   • Plan synced...                          │
└───────────┴─────────────────────────────────────────────┘
```

**Voiceover:**
> "The dashboard has a clean layout. Sidebar navigation on the left, main content in the center. You'll see your project cards and recent activity right on the home page."

---

### Part 2: Projects Page (0:35 - 1:05)

**Visual:** Projects grid

```
[Navigate to Projects page]

📁 Your Projects
─────────────────────────────────────────────────────────

┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│ E-commerce API │  │ Mobile App     │  │ Admin Portal   │
│                │  │                │  │                │
│   [72%]        │  │   [45%]        │  │   [100%] ✓     │
│   ████████░░   │  │   █████░░░░░   │  │   ██████████   │
│                │  │                │  │                │
│ 18/25 tasks    │  │ 9/20 tasks     │  │ 12/12 tasks    │
│ Updated: 2h    │  │ Updated: 1d    │  │ Completed      │
└────────────────┘  └────────────────┘  └────────────────┘
```

**Voiceover:**
> "The Projects page shows all your projects as cards. Each card displays progress, task count, and last update time. Completed projects show a checkmark."

**Visual:** Click on project card

```
[Click E-commerce API card]
[Navigate to project detail page]
```

---

### Part 3: Project Detail - Overview Tab (1:05 - 1:35)

**Visual:** Project overview

```
E-commerce API                               [Edit] [Sync]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Overview] [Tasks] [Plan] [Team] [Settings]

┌─────────────────────┐  ┌───────────────────────────────┐
│                     │  │ Statistics                    │
│   ┌───────────┐     │  │                               │
│   │           │     │  │ Total:       25               │
│   │    72%    │     │  │ Completed:   18  ████████     │
│   │           │     │  │ In Progress: 4   ███░░░░░     │
│   └───────────┘     │  │ Blocked:     1   █░░░░░░░     │
│   Progress Ring     │  │ TODO:        2   ██░░░░░░     │
└─────────────────────┘  └───────────────────────────────┘

Phase Progress                   Complexity Breakdown
──────────────────              ────────────────────
Phase 1: █████████ 100%         Low:    ████ 20%
Phase 2: ████████░ 89%          Medium: ████████ 50%
Phase 3: ██████░░░ 67%          High:   ██████ 30%
Phase 4: ████░░░░░ 44%
```

**Voiceover:**
> "The Overview tab gives you a visual summary. A progress ring in the center, statistics on the right, and phase progress below. You can see at a glance where the project stands."

---

### Part 4: Tasks Tab - Kanban Board (1:35 - 2:05)

**Visual:** Kanban view

```
[Click Tasks tab]

Tasks                                    [List View] [Kanban]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TODO (2)        IN PROGRESS (4)    BLOCKED (1)      DONE (18)
───────────     ────────────────   ────────────     ──────────
┌─────────┐     ┌─────────────┐    ┌──────────┐     ┌────────┐
│ T4.3    │     │ T3.1        │    │ T3.5     │     │ T1.1   │
│ API docs│     │ Auth tokens │    │ Rate     │     │ Setup  │
│ Low     │     │ High        │    │ limiting │     │ ✓      │
└─────────┘     │ @Sarah      │    │ 🚫       │     └────────┘
                └─────────────┘    └──────────┘     ...
┌─────────┐     ┌─────────────┐
│ T4.4    │     │ T3.2        │
│ Tests   │     │ Sessions    │
│ Medium  │     │ Medium      │
└─────────┘     │ @John       │
                └─────────────┘
```

**Voiceover:**
> "The Tasks tab has a kanban board view. Drag and drop tasks between columns to update their status. Each card shows the task ID, name, complexity, and assignee."

**Visual:** Toggle to list view

```
[Click "List View" button]

[Switch to table view with sortable columns]
```

**Voiceover:**
> "Prefer a list? Toggle to list view for a sortable table. Great for working with many tasks."

---

### Part 5: Plan Tab (2:05 - 2:20)

**Visual:** Plan viewer

```
[Click Plan tab]

PROJECT_PLAN.md                              [Download] [Edit]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
...
```

**Voiceover:**
> "The Plan tab shows your rendered PROJECT_PLAN.md. You can download or edit it directly in the browser."

---

### Part 6: Settings & Tokens (2:20 - 2:45)

**Visual:** Settings navigation

```
[Click Settings in sidebar]

Settings
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Profile] [API Tokens] [Billing] [MCP Setup]

Profile                          API Tokens
────────────                     ──────────────
Name: Alex Developer             Claude Code - MacBook
Email: alex@example.com          Created: Jan 15, 2026
                                 Last used: 2 hours ago
[Update Profile]
                                 [+ Generate New Token]
```

**Voiceover:**
> "In Settings, manage your profile, API tokens, billing, and get MCP setup instructions. The Tokens page shows when each token was last used - helpful for security."

---

### Closing (2:45 - 3:00)

**Visual:** Dashboard + Terminal split

**Voiceover:**
> "That's the web dashboard! Use it when you need visual overview, and Claude Code when you want to stay in the terminal. They work together seamlessly."

**Visual:** End card

```
Web Dashboard:
  ✅ Project cards
  ✅ Visual progress
  ✅ Kanban board
  ✅ Plan viewer
  ✅ Settings management

🎉 Tutorial Series Complete!

Start using PlanFlow:
planflow.dev
```

**Voiceover:**
> "Congratulations! You've completed the PlanFlow tutorial series. Head to planflow.dev to get started with your own projects. Happy planning!"

---

## Timestamps for YouTube

```
0:00 - Introduction
0:10 - Dashboard Overview
0:35 - Projects Page
1:05 - Project Overview Tab
1:35 - Tasks Kanban Board
2:05 - Plan Tab
2:20 - Settings & Tokens
2:45 - Summary & Conclusion
```

---

## Series Wrap-Up

This is the final tutorial in the series. Consider adding a "Complete Series" video that:

1. Recaps all 7 tutorials (30 seconds each)
2. Shows the full workflow end-to-end
3. Provides a quick reference card
4. Points to documentation for deeper learning

Suggested title: "PlanFlow Complete Guide - Everything in 5 Minutes"
