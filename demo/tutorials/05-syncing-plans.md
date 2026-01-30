# Tutorial 5: Syncing Plans

> Keep your local PROJECT_PLAN.md and the cloud in perfect sync

**Duration:** 2-3 minutes
**Audience:** All users
**Prerequisites:** PlanFlow project with PROJECT_PLAN.md

---

## Learning Objectives

By the end of this tutorial, viewers will be able to:
- Push local PROJECT_PLAN.md to the cloud
- Pull cloud changes to local file
- Handle sync conflicts
- Understand sync workflow

---

## Script

### Opening (0:00 - 0:10)

**Visual:** Split screen - Local file + Cloud dashboard

**Voiceover:**
> "PlanFlow keeps your local PROJECT_PLAN.md and the cloud dashboard in sync. Let's see how bidirectional sync works."

---

### Part 1: Push Local Changes (0:10 - 0:50)

**Visual:** Code editor with PROJECT_PLAN.md

```markdown
## Phase 3: Authentication

| ID   | Task              | Status  | Complexity |
|------|-------------------|---------|------------|
| T3.1 | User registration | DONE ✅ | Medium     |
| T3.2 | Login endpoint    | DONE ✅ | Medium     |
| T3.3 | JWT tokens        | TODO    | High       |  ← Just added
```

**Voiceover:**
> "Say you've updated your local PROJECT_PLAN.md - added new tasks or marked some as done."

**Visual:** Terminal with Claude

```
You > Sync my PROJECT_PLAN.md to PlanFlow

Claude > Calling planflow_sync (push)...

📤 Pushing to cloud...

✅ Plan synced successfully!

📄 PROJECT_PLAN.md
   Lines: 156
   Size: 5.2 KB
   Tasks: 24 total

📊 Changes:
   +1 new task (T3.3)
   ~2 tasks updated

Synced at: 2026-01-30 14:32:05
```

**Voiceover:**
> "Tell Claude to sync your plan. PlanFlow uploads your local file to the cloud and updates all tasks."

**Visual:** Dashboard refreshing

```
[Dashboard shows new task T3.3 appearing]
[Progress stats update]
```

**Voiceover:**
> "The web dashboard updates immediately - your team sees the changes right away."

---

### Part 2: Pull Cloud Changes (0:50 - 1:30)

**Visual:** Scenario setup

```
┌─────────────────────────────────────────────┐
│ Teammate Sarah on web dashboard:            │
│                                             │
│ [Marks T2.4 as DONE]                        │
│ [Adds comment to T3.1]                      │
│                                             │
│ You in terminal:                            │
│ (unaware of changes)                        │
└─────────────────────────────────────────────┘
```

**Voiceover:**
> "Imagine your teammate Sarah updates some tasks on the web dashboard. You want those changes in your local file."

**Visual:** Terminal

```
You > Pull the latest plan from PlanFlow

Claude > Calling planflow_sync (pull)...

📥 Pulling from cloud...

✅ Plan downloaded!

📄 PROJECT_PLAN.md updated
   Lines: 158 (+2)

📊 Changes from cloud:
   • T2.4 marked as DONE by Sarah
   • T3.1 comment added: "Need OAuth provider setup"

Your local file has been updated.
```

**Voiceover:**
> "Pull the latest changes. PlanFlow downloads the cloud version and updates your local file. You can see exactly what changed and who made the changes."

---

### Part 3: Sync Workflow (1:30 - 2:00)

**Visual:** Workflow diagram

```
Your Workflow
─────────────────────────────────────────────

1. Start your day
   └── "Pull latest plan from PlanFlow"

2. Work on tasks
   └── Update local PROJECT_PLAN.md
   └── Use Claude to update task status

3. End of session
   └── "Sync my plan to PlanFlow"

4. Team collaboration
   └── Others see your changes on dashboard
   └── You pull their changes next session
```

**Voiceover:**
> "Here's the recommended workflow: Pull at the start of your day, work on tasks, then push your changes when you're done. This keeps everyone in sync."

---

### Part 4: Handling Conflicts (2:00 - 2:30)

**Visual:** Conflict scenario

```
You > Sync my plan to PlanFlow

Claude > ⚠️ Sync conflict detected!

Your local file has changes that conflict with cloud:

Local:  T2.3 status = IN_PROGRESS
Cloud:  T2.3 status = DONE (by Sarah, 2 hours ago)

Options:
1. Keep local (force push)
2. Keep cloud (pull first)
3. Merge manually

Which would you like to do?
```

**Voiceover:**
> "If both you and a teammate edit the same task, PlanFlow detects the conflict. You can choose to keep your version, theirs, or merge manually."

**Visual:** Resolution

```
You > Keep cloud version, then push my other changes

Claude > 📥 Pulling cloud version...
         📤 Pushing your changes...

✅ Conflict resolved!
   T2.3 status kept as DONE (Sarah's change)
   Your other updates synced successfully.
```

**Voiceover:**
> "Most conflicts are easy to resolve. PlanFlow gives you full control over what happens."

---

### Closing (2:30 - 2:50)

**Visual:** Sync summary

```
Sync Commands:
─────────────────────────────────────────────
Push:  "Sync my plan to PlanFlow"
Pull:  "Pull latest from PlanFlow"
Both:  "Sync plan both ways"
─────────────────────────────────────────────
```

**Voiceover:**
> "That's bidirectional sync with PlanFlow. Your local files and the cloud stay perfectly in sync."

**Visual:** End card

```
Syncing Plans:
  ✅ Push local to cloud
  ✅ Pull cloud to local
  ✅ Conflict detection
  ✅ Team collaboration

Next: Tutorial 6 - Team Collaboration
```

**Voiceover:**
> "In the next tutorial, we'll dive into team collaboration features - sharing projects, assigning tasks, and working together."

---

## Timestamps for YouTube

```
0:00 - Introduction
0:10 - Push Local Changes
0:50 - Pull Cloud Changes
1:30 - Sync Workflow
2:00 - Handling Conflicts
2:30 - Summary & Next Steps
```
