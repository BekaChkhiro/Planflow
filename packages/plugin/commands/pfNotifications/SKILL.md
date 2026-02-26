---
name: pfNotifications
description: View and manage notifications in the current PlanFlow project
---

# PlanFlow Notifications

View and manage your notifications in the linked cloud project.

## Usage

```bash
/pfNotifications                  # Show all notifications (unread first)
/pfNotifications --unread         # Show only unread notifications
/pfNotifications --limit 20       # Show more entries (default: 10)
/pfNotifications --type mention   # Filter by notification type
```

## Process

### Step 0: Load Configuration & Translations

**CRITICAL: Execute this step FIRST, before any output!**

```javascript
// Merge global and local configs
function getMergedConfig() {
  let globalConfig = {}
  let localConfig = {}

  const globalPath = expandPath("~/.config/claude/plan-plugin-config.json")
  if (fileExists(globalPath)) {
    try { globalConfig = JSON.parse(readFile(globalPath)) } catch (e) {}
  }

  if (fileExists("./.plan-config.json")) {
    try { localConfig = JSON.parse(readFile("./.plan-config.json")) } catch (e) {}
  }

  return {
    ...globalConfig,
    ...localConfig,
    cloud: {
      ...(globalConfig.cloud || {}),
      ...(localConfig.cloud || {})
    }
  }
}

const config = getMergedConfig()
const language = config.language || "en"
const cloudConfig = config.cloud || {}
const isAuthenticated = !!cloudConfig.apiToken
const projectId = cloudConfig.projectId
const apiUrl = cloudConfig.apiUrl || "https://api.planflow.tools"

// Load translations
const t = JSON.parse(readFile(`locales/${language}.json`))
```

### Step 1: Check Authentication

If not authenticated, show error:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.sync.notAuthenticated}                                          │
│                                                                              │
│  💡 Run /pfLogin to authenticate first.                                      │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

If no project linked, show error:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.sync.notLinked}                                                 │
│                                                                              │
│  💡 Run /pfCloudLink to link a project first.                                │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### Step 2: Show Usage Card (if --help)

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🔔 Notifications                                                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── {t.commands.notifications.usage} ──────────────────────────────────────  │
│                                                                              │
│  /pfNotifications                  Show all notifications                    │
│  /pfNotifications --unread         Show only unread notifications            │
│  /pfNotifications --limit <n>      Show more entries (default: 10)           │
│  /pfNotifications --type <type>    Filter by notification type               │
│                                                                              │
│  ── {t.commands.notifications.types} ──────────────────────────────────────  │
│                                                                              │
│  mention      - When someone @mentions you                                   │
│  assignment   - When you're assigned to a task                               │
│  task         - Task status changes you're watching                          │
│  comment      - New comments on tasks you're involved in                     │
│                                                                              │
│  ── {t.commands.notifications.example} ────────────────────────────────────  │
│                                                                              │
│  /pfNotifications --unread --type mention                                    │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### Step 3: Fetch Notifications from API

**API Endpoint:** `GET /projects/{projectId}/notifications`

**Query Parameters:**
- `unread` (boolean) - Filter to unread only
- `type` (string) - Filter by type: mention, assignment, task, comment
- `limit` (number) - Max items to return (default: 10, max: 50)

**Bash Implementation:**

```bash
API_URL="https://api.planflow.tools"
TOKEN="$API_TOKEN"
PROJECT_ID="$PROJECT_ID"
LIMIT="10"
UNREAD_ONLY=""  # or "true"
TYPE_FILTER=""  # or "mention", "assignment", "task", "comment"

# Build query string
QUERY="limit=${LIMIT}"
if [ -n "$UNREAD_ONLY" ]; then
  QUERY="${QUERY}&unread=true"
fi
if [ -n "$TYPE_FILTER" ]; then
  QUERY="${QUERY}&type=${TYPE_FILTER}"
fi

# Fetch notifications
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 10 \
  -X GET \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "${API_URL}/projects/${PROJECT_ID}/notifications?${QUERY}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  # Parse notifications from response
  echo "$BODY"
else
  echo "Error: HTTP $HTTP_CODE"
fi
```

**Expected Response:**

```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "notif-uuid-1",
        "type": "mention",
        "read": false,
        "createdAt": "2026-02-10T08:55:00Z",
        "actor": {
          "name": "Jane Smith",
          "email": "jane@company.com"
        },
        "task": {
          "taskId": "T2.1",
          "name": "Implement login API"
        },
        "preview": "@john please review the changes",
        "priority": "high"
      },
      {
        "id": "notif-uuid-2",
        "type": "assignment",
        "read": false,
        "createdAt": "2026-02-10T07:00:00Z",
        "actor": {
          "name": "Jane Smith",
          "email": "jane@company.com"
        },
        "task": {
          "taskId": "T3.2",
          "name": "Add validation"
        },
        "priority": "medium"
      },
      {
        "id": "notif-uuid-3",
        "type": "task",
        "read": false,
        "createdAt": "2026-02-10T06:00:00Z",
        "actor": {
          "name": "Bob Wilson",
          "email": "bob@company.com"
        },
        "task": {
          "taskId": "T2.3",
          "name": "Error handling"
        },
        "action": "completed",
        "priority": "low"
      },
      {
        "id": "notif-uuid-4",
        "type": "comment",
        "read": true,
        "createdAt": "2026-02-10T05:00:00Z",
        "actor": {
          "name": "Jane Smith",
          "email": "jane@company.com"
        },
        "task": {
          "taskId": "T2.1",
          "name": "Implement login API"
        },
        "preview": "Looks good!",
        "priority": "low"
      }
    ],
    "unreadCount": 3,
    "total": 4
  }
}
```

