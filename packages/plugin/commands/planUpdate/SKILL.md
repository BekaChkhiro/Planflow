---
name: planUpdate
description: Plan Update Command
---

# Plan Update Command

You are a task progress tracking assistant. Your role is to update task statuses in PROJECT_PLAN.md and recalculate progress metrics.

## ⚠️ IMPORTANT: Auto-Sync Requirement (v1.2.0+)

**After updating the local file (Step 7), you MUST always execute Step 8 (Cloud Integration) to check if auto-sync is enabled and sync to cloud if conditions are met. This is NOT optional!**

## Objective

Update the status of tasks in PROJECT_PLAN.md, recalculate progress percentages, and maintain accurate project tracking.

## Usage

```bash
/planUpdate <task-id> <action> [--force]
/planUpdate T1.1 start    # Mark task as in progress
/planUpdate T1.1 done     # Mark task as completed
/planUpdate T2.3 block    # Mark task as blocked
/planUpdate T2.1 done --force  # Update even if assigned to someone else
```

**Flags:**
- `--force` - Skip assignment check and update task regardless of who it's assigned to

## Process

### Step 0: Load User Language & Translations

**CRITICAL: Execute this step FIRST, before any output!**

Load user's language preference using hierarchical config (local → global → default) and translation file.

**Pseudo-code:**
```javascript
// Read config with hierarchy AND MERGE (v1.2.0+)
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

// Cloud config (v1.2.0+) - now properly merged from both configs
const cloudConfig = config.cloud || {}
const isAuthenticated = !!cloudConfig.apiToken
const apiUrl = cloudConfig.apiUrl || "https://api.planflow.tools"
const autoSync = cloudConfig.autoSync || false
const linkedProjectId = cloudConfig.projectId || null

// Load translations
const translationPath = `locales/${language}.json`
const t = JSON.parse(readFile(translationPath))
```

**Instructions for Claude:**

1. Read BOTH config files and MERGE them:
   - First read `~/.config/claude/plan-plugin-config.json` (global, base)
   - Then read `./.plan-config.json` (local, overrides)
   - Merge the `cloud` sections: global values + local overrides
2. This ensures:
   - `apiToken` from global config is available
   - `projectId` from global config is available
   - `autoSync` from local config overrides global
3. Use Read tool: `locales/{language}.json`
4. Store as `t` variable

**Example merge:**
```javascript
// Global config:
{ "cloud": { "apiToken": "pf_xxx", "projectId": "abc123" } }

// Local config:
{ "cloud": { "autoSync": true } }

// Merged result:
{ "cloud": { "apiToken": "pf_xxx", "projectId": "abc123", "autoSync": true } }
```

### Step 0.5: Show Notification Badge (v1.6.0+)

**Purpose:** Display unread notification count to keep users informed of team activity.

**When to Execute:** Only if authenticated AND linked to a project.

**Bash Implementation:**
```bash
API_URL="https://api.planflow.tools"
TOKEN="$API_TOKEN"
PROJECT_ID="$PROJECT_ID"

# Only proceed if authenticated and linked
if [ -n "$TOKEN" ] && [ -n "$PROJECT_ID" ]; then
  # Fetch unread count with short timeout
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

**Example Output (if 3 unread):**
```
🔔 3 unread notifications — /pfNotifications to view

[... rest of update output ...]
```

**Instructions for Claude:**

1. After loading config and translations (Step 0), check if `cloudConfig.apiToken` AND `cloudConfig.projectId` exist
2. If yes, make a quick API call to fetch notification count
3. If unreadCount > 0, display the badge line with a blank line after
4. If any error occurs (timeout, network, auth), silently skip and continue
5. Proceed to Step 1 regardless of badge result

**Important:** Never let this step block or delay the main command. Use short timeouts and fail silently.

See: `skills/notification-badge/SKILL.md` for full implementation details.

### Step 1: Validate Inputs

Check that the user provided:
1. Task ID (e.g., T1.1, T2.3)
2. Action: `start`, `done`, or `block`

If missing, show usage:
```
{t.commands.update.usage}

{t.commands.update.actions}
  {t.commands.update.startAction}
  {t.commands.update.doneAction}
  {t.commands.update.blockAction}

{t.commands.update.example}
```

**Example output (English):**
```
Usage: /planUpdate <task-id> <action>

Actions:
  start  - Mark task as in progress (TODO → IN_PROGRESS)
  done   - Mark task as completed (ANY → DONE)
  block  - Mark task as blocked (ANY → BLOCKED)

Example: /planUpdate T1.1 start
```

**Example output (Georgian):**
```
გამოყენება: /planUpdate <task-id> <action>

მოქმედებები:
  start  - მონიშნე ამოცანა როგორც მიმდინარე (TODO → IN_PROGRESS)
  done   - მონიშნე ამოცანა როგორც დასრულებული (ANY → DONE)
  block  - მონიშნე ამოცანა როგორც დაბლოკილი (ANY → BLOCKED)

მაგალითი: /planUpdate T1.1 start
```

### Step 2: Read PROJECT_PLAN.md

Use the Read tool to read the PROJECT_PLAN.md file from the current working directory.

If file doesn't exist, output:
```
{t.commands.update.planNotFound}

{t.commands.update.runPlanNew}
```

**Example:**
- EN: "❌ Error: PROJECT_PLAN.md not found in current directory. Please run /planNew first to create a project plan."
- KA: "❌ შეცდომა: PROJECT_PLAN.md არ მოიძებნა მიმდინარე დირექტორიაში. გთხოვთ ჯერ გაუშვათ /planNew პროექტის გეგმის შესაქმნელად."

### Step 3: Find the Task

Search for the task ID in the file. Tasks are formatted as:

```markdown
#### T1.1: Task Name
- [ ] **Status**: TODO
- **Complexity**: Low
- **Estimated**: 2 hours
...
```

or

```markdown
#### T1.1: Task Name
- [x] **Status**: DONE ✅
- **Complexity**: Low
...
```

If task not found:
```
{t.commands.update.taskNotFound.replace("{taskId}", taskId)}

{t.commands.update.availableTasks}
[List first 5-10 task IDs found in the file]

{t.commands.update.checkTasksSection}
```

**Example output (English):**
```
❌ Error: Task T1.5 not found in PROJECT_PLAN.md

Available tasks:
T1.1, T1.2, T1.3, T1.4, T2.1, T2.2...

Tip: Check the "Tasks & Implementation Plan" section for valid task IDs.
```

**Example output (Georgian):**
```
❌ შეცდომა: ამოცანა T1.5 ვერ მოიძებნა PROJECT_PLAN.md-ში

ხელმისაწვდომი ამოცანები:
T1.1, T1.2, T1.3, T1.4, T2.1, T2.2...

