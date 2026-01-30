# PlanFlow Terminal Session Mockup

> Copy these for demo recordings. Adjust project names/IDs as needed.

---

## Session 1: First-Time Setup

```
$ claude

╭─────────────────────────────────────────────────────────────╮
│  Claude Code                                                │
│  AI pair programmer for your terminal                       │
╰─────────────────────────────────────────────────────────────╯

You > I want to connect my PlanFlow account. My API token is pf_live_abc123xyz

Claude > I'll authenticate you with PlanFlow using your API token.

┌─ planflow_login ─────────────────────────────────────────────┐
│ Verifying API token...                                       │
└──────────────────────────────────────────────────────────────┘

✅ Successfully authenticated!

╭─ Welcome to PlanFlow ───────────────────────────────────────╮
│                                                             │
│  👤 User: Alex Chen                                         │
│  📧 Email: alex@example.com                                 │
│  📅 Member since: January 2026                              │
│  💳 Plan: Pro                                               │
│                                                             │
│  You now have access to all PlanFlow MCP tools.             │
│  Try: "Show my projects" or "What's my next task?"          │
│                                                             │
╰─────────────────────────────────────────────────────────────╯

You >
```

---

## Session 2: Daily Workflow

```
You > Good morning! What should I work on today?

Claude > Let me check your PlanFlow projects and find the best task for you.

┌─ planflow_projects ──────────────────────────────────────────┐
│ Fetching your projects...                                    │
└──────────────────────────────────────────────────────────────┘

📁 Your Projects (3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
│ Project         │ Progress │ Tasks    │ Last Updated        │
├─────────────────┼──────────┼──────────┼─────────────────────┤
│ PlanFlow MVP    │ 52%      │ 12/24    │ 2 hours ago         │
│ Client Portal   │ 78%      │ 18/23    │ Yesterday           │
│ API Redesign    │ 15%      │ 3/20     │ 3 days ago          │
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Let me get the recommended next task for PlanFlow MVP since it was most recently updated.

┌─ planflow_task_next ─────────────────────────────────────────┐
│ Analyzing tasks for project: PlanFlow MVP                    │
│ Calculating priority scores...                               │
└──────────────────────────────────────────────────────────────┘

🎯 Recommended Next Task
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  T3.2: Implement OAuth providers (Google, GitHub)

  ┌────────────────────────────────────────────────────────┐
  │ 📊 Complexity    Medium                                │
  │ 🎯 Phase         3 - Authentication                    │
  │ ✅ Dependencies  T3.1 (Auth setup) - DONE              │
  │ 🔓 Unlocks       T3.3, T3.4, T3.5, T4.1                │
  └────────────────────────────────────────────────────────┘

  Why this task?
  ━━━━━━━━━━━━━━
  • Unlocks 4 downstream tasks (highest impact)
  • All dependencies satisfied
  • Medium complexity - good balance after yesterday's High task
  • Critical path: blocks Phase 4 features

  📝 Task Details:
  ━━━━━━━━━━━━━━━━
  Add OAuth authentication support for Google and GitHub.
  Implement callback handlers, token exchange, and user
  profile fetching. Store OAuth tokens securely.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 Alternatives (if this doesn't fit your schedule):
   1. T3.3: Session management - Low - 2 hours
   2. T3.4: Password reset flow - Medium - 3 hours
   3. T2.8: Error handling - Low - 1.5 hours

Ready to start T3.2? Just say "start T3.2" or pick an alternative.

You > Let's do it. Start T3.2

Claude > I'll mark T3.2 as in progress.

┌─ planflow_task_update ───────────────────────────────────────┐
│ Updating task T3.2...                                        │
└──────────────────────────────────────────────────────────────┘

✅ Task T3.2 status updated!

  TODO → IN_PROGRESS 🔄

╭─ Now Working On ────────────────────────────────────────────╮
│                                                             │
│  T3.2: Implement OAuth providers                            │
│                                                             │
│  📊 Complexity: Medium                                      │
│  🎯 Phase: 3 - Authentication                               │
│  ⏱️  Estimated: 4 hours                                     │
│                                                             │
│  📝 Checklist:                                              │
│  □ Set up OAuth app on Google Console                       │
│  □ Set up OAuth app on GitHub                               │
│  □ Implement callback endpoints                             │
│  □ Handle token exchange                                    │
│  □ Fetch and store user profile                             │
│  □ Write tests                                              │
│                                                             │
╰─────────────────────────────────────────────────────────────╯

Good luck! Let me know when you're done or if you need help.

You >
```

