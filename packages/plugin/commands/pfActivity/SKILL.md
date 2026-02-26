---
name: pfActivity
description: View recent activity in the current PlanFlow project
---

# PlanFlow Activity Feed

View recent activity in the linked cloud project with activity feed cards.

## Usage

```bash
/pfActivity                   # Show recent project activity
/pfActivity T2.1              # Show activity for specific task
/pfActivity --limit 20        # Show more entries (default: 10)
/pfActivity --type tasks      # Filter by activity type
```

## Process

### Step 0: Load User Language & Translations

**CRITICAL: Execute this step FIRST, before any output!**

Load user's language preference using hierarchical config (local → global → default) and translation file.

**Pseudo-code:**
```javascript
// Read config with hierarchy AND MERGE
function getMergedConfig() {
  let globalConfig = {}
  let localConfig = {}

  // Read global config first (base)
  const globalPath = expandPath("~/.config/claude/plan-plugin-config.json")
  if (fileExists(globalPath)) {
    try {
      globalConfig = JSON.parse(readFile(globalPath))
    } catch (error) {}
  }

  // Read local config (overrides)
  if (fileExists("./.plan-config.json")) {
    try {
      localConfig = JSON.parse(readFile("./.plan-config.json"))
    } catch (error) {}
  }

  // Merge configs: local overrides global, but cloud settings are merged
  const mergedConfig = {
    ...globalConfig,
    ...localConfig,
    cloud: {
      ...(globalConfig.cloud || {}),
      ...(localConfig.cloud || {})
    }
  }

  return mergedConfig
}

const config = getMergedConfig()
const language = config.language || "en"

// Cloud config - properly merged from both configs
const cloudConfig = config.cloud || {}
const isAuthenticated = !!cloudConfig.apiToken
const apiUrl = cloudConfig.apiUrl || "https://api.planflow.tools"
const projectId = cloudConfig.projectId || null
const projectName = cloudConfig.projectName || "Unknown Project"

// Load translations
const translationPath = `locales/${language}.json`
const t = JSON.parse(readFile(translationPath))
```

**Instructions for Claude:**

1. Read BOTH config files and MERGE them:
   - First read `~/.config/claude/plan-plugin-config.json` (global, base)
   - Then read `./.plan-config.json` (local, overrides)
   - Merge the `cloud` sections: global values + local overrides
2. Use Read tool: `locales/{language}.json`
3. Store as `t` variable

---

### Step 1: Parse Arguments

Parse the command arguments to extract task ID, limit, and type filter.

**Pseudo-code:**
```javascript
function parseArgs(args) {
  let taskId = null
  let limit = 10
  let activityType = null

  const parts = args.trim().split(/\s+/)

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]

    if (part === '--limit' && parts[i + 1]) {
      limit = parseInt(parts[i + 1], 10)
      if (isNaN(limit) || limit < 1) limit = 10
      if (limit > 50) limit = 50
      i++ // Skip next part
    } else if (part === '--type' && parts[i + 1]) {
      activityType = parts[i + 1]
      i++ // Skip next part
    } else if (part.match(/^T\d+\.\d+$/i)) {
      taskId = part.toUpperCase()
    } else if (part === '--help' || part === '-h') {
      return { showHelp: true }
    }
  }

  return { taskId, limit, activityType, showHelp: false }
}

const { taskId, limit, activityType, showHelp } = parseArgs(ARGUMENTS)
```

**Activity Type Mapping:**
- `tasks` → action filter: `task_status_changed`
- `comments` → action filter: `comment_created`
- `assignments` → action filter: `task_assigned`
- `team` → entity filter: `member`

---

### Step 2: Show Usage Card (if help requested or no project linked)

If `--help` is provided or no project is linked, display usage information.