რჩევა: შეამოწმეთ "ამოცანები და იმპლემენტაციის გეგმა" სექცია ვალიდური task ID-ებისთვის.
```

### Step 3.5: Check Task Assignment (v1.6.0+)

**Purpose:** Before allowing a status update, check if the task is assigned to someone else and warn the user.

**When to Execute:**
- Only when authenticated (`apiToken` exists)
- Only when linked to a cloud project (`projectId` exists)
- Skip if `--force` flag is provided

**Pseudo-code:**
```javascript
async function checkTaskAssignment(taskId, config, forceFlag, t) {
  const cloudConfig = config.cloud || {}
  const isAuthenticated = !!cloudConfig.apiToken
  const projectId = cloudConfig.projectId
  const currentUserEmail = cloudConfig.userEmail

  // Skip check if not authenticated or not linked
  if (!isAuthenticated || !projectId) {
    return { proceed: true, reason: "not_cloud_enabled" }
  }

  // Skip check if --force flag is provided
  if (forceFlag) {
    return { proceed: true, reason: "force_flag" }
  }

  // Fetch task from cloud to get assignment info
  const apiUrl = cloudConfig.apiUrl || "https://api.planflow.tools"
  const response = await fetch(
    `${apiUrl}/projects/${projectId}/tasks/${taskId}`,
    {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${cloudConfig.apiToken}`,
        "Accept": "application/json"
      }
    }
  )

  // If task not found on cloud, proceed (local-only task)
  if (response.status === 404) {
    return { proceed: true, reason: "task_not_on_cloud" }
  }

  // If request failed, proceed with warning
  if (!response.ok) {
    console.log(t.commands.update.assignmentCheckFailed || "⚠️ Could not check task assignment")
    return { proceed: true, reason: "api_error" }
  }

  const task = response.data.task
  const assignee = task.assignee

  // Case 1: Task is not assigned - proceed freely
  if (!assignee) {
    return { proceed: true, reason: "unassigned" }
  }

  // Case 2: Task is assigned to current user - proceed with positive message
  if (assignee.email === currentUserEmail) {
    return { proceed: true, reason: "assigned_to_me", assignee }
  }

  // Case 3: Task is assigned to someone else - warn and ask for confirmation
  return {
    proceed: false,
    reason: "assigned_to_other",
    assignee,
    message: t.commands.update.assignedToOther
      .replace("{name}", assignee.name || assignee.email)
  }
}
```

**Bash Implementation:**
```bash
API_URL="https://api.planflow.tools"
TOKEN="$API_TOKEN"
PROJECT_ID="$PROJECT_ID"
TASK_ID="T2.1"
CURRENT_USER_EMAIL="$USER_EMAIL"

# Fetch task to check assignment
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 10 \
  -X GET \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "${API_URL}/projects/${PROJECT_ID}/tasks/${TASK_ID}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 404 ]; then
  # Task not on cloud - proceed
  echo "Task not found on cloud, proceeding with local update"
elif [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  # Parse assignee
  ASSIGNEE_EMAIL=$(echo "$BODY" | grep -o '"assignee":{[^}]*"email":"[^"]*"' | grep -o '"email":"[^"]*"' | cut -d'"' -f4)
  ASSIGNEE_NAME=$(echo "$BODY" | grep -o '"assignee":{[^}]*"name":"[^"]*"' | grep -o '"name":"[^"]*"' | cut -d'"' -f4)

  if [ -z "$ASSIGNEE_EMAIL" ]; then
    echo "Task is unassigned, proceeding"
  elif [ "$ASSIGNEE_EMAIL" = "$CURRENT_USER_EMAIL" ]; then
    echo "Task is assigned to you, proceeding"
  else
    echo "⚠️ Task is assigned to: $ASSIGNEE_NAME ($ASSIGNEE_EMAIL)"
    echo "Use --force to update anyway, or /pfUnassign $TASK_ID first"
  fi
fi
```

**Flow:**

```
/planUpdate T2.1 done
    │
    ▼
┌─────────────────────────────────────┐
│ Is --force flag provided?            │
└──────────────┬──────────────────────┘
               │
        ┌──────┴──────┐
        │ Yes         │ No
        ▼             ▼
   Proceed to    ┌─────────────────────────────────────┐
   Step 4        │ Is user authenticated + linked?      │
                 └──────────────┬──────────────────────┘
                                │
                         ┌──────┴──────┐
                         │ No          │ Yes
                         ▼             ▼
                    Proceed to    ┌─────────────────────┐
                    Step 4        │ Fetch task from API │
                                  └──────────┬──────────┘
                                             │
                                             ▼
                                  ┌─────────────────────┐
                                  │ Check assignee      │
                                  └──────────┬──────────┘
                                             │
                              ┌──────────────┼──────────────┐
                              │              │              │
                         Unassigned    Assigned to me   Assigned to other
                              │              │              │
                              ▼              ▼              ▼
                         Proceed        Proceed +      Show warning
                         to Step 4      positive msg   Ask to confirm
```

**Output Examples:**

#### Case 1: Task Assigned to Current User (Positive)
```
👤 This task is assigned to you - ready to work on!

[Proceeds to Step 4]
```

#### Case 2: Task Assigned to Someone Else (Warning)
```
⚠️ Task T2.1 is assigned to Jane Smith (jane@company.com)

This task belongs to another team member. Updating it may cause confusion.

Options:
  1. Use --force to update anyway: /planUpdate T2.1 done --force
  2. Unassign first: /pfUnassign T2.1
  3. Ask them to update it

💡 Tip: Check /pfWorkload to see team task distribution
```

**Example output (Georgian):**
```
⚠️ ამოცანა T2.1 მინიჭებულია Jane Smith-ზე (jane@company.com)

ეს ამოცანა ეკუთვნის გუნდის სხვა წევრს. მისი განახლება შეიძლება გამოიწვიოს დაბნეულობა.

ვარიანტები:
  1. გამოიყენე --force მაინც განსაახლებლად: /planUpdate T2.1 done --force
  2. ჯერ მოხსენი მინიჭება: /pfUnassign T2.1
  3. სთხოვე მათ განაახლონ

💡 რჩევა: შეამოწმე /pfWorkload გუნდის ამოცანების განაწილების სანახავად
```

#### Case 3: Task Unassigned (Silent Proceed)
No message shown, proceeds directly to Step 4.

#### Case 4: Force Flag Used
```
⚡ Force flag detected - skipping assignment check

[Proceeds to Step 4]
```

**Translation Keys Required:**
```json
{
  "commands": {
    "update": {
      "assignedToYou": "👤 This task is assigned to you - ready to work on!",
      "assignedToOther": "⚠️ Task {taskId} is assigned to {name}",
      "assignedToOtherEmail": "({email})",
      "assignedWarning": "This task belongs to another team member. Updating it may cause confusion.",
      "assignedOptions": "Options:",
      "assignedForceHint": "1. Use --force to update anyway: /planUpdate {taskId} {action} --force",
      "assignedUnassignHint": "2. Unassign first: /pfUnassign {taskId}",
      "assignedAskHint": "3. Ask them to update it",
      "assignedWorkloadTip": "💡 Tip: Check /pfWorkload to see team task distribution",
      "assignmentCheckFailed": "⚠️ Could not check task assignment",
      "forceSkipping": "⚡ Force flag detected - skipping assignment check"
    }
  }
}
```

**Instructions for Claude:**

1. After Step 3 (task found), check if `--force` flag was provided in arguments
2. If no `--force` flag:
   - Check if user is authenticated and project is linked
   - If yes, make GET request to `/projects/{projectId}/tasks/{taskId}`
   - Parse the assignee from response
   - Compare assignee email with `config.cloud.userEmail`
3. Based on comparison:
   - **Unassigned**: Proceed silently to Step 4
   - **Assigned to current user**: Show positive message, proceed to Step 4
   - **Assigned to someone else**: Show warning with options, STOP (do not proceed)
4. If `--force` flag: Skip all checks, proceed to Step 4

**Error Handling:**
- API timeout/error: Show warning but proceed (fail-open for better UX)
- Task not found on cloud (404): Proceed (local-only task)
- Network unavailable: Proceed with warning

---

### Step 4: Update Task Status

Based on the action, update:

#### For `start` action:
- Change checkbox: `- [ ]` → `- [ ]` (stays empty)
- Change status: `**Status**: TODO` → `**Status**: IN_PROGRESS 🔄`

#### For `done` action:
- Change checkbox: `- [ ]` → `- [x]`
- Change status: `**Status**: [ANY]` → `**Status**: DONE ✅`

#### For `block` action:
- Change checkbox: `- [ ]` → `- [ ]` (stays empty)
- Change status: `**Status**: [ANY]` → `**Status**: BLOCKED 🚫`

Use the Edit tool to make these changes.

### Step 5: Update Progress Tracking

Find the "Progress Tracking" section and update:

#### Count Tasks

Parse all tasks and count:
- Total tasks: Count all `#### T` task headers
- Completed tasks: Count all `- [x]` checkboxes
- In progress tasks: Count all `IN_PROGRESS` statuses
- Blocked tasks: Count all `BLOCKED` statuses

#### Calculate Progress

```
Progress % = (Completed / Total) × 100
```

Round to nearest integer.

#### Generate Progress Bar

Create visual progress bar (10 blocks):
```
Completed: 0%   → ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜
Completed: 15%  → 🟩⬜⬜⬜⬜⬜⬜⬜⬜⬜
Completed: 35%  → 🟩🟩🟩⬜⬜⬜⬜⬜⬜⬜
Completed: 50%  → 🟩🟩🟩🟩🟩⬜⬜⬜⬜⬜
Completed: 75%  → 🟩🟩🟩🟩🟩🟩🟩⬜⬜⬜
Completed: 100% → 🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩
```

Formula: `filled_blocks = Math.floor(progress_percent / 10)`

#### Update Progress Section

Find and replace the progress section:

```markdown
### Overall Status
**Total Tasks**: [X]
**Completed**: [Y] [PROGRESS_BAR] ([Z]%)
**In Progress**: [A]
**Blocked**: [B]
```

#### Update Phase Progress

For each phase (Phase 1, Phase 2, etc.):
1. Count tasks in that phase (T1.X belongs to Phase 1, T2.X to Phase 2, etc.)
2. Count completed tasks in that phase
3. Calculate phase percentage

Update the phase progress section:
```markdown
### Phase Progress
- 🟢 Phase 1: Foundation → [X]/[Y] ([Z]%)
- 🔵 Phase 2: Core Features → [A]/[B] ([C]%)
- 🟣 Phase 3: Advanced Features → [D]/[E] ([F]%)
- 🟠 Phase 4: Testing & Deployment → [G]/[H] ([I]%)
```

#### Update Current Focus

Find the next TODO or IN_PROGRESS task and update:

```markdown
### Current Focus
🎯 **Next Task**: T[X].[Y] - [Task Name]
📅 **Phase**: [N] - [Phase Name]
🔄 **Status**: [Current overall status]
```

#### Update Last Modified Date

Find and update the "Last Updated" date at the top of the file:

```markdown
*Last Updated: 2026-01-26*
```

Use current date in YYYY-MM-DD format.

### Step 6: Save Changes

Use the Edit tool to apply all changes to PROJECT_PLAN.md.

### Step 7: Auto-Sync and Show Confirmation

**This step has TWO parts that MUST both be executed:**

#### Part A: Auto-Sync to Cloud (if enabled)

Before showing the confirmation message, check if auto-sync should be triggered:

```javascript
// Get merged config (global + local)
const cloudConfig = config.cloud || {}
const apiToken = cloudConfig.apiToken
const projectId = cloudConfig.projectId
const autoSync = cloudConfig.autoSync === true

if (apiToken && projectId && autoSync) {
  // MUST execute auto-sync
  console.log("☁️ Auto-syncing to cloud...")

  // Map action to status
  const statusMap = { "start": "IN_PROGRESS", "done": "DONE", "block": "BLOCKED" }
  const newStatus = statusMap[action]

  // Make PATCH request
  const response = await fetch(
    `https://api.planflow.tools/projects/${projectId}/tasks/${taskId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiToken}`
      },
      body: JSON.stringify({ status: newStatus })
    }
  )

  if (response.ok) {
    console.log("☁️ ✅ Synced to cloud")
  } else {
    console.log("☁️ ⚠️ Cloud sync failed (local update succeeded)")
  }
}
```

**Claude MUST execute this Bash command if autoSync is enabled:**
```bash
curl -s -X PATCH \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {API_TOKEN}" \
  -d '{"status": "{NEW_STATUS}"}' \
  "https://api.planflow.tools/projects/{PROJECT_ID}/tasks/{TASK_ID}"
