---
name: pfComments
description: View comments on a task in the current PlanFlow project
---

# PlanFlow View Task Comments

View all comments on a task in the linked cloud project with comment thread cards.

## Usage

```bash
/pfComments <task-id>           # View comments on task
/pfComments T2.1                # View comments on T2.1
/pfComments T2.1 --all          # Include resolved/old comments
```

## Step 0: Load Configuration

```javascript
// ... standard config loading ...
```

## Step 1: Show Usage Card (if no arguments)

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  💬 View Task Comments                                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── Usage ───────────────────────────────────────────────────────────────    │
│                                                                              │
│  /pfComments <task-id>          View comments on task                        │
│  /pfComments <task-id> --all    Include all comments                         │
│                                                                              │
│  ── Example ────────────────────────────────────────────────────────────     │
│                                                                              │
│  /pfComments T2.1                                                            │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 2: Display Comments Card

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  💬 Comments - T2.1                                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📋 Task: Implement login API                                                │
│  📝 3 comments                                                               │
│                                                                              │
│  ── Comment Thread ─────────────────────────────────────────────────────     │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  👤 John Doe                                           2 hours ago     │  │
│  │                                                                        │  │
│  │  "Started working on this task"                                        │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  👤 John Doe                                           30 min ago      │  │
│  │                                                                        │  │
│  │  "Ready for review **@jane@company.com**"                              │  │
│  │  📧 → Jane Smith                                                       │  │
│  │                                                                        │  │
│  │  └── 👤 Jane Smith                                     15 min ago      │  │
│  │      "Looks good! Just one small fix needed."                          │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Add a comment:                                                           │
│     • /pfComment T2.1 "Your message"                                         │
│     • /pfComment T2.1 "@teammate Check this"                                 │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

## Step 3: No Comments Card

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  💬 Comments - T2.1                                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📋 Task: Implement login API                                                │
│                                                                              │
│  ╭─────────────────────────────────────────────────────────────────────╮     │
│  │                                                                     │     │
│  │  📭 No comments yet.                                                │     │
│  │                                                                     │     │
│  ╰─────────────────────────────────────────────────────────────────────╯     │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Be the first to comment:                                                 │
│     • /pfComment T2.1 "Your message"                                         │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
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
│  You don't have permission to view comments.                                 │
│                                                                              │
│  Only project members can view comments.                                     │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Notes

- Comments are displayed in chronological order (oldest first)
- Replies are indented under their parent comment
- Time is shown relative to now (e.g., "2 hours ago")
- **@mentions are highlighted** in bold in the comment text
- Mentioned team members are shown with 📧 indicator
- Use --all flag to include older/resolved comments
- Maximum 50 comments returned by default