---

## Session 3: Completing a Task

```
You > I finished the OAuth implementation. All tests passing. Mark T3.2 as done.

Claude > Great work! Let me update the task status.

┌─ planflow_task_update ───────────────────────────────────────┐
│ Updating task T3.2 to DONE...                                │
└──────────────────────────────────────────────────────────────┘

✅ Task T3.2 completed! 🎉

╭─ Progress Update ───────────────────────────────────────────╮
│                                                             │
│  📊 Project Progress                                        │
│                                                             │
│  Before: 52% (12/24 tasks)                                  │
│  After:  56% (13/24 tasks)  +4%                             │
│                                                             │
│  🟩🟩🟩🟩🟩🟩⬜⬜⬜⬜ 56%                                   │
│                                                             │
╰─────────────────────────────────────────────────────────────╯

🔓 Newly Unlocked Tasks:
   • T3.3: Session management (Low)
   • T3.4: Password reset flow (Medium)
   • T3.5: Remember me functionality (Low)
   • T4.1: Dashboard layout (Medium)

╭─ Phase 3 Progress ──────────────────────────────────────────╮
│  Authentication: 4/6 tasks (67%)                            │
│  🟩🟩🟩🟩🟩🟩🟩⬜⬜⬜                                       │
╰─────────────────────────────────────────────────────────────╯

🎯 Next recommended: T3.3 - Session management (Low complexity)
   Perfect for a quick win before lunch!

You >
```

---

## Session 4: Viewing All Tasks

