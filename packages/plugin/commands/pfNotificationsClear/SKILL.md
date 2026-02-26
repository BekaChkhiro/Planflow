---
name: pfNotificationsClear
description: Mark notifications as read in the current PlanFlow project
---

# PlanFlow Clear Notifications

Mark notifications as read in the linked cloud project.

## Usage

```bash
/pfNotificationsClear                  # Mark all notifications as read
/pfNotificationsClear T2.1             # Mark notifications for specific task as read
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

### Step 2: Parse Arguments

Check if a task ID was provided:

```javascript
const args = commandArgs.trim()
const taskIdMatch = args.match(/^(T\d+\.\d+)$/i)
const taskId = taskIdMatch ? taskIdMatch[1].toUpperCase() : null

// Mode: "all" or "task"
const mode = taskId ? "task" : "all"
```

### Step 3: Mark Notifications as Read

**API Endpoint:** `POST /projects/{projectId}/notifications/mark-read`

**Request Body:**
- For all notifications: `{}`
- For task-specific: `{"taskId": "T2.1"}`

**Bash Implementation:**

```bash
API_URL="https://api.planflow.tools"
TOKEN="$API_TOKEN"
PROJECT_ID="$PROJECT_ID"
TASK_ID=""  # Optional: specific task ID like "T2.1"

# Build request body
if [ -n "$TASK_ID" ]; then
  BODY="{\"taskId\": \"$TASK_ID\"}"
else
  BODY="{}"
fi

# Mark notifications as read
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 10 \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "$BODY" \
  "${API_URL}/projects/${PROJECT_ID}/notifications/mark-read")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  # Parse response
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
    "markedCount": 4,
    "message": "Notifications marked as read"
  }
}
```

### Step 4: Display Success Card

**All Notifications Cleared:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ {t.commands.notifications.clearSuccess}                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.notifications.clearedCount} → {count} notifications             │
│                                                                              │
│  📁 Project: {projectName}                                                   │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.quickActions}                                               │
│     • /pfNotifications            View all notifications                     │
│     • /pfNotifications --unread   Check for new notifications                │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Task-Specific Notifications Cleared:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ {t.commands.notifications.clearTaskSuccess}                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📋 Task: {taskId}                                                           │
│  {t.commands.notifications.clearedCount} → {count} notifications             │
│                                                                              │
│  📁 Project: {projectName}                                                   │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.quickActions}                                               │
│     • /pfComments {taskId}        View task comments                         │
│     • /pfNotifications            View all notifications                     │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### Step 5: No Unread Notifications

When there are no unread notifications to clear:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ℹ️ {t.commands.notifications.nothingToClear}                                │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  All notifications are already read.                                         │
│                                                                              │
│  📁 Project: {projectName}                                                   │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.quickActions}                                               │
│     • /pfNotifications            View all notifications                     │
│     • /pfActivity                 View recent project activity               │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Error Handling

**Invalid Task ID:**

If a task ID is provided but doesn't match the pattern:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.comments.invalidTaskId}                                         │
│                                                                              │
│  {t.commands.comments.taskIdExample}                                         │
│  Example: T1.1, T2.3, T10.5                                                  │
│                                                                              │
│  ── {t.commands.notifications.usage} ──────────────────────────────────────  │
│                                                                              │
│  /pfNotificationsClear             Mark all as read                          │
│  /pfNotificationsClear T2.1        Mark task notifications as read           │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Task Not Found:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.comments.taskNotFound}                                          │
│                                                                              │
│  Task {taskId} was not found in this project.                                │
│                                                                              │
│  {t.commands.comments.checkTaskId}                                           │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Network Error:**

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

## Full Example Flow

### Example 1: Clear All Notifications

```bash
User: /pfNotificationsClear

# Claude reads configs
# Claude makes API call: POST /projects/{id}/notifications/mark-read
# Response: {"success": true, "data": {"markedCount": 4}}

Output:
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ Notifications marked as read!                                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  4 notifications marked as read                                              │
│                                                                              │
│  📁 Project: Plan Flow Plugin                                                │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Quick Actions:                                                           │
│     • /pfNotifications            View all notifications                     │
│     • /pfNotifications --unread   Check for new notifications                │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### Example 2: Clear Task-Specific Notifications

```bash
User: /pfNotificationsClear T2.1

# Claude reads configs
# Claude makes API call: POST /projects/{id}/notifications/mark-read
#   Body: {"taskId": "T2.1"}
# Response: {"success": true, "data": {"markedCount": 2}}

Output:
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ Notifications for T2.1 marked as read                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📋 Task: T2.1                                                               │
│  2 notifications marked as read                                              │
│                                                                              │
│  📁 Project: Plan Flow Plugin                                                │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Quick Actions:                                                           │
│     • /pfComments T2.1            View task comments                         │
│     • /pfNotifications            View all notifications                     │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### Example 3: No Unread Notifications

```bash
User: /pfNotificationsClear

# API returns markedCount: 0

Output:
╭──────────────────────────────────────────────────────────────────────────────╮
│  ℹ️ No unread notifications to clear.                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  All notifications are already read.                                         │
│                                                                              │
│  📁 Project: Plan Flow Plugin                                                │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Quick Actions:                                                           │
│     • /pfNotifications            View all notifications                     │
│     • /pfActivity                 View recent project activity               │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### Example 4: Georgian Language

```bash
User: /pfNotificationsClear

Output:
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ შეტყობინებები წაკითხულად მოინიშნა!                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  4 შეტყობინება წაკითხულად მოინიშნა                                           │
│                                                                              │
│  📁 პროექტი: Plan Flow Plugin                                                │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 სწრაფი მოქმედებები:                                                      │
│     • /pfNotifications            ყველა შეტყობინების ნახვა                   │
│     • /pfNotifications --unread   ახალი შეტყობინებების შემოწმება             │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Translation Keys Used

```json
{
  "commands": {
    "notifications": {
      "clearSuccess": "Notifications marked as read!",
      "clearedCount": "{count} notifications marked as read",
      "clearTaskSuccess": "Notifications for {taskId} marked as read",
      "nothingToClear": "No unread notifications to clear.",
      "networkError": "Could not fetch notifications.",
      "tryAgain": "Please check your connection and try again."
    },
    "comments": {
      "invalidTaskId": "Invalid task ID format.",
      "taskIdExample": "Task ID should be like: T1.1, T2.3, T10.5",
      "taskNotFound": "Task not found.",
      "checkTaskId": "Make sure the task exists. Run /pfSyncPush to sync your local tasks."
    },
    "sync": {
      "notAuthenticated": "Not authenticated. Run /pfLogin first.",
      "notLinked": "Project not linked to cloud. Run /pfCloudLink first."
    }
  },
  "ui": {
    "labels": {
      "quickActions": "Quick Actions:"
    }
  }
}
```

## Notes

- Marking notifications as read is idempotent (safe to call multiple times)
- Task-specific clearing only affects notifications related to that task
- Already-read notifications are not affected
- API returns the count of notifications that were actually marked as read
