---
name: pfWorkload
description: View team workload distribution for the current PlanFlow project
---

# PlanFlow Team Workload

Display team workload distribution with visual progress bars for each team member.

## Usage

```bash
/pfWorkload                    # Show team workload overview
/pfWorkload --details          # Show detailed task breakdown per member
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

## Step 1: Display Workload Card

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  📊 Team Workload                                                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 Project: Planflow Plugin                                                 │
│  📋 Total Tasks: 24                                                          │
│                                                                              │
│  ── Workload Distribution ──────────────────────────────────────────────     │
│                                                                              │
│  John         ████████████████████░░░░░░░░░░  8 tasks (2 in progress)        │
│  Jane         ██████████████░░░░░░░░░░░░░░░░  6 tasks (1 in progress)        │
│  Bob          ████████░░░░░░░░░░░░░░░░░░░░░░  4 tasks                        │
│                                                                              │
│  ── Unassigned ─────────────────────────────────────────────────────────     │
│                                                                              │
│  📭 12 tasks are not assigned                                                │
│                                                                              │
│  ── Summary ────────────────────────────────────────────────────────────     │
│                                                                              │
│  Average per member: 6.0 tasks                                               │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.commands}                                                   │
│     • /pfAssign <task-id> <email>    Assign unassigned tasks                 │
│     • /pfWorkload --details          View detailed breakdown                 │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

## Step 2: Detailed Workload Card (--details)

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  📊 Team Workload                                                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 Project: Planflow Plugin                                                 │
│  📋 Total Tasks: 24                                                          │
│                                                                              │
│  ── Workload Distribution ──────────────────────────────────────────────     │
│                                                                              │
│  John         ████████████████████░░░░░░░░░░  8 tasks (2 in progress)        │
│  Jane         ██████████████░░░░░░░░░░░░░░░░  6 tasks (1 in progress)        │
│  Bob          ████████░░░░░░░░░░░░░░░░░░░░░░  4 tasks                        │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── Detailed Breakdown ─────────────────────────────────────────────────     │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  👤 John Doe (john@company.com)                                        │  │
│  │     🔄 In Progress:                                                    │  │
│  │        T2.1 - API endpoints                                            │  │
│  │        T2.4 - Database schema                                          │  │
│  │     ○ To Do:                                                           │  │
│  │        T2.3 - Validation                                               │  │
│  │        T2.5 - Error handling                                           │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  👤 Jane Smith (jane@company.com)                                      │  │
│  │     🔄 In Progress:                                                    │  │
│  │        T3.5 - Dashboard                                                │  │
│  │     ○ To Do:                                                           │  │
│  │        T3.6 - Charts                                                   │  │
│  │        T3.7 - Reports                                                  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  👤 Bob Wilson (bob@company.com)                                       │  │
│  │     ○ To Do:                                                           │  │
│  │        T4.1 - Testing                                                  │  │
│  │        T4.2 - Documentation                                            │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ── Unassigned Tasks ───────────────────────────────────────────────────     │
│                                                                              │
│  📭 T5.1 - Deployment                                                        │
│  📭 T5.2 - CI/CD setup                                                       │
│  📭 T5.3 - Monitoring                                                        │
│     ... and 9 more                                                           │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.commands}                                                   │
│     • /pfAssign T5.1 bob@company.com    Assign a task                        │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

## Step 3: Only Owner Card (Empty Team)

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  📊 Team Workload                                                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 Project: Planflow Plugin                                                 │
│  📋 Total Tasks: 15                                                          │
│                                                                              │
│  ── Workload Distribution ──────────────────────────────────────────────     │
│                                                                              │
│  You          ██████████████░░░░░░░░░░░░░░░░  7 tasks (1 in progress)        │
│                                                                              │
│  📭 Unassigned: 8 tasks                                                      │
│                                                                              │
│  ℹ️  You're the only team member.                                             │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 To distribute workload:                                                  │
│     • /pfTeamInvite <email>          Invite team members                     │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

## Workload Imbalance Warning

When workload is significantly unbalanced:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚠️  Workload Imbalance Detected                                             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  John has 12 tasks while Bob has only 2 tasks.                               │
│                                                                              │
│  Consider redistributing tasks for better balance.                           │
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

**Network Error Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Network error. Could not fetch workload data.                               │
│                                                                              │
│  Please check your connection and try again.                                 │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