**Output:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  📊 Activity Feed                                                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── Usage ───────────────────────────────────────────────────────────────    │
│                                                                              │
│  /pfActivity                   Show recent project activity                  │
│  /pfActivity <task-id>         Show activity for specific task               │
│  /pfActivity --limit <n>       Show more entries (default: 10, max: 50)      │
│  /pfActivity --type <type>     Filter by activity type                       │
│                                                                              │
│  ── Activity Types ─────────────────────────────────────────────────────     │
│                                                                              │
│  tasks       - Task status changes                                           │
│  comments    - Comment activity                                              │
│  assignments - Task assignments                                              │
│  team        - Team membership changes                                       │
│                                                                              │
│  ── Examples ────────────────────────────────────────────────────────────    │
│                                                                              │
│  /pfActivity T2.1                                                            │
│  /pfActivity --type comments --limit 20                                      │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

---

### Step 3: Check Prerequisites

Verify user is authenticated and project is linked.

**Pseudo-code:**
```javascript
if (!isAuthenticated) {
  showError(t.commands.sync.notAuthenticated)
  // "❌ Not authenticated. Run /pfLogin first."
  return
}

if (!projectId) {
  showError(t.commands.sync.notLinked)
  // "❌ Project not linked to cloud. Run /pfCloudLink first."
  return
}
```

**Not Authenticated Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Not authenticated.                                                          │
│                                                                              │
│  💡 Run /pfLogin first to authenticate.                                      │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Not Linked Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Project not linked to cloud.                                                │
│                                                                              │
│  💡 Run /pfCloudLink first to link this project.                             │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

---

### Step 4: Fetch Activity from API

Make API request to fetch activity.

**Pseudo-code:**
```javascript
async function fetchActivity(projectId, taskId, limit, activityType, apiToken, apiUrl) {
  let endpoint
  const params = new URLSearchParams()
  params.append('limit', String(limit))

  if (taskId) {
    // Task-specific activity
    endpoint = `${apiUrl}/projects/${projectId}/tasks/${taskId}/activity`
  } else {
    // Project activity
    endpoint = `${apiUrl}/projects/${projectId}/activity`
  }

  // Add type filter
  if (activityType) {
    switch (activityType) {
      case 'tasks':
        params.append('action', 'task_status_changed')
        break
      case 'comments':
        params.append('action', 'comment_created')
        break
      case 'assignments':
        params.append('action', 'task_assigned')
        break
      case 'team':
        params.append('entityType', 'member')
        break
    }
  }

  const url = `${endpoint}?${params.toString()}`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Accept': 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return response.json()
}
```

**Bash Implementation:**

```bash
API_URL="https://api.planflow.tools"
TOKEN="$API_TOKEN"
PROJECT_ID="$PROJECT_ID"
TASK_ID="$TASK_ID"  # Optional
LIMIT="10"

# Build URL
if [ -n "$TASK_ID" ]; then
  ENDPOINT="${API_URL}/projects/${PROJECT_ID}/tasks/${TASK_ID}/activity"
else
  ENDPOINT="${API_URL}/projects/${PROJECT_ID}/activity"
fi

# Make request
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 15 \
  -X GET \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "${ENDPOINT}?limit=${LIMIT}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "$BODY"
else
  echo "Error: HTTP $HTTP_CODE"
fi
```

**Instructions for Claude:**

1. Build the API URL based on whether taskId is provided
2. Add query parameters for limit and type filters
3. Make GET request with authorization header
4. Parse JSON response

---

### Step 5: Format Activity Items

Format each activity item for display.

**Activity Icons:**

| Action | Icon |
|--------|------|
| task_created | ✨ |
| task_updated | 📝 |
| task_status_changed | 🔄 |
| task_assigned | 👤 |
| task_unassigned | 👤 |
| comment_created | 💬 |
| comment_updated | ✏️ |
| comment_deleted | 🗑️ |
| project_updated | 📋 |
| plan_updated | 📄 |
| member_invited | 📨 |
| member_joined | 🎉 |
| member_removed | 👋 |
| member_role_changed | 🔑 |

**Status Icons for task_status_changed:**

| New Status | Icon |
|------------|------|
| DONE | ✅ |
| IN_PROGRESS | 🔄 |
| BLOCKED | 🚫 |
| TODO | ⬜ |

**Relative Time Formatting:**

```javascript
function formatRelativeTime(dateString) {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMinutes < 1) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes} min ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}
```

**Activity Message Formatting:**