```

Replace:
- `{API_TOKEN}` with token from merged config
- `{PROJECT_ID}` with projectId from merged config
- `{TASK_ID}` with the task ID (e.g., T1.4)
- `{NEW_STATUS}` with: IN_PROGRESS (start), DONE (done), or BLOCKED (block)

#### Part A.5: Broadcast Presence (v1.6.0+ - T12.2)

**Purpose:** Broadcast "Currently Working On" status to team members in real-time.

**When to Execute:** After cloud sync succeeds, if WebSocket is connected.

**Pseudo-code:**
```javascript
// Check WebSocket connection status
const wsState = ws_status()  // from skills/websocket/SKILL.md

if (wsState === "connected" || wsState === "polling") {
  if (action === "start") {
    // Set presence: "Working on T2.1"
    ws_update_presence(taskId, taskName)
    console.log(t.commands.update.presenceBroadcasted
      .replace("{taskId}", taskId)
      .replace("{action}", "started"))
  } else if (action === "done" || action === "block") {
    // Clear presence: no longer working on this task
    ws_update_presence("")
    console.log(t.commands.update.presenceBroadcasted
      .replace("{taskId}", taskId)
      .replace("{action}", action === "done" ? "completed" : "blocked"))
  }
}
```

**Bash Implementation:**
```bash
# Check WebSocket state
STATE_FILE="${HOME}/.planflow-ws-state.json"
WS_STATE="disconnected"

if [ -f "$STATE_FILE" ]; then
  WS_STATE=$(jq -r '.state // "disconnected"' "$STATE_FILE")
fi

# Broadcast presence if connected
if [ "$WS_STATE" = "connected" ] || [ "$WS_STATE" = "polling" ]; then
  if [ "$ACTION" = "start" ]; then
    # Set "Working on" presence
    PRESENCE_MSG=$(jq -n \
      --arg taskId "$TASK_ID" \
      --arg taskName "$TASK_NAME" \
      '{
        type: "presence",
        status: "working",
        taskId: $taskId,
        taskName: $taskName
      }')

    # Update local state file
    jq --arg taskId "$TASK_ID" --arg taskName "$TASK_NAME" \
      '.presence = { taskId: $taskId, taskName: $taskName, since: (now | todate) }' \
      "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"

    echo "🟢 Broadcasting: Working on $TASK_ID to team members"
  else
    # Clear presence for "done" or "block"
    PRESENCE_MSG='{"type":"presence","status":"idle","taskId":null}'

    # Clear local state
    if [ -f "$STATE_FILE" ]; then
      jq '.presence = null' "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"
    fi

    if [ "$ACTION" = "done" ]; then
      echo "🟢 Broadcasting: $TASK_ID completed to team members"
    else
      echo "🟢 Broadcasting: $TASK_ID blocked to team members"
    fi
  fi

  # Send via WebSocket (non-blocking)
  # The ws_send function handles queueing if offline
  ws_send "$PRESENCE_MSG" 2>/dev/null &
fi
```

**Output Examples:**

For `/planUpdate T2.1 start`:
```
☁️ ✅ Synced to cloud
🟢 Broadcasting: Working on T2.1 to team members
```

For `/planUpdate T2.1 done`:
```
☁️ ✅ Synced to cloud
🟢 Broadcasting: T2.1 completed to team members
```

For `/planUpdate T2.1 block`:
```
☁️ ✅ Synced to cloud
🟢 Broadcasting: T2.1 blocked to team members
```

**When Offline/Disconnected:**
If WebSocket is disconnected, presence messages are automatically queued via the offline queue system. They'll be sent when reconnected.

```
☁️ ✅ Synced to cloud
📤 Presence update queued (will broadcast when connected)
```

**Translation Keys:**
```json
{
  "commands": {
    "update": {
      "presenceBroadcasting": "🔄 Broadcasting status to team...",
      "presenceBroadcasted": "🟢 Broadcasting: {action} {taskId} to team members",
      "presenceWorkingOn": "🟢 Broadcasting: Working on {taskId} to team members",
      "presenceCompleted": "🟢 Broadcasting: {taskId} completed to team members",
      "presenceBlocked": "🟢 Broadcasting: {taskId} blocked to team members",
      "presenceQueued": "📤 Presence update queued (will broadcast when connected)",
      "presenceFailed": "⚠️ Could not broadcast presence (local update succeeded)"
    }
  }
}
```

**Team Members See:**
When you start a task, other team members running `/pfTeamList` or `/team` will see:
```
👥 Team Members

  🟢 John Doe (Editor)      john@company.com
     Working on: T2.1 - Implement login API
```

**Instructions for Claude:**

1. After successful cloud sync (Part A), check WebSocket state file
2. If connected or polling:
   - For "start": send presence with taskId and taskName
   - For "done"/"block": send idle presence to clear status
3. Update local state file with current presence
4. Show broadcasting confirmation in output
5. If disconnected: queue message, show queued indicator
6. Never let presence failure block the update flow

#### Part B: Show Confirmation

Display a success message with updated metrics using translations.

**Pseudo-code:**
```javascript
const action = userAction  // "start", "done", or "block"
let statusMessage

if (action === "start") {
  statusMessage = t.commands.update.taskStarted.replace("{taskId}", taskId)
} else if (action === "done") {
  statusMessage = t.commands.update.taskCompleted.replace("{taskId}", taskId)
} else if (action === "block") {
  statusMessage = t.commands.update.taskBlocked.replace("{taskId}", taskId)
}

let output = statusMessage + "\n\n"

// Progress update
const progressDelta = newProgress - oldProgress
output += t.commands.update.progressUpdate
  .replace("{old}", oldProgress)
  .replace("{new}", newProgress)
  .replace("{delta}", progressDelta) + "\n\n"

// Overall status
output += t.commands.update.overallStatus + "\n"
output += t.commands.update.total + " " + totalTasks + "\n"
output += t.commands.update.done + " " + doneTasks + "\n"
output += t.commands.update.inProgress + " " + inProgressTasks + "\n"
output += t.commands.update.blocked + " " + blockedTasks + "\n"
output += t.commands.update.remaining + " " + remainingTasks + "\n\n"
output += progressBar + " " + newProgress + "%\n\n"
output += t.commands.update.nextSuggestion
```

**Example output (English):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ Task Completed                                                           │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Task T1.2 completed! 🎉                                                     │
│                                                                              │
│  ── Progress ──────────────────────────────────────────────────────────────  │
│                                                                              │
│  📊 25% → 31% (+6%)                                                          │
│                                                                              │
│  🟩🟩🟩⬜⬜⬜⬜⬜⬜⬜ 31%                                                        │
│                                                                              │
│  ── Overall Status ────────────────────────────────────────────────────────  │
│                                                                              │
│  📋 Total:       18                                                          │
│  ✅ Done:        6                                                           │
│  🔄 In Progress: 1                                                           │
│  🚫 Blocked:     0                                                           │
│  📋 Remaining:   11                                                          │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /planNext    Get next task recommendation                              │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Example output (Georgian):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ ამოცანა დასრულდა                                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ამოცანა T1.2 დასრულდა! 🎉                                                   │
│                                                                              │
│  ── პროგრესი ──────────────────────────────────────────────────────────────  │
│                                                                              │
│  📊 25% → 31% (+6%)                                                          │
│                                                                              │
│  🟩🟩🟩⬜⬜⬜⬜⬜⬜⬜ 31%                                                        │
│                                                                              │
│  ── საერთო სტატუსი ────────────────────────────────────────────────────────  │
│                                                                              │
│  📋 სულ:          18                                                         │
│  ✅ დასრულებული:  6                                                          │
│  🔄 მიმდინარე:    1                                                          │
│  🚫 დაბლოკილი:    0                                                          │
│  📋 დარჩენილი:    11                                                         │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 შემდეგი ნაბიჯები:                                                        │
│     • /planNext    რეკომენდაციის მისაღებად                                   │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Instructions for Claude:**

Use translation keys:
- Task started: `t.commands.update.taskStarted.replace("{taskId}", actualTaskId)`
- Task completed: `t.commands.update.taskCompleted.replace("{taskId}", actualTaskId)`
- Task blocked: `t.commands.update.taskBlocked.replace("{taskId}", actualTaskId)`
- Progress: `t.commands.update.progressUpdate` with {old}, {new}, {delta} replacements
- Overall status: `t.commands.update.overallStatus`
- Total: `t.commands.update.total`
- Done: `t.commands.update.done`
- In Progress: `t.commands.update.inProgress`
- Blocked: `t.commands.update.blocked`
- Remaining: `t.commands.update.remaining`
- Next suggestion: `t.commands.update.nextSuggestion`

**⚠️ IMPORTANT: After showing the confirmation message, you MUST proceed to Step 8 (Cloud Integration) to check for auto-sync!**

## Special Cases

### Completing Tasks with Dependencies

When marking a task as DONE that other tasks depend on, mention it:

**Pseudo-code:**
```javascript
let output = t.commands.update.taskCompleted.replace("{taskId}", taskId) + "\n\n"

