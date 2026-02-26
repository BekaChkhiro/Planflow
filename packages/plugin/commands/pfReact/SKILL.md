---
name: pfReact
description: Add emoji reaction to a task in the current PlanFlow project
---

# PlanFlow Task Reaction

Add an emoji reaction to a task in the linked cloud project with reaction card.

## Usage

```bash
/pfReact <task-id> <emoji>       # Add reaction to task
/pfReact T2.1 👍                 # Thumbs up
/pfReact T2.1 ✅                 # Check mark
/pfReact T2.1 🎉                 # Celebration
/pfReact T2.1 remove <emoji>    # Remove own reaction
```

## Step 0: Load Configuration

```javascript
// ... standard config loading ...
```

## Step 1: Show Usage Card (if no arguments)

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  😄 Task Reaction                                                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── Usage ───────────────────────────────────────────────────────────────    │
│                                                                              │
│  /pfReact <task-id> <emoji>           Add emoji reaction to task             │
│  /pfReact <task-id> remove <emoji>    Remove your reaction from task         │
│                                                                              │
│  ── Examples ────────────────────────────────────────────────────────────    │
│                                                                              │
│  /pfReact T2.1 👍                                                            │
│  /pfReact T2.1 🎉                                                            │
│  /pfReact T2.1 remove 👍                                                     │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 2: Display Success Card (Add Reaction)

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Reaction added!                                                             │
│                                                                              │
│  ── Reaction Details ───────────────────────────────────────────────────     │
│                                                                              │
│  📋 Task:     T2.1: Implement login API                                      │
│  😄 Emoji:    👍                                                             │
│  📁 Project:  Planflow Plugin                                                │
│                                                                              │
│  ── Current Reactions ──────────────────────────────────────────────────     │
│                                                                              │
│  👍 3 (Beka, Jane, Bob)                                                      │
│  ✅ 1 (Jane)                                                                 │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 View comments:                                                           │
│     • /pfComments T2.1                                                       │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

## Step 3: Display Success Card (Remove Reaction)

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Reaction removed!                                                           │
│                                                                              │
│  ── Reaction Details ───────────────────────────────────────────────────     │
│                                                                              │
│  📋 Task:     T2.1: Implement login API                                      │
│  😄 Emoji:    👍                                                             │
│  📁 Project:  Planflow Plugin                                                │
│                                                                              │
│  ── Current Reactions ──────────────────────────────────────────────────     │
│                                                                              │
│  👍 2 (Jane, Bob)                                                            │
│  ✅ 1 (Jane)                                                                 │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 View comments:                                                           │
│     • /pfComments T2.1                                                       │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

## Step 4: No Reactions Card

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Reaction added!                                                             │
│                                                                              │
│  ── Reaction Details ───────────────────────────────────────────────────     │
│                                                                              │
│  📋 Task:     T2.1: Implement login API                                      │
│  😄 Emoji:    👍                                                             │
│  📁 Project:  Planflow Plugin                                                │
│                                                                              │
│  ── Current Reactions ──────────────────────────────────────────────────     │
│                                                                              │
│  👍 1 (You)                                                                  │
│                                                                              │
│  You're the first to react!                                                  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 View comments:                                                           │
│     • /pfComments T2.1                                                       │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

## Error Handling

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

**Invalid Emoji Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Please provide an emoji to react with.                                      │
│                                                                              │
│  Emoji is required.                                                          │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

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

**Already Reacted Card (409):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚠️  WARNING                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  You already reacted with this emoji.                                        │
│                                                                              │
│  💡 To remove your reaction:                                                 │
│     • /pfReact T2.1 remove 👍                                                │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Not Reacted Card (400 on remove):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚠️  WARNING                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  You haven't reacted with this emoji.                                        │
│                                                                              │
│  💡 To add a reaction:                                                       │
│     • /pfReact T2.1 👍                                                       │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Permission Denied Card (403):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  You don't have permission to react.                                         │
│                                                                              │
│  Only project members can add reactions.                                     │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Notes

- Task IDs are case-insensitive (t2.1 becomes T2.1)
- Only project members can add reactions
- Each user can only react once per emoji per task
- The `remove` action only removes your own reaction
- View task comments with /pfComments <task-id>