```
You > Show me all tasks for PlanFlow MVP

Claude > I'll fetch the complete task list.

┌─ planflow_task_list ─────────────────────────────────────────┐
│ Fetching tasks for PlanFlow MVP...                           │
└──────────────────────────────────────────────────────────────┘

📋 Tasks: PlanFlow MVP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase 1: Foundation (4/4 complete) ✅
──────────────────────────────────────────────────────────────
│ ID   │ Task                    │ Complexity │ Status      │
├──────┼─────────────────────────┼────────────┼─────────────┤
│ T1.1 │ Project setup           │ Low        │ ✅ DONE     │
│ T1.2 │ Database schema         │ Medium     │ ✅ DONE     │
│ T1.3 │ API scaffolding         │ Medium     │ ✅ DONE     │
│ T1.4 │ CI/CD pipeline          │ High       │ ✅ DONE     │

Phase 2: Core Features (5/6 complete)
──────────────────────────────────────────────────────────────
│ ID   │ Task                    │ Complexity │ Status      │
├──────┼─────────────────────────┼────────────┼─────────────┤
│ T2.1 │ User CRUD               │ Medium     │ ✅ DONE     │
│ T2.2 │ Project CRUD            │ Medium     │ ✅ DONE     │
│ T2.3 │ Task CRUD               │ Medium     │ ✅ DONE     │
│ T2.4 │ Plan sync endpoint      │ High       │ ✅ DONE     │
│ T2.5 │ Notifications           │ Medium     │ ✅ DONE     │
│ T2.6 │ Webhooks                │ High       │ 📋 TODO     │

Phase 3: Authentication (4/6 complete)
──────────────────────────────────────────────────────────────
│ ID   │ Task                    │ Complexity │ Status      │
├──────┼─────────────────────────┼────────────┼─────────────┤
│ T3.1 │ Auth setup              │ Medium     │ ✅ DONE     │
│ T3.2 │ OAuth providers         │ Medium     │ ✅ DONE     │
│ T3.3 │ Session management      │ Low        │ 📋 TODO     │
│ T3.4 │ Password reset          │ Medium     │ 📋 TODO     │
│ T3.5 │ Remember me             │ Low        │ 📋 TODO     │
│ T3.6 │ 2FA support             │ High       │ 📋 TODO     │

Phase 4: Dashboard (0/8 complete)
──────────────────────────────────────────────────────────────
│ ID   │ Task                    │ Complexity │ Status      │
├──────┼─────────────────────────┼────────────┼─────────────┤
│ T4.1 │ Dashboard layout        │ Medium     │ 📋 TODO     │
│ T4.2 │ Project list view       │ Medium     │ 📋 TODO     │
│ T4.3 │ Task kanban             │ High       │ 📋 TODO     │
│ T4.4 │ Progress charts         │ Medium     │ 📋 TODO     │
│ T4.5 │ Settings page           │ Low        │ 📋 TODO     │
│ T4.6 │ Profile page            │ Low        │ 📋 TODO     │
│ T4.7 │ Billing integration     │ High       │ 📋 TODO     │
│ T4.8 │ Notifications UI        │ Medium     │ 📋 TODO     │

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Summary
   Total: 24 tasks
   ✅ Done: 13 (54%)
   🔄 In Progress: 0
   📋 TODO: 11
   🚫 Blocked: 0

You > Show me only the TODO tasks

Claude > I'll filter for TODO tasks only.

┌─ planflow_task_list ─────────────────────────────────────────┐
│ Filtering: status = TODO                                     │
└──────────────────────────────────────────────────────────────┘

📋 TODO Tasks: PlanFlow MVP (11)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
│ ID   │ Task                    │ Complexity │ Phase   │ Deps │
├──────┼─────────────────────────┼────────────┼─────────┼──────┤
│ T2.6 │ Webhooks                │ High       │ Phase 2 │ T2.5 │
│ T3.3 │ Session management      │ Low        │ Phase 3 │ T3.2 │
│ T3.4 │ Password reset          │ Medium     │ Phase 3 │ T3.2 │
│ T3.5 │ Remember me             │ Low        │ Phase 3 │ T3.3 │
│ T3.6 │ 2FA support             │ High       │ Phase 3 │ T3.4 │
│ T4.1 │ Dashboard layout        │ Medium     │ Phase 4 │ T3.2 │
│ T4.2 │ Project list view       │ Medium     │ Phase 4 │ T4.1 │
│ T4.3 │ Task kanban             │ High       │ Phase 4 │ T4.2 │
│ T4.4 │ Progress charts         │ Medium     │ Phase 4 │ T4.2 │
│ T4.5 │ Settings page           │ Low        │ Phase 4 │ T4.1 │
│ T4.6 │ Profile page            │ Low        │ Phase 4 │ T4.1 │
│ T4.7 │ Billing integration     │ High       │ Phase 4 │ T4.5 │
│ T4.8 │ Notifications UI        │ Medium     │ Phase 4 │ T4.1 │
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 Available now (dependencies satisfied):
   • T2.6, T3.3, T3.4, T4.1

You >
```

---

## Session 5: Syncing Plans