if (unlockedTasks.length > 0) {
  output += t.commands.update.unlockedTasks + "\n"
  output += unlockedTasks.map(t => `  - ${t.id}: ${t.name}`).join("\n")
}
```

**Example output (English):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ Task Completed                                                           │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Task T1.2 completed! 🎉                                                     │
│                                                                              │
│  ── Unlocked Tasks ────────────────────────────────────────────────────────  │
│                                                                              │
│  🔓 T1.3: Database Setup                                                     │
│  🔓 T2.1: API Endpoints                                                      │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Example output (Georgian):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ ამოცანა დასრულდა                                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ამოცანა T1.2 დასრულდა! 🎉                                                   │
│                                                                              │
│  ── განბლოკილი ამოცანები ──────────────────────────────────────────────────  │
│                                                                              │
│  🔓 T1.3: მონაცემთა ბაზის დაყენება                                           │
│  🔓 T2.1: API Endpoints                                                      │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

To detect this, look for tasks that list the completed task in their "Dependencies" field.

**Instructions for Claude:**

Use `t.commands.update.unlockedTasks` when showing unlocked tasks.

### Blocking a Task

When marking a task as BLOCKED, show helpful tip:

**Pseudo-code:**
```javascript
let output = t.commands.update.taskBlocked.replace("{taskId}", taskId) + "\n\n"
output += t.commands.update.tipDocumentBlocker + "\n"
output += t.commands.update.whatBlocking + "\n"
output += t.commands.update.whatNeeded + "\n"
output += t.commands.update.whoCanHelp + "\n\n"
output += t.commands.update.considerNewTask
```

**Example output (English):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🚫 Task Blocked                                                             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Task T2.3 marked as blocked.                                                │
│                                                                              │
│  ── Document the Blocker ──────────────────────────────────────────────────  │
│                                                                              │
│  💡 Add to task description:                                                 │
│     • What is blocking this task?                                            │
│     • What needs to happen to unblock it?                                    │
│     • Who can help resolve this?                                             │
│                                                                              │
│  Consider creating a new task to resolve the blocker.                        │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Example output (Georgian):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🚫 ამოცანა დაბლოკილია                                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ამოცანა T2.3 მონიშნულია როგორც დაბლოკილი.                                   │
│                                                                              │
│  ── დააფიქსირეთ ბლოკერი ───────────────────────────────────────────────────  │
│                                                                              │
│  💡 ამოცანის აღწერაში დაამატეთ:                                              │
│     • რა აბლოკავს ამ ამოცანას?                                               │
│     • რა უნდა მოხდეს მისი განსაბლოკად?                                       │
│     • ვინ შეუძლია დაეხმაროს ამის მოგვარებაში?                                │
│                                                                              │
│  განიხილეთ ახალი ამოცანის შექმნა ბლოკერის მოსაგვარებლად.                     │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Instructions for Claude:**

Use translation keys:
- `t.commands.update.taskBlocked`
- `t.commands.update.tipDocumentBlocker`
- `t.commands.update.whatBlocking`
- `t.commands.update.whatNeeded`
- `t.commands.update.whoCanHelp`
- `t.commands.update.considerNewTask`

### Completing Final Task

When the last task is marked as DONE:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🎉 PROJECT COMPLETE                                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Congratulations! All tasks completed!                                       │
│                                                                              │
│  ── Project Summary ───────────────────────────────────────────────────────  │
│                                                                              │
│  ✅ Project:   [PROJECT_NAME]                                                │
│  📊 Progress:  ████████████████████████████████ 100%                         │
│  🏆 Tasks:     [Total] completed                                             │
│                                                                              │
│  ╭────────────────────────────────────────────────────────────────────────╮  │
│  │  ✅ Project Status: COMPLETE                                           │  │
│  ╰────────────────────────────────────────────────────────────────────────╯  │
│                                                                              │
│  Great work on finishing this project! 🚀                                    │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • Review the project documentation                                       │
│     • Deploy to production (if not already done)                             │
│     • Gather user feedback                                                   │
│     • Plan next phase or features                                            │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

Update the overall status in the Overview section from "In Progress" to "Complete".

### Invalid State Transitions

Some transitions don't make sense. Allow all but note:

```
⚠️ Note: Task T1.1 was TODO, now marked BLOCKED.

💡 Tip: Usually tasks are blocked after starting them.
     Consider adding notes about what's blocking this.
```

## Error Handling

### File Read Errors

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Cannot read PROJECT_PLAN.md                                                 │
│                                                                              │
│  Make sure:                                                                  │
│     1. You're in the correct project directory                               │
│     2. The file exists (run /planNew if not)                                 │
│     3. You have read permissions                                             │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### File Write Errors

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Cannot update PROJECT_PLAN.md                                               │
│                                                                              │
│  The file may be:                                                            │
│     • Open in another program                                                │
│     • Read-only                                                              │
│     • Locked by version control                                              │
│                                                                              │
│  Please check and try again.                                                 │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### Malformed Task Format

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚠️  WARNING                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Task [task-id] has unexpected format.                                       │
│                                                                              │
│  The update was applied but progress calculations may be inaccurate.         │
│  Please check the PROJECT_PLAN.md file manually.                             │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Regex Patterns for Parsing

### Task Header
```regex
#### (T\d+\.\d+): (.+)
```

### Task Checkbox
```regex
- \[([ x])\] \*\*Status\*\*: (.+)
```

### Dependencies
```regex
\*\*Dependencies\*\*: (.+)
```

## Examples

### Example 1: Starting a Task
```bash
User: /planUpdate T1.1 start

Output:
✅ Task T1.1 updated: TODO → IN_PROGRESS 🔄

📊 Progress: 0% → 0% (no change)

You're now working on:
  T1.1: Project Setup
  Complexity: Low
  Estimated: 2 hours

Good luck! Run /planUpdate T1.1 done when finished.
```

### Example 2: Completing a Task
```bash
User: /planUpdate T1.1 done

Output:
✅ Task T1.1 completed! 🎉

📊 Progress: 0% → 7% (+7%)

Overall Status:
  🟩⬜⬜⬜⬜⬜⬜⬜⬜⬜ 7%

  Total: 14 tasks
  ✅ Done: 1
  📋 Remaining: 13

🔓 Unlocked: T1.2 - Database Configuration

🎯 Next: /planNext (get recommendation)
```

### Example 3: Blocking a Task
```bash
User: /planUpdate T2.3 block

Output:
🚫 Task T2.3 marked as blocked

📊 Progress: 35% (no change)

Overall Status:
  Total: 14 tasks
  ✅ Done: 5
  🚫 Blocked: 1
  📋 Remaining: 8

💡 Consider:
  - Document what's blocking this task
  - Create a task to resolve the blocker
  - Update dependencies if needed

Run /planNext to find alternative tasks to work on.
```

## Important Notes

1. **Always recalculate progress** after any update
2. **Be precise with Edit tool** - match exact strings including whitespace
3. **Handle multiple status formats** - tasks may have emojis or not
4. **Preserve formatting** - don't accidentally change indentation or structure
5. **Atomic updates** - if any edit fails, inform user clearly
6. **Phase detection** - T1.X = Phase 1, T2.X = Phase 2, etc.

## Success Criteria

A successful update should:
- ✅ Change task status correctly
- ✅ Update checkbox if completing
- ✅ Recalculate all progress metrics
- ✅ Update progress bar visual
- ✅ Update phase progress
- ✅ Update "Current Focus"
- ✅ Update "Last Updated" date
- ✅ Show clear confirmation to user
- ✅ Suggest next action
- ✅ **Execute Step 8 (auto-sync check) - ALWAYS!**

## Cloud Integration (v1.2.0+)

**IMPORTANT: After completing Step 7, you MUST execute Step 8 to check for auto-sync.**

When cloud config is available, the /planUpdate command automatically syncs task status to cloud after updating the local file.

---

## Sync Mode Decision Flow (v1.3.0+)

After updating the local PROJECT_PLAN.md, Claude MUST determine which sync mode to use:

**Pseudo-code:**
```javascript
function determineSyncMode(config) {
  const cloudConfig = config.cloud || {}
  const isAuthenticated = !!cloudConfig.apiToken
  const projectId = cloudConfig.projectId
  const storageMode = cloudConfig.storageMode || "local"
  const autoSync = cloudConfig.autoSync || false

  // Check conditions in order of priority
  if (!isAuthenticated || !projectId) {
    return { mode: "skip", reason: "not_authenticated_or_linked" }
  }

  // v1.3.0: Hybrid mode takes precedence
  if (storageMode === "hybrid") {
    return { mode: "hybrid", reason: "hybrid_mode_enabled" }
  }

  // v1.3.0: Cloud mode (cloud is source of truth)
  if (storageMode === "cloud") {
    return { mode: "cloud", reason: "cloud_mode_enabled" }
  }

  // v1.2.0: Legacy auto-sync (simple push)
  if (autoSync === true) {
    return { mode: "auto_sync", reason: "auto_sync_enabled" }
  }

  // Default: Local only
  return { mode: "local", reason: "local_mode" }
}
```

**Mode Behaviors:**

| Mode | Behavior | When to Use |
|------|----------|-------------|
| `local` | No cloud sync | Offline work, no cloud account |
| `auto_sync` | Simple push (v1.2.0) | Quick sync without conflict detection |
| `cloud` | Pull-then-push, cloud wins | Team projects, cloud is authoritative |
| `hybrid` | Pull-merge-push with smart merge | Collaborative work, preserve local changes |

**Instructions for Claude:**

1. After Step 7 (local update), call `determineSyncMode(config)`
2. Based on result, execute the appropriate sync:
   - `skip` → No sync, just show confirmation
   - `local` → No sync, just show confirmation
   - `auto_sync` → Execute Step 8 (simple PATCH)
   - `cloud` → Execute Step 8-Cloud (pull first, cloud wins)
   - `hybrid` → Execute Step 8-Hybrid (pull-merge-push with smart merge)

---

## Hybrid Sync Mode (v1.3.0+)

When `storageMode: "hybrid"` is configured, the /planUpdate command implements a **pull-before-push** pattern to enable smart merging of concurrent changes.

### Integration with Smart Merge Skill

The hybrid sync mode uses the **`skills/smart-merge/SKILL.md`** algorithm for conflict detection and resolution. Key functions used:

| Function | Purpose | When Called |
|----------|---------|-------------|
| `smartMerge()` | Core merge algorithm | After pulling cloud state |
| `normalizeStatus()` | Normalize status strings | Before comparison |
| `buildMergeContext()` | Create merge context | With local and cloud data |
| `detectChanges()` | Detect what changed | During context building |

**Integration Flow:**
```
/planUpdate T1.1 done
    │
    ├─→ Update local PROJECT_PLAN.md
    │
    ├─→ Pull cloud state (GET /projects/:id/tasks/:taskId)
    │
    ├─→ Call smartMerge() from smart-merge skill
    │   │
    │   ├─→ buildMergeContext(local, cloud, lastSyncedAt)
    │   │
    │   ├─→ normalizeStatus() for comparison
    │   │
    │   └─→ Return: AUTO_MERGE | CONFLICT | NO_CHANGE
    │
    ├─→ If AUTO_MERGE: Push to cloud
    │
    ├─→ If CONFLICT: Show conflict UI (T6.4)
    │
    └─→ Update lastSyncedAt on success