### Step 4: Display Notifications Card

**Main Notifications Card (with notifications):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🔔 {t.commands.notifications.title} ({unreadCount} unread)                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 Project: {projectName}                                                   │
│                                                                              │
│  ── Notifications ─────────────────────────────────────────────────────────  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  🔴 Jane mentioned you in T2.1                        5 min ago        │  │
│  │     "@john please review the changes"                                  │  │
│  │     📋 Implement login API                                             │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  🟡 You were assigned to T3.2                         1 hour ago       │  │
│  │     Assigned by: Jane Smith                                            │  │
│  │     📋 Add validation                                                  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  🟢 T2.3 was completed                                2 hours ago      │  │
│  │     Completed by: Bob Wilson                                           │  │
│  │     📋 Error handling                                                  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  ○ New comment on T2.1                                3 hours ago      │  │
│  │     Jane: "Looks good!"                                                │  │
│  │     📋 Implement login API                                             │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  📄 Showing {shown} of {total} notifications                                 │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.quickActions}                                               │
│     • /pfNotificationsClear           {t.commands.notifications.markAllRead} │
│     • /pfNotificationsClear T2.1      {t.commands.notifications.markTaskRead}│
│     • /pfComments T2.1                {t.commands.notifications.viewTask}    │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

### Step 5: No Notifications Card

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🔔 {t.commands.notifications.title}                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 Project: {projectName}                                                   │
│                                                                              │
│  ╭─────────────────────────────────────────────────────────────────────╮     │
│  │                                                                     │     │
│  │  📭 {t.commands.notifications.noNotifications}                      │     │
│  │                                                                     │     │
│  ╰─────────────────────────────────────────────────────────────────────╯     │
│                                                                              │
│  {t.commands.notifications.noNotificationsHint}                              │
│     • When someone @mentions you in a comment                                │
│     • When you're assigned to a task                                         │
│     • When tasks you're watching are updated                                 │
│     • When someone comments on your tasks                                    │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Notification Priority & Icons

| Priority | Icon | When Used |
|----------|------|-----------|
| high (unread) | 🔴 | @mentions |
| medium (unread) | 🟡 | Task assignments |
| low (unread) | 🟢 | Task updates, comments |
| read | ○ | All read notifications |

## Notification Type Messages

| Type | Message Template |
|------|------------------|
| mention | "{actor} mentioned you in {taskId}" |
| assignment | "You were assigned to {taskId}" |
| task | "{taskId} was {action}" (completed/started/blocked) |
| comment | "New comment on {taskId}" |

## Time Formatting

Use relative time formatting:
- "just now" - < 1 minute
- "{n} min ago" - < 60 minutes
- "{n} hours ago" - < 24 hours
- "{n} days ago" - >= 24 hours

## Error Handling

**Network Error Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.notifications.networkError}                                     │
│                                                                              │
│  {t.commands.notifications.tryAgain}                                         │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Invalid Type Filter Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.notifications.invalidType}                                      │
│                                                                              │
│  {t.commands.notifications.validTypes}                                       │
│  mention, assignment, task, comment                                          │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Translation Keys Required

```json
{
  "commands": {
    "notifications": {
      "title": "Notifications",
      "usage": "Usage",
      "types": "Notification Types",
      "example": "Example",
      "unread": "unread",
      "noNotifications": "No notifications.",
      "noNotificationsHint": "You'll be notified when:",
      "showing": "Showing {shown} of {total} notifications",
      "mentionedYou": "{actor} mentioned you in {taskId}",
      "assignedToYou": "You were assigned to {taskId}",
      "assignedBy": "Assigned by: {actor}",
      "taskUpdated": "{taskId} was {action}",
      "completedBy": "Completed by: {actor}",
      "startedBy": "Started by: {actor}",
      "blockedBy": "Blocked by: {actor}",
      "newComment": "New comment on {taskId}",
      "markAllRead": "Mark all as read",
      "markTaskRead": "Mark task notifications read",
      "viewTask": "View task comments",
      "invalidType": "Invalid notification type.",
      "validTypes": "Valid types:",
      "networkError": "Could not fetch notifications.",
      "tryAgain": "Please check your connection and try again.",
      "justNow": "just now",
      "minutesAgo": "{count} min ago",
      "hoursAgo": "{count} hours ago",
      "daysAgo": "{count} days ago"
    }
  }
}
```

## Notes

- Notifications are sorted by date (newest first)
- Unread notifications appear before read ones
- @mentions have highest priority (🔴)
- Preview text is truncated at ~50 characters
- Maximum 50 notifications returned per request
- Use --unread flag for quick check of what needs attention