```javascript
function formatActivityMessage(activity) {
  const actor = activity.actor.name || activity.actor.email.split('@')[0]
  const taskId = activity.taskId

  switch (activity.action) {
    case 'task_status_changed':
      const newStatus = activity.metadata?.newStatus
      const statusIcon = getStatusIcon(newStatus)
      if (taskId) {
        return `${statusIcon} ${actor} marked ${taskId} as ${newStatus.toLowerCase()}`
      }
      return `${statusIcon} ${actor} changed task status to ${newStatus.toLowerCase()}`

    case 'task_assigned':
      const assignee = activity.metadata?.assigneeName || activity.metadata?.assigneeEmail
      if (taskId) {
        return `👤 ${actor} assigned ${taskId} to ${assignee}`
      }
      return `👤 ${actor} assigned task to ${assignee}`

    case 'task_unassigned':
      if (taskId) {
        return `👤 ${actor} unassigned ${taskId}`
      }
      return `👤 ${actor} removed assignment`

    case 'comment_created':
      const preview = activity.metadata?.commentPreview
      if (taskId && preview) {
        return `💬 ${actor} commented on ${taskId}\n     "${truncate(preview, 40)}"`
      }
      if (taskId) {
        return `💬 ${actor} commented on ${taskId}`
      }
      return `💬 ${actor} added a comment`

    case 'member_joined':
      return `🎉 ${actor} joined the project`

    case 'member_invited':
      const invitee = activity.metadata?.inviteeEmail
      return `📨 ${actor} invited ${invitee}`

    case 'member_removed':
      return `👋 ${actor} left the project`

    case 'member_role_changed':
      const newRole = activity.metadata?.newRole
      return `🔑 ${actor}'s role changed to ${newRole}`

    case 'plan_updated':
      return `📄 ${actor} updated the project plan`

    default:
      return `📌 ${actor} ${activity.description || activity.action.replace(/_/g, ' ')}`
  }
}
```

---

### Step 6: Display Activity Feed Card

Display the activity feed in a formatted card.

**Project Activity Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  📊 Recent Activity                                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 Project: Planflow Plugin                                                 │
│                                                                              │
│  ── Activity Feed ──────────────────────────────────────────────────────     │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  ✅ John marked T2.1 as done                           5 min ago       │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  💬 Jane commented on T2.3                             10 min ago      │  │
│  │     "Looks good! Just one small fix..."                                │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  🔄 Bob started working on T3.1                        1 hour ago      │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  👤 Jane assigned T2.5 to John                         2 hours ago     │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  🎉 Alice joined the project                           4 hours ago     │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  📄 Showing 5 of 45 activities                                               │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Commands:                                                                │
│     • /pfActivity --limit 20       View more activity                        │
│     • /pfActivity T2.1             View task activity                        │
│     • /pfActivity --type tasks     Filter by type                            │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Task-Specific Activity Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  📊 Activity for T2.1                                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📋 Task: Implement login API                                                │
│                                                                              │
│  ── Activity Feed ──────────────────────────────────────────────────────     │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  ✅ John marked as done                                5 min ago       │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  💬 Jane commented                                     30 min ago      │  │
│  │     "Ready for review!"                                                │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  💬 John commented                                     1 hour ago      │  │
│  │     "Almost done, just testing..."                                     │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  🔄 John started working                               3 hours ago     │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  👤 Jane assigned to John                              1 day ago       │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Commands:                                                                │
│     • /pfComment T2.1 "Your message"    Add a comment                        │
│     • /pfComments T2.1                  View all comments                    │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

---

### Step 7: No Activity Card

Display when no activity is found.

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  📊 Recent Activity                                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 Project: Planflow Plugin                                                 │
│                                                                              │
│  ╭─────────────────────────────────────────────────────────────────────╮     │
│  │                                                                     │     │
│  │  📭 No recent activity found.                                       │     │
│  │                                                                     │     │
│  ╰─────────────────────────────────────────────────────────────────────╯     │
│                                                                              │
│  Activity will appear when team members:                                     │
│     • Update task statuses                                                   │
│     • Add comments                                                           │
│     • Assign tasks                                                           │
│     • Join or leave the project                                              │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

---

## Error Handling

### Task Not Found (404)

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Task not found: T2.1                                                        │
│                                                                              │
│  Make sure the task exists. Run /pfSyncPush to sync your local tasks.       │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### Invalid Activity Type

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Invalid activity type: "{type}"                                             │
│                                                                              │
│  Valid types: tasks, comments, assignments, team                             │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### Network Error

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Failed to fetch activity.                                                   │
│                                                                              │
│  Please check your internet connection and try again.                        │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### Authentication Error (401)

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Authentication failed. Your token may have expired.                         │
│                                                                              │
│  💡 Run /pfLogin to re-authenticate.                                         │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

---

## Complete Implementation Flow

```
/pfActivity [args]
    │
    ▼