```

### Storage Mode Check

Before proceeding with cloud sync, check the storage mode:

**Pseudo-code:**
```javascript
const cloudConfig = config.cloud || {}
const storageMode = cloudConfig.storageMode || "local"  // Default to local-only

// Storage modes:
// - "local"  → No auto-sync, just update file
// - "cloud"  → Cloud is source of truth, always sync
// - "hybrid" → Pull-before-push with smart merge (v1.3.0)

if (storageMode === "hybrid" && isAuthenticated && projectId) {
  // Use pull-before-push flow (Step 8-Hybrid)
  await hybridSync(taskId, newStatus, cloudConfig, t)
} else if (storageMode === "cloud" && isAuthenticated && projectId) {
  // Direct push (existing v1.2.0 behavior)
  await syncTaskToCloud(taskId, newStatus, cloudConfig, t)
} else if (autoSync && isAuthenticated && projectId) {
  // Legacy auto-sync (for backwards compatibility)
  await syncTaskToCloud(taskId, newStatus, cloudConfig, t)
}
// else: local mode, no sync
```

---

### Step 8-Hybrid: Pull-Before-Push Sync (v1.3.0)

When in hybrid mode, always pull cloud state before pushing local changes to detect and handle concurrent modifications.

#### Step 8-Hybrid-A: Pull Cloud State

First, fetch the current cloud state for the specific task.

**Pseudo-code:**
```javascript
async function hybridSync(taskId, newLocalStatus, cloudConfig, t) {
  const projectId = cloudConfig.projectId
  const apiToken = cloudConfig.apiToken
  const apiUrl = cloudConfig.apiUrl || "https://api.planflow.tools"
  const lastSyncedAt = cloudConfig.lastSyncedAt

  // Show syncing indicator
  console.log("")
  console.log(t.commands.update.hybridSyncing || "🔄 Syncing with cloud (hybrid mode)...")

  // Step 1: PULL - Get cloud state for this task
  console.log(t.commands.update.hybridPulling || "   ↓ Pulling cloud state...")

  const pullResponse = await fetch(
    `${apiUrl}/projects/${projectId}/tasks/${taskId}`,
    {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Accept": "application/json"
      }
    }
  )

  if (!pullResponse.ok) {
    if (pullResponse.status === 404) {
      // Task doesn't exist on cloud yet - safe to push
      console.log(t.commands.update.hybridTaskNew || "   → Task is new, pushing...")
      return await pushTaskToCloud(taskId, newLocalStatus, cloudConfig, t)
    }
    // Other error - fall back to local-only
    console.log(t.commands.update.hybridPullFailed || "   ⚠️ Could not fetch cloud state")
    console.log(t.commands.update.hybridLocalOnly || "   → Changes saved locally only")
    return
  }

  const cloudTask = pullResponse.data.task
  const cloudStatus = cloudTask.status
  const cloudUpdatedAt = cloudTask.updatedAt
  const cloudUpdatedBy = cloudTask.updatedBy || "cloud"

  // Step 2: COMPARE - Check for conflicts
  const comparison = compareTaskStates({
    taskId,
    localStatus: newLocalStatus,
    localUpdatedAt: new Date().toISOString(),
    localUpdatedBy: "local",
    cloudStatus,
    cloudUpdatedAt,
    cloudUpdatedBy,
    lastSyncedAt
  })

  // Step 3: Handle based on comparison result
  if (comparison.result === "NO_CONFLICT") {
    // Same status or cloud hasn't changed - safe to push
    console.log(t.commands.update.hybridNoConflict || "   ✓ No conflicts detected")
    return await pushTaskToCloud(taskId, newLocalStatus, cloudConfig, t)
  }

  if (comparison.result === "AUTO_MERGE") {
    // Cloud changed different field or compatible change
    console.log(t.commands.update.hybridAutoMerge || "   ✓ Auto-merged changes")
    return await pushTaskToCloud(taskId, newLocalStatus, cloudConfig, t)
  }

  if (comparison.result === "CONFLICT") {
    // Real conflict - both changed the same task to different values
    console.log(t.commands.update.hybridConflict || "   ⚠️ Conflict detected!")

    // Store conflict info for resolution (T6.4 will handle UI)
    return {
      conflict: true,
      taskId,
      local: { status: newLocalStatus, updatedAt: new Date().toISOString() },
      cloud: { status: cloudStatus, updatedAt: cloudUpdatedAt, updatedBy: cloudUpdatedBy },
      message: t.commands.update.hybridConflictMessage ||
        `Task ${taskId} was modified on cloud. Use /pfSyncPush to resolve.`
    }
  }
}
```

**Bash Implementation for Pull:**

```bash
API_URL="https://api.planflow.tools"
TOKEN="$API_TOKEN"
PROJECT_ID="$PROJECT_ID"
TASK_ID="T1.1"

# Pull cloud state for specific task
echo "   ↓ Pulling cloud state..."
PULL_RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 10 \
  -X GET \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "${API_URL}/projects/${PROJECT_ID}/tasks/${TASK_ID}")

PULL_HTTP_CODE=$(echo "$PULL_RESPONSE" | tail -n1)
PULL_BODY=$(echo "$PULL_RESPONSE" | sed '$d')

if [ "$PULL_HTTP_CODE" -eq 404 ]; then
  # Task is new on cloud
  echo "   → Task is new, pushing..."
  # Proceed to push
elif [ "$PULL_HTTP_CODE" -ge 200 ] && [ "$PULL_HTTP_CODE" -lt 300 ]; then
  # Parse cloud status
  CLOUD_STATUS=$(echo "$PULL_BODY" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
  CLOUD_UPDATED_AT=$(echo "$PULL_BODY" | grep -o '"updatedAt":"[^"]*"' | head -1 | cut -d'"' -f4)

  echo "   Cloud status: $CLOUD_STATUS (updated: $CLOUD_UPDATED_AT)"
  # Compare and decide
else
  echo "   ⚠️ Could not fetch cloud state (HTTP $PULL_HTTP_CODE)"
  echo "   → Changes saved locally only"
  exit 0
fi
```

---

#### Step 8-Hybrid-B: Compare Task States

Compare local and cloud states to determine if there's a conflict.

**Pseudo-code:**
```javascript
function compareTaskStates(params) {
  const {
    taskId,
    localStatus,
    localUpdatedAt,
    cloudStatus,
    cloudUpdatedAt,
    lastSyncedAt
  } = params

  // Case 1: Same status - no conflict
  if (localStatus === cloudStatus) {
    return { result: "NO_CONFLICT", reason: "same_status" }
  }

  // Case 2: Cloud hasn't changed since last sync
  if (lastSyncedAt && new Date(cloudUpdatedAt) <= new Date(lastSyncedAt)) {
    return { result: "NO_CONFLICT", reason: "cloud_unchanged" }
  }

  // Case 3: Cloud changed but to same value we want
  if (localStatus === cloudStatus) {
    return { result: "AUTO_MERGE", reason: "convergent_change" }
  }

  // Case 4: Real conflict - cloud has different status than what we want
  // AND cloud was updated after our last sync
  if (new Date(cloudUpdatedAt) > new Date(lastSyncedAt || 0)) {
    return {
      result: "CONFLICT",
      reason: "concurrent_modification",
      localStatus,
      cloudStatus,
      cloudUpdatedAt
    }
  }

  // Default: safe to push
  return { result: "NO_CONFLICT", reason: "local_newer" }
}
```

**Comparison Rules:**

| Local Status | Cloud Status | Cloud Updated After Sync? | Result |
|--------------|--------------|---------------------------|--------|
| DONE | DONE | Any | NO_CONFLICT (same) |
| DONE | TODO | No | NO_CONFLICT (push) |
| DONE | TODO | Yes | CONFLICT |
| DONE | IN_PROGRESS | Yes | CONFLICT |
| IN_PROGRESS | DONE | Yes | CONFLICT |
| IN_PROGRESS | BLOCKED | Yes | CONFLICT |
| Any | (404 Not Found) | N/A | NO_CONFLICT (new) |

---

#### Step 8-Hybrid-C: Push After Successful Compare

If no conflict, push the local change to cloud.

**Pseudo-code:**
```javascript
async function pushTaskToCloud(taskId, newStatus, cloudConfig, t) {
  const projectId = cloudConfig.projectId
  const apiToken = cloudConfig.apiToken
  const apiUrl = cloudConfig.apiUrl || "https://api.planflow.tools"

  console.log(t.commands.update.hybridPushing || "   ↑ Pushing local changes...")

  const pushResponse = await fetch(
    `${apiUrl}/projects/${projectId}/tasks/${taskId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiToken}`
      },
      body: JSON.stringify({ status: newStatus })
    }
  )

  if (pushResponse.ok) {
    // Update lastSyncedAt
    updateLastSyncedAt(new Date().toISOString())
    console.log(t.commands.update.hybridSyncSuccess || "☁️ ✅ Synced to cloud (hybrid)")
    return { success: true }
  } else {
    console.log(t.commands.update.hybridPushFailed || "☁️ ⚠️ Push failed")
    return { success: false, error: pushResponse.status }
  }
}
```

**Bash Implementation for Push:**

```bash
# Push local change to cloud
echo "   ↑ Pushing local changes..."
PUSH_RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 10 \
  -X PATCH \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"status\": \"$NEW_STATUS\"}" \
  "${API_URL}/projects/${PROJECT_ID}/tasks/${TASK_ID}")