```
You > I updated my local PROJECT_PLAN.md with some new tasks. Push it to the cloud.

Claude > I'll sync your local plan to PlanFlow cloud.

┌─ planflow_sync ──────────────────────────────────────────────┐
│ Direction: push                                              │
│ Reading PROJECT_PLAN.md...                                   │
│ Uploading to cloud...                                        │
└──────────────────────────────────────────────────────────────┘

✅ Plan synced to cloud!

╭─ Sync Summary ──────────────────────────────────────────────╮
│                                                             │
│  📄 File: PROJECT_PLAN.md                                   │
│  📏 Lines: 248                                              │
│  📦 Size: 8.4 KB                                            │
│                                                             │
│  🕐 Synced at: 2026-01-30 14:32:05 UTC                      │
│                                                             │
│  Changes detected:                                          │
│  • +2 new tasks added (T4.9, T4.10)                         │
│  • 1 task description updated (T3.6)                        │
│                                                             │
╰─────────────────────────────────────────────────────────────╯

Your web dashboard will now show the updated plan.

You > My teammate Sarah said she updated some tasks. Pull the latest.

Claude > I'll pull the latest plan from the cloud.

┌─ planflow_sync ──────────────────────────────────────────────┐
│ Direction: pull                                              │
│ Fetching from cloud...                                       │
│ Writing to PROJECT_PLAN.md...                                │
└──────────────────────────────────────────────────────────────┘

✅ Plan downloaded!

╭─ Sync Summary ──────────────────────────────────────────────╮
│                                                             │
│  📄 File: PROJECT_PLAN.md                                   │
│  📏 Lines: 252 (+4 from local)                              │
│                                                             │
│  Changes from cloud:                                        │
│  • T4.1 marked as DONE by Sarah                             │
│  • T4.2 marked as IN_PROGRESS by Sarah                      │
│  • Task T4.11 added: "Dark mode support"                    │
│                                                             │
│  💾 Local backup: PROJECT_PLAN.md.backup                    │
│                                                             │
╰─────────────────────────────────────────────────────────────╯

Your local PROJECT_PLAN.md is now up to date!

You >
```

---

## Session 6: Checking Notifications

```
You > Any notifications for me?

Claude > Let me check your PlanFlow notifications.

┌─ planflow_notifications ─────────────────────────────────────┐
│ Fetching unread notifications...                             │
└──────────────────────────────────────────────────────────────┘

🔔 Notifications (4 unread)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ✅ Task Completed                              2 hours ago
     Sarah marked T4.1 as done in "PlanFlow MVP"

  💬 New Comment                                 3 hours ago
     Sarah commented on T4.2: "Starting the project
     list view. Will need the API endpoint updated."

  🔄 Task Started                                5 hours ago
     Sarah started T4.2 in "PlanFlow MVP"

  👤 Team Update                                 Yesterday
     Mike joined "PlanFlow MVP" as Developer

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 Say "mark all as read" to clear notifications.

You >
```

---

## Session 7: Quick Commands Reference

```
You > What PlanFlow commands can I use?

Claude > Here are all the PlanFlow MCP tools available:

╭─ PlanFlow MCP Tools ────────────────────────────────────────╮
│                                                             │
│  🔐 Authentication                                          │
│  ────────────────────────────────────────────────────────   │
│  planflow_login     Connect with your API token             │
│  planflow_logout    Disconnect from PlanFlow                │
│  planflow_whoami    Show current user info                  │
│                                                             │
│  📁 Projects                                                │
│  ────────────────────────────────────────────────────────   │
│  planflow_projects  List all your projects                  │
│  planflow_create    Create a new project                    │
│  planflow_sync      Push/pull PROJECT_PLAN.md               │
│                                                             │
│  ✅ Tasks                                                   │
│  ────────────────────────────────────────────────────────   │
│  planflow_task_list   View tasks (with filters)             │
│  planflow_task_update Change task status                    │
│  planflow_task_next   Get recommended next task             │
│                                                             │
│  🔔 Other                                                   │
│  ────────────────────────────────────────────────────────   │
│  planflow_notifications  View notifications                 │
│                                                             │
╰─────────────────────────────────────────────────────────────╯

Just describe what you want to do in natural language, and I'll
use the appropriate tool. For example:

  • "What's my next task?"
  • "Show me blocked tasks"
  • "Mark T2.3 as done"
  • "Sync my plan to cloud"

You >
```

---

## Tips for Recording

1. **Type at a natural pace** - Not too fast, not too slow
2. **Add pauses** - After commands, let responses "breathe"
3. **Use cursor highlighting** - Draw attention to key info
4. **Terminal zoom** - 150-200% for readability
5. **Clean terminal** - Clear before each scene
6. **Consistent timing** - ~2-3 seconds per response section
