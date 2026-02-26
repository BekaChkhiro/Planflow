---
name: pfMyTasks
description: View tasks assigned to you in the current PlanFlow project
---

# PlanFlow My Tasks

View all tasks assigned to you in the linked cloud project with task list cards.

## Usage

```bash
/pfMyTasks                    # Show all your assigned tasks
/pfMyTasks --status todo      # Filter by status (todo, in_progress, done, blocked)
/pfMyTasks --all              # Include completed tasks (hidden by default)
```

## Step 0: Load Configuration

```javascript
// ... standard config loading ...
```

## Step 0.5: Show Notification Badge (v1.6.0+)

**Purpose:** Display unread notification count to keep users informed of team activity.

**When to Execute:** Only if authenticated AND linked to a project.

```bash
# Only proceed if authenticated and linked
if [ -n "$TOKEN" ] && [ -n "$PROJECT_ID" ]; then
  RESPONSE=$(curl -s --connect-timeout 3 --max-time 5 \
    -X GET \
    -H "Accept: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    "${API_URL}/projects/${PROJECT_ID}/notifications?limit=1&unread=true" 2>/dev/null)

  if [ $? -eq 0 ]; then
    UNREAD_COUNT=$(echo "$RESPONSE" | grep -o '"unreadCount":[0-9]*' | grep -o '[0-9]*')
    if [ -n "$UNREAD_COUNT" ] && [ "$UNREAD_COUNT" -gt 0 ]; then
      echo "🔔 $UNREAD_COUNT unread notification(s) — /pfNotifications to view"
      echo ""
    fi
  fi
fi
```

See: `skills/notification-badge/SKILL.md` for full implementation details.

## Step 1: Display My Tasks Card

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  📋 My Assigned Tasks                                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 Project: Planflow Plugin                                                 │
│                                                                              │
│  ── In Progress (1) ────────────────────────────────────────────────────     │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  🔄 T2.1 - Implement login API                                         │  │
│  │     🔴 High complexity                                                 │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ── To Do (2) ──────────────────────────────────────────────────────────     │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  ○ T2.3 - Add validation                                               │  │
│  │     🟡 Medium complexity                                               │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  ○ T3.1 - Create dashboard                                             │  │
│  │     🟢 Low complexity                                                  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Quick actions:                                                           │
│     • /planUpdate T2.1 done       Mark current task as done                  │
│     • /pfMyTasks --all            Include completed tasks                    │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**With Blocked Tasks:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  📋 My Assigned Tasks                                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 Project: Planflow Plugin                                                 │
│                                                                              │
│  ── In Progress (1) ────────────────────────────────────────────────────     │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  🔄 T2.1 - Implement login API                                         │  │
│  │     🔴 High complexity                                                 │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ── Blocked (1) ────────────────────────────────────────────────────────     │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  🚫 T2.5 - Setup database                                              │  │
│  │     🟡 Medium complexity                                               │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ── To Do (1) ──────────────────────────────────────────────────────────     │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  ○ T2.3 - Add validation                                               │  │
│  │     🟡 Medium complexity                                               │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Quick actions:                                                           │
│     • /planUpdate T2.1 done       Mark current task as done                  │
│     • /planUpdate T2.5 unblock    Unblock task                               │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

## Step 2: No Tasks Card

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  📋 My Assigned Tasks                                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 Project: Planflow Plugin                                                 │
│                                                                              │
│  ╭─────────────────────────────────────────────────────────────────────╮     │
│  │                                                                     │     │
│  │  📭 You don't have any assigned tasks.                              │     │
│  │                                                                     │     │
│  ╰─────────────────────────────────────────────────────────────────────╯     │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Get started:                                                             │
│     • /planNext                   Find tasks to work on                      │
│     • /pfAssign T1.1 me           Assign yourself a task                     │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Error Handling

**Not Authenticated Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.sync.notAuthenticated}                                          │
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /pfLogin               Sign in to PlanFlow                             │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Not Linked Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.sync.notLinked}                                                 │
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /pfCloudLink           Link to a cloud project                         │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Invalid Status Filter Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Invalid status filter.                                                      │
│                                                                              │
│  Valid statuses: todo, in_progress, done, blocked                            │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