PUSH_HTTP_CODE=$(echo "$PUSH_RESPONSE" | tail -n1)

if [ "$PUSH_HTTP_CODE" -ge 200 ] && [ "$PUSH_HTTP_CODE" -lt 300 ]; then
  echo "☁️ ✅ Synced to cloud (hybrid)"
else
  echo "☁️ ⚠️ Push failed (HTTP $PUSH_HTTP_CODE)"
fi
```

---

#### Step 8-Hybrid-D: Handle Conflicts (Basic)

For v1.3.0, display a basic conflict message. The rich conflict UI (T6.4) will be implemented separately.

**Pseudo-code:**
```javascript
function handleConflict(conflict, t) {
  console.log("")
  console.log(t.commands.update.hybridConflictDetected || "⚠️ Sync Conflict Detected!")
  console.log("")
  console.log(`Task: ${conflict.taskId}`)
  console.log(`  Local:  ${conflict.local.status}`)
  console.log(`  Cloud:  ${conflict.cloud.status} (by ${conflict.cloud.updatedBy})`)
  console.log("")
  console.log(t.commands.update.hybridConflictHint || "💡 To resolve:")
  console.log("   /pfSyncPushPull --force   → Keep cloud version")
  console.log("   /pfSyncPushPush --force   → Keep local version")
  console.log("")
  console.log(t.commands.update.hybridLocalSaved || "📝 Local changes saved to PROJECT_PLAN.md")
}
```

**Example Conflict Output:**

```
🔄 Syncing with cloud (hybrid mode)...
   ↓ Pulling cloud state...
   ⚠️ Conflict detected!

⚠️ Sync Conflict Detected!

Task: T1.2
  Local:  DONE
  Cloud:  BLOCKED (by teammate@example.com)

💡 To resolve:
   /pfSyncPushPull --force   → Keep cloud version
   /pfSyncPushPush --force   → Keep local version

📝 Local changes saved to PROJECT_PLAN.md
```

---

### Complete Hybrid Sync Flow

**Full Flow Diagram:**

```
/planUpdate T1.1 done
    │
    ▼
┌─────────────────────────────┐
│ 1. Update local file        │
│    PROJECT_PLAN.md          │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ 2. Check storage mode       │
│    storageMode === "hybrid" │
└──────────────┬──────────────┘
               │ Yes
               ▼
┌─────────────────────────────┐
│ 3. PULL cloud state         │
│    GET /tasks/{taskId}      │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ 4. Compare states           │
│    local vs cloud           │
└──────────────┬──────────────┘
               │
        ┌──────┴──────┐
        │             │
        ▼             ▼
   NO_CONFLICT    CONFLICT
        │             │
        ▼             ▼
┌───────────────┐ ┌───────────────┐
│ 5. PUSH       │ │ 5. Show       │
│    changes    │ │    conflict   │
│               │ │    message    │
└───────┬───────┘ └───────┬───────┘
        │                 │
        ▼                 ▼
   ✅ Synced         📝 Local saved
                     ⚠️ Needs resolve
```

---

### Hybrid Sync Translation Keys

Add these to `locales/en.json` and `locales/ka.json`:

**English:**
```json
{
  "commands": {
    "update": {
      "hybridSyncing": "🔄 Syncing with cloud (hybrid mode)...",
      "hybridPulling": "   ↓ Pulling cloud state...",
      "hybridPushing": "   ↑ Pushing local changes...",
      "hybridNoConflict": "   ✓ No conflicts detected",
      "hybridAutoMerge": "   ✓ Auto-merged changes",
      "hybridConflict": "   ⚠️ Conflict detected!",
      "hybridTaskNew": "   → Task is new, pushing...",
      "hybridPullFailed": "   ⚠️ Could not fetch cloud state",
      "hybridLocalOnly": "   → Changes saved locally only",
      "hybridSyncSuccess": "☁️ ✅ Synced to cloud (hybrid)",
      "hybridPushFailed": "☁️ ⚠️ Push failed",
      "hybridConflictDetected": "⚠️ Sync Conflict Detected!",
      "hybridConflictHint": "💡 To resolve:",
      "hybridLocalSaved": "📝 Local changes saved to PROJECT_PLAN.md",
      "hybridConflictMessage": "Task was modified on cloud. Use /pfSyncPush to resolve."
    }
  }
}
```

**Georgian:**
```json
{
  "commands": {
    "update": {
      "hybridSyncing": "🔄 სინქრონიზაცია ქლაუდთან (ჰიბრიდული რეჟიმი)...",
      "hybridPulling": "   ↓ ქლაუდის მდგომარეობის მიღება...",
      "hybridPushing": "   ↑ ლოკალური ცვლილებების ატვირთვა...",
      "hybridNoConflict": "   ✓ კონფლიქტი არ აღმოჩნდა",
      "hybridAutoMerge": "   ✓ ცვლილებები ავტომატურად გაერთიანდა",
      "hybridConflict": "   ⚠️ კონფლიქტი აღმოჩნდა!",
      "hybridTaskNew": "   → ამოცანა ახალია, იტვირთება...",
      "hybridPullFailed": "   ⚠️ ქლაუდის მდგომარეობის მიღება ვერ მოხერხდა",
      "hybridLocalOnly": "   → ცვლილებები შენახულია მხოლოდ ლოკალურად",
      "hybridSyncSuccess": "☁️ ✅ სინქრონიზებულია ქლაუდთან (ჰიბრიდული)",
      "hybridPushFailed": "☁️ ⚠️ ატვირთვა ვერ მოხერხდა",
      "hybridConflictDetected": "⚠️ სინქრონიზაციის კონფლიქტი აღმოჩნდა!",
      "hybridConflictHint": "💡 მოსაგვარებლად:",
      "hybridLocalSaved": "📝 ლოკალური ცვლილებები შენახულია PROJECT_PLAN.md-ში",
      "hybridConflictMessage": "ამოცანა შეიცვალა ქლაუდში. გამოიყენეთ /pfSyncPush მოსაგვარებლად."
    }
  }
}
```

---

### Testing Hybrid Sync

```bash
# Test 1: Hybrid mode - no conflict (cloud unchanged)
# Config: storageMode: "hybrid", authenticated, linked
/planUpdate T1.1 done
# Expected: Pull → No conflict → Push → Success

# Test 2: Hybrid mode - new task on cloud
# Task exists locally but not on cloud (404)
/planUpdate T1.1 done
# Expected: Pull (404) → Push as new → Success

# Test 3: Hybrid mode - conflict
# Cloud has T1.1 as BLOCKED, local wants DONE
/planUpdate T1.1 done
# Expected: Pull → Conflict detected → Show resolution options

# Test 4: Hybrid mode - same status (no-op)
# Both local and cloud have T1.1 as DONE
/planUpdate T1.1 done
# Expected: Pull → Same status → Skip push → Success

# Test 5: Hybrid mode - network error on pull
/planUpdate T1.1 done
# Expected: Pull fails → Save locally → Warn user

# Test 6: Non-hybrid mode (backwards compatibility)
# Config: storageMode: "local" or autoSync: true
/planUpdate T1.1 done
# Expected: Original v1.2.0 behavior (direct push)
```

---

## Offline Fallback Handling (v1.3.0)

When network is unavailable or API calls fail, the /planUpdate command should gracefully degrade to local-only mode while queuing changes for later sync.

### Offline Detection

**Pseudo-code:**
```javascript
async function isOnline(apiUrl) {
  try {
    const response = await fetch(`${apiUrl}/health`, {
      method: "HEAD",
      timeout: 3000  // 3 second timeout
    })
    return response.ok
  } catch (error) {
    return false
  }
}
```

**Bash Implementation:**
```bash
# Quick connectivity check
API_URL="https://api.planflow.tools"
ONLINE=$(curl -s --connect-timeout 3 --max-time 5 -o /dev/null -w "%{http_code}" "${API_URL}/health" 2>/dev/null)

