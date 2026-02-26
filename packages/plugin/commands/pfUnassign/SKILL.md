---
name: pfUnassign
description: Remove assignment from a task in the current PlanFlow project
---

# PlanFlow Task Unassignment

Remove the assignee from a task in the linked cloud project with unassignment card.

## Usage

```bash
/pfUnassign <task-id>        # Remove assignment from task
/pfUnassign T2.1             # Example
```

## Step 0: Load Configuration

```javascript
// ... standard config loading ...
```

## Step 1: Show Usage Card (if no arguments)

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  📋 Task Unassignment                                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── Usage ───────────────────────────────────────────────────────────────    │
│                                                                              │
│  /pfUnassign <task-id>    Remove assignment from task                        │
│                                                                              │
│  ── Example ────────────────────────────────────────────────────────────     │
│                                                                              │
│  /pfUnassign T2.1                                                            │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 2: Display Success Card

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Assignment removed!                                                         │
│                                                                              │
│  ── Unassignment Details ───────────────────────────────────────────────     │
│                                                                              │
│  📋 Task:         T2.1: Implement login API                                  │
│  👤 Removed from: Jane Smith (jane@company.com)                              │
│  📁 Project:      Planflow Plugin                                            │
│                                                                              │
│  ╭───────────────────╮                                                       │
│  │ ✓ Unassigned      │                                                       │
│  ╰───────────────────╯                                                       │
│                                                                              │
│  The task is now available for anyone to pick up.                            │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.commands}                                                   │
│     • /pfAssign T2.1 <email>      Reassign to someone                        │
│     • /pfAssign T2.1 me           Assign to yourself                         │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

## Error Handling

**Task Not Found Card (404):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Task not found: T2.1                                                        │
│                                                                              │
│  Make sure the task exists in the cloud project.                             │
│                                                                              │
│  💡 Run /pfSyncPush to sync your local tasks first.                          │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Task Not Assigned Card (400):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚠️  WARNING                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Task T2.1 has no assignee.                                                  │
│                                                                              │
│  This task is not currently assigned to anyone.                              │
│                                                                              │
│  💡 To assign it:                                                            │
│     • /pfAssign T2.1 <email>                                                 │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Permission Denied Card (403):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  You don't have permission to unassign tasks.                                │
│                                                                              │
│  Only editors and above can modify task assignments.                         │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Invalid Task ID Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Invalid task ID format.                                                     │
│                                                                              │
│  Task ID should be like: T1.1, T2.3, T10.5                                   │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