┌────────────────────────────────────────┐
│ Step 0: Load config and translations   │
└─────────────────┬──────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────┐
│ Step 1: Parse arguments                 │
│   - taskId (optional)                   │
│   - limit (default: 10)                 │
│   - type filter (optional)              │
└─────────────────┬──────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────┐
│ Step 2: Check for --help flag           │
│   → Show usage if needed                │
└─────────────────┬──────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────┐
│ Step 3: Check prerequisites             │
│   - Authenticated?                      │
│   - Project linked?                     │
└─────────────────┬──────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────┐
│ Step 4: Fetch activity from API         │
│   GET /projects/:id/activity            │
│   GET /projects/:id/tasks/:id/activity  │
└─────────────────┬──────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────┐
│ Step 5: Format activity items           │
│   - Apply icons                         │
│   - Format relative time                │
│   - Build messages                      │
└─────────────────┬──────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────┐
│ Step 6/7: Display activity card         │
│   - Activity feed or no activity        │
└────────────────────────────────────────┘
```

---

## Translation Keys

```json
{
  "commands": {
    "activity": {
      "title": "📊 Activity Feed",
      "recentActivity": "📊 Recent Activity",
      "taskActivity": "📊 Activity for {taskId}",
      "projectLabel": "📁 Project: {name}",
      "taskLabel": "📋 Task: {name}",
      "feedTitle": "Activity Feed",
      "showingCount": "📄 Showing {count} of {total} activities",
      "noActivity": "📭 No recent activity found.",
      "noActivityHint": "Activity will appear when team members:",
      "noActivityHint1": "Update task statuses",
      "noActivityHint2": "Add comments",
      "noActivityHint3": "Assign tasks",
      "noActivityHint4": "Join or leave the project",
      "usage": "Usage",
      "usageMain": "/pfActivity                   Show recent project activity",
      "usageTask": "/pfActivity <task-id>         Show activity for specific task",
      "usageLimit": "/pfActivity --limit <n>       Show more entries (default: 10, max: 50)",
      "usageType": "/pfActivity --type <type>     Filter by activity type",
      "types": "Activity Types",
      "typeTasks": "tasks       - Task status changes",
      "typeComments": "comments    - Comment activity",
      "typeAssignments": "assignments - Task assignments",
      "typeTeam": "team        - Team membership changes",
      "examples": "Examples",
      "commands": "Commands",
      "viewMore": "/pfActivity --limit 20       View more activity",
      "viewTask": "/pfActivity T2.1             View task activity",
      "filterType": "/pfActivity --type tasks     Filter by type",
      "addComment": "/pfComment {taskId} \"Your message\"    Add a comment",
      "viewComments": "/pfComments {taskId}                  View all comments",
      "invalidType": "Invalid activity type: \"{type}\"",
      "validTypes": "Valid types: tasks, comments, assignments, team",
      "taskNotFound": "Task not found: {taskId}",
      "taskNotFoundHint": "Make sure the task exists. Run /pfSyncPush to sync your local tasks.",
      "fetchFailed": "Failed to fetch activity.",
      "checkConnection": "Please check your internet connection and try again."
    }
  }
}
```

---

## Success Criteria

A successful /pfActivity command should:
- ✅ Load config and check authentication
- ✅ Parse task ID, limit, and type from arguments
- ✅ Make appropriate API call (project or task activity)
- ✅ Format activity items with icons and relative times
- ✅ Display activity in formatted card
- ✅ Handle empty activity gracefully
- ✅ Handle errors with helpful messages
- ✅ Show usage on --help or missing project