if [ "$ONLINE" = "200" ]; then
  echo "Online"
else
  echo "Offline"
fi
```

### Pending Sync Queue

When offline, store pending changes for later synchronization.

**Queue File Location:** `./.plan-pending-sync.json`

**Queue Structure:**
```json
{
  "pendingChanges": [
    {
      "taskId": "T1.1",
      "newStatus": "DONE",
      "localUpdatedAt": "2026-02-01T10:00:00Z",
      "queuedAt": "2026-02-01T10:00:05Z",
      "attempts": 0
    },
    {
      "taskId": "T2.3",
      "newStatus": "IN_PROGRESS",
      "localUpdatedAt": "2026-02-01T10:05:00Z",
      "queuedAt": "2026-02-01T10:05:02Z",
      "attempts": 0
    }
  ],
  "lastAttempt": null
}
```

### Queueing Changes

**Pseudo-code:**
```javascript
async function queuePendingSync(taskId, newStatus) {
  const queuePath = "./.plan-pending-sync.json"

  let queue = { pendingChanges: [] }
  if (fileExists(queuePath)) {
    try {
      queue = JSON.parse(readFile(queuePath))
    } catch (e) {
      queue = { pendingChanges: [] }
    }
  }

  // Check if task already in queue
  const existingIndex = queue.pendingChanges.findIndex(c => c.taskId === taskId)

  const change = {
    taskId,
    newStatus,
    localUpdatedAt: new Date().toISOString(),
    queuedAt: new Date().toISOString(),
    attempts: 0
  }

  if (existingIndex >= 0) {
    // Update existing entry (latest status wins)
    queue.pendingChanges[existingIndex] = change
  } else {
    // Add new entry
    queue.pendingChanges.push(change)
  }

  writeFile(queuePath, JSON.stringify(queue, null, 2))

  return queue.pendingChanges.length
}
```

### Processing Pending Queue

When back online (e.g., next /update or /pfSyncPush), process pending changes:

**Pseudo-code:**
```javascript
async function processPendingQueue(config, t) {
  const queuePath = "./.plan-pending-sync.json"

  if (!fileExists(queuePath)) {
    return { processed: 0 }
  }

  const queue = JSON.parse(readFile(queuePath))

  if (queue.pendingChanges.length === 0) {
    return { processed: 0 }
  }

  console.log(t.commands.update.hybridProcessingQueue ||
    `📤 Processing ${queue.pendingChanges.length} pending changes...`)

  const results = {
    success: [],
    failed: [],
    conflicts: []
  }

  for (const change of queue.pendingChanges) {
    try {
      // Use hybrid sync for each pending change
      const result = await performHybridSync({
        taskId: change.taskId,
        newStatus: change.newStatus
      }, config, t)

      if (result.success) {
        results.success.push(change.taskId)
      } else if (result.conflict) {
        results.conflicts.push({
          taskId: change.taskId,
          conflict: result.conflict
        })
      } else {
        results.failed.push(change.taskId)
      }
    } catch (error) {
      results.failed.push(change.taskId)
    }
  }

  // Update queue: remove successful, keep failed for retry
  queue.pendingChanges = queue.pendingChanges.filter(
    c => !results.success.includes(c.taskId)
  )
  queue.lastAttempt = new Date().toISOString()

  if (queue.pendingChanges.length === 0) {
    // Delete queue file if empty
    deleteFile(queuePath)
  } else {
    writeFile(queuePath, JSON.stringify(queue, null, 2))
  }

  return results
}
```

### Offline Mode Output

When operating in offline mode:

```
✅ Task T1.2 completed! 🎉

📊 Progress: 25% → 31% (+6%)

[... normal output ...]

🔄 Syncing with cloud (hybrid mode)...
   ⚠️ Network unavailable
   📝 Changes saved locally
   📤 Queued for sync when online (1 pending)

💡 Run /pfSyncPush when back online to push changes

🎯 Next: /planNext (get recommendation)
```

### Translation Keys for Offline Mode

Add to `locales/en.json`:
```json
{
  "commands": {
    "update": {
      "hybridOffline": "   ⚠️ Network unavailable",
      "hybridQueued": "   📤 Queued for sync when online ({count} pending)",
      "hybridProcessingQueue": "📤 Processing {count} pending changes...",
      "hybridQueueSuccess": "   ✓ {count} pending changes synced",
      "hybridQueueFailed": "   ⚠️ {count} changes failed to sync",
      "hybridQueueConflicts": "   ⚠️ {count} conflicts need resolution",
      "hybridSyncWhenOnline": "💡 Run /pfSyncPush when back online to push changes"
    }
  }
}
```

Add to `locales/ka.json`:
```json
{
  "commands": {
    "update": {
      "hybridOffline": "   ⚠️ ქსელი მიუწვდომელია",
      "hybridQueued": "   📤 რიგში დგას სინქრონიზაციისთვის ({count} მოლოდინში)",
      "hybridProcessingQueue": "📤 მუშავდება {count} მოლოდინში მყოფი ცვლილება...",
      "hybridQueueSuccess": "   ✓ {count} მოლოდინში მყოფი ცვლილება სინქრონიზდა",
      "hybridQueueFailed": "   ⚠️ {count} ცვლილების სინქრონიზაცია ვერ მოხერხდა",
      "hybridQueueConflicts": "   ⚠️ {count} კონფლიქტი საჭიროებს მოგვარებას",
      "hybridSyncWhenOnline": "💡 გაუშვით /pfSyncPush როცა ონლაინ იქნებით ცვლილებების ასატვირთად"
    }
  }
}
```

### Complete Offline Flow

```
┌────────────────────────────────────────┐
│ /planUpdate T1.1 done                       │
└─────────────────┬──────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────┐
│ 1. Update local PROJECT_PLAN.md        │
│    (Always succeeds)                    │
└─────────────────┬──────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────┐
│ 2. Check network connectivity           │
│    curl --connect-timeout 3 /health    │
└─────────────────┬──────────────────────┘
                  │
         ┌───────┴───────┐
         │               │
    ONLINE           OFFLINE
         │               │
         ▼               ▼
┌─────────────┐   ┌─────────────────────┐
│ 3a. Process │   │ 3b. Queue change    │
│ pending     │   │     for later sync  │
│ queue first │   │                     │
└──────┬──────┘   └──────────┬──────────┘
       │                     │
       ▼                     ▼
┌─────────────┐   ┌─────────────────────┐
│ 4a. Hybrid  │   │ 4b. Show "queued"   │
│ sync new    │   │     message         │
│ change      │   │                     │
└──────┬──────┘   └──────────┬──────────┘
       │                     │
       └──────────┬──────────┘
                  │
                  ▼
┌────────────────────────────────────────┐
│ 5. Show confirmation                    │
└────────────────────────────────────────┘
```

---

### Step 8: Auto-Sync to Cloud (REQUIRED CHECK)

**CRITICAL: Always execute this step after Step 7, even if you think auto-sync might be disabled.**

After successfully updating the local PROJECT_PLAN.md file, check if auto-sync should be triggered.

**Pseudo-code:**
```javascript
// Check if auto-sync conditions are met
const cloudConfig = config.cloud || {}
const isAuthenticated = !!cloudConfig.apiToken
const projectId = cloudConfig.projectId
const autoSync = cloudConfig.autoSync || false

if (isAuthenticated && projectId && autoSync) {
  // Trigger auto-sync
  syncTaskToCloud(taskId, newStatus, cloudConfig, t)
}
```

**Instructions for Claude:**

After Step 7 (showing confirmation), check if auto-sync should be triggered:

1. Read cloud config from loaded config:
   - `apiToken` - authentication token
   - `projectId` - linked cloud project ID
   - `autoSync` - boolean flag to enable auto-sync

2. If ALL three conditions are met:
   - User is authenticated (`apiToken` exists)
   - Project is linked (`projectId` exists)
   - Auto-sync is enabled (`autoSync === true`)

3. If conditions met, proceed to auto-sync the task update

---

### Step 8a: Sync Task Status to Cloud

Sync the specific task update to cloud using the PATCH /projects/:id/tasks/:taskId API.

**Pseudo-code:**
```javascript
async function syncTaskToCloud(taskId, newStatus, cloudConfig, t) {
  // Show syncing indicator
  console.log("")
  console.log("☁️ Auto-syncing to cloud...")

  // Make API request to update single task
  const response = makeRequest(
    "PATCH",
    `/projects/${cloudConfig.projectId}/tasks/${taskId}`,
    { status: newStatus },
    cloudConfig.apiToken
  )

  if (response.ok) {
    // Update lastSyncedAt in config
    updateLastSyncedAt(new Date().toISOString())

    // Show success (brief)
    console.log("☁️ ✅ Synced to cloud")
  } else {
    // Show error but don't fail the update
    console.log("☁️ ⚠️ Cloud sync failed (local update succeeded)")

    if (response.status === 401) {
      console.log("   Token may be expired. Run /pfLogin to re-authenticate.")
    } else if (response.status === 404) {
      console.log("   Task not found on cloud. Run /pfSyncPushPush to sync full plan.")
    } else {
      console.log("   Try /pfSyncPushPush later to manually sync.")
    }
  }
}
```

**Bash Implementation:**

```bash
API_URL="https://api.planflow.tools"
TOKEN="$API_TOKEN"
PROJECT_ID="$PROJECT_ID"
TASK_ID="T1.1"
NEW_STATUS="DONE"

