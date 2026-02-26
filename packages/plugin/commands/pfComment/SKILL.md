---
name: pfComment
description: Add a comment to a task in the current PlanFlow project
---

# PlanFlow Task Comment

Add a comment to a task in the linked cloud project with comment card. Supports @mentions to notify team members.

## Usage

```bash
/pfComment <task-id> <comment>           # Add comment to task
/pfComment T2.1 "Ready for review"       # Simple comment
/pfComment T2.1 "@jane Please check"     # Comment with @mention
```

## Step 0: Load Configuration

```javascript
// ... standard config loading ...
```

## Step 1: Show Usage Card (if no arguments)

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  💬 Task Comment                                                             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── Usage ───────────────────────────────────────────────────────────────    │
│                                                                              │
│  /pfComment <task-id> <comment>    Add comment to task                       │
│                                                                              │
│  ── Examples ────────────────────────────────────────────────────────────    │
│                                                                              │
│  /pfComment T2.1 "Ready for review"                                          │
│  /pfComment T2.1 "@jane Please check the validation"                         │
│                                                                              │
│  💡 Use @email to mention and notify team members                            │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 2: Display Success Card

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Comment added!                                                              │
│                                                                              │
│  ── Comment Details ────────────────────────────────────────────────────     │
│                                                                              │
│  📋 Task:     T2.1: Implement login API                                      │
│  👤 Author:   John Doe                                                       │
│  🕐 Time:     just now                                                       │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                                                                        │  │
│  │  "Ready for review **@jane@company.com**"                              │  │
│  │                                                                        │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ── Notifications Sent ─────────────────────────────────────────────────     │
│                                                                              │
│  ✉️  Jane Smith (jane@company.com)                                           │
│                                                                              │
│  They will receive an email notification.                                    │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 View all comments:                                                       │
│     • /pfComments T2.1                                                       │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Success Card (without mentions):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Comment added!                                                              │
│                                                                              │
│  ── Comment Details ────────────────────────────────────────────────────     │
│                                                                              │
│  📋 Task:     T2.1: Implement login API                                      │
│  👤 Author:   John Doe                                                       │
│  🕐 Time:     just now                                                       │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                                                                        │  │
│  │  "Started working on this task"                                        │  │
│  │                                                                        │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 View all comments:                                                       │
│     • /pfComments T2.1                                                       │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

## Step 3: Success Card with Unresolved Mentions

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Comment added!                                                              │
│                                                                              │
│  ── Comment Details ────────────────────────────────────────────────────     │
│                                                                              │
│  📋 Task:     T2.1: Implement login API                                      │
│  👤 Author:   John Doe                                                       │
│  🕐 Time:     just now                                                       │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                                                                        │  │
│  │  "Hey **@bob** and **@unknown@test.com**, please review"               │  │
│  │                                                                        │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ── Notifications Sent ─────────────────────────────────────────────────     │
│                                                                              │
│  ✉️  Bob Wilson (bob@company.com)                                            │
│                                                                              │
│  ── Undelivered Mentions ───────────────────────────────────────────────     │
│                                                                              │
│  ❌ @unknown@test.com - not a team member                                    │
│                                                                              │
│  💡 Invite them first: /pfTeamInvite <email>                                 │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 View all comments:                                                       │
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

**Empty Comment Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Comment cannot be empty.                                                    │
│                                                                              │
│  Please provide a comment message.                                           │
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

**Permission Denied Card (403):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  You don't have permission to comment.                                       │
│                                                                              │
│  Only editors and above can add comments.                                    │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## @Mention Support

| Input | Resolution | Notes |
|-------|------------|-------|
| @jane@company.com | jane@company.com | Direct email match |
| @jane | jane@company.com | Match by first name |
| @jane.smith | jane.smith@company.com | Match by full name |
| @unknown | (invalid) | Show warning, skip |

## Notes

- Comments support @mentions using email (@jane@company.com) or username (@jane)
- Mentioned users receive email notifications (if enabled)
- Task IDs are case-insensitive (t2.1 becomes T2.1)
- Maximum comment length is 2000 characters
- View comments with /pfComments <task-id>