# Make API request to update single task by taskId
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 10 \
  -X PATCH \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"status\": \"$NEW_STATUS\"}" \
  "${API_URL}/projects/${PROJECT_ID}/tasks/${TASK_ID}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "☁️ ✅ Synced to cloud"
else
  echo "☁️ ⚠️ Cloud sync failed (local update succeeded)"
fi
```

**Instructions for Claude:**

1. Show syncing indicator:
   ```
   ☁️ Auto-syncing to cloud...
   ```

2. Make API PATCH request to `/projects/{projectId}/tasks/{taskId}`:
   ```bash
   curl -s -w "\n%{http_code}" \
     --connect-timeout 5 \
     --max-time 10 \
     -X PATCH \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer {TOKEN}" \
     -d '{"status": "{STATUS}"}' \
     "https://api.planflow.tools/projects/{PROJECT_ID}/tasks/{TASK_ID}"
   ```

   Map task status to API format:
   - `start` action → `"IN_PROGRESS"`
   - `done` action → `"DONE"`
   - `block` action → `"BLOCKED"`

3. Handle response:
   - **Success (200)**: Show "☁️ ✅ Synced to cloud"
   - **Error**: Show warning but don't fail (local update already succeeded)

4. Update `lastSyncedAt` in local config on success

---

### Step 8b: Update Config After Sync

Save sync timestamp to config after successful cloud sync.

**Pseudo-code:**
```javascript
function updateLastSyncedAt(timestamp) {
  const localPath = "./.plan-config.json"

  let config = {}
  if (fileExists(localPath)) {
    config = JSON.parse(readFile(localPath))
  }

  if (!config.cloud) {
    config.cloud = {}
  }

  config.cloud.lastSyncedAt = timestamp

  writeFile(localPath, JSON.stringify(config, null, 2))
}
```

**Instructions for Claude:**

1. Read current `./.plan-config.json`
2. Update `cloud.lastSyncedAt` with current timestamp
3. Write back config file using Edit or Write tool

---

### Auto-Sync Output Examples

#### Example 1: Successful Auto-Sync

```
✅ Task T1.2 completed! 🎉

📊 Progress: 25% → 31% (+6%)

Overall Status:
Total: 18
✅ Done: 6
🔄 In Progress: 1
🚫 Blocked: 0
📋 Remaining: 11

🟩🟩🟩⬜⬜⬜⬜⬜⬜⬜ 31%

☁️ Auto-syncing to cloud...
☁️ ✅ Synced to cloud

🎯 Next: /planNext (get recommendation)
```

#### Example 2: Auto-Sync Disabled (No Output)

When `autoSync: false` or not set, no cloud sync message appears:

```
✅ Task T1.2 completed! 🎉

📊 Progress: 25% → 31% (+6%)

[... normal output ...]

🎯 Next: /planNext (get recommendation)
```

#### Example 3: Auto-Sync Failed (Graceful Degradation)

```
✅ Task T1.2 completed! 🎉

📊 Progress: 25% → 31% (+6%)

[... normal output ...]

☁️ Auto-syncing to cloud...
☁️ ⚠️ Cloud sync failed (local update succeeded)
   Token may be expired. Run /pfLogin to re-authenticate.

🎯 Next: /planNext (get recommendation)
```

#### Example 4: Not Authenticated (Silent Skip)

When user is not authenticated, auto-sync is silently skipped:

```
✅ Task T1.2 completed! 🎉

📊 Progress: 25% → 31% (+6%)

[... normal output ...]

🎯 Next: /planNext (get recommendation)
```

#### Example 5: Georgian Language with Auto-Sync

```
✅ ამოცანა T1.2 დასრულდა! 🎉

📊 პროგრესი: 25% → 31% (+6%)

[... Georgian output ...]

☁️ ავტო-სინქრონიზაცია ქლაუდთან...
☁️ ✅ სინქრონიზებულია ქლაუდთან

🎯 შემდეგი: /planNext (რეკომენდაციის მისაღებად)
```

---

### Auto-Sync Configuration

Users enable auto-sync via `/settings` or by editing config directly:

**Local config (`./.plan-config.json`):**
```json
{
  "language": "en",
  "cloud": {
    "projectId": "abc123",
    "autoSync": true,
    "lastSyncedAt": "2026-01-31T15:30:00Z"
  }
}
```

**Global config (`~/.config/claude/plan-plugin-config.json`):**
```json
{
  "language": "en",
  "cloud": {
    "apiToken": "pf_xxx...",
    "apiUrl": "https://api.planflow.tools",
    "autoSync": true
  }
}
```

**Notes:**
- `autoSync` defaults to `false` if not set
- Local config `projectId` takes precedence (project-specific)
- Global config typically stores `apiToken` (shared across projects)
- Local config stores `projectId` and `lastSyncedAt` (project-specific)
- Configs are MERGED: global provides base, local overrides/extends

---

### Error Handling for Auto-Sync

Auto-sync should NEVER fail the local update. It's a background enhancement.

**Principles:**
1. Local update always completes first
2. Cloud sync errors are warnings, not failures
3. Network timeouts are short (5s connect, 10s total)
4. Errors provide actionable hints
5. Uses PATCH endpoint for single task updates

**Error Scenarios:**

| Scenario | Behavior |
|----------|----------|
| Network timeout | Show warning, suggest `/pfSyncPushPush` later |
| 401 Unauthorized | Show warning, suggest `/pfLogin` |
| 404 Not Found | Show warning, suggest `/pfSyncPushPush` to sync full plan |
| 500 Server Error | Show warning, suggest retry later |
| Config missing | Silently skip (not authenticated/linked) |

---

### Translation Keys for Auto-Sync

Add these keys to `locales/en.json` and `locales/ka.json`:

```json
{
  "commands": {
    "update": {
      "autoSyncing": "☁️ Auto-syncing to cloud...",
      "autoSyncSuccess": "☁️ ✅ Synced to cloud",
      "autoSyncFailed": "☁️ ⚠️ Cloud sync failed (local update succeeded)",
      "autoSyncTokenExpired": "   Token may be expired. Run /pfLogin to re-authenticate.",
      "autoSyncTaskNotFound": "   Task not found on cloud. Run /pfSyncPushPush to sync full plan.",
      "autoSyncTryLater": "   Try /pfSyncPushPush later to manually sync."
    }
  }
}
```

**Georgian translations:**
```json
{
  "commands": {
    "update": {
      "autoSyncing": "☁️ ავტო-სინქრონიზაცია ქლაუდთან...",
      "autoSyncSuccess": "☁️ ✅ სინქრონიზებულია ქლაუდთან",
      "autoSyncFailed": "☁️ ⚠️ ქლაუდ სინქრონიზაცია ვერ მოხერხდა (ლოკალური განახლება წარმატებულია)",
      "autoSyncTokenExpired": "   ტოკენი შესაძლოა ვადაგასულია. გაუშვით /pfLogin ხელახლა ავთენტიფიკაციისთვის.",
      "autoSyncTaskNotFound": "   ამოცანა ვერ მოიძებნა ქლაუდში. გაუშვით /pfSyncPushPush სრული გეგმის სინქრონიზაციისთვის.",
      "autoSyncTryLater": "   სცადეთ /pfSyncPushPush მოგვიანებით ხელით სინქრონიზაციისთვის."
    }
  }
}
```

**Instructions for Claude:**

Use the appropriate translation key when displaying auto-sync messages:
- `t.commands.update.autoSyncing` - Starting sync message
- `t.commands.update.autoSyncSuccess` - Success message
- `t.commands.update.autoSyncFailed` - Failure warning
- `t.commands.update.autoSyncTokenExpired` - Token hint
- `t.commands.update.autoSyncTaskNotFound` - Task not found hint
- `t.commands.update.autoSyncTryLater` - Manual sync hint

---

### Testing Auto-Sync

```bash
# Test 1: Auto-sync disabled (default)
# Config has autoSync: false or missing
/planUpdate T1.1 done
# Should NOT show any cloud sync messages

# Test 2: Auto-sync enabled - success
# Config has: autoSync: true, apiToken, projectId
/planUpdate T1.1 done
# Should show "☁️ Auto-syncing..." then "☁️ ✅ Synced"

# Test 3: Auto-sync enabled - not authenticated
# Config has: autoSync: true, NO apiToken
/planUpdate T1.1 done
# Should silently skip auto-sync (no messages)

# Test 4: Auto-sync enabled - not linked
# Config has: autoSync: true, apiToken, NO projectId
/planUpdate T1.1 done
# Should silently skip auto-sync (no messages)

# Test 5: Auto-sync enabled - network error
# Config has: autoSync: true, apiToken, projectId
# But API is unreachable
/planUpdate T1.1 done
# Should show "☁️ ⚠️ Cloud sync failed..."
# Local update should still succeed

# Test 6: Auto-sync enabled - token expired
# Config has: autoSync: true, INVALID apiToken, projectId
/planUpdate T1.1 done
# Should show "☁️ ⚠️ Cloud sync failed..."
# With hint about /pfLogin
```
