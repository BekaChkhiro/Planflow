---
name: pfAssign
description: Assign a task to a team member in the current PlanFlow project
---

# PlanFlow Task Assignment

Assign a task to a team member or yourself in the linked cloud project.

## Usage

```bash
/pfAssign <task-id> <email|me>        # Assign task to team member or self
/pfAssign T2.1 jane@company.com       # Assign to specific member
/pfAssign T2.1 me                     # Assign to yourself
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
const currentUserEmail = cloudConfig.userEmail || null

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

### Step 1: Show Usage Card (if no arguments)

If no arguments provided, display usage information.

**Output:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  📋 Task Assignment                                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── Usage ───────────────────────────────────────────────────────────────    │
│                                                                              │
│  /pfAssign <task-id> <email>    Assign to team member by email               │
│  /pfAssign <task-id> me         Assign to yourself                           │
│                                                                              │
│  ── Examples ────────────────────────────────────────────────────────────    │
│                                                                              │
│  /pfAssign T2.1 jane@company.com                                             │
│  /pfAssign T2.1 me                                                           │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Instructions for Claude:**

Use translation keys:
- `t.commands.assign.title`
- `t.commands.assign.usage`
- `t.commands.assign.usageEmail`
- `t.commands.assign.usageMe`
- `t.commands.assign.example`

---

### Step 2: Check Prerequisites

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
│  💡 Run /pfCloudLink first to link a project.                                │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

---

### Step 3: Parse and Validate Arguments

Parse the task ID and assignee from arguments.

**Pseudo-code:**
```javascript
// Parse arguments: /pfAssign T2.1 jane@company.com
const args = parseArguments(input)  // ["T2.1", "jane@company.com"]
const taskId = args[0]              // "T2.1"
const assigneeArg = args[1]         // "jane@company.com" or "me"

// Validate task ID format (T followed by numbers and dots)
const taskIdRegex = /^T\d+\.\d+$/i
if (!taskId || !taskIdRegex.test(taskId)) {
  showError(t.commands.assign.invalidTaskId)
  showHint(t.commands.assign.taskIdExample)
  return
}

// Normalize task ID to uppercase
const normalizedTaskId = taskId.toUpperCase()

// Check assignee argument
if (!assigneeArg) {
  showError("Missing assignee. Provide an email or 'me'.")
  return
}

// Determine assignee email
let assigneeEmail
if (assigneeArg.toLowerCase() === "me") {
  assigneeEmail = currentUserEmail
  isSelfAssignment = true
} else {
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(assigneeArg)) {
    showError(t.commands.assign.invalidEmail)
    showHint(t.commands.assign.emailExample)
    return
  }
  assigneeEmail = assigneeArg.toLowerCase()
  isSelfAssignment = (assigneeEmail === currentUserEmail)
}
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

**Invalid Email Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Invalid email format.                                                       │
│                                                                              │
│  Example: jane@company.com or use 'me'                                       │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

---

### Step 4: Make API Request to Assign Task

Call the PlanFlow API to assign the task.

**API Endpoint:**
```
POST /projects/{projectId}/tasks/{taskId}/assign
```

**Request Body:**
```json
{
  "email": "jane@company.com"
}
```

**Bash Implementation:**

```bash
API_URL="https://api.planflow.tools"
TOKEN="$API_TOKEN"
PROJECT_ID="$PROJECT_ID"
TASK_ID="T2.1"
ASSIGNEE_EMAIL="jane@company.com"

RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 10 \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"email\": \"$ASSIGNEE_EMAIL\"}" \
  "${API_URL}/projects/${PROJECT_ID}/tasks/${TASK_ID}/assign")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Code: $HTTP_CODE"
echo "Body: $BODY"
```

**Instructions for Claude:**

1. Make POST request to `/projects/{projectId}/tasks/{taskId}/assign`
2. Include `{"email": "{assigneeEmail}"}` in body
3. Parse response to get task and assignee details

---

### Step 5: Handle Response

Process the API response and display appropriate card.

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "task": {
      "taskId": "T2.1",
      "name": "Implement login API",
      "status": "TODO",
      "assignee": {
        "id": "uuid",
        "email": "jane@company.com",
        "name": "Jane Smith"
      }
    },
    "project": {
      "id": "uuid",
      "name": "Planflow Plugin"
    }
  }
}
```

**Pseudo-code for Response Handling:**
```javascript
if (httpCode >= 200 && httpCode < 300) {
  const data = JSON.parse(body).data
  const task = data.task
  const project = data.project
  const assignee = task.assignee

  if (isSelfAssignment) {
    showSelfAssignmentSuccessCard(task, project, currentUserEmail)
  } else {
    showAssignmentSuccessCard(task, project, assignee)
  }
} else if (httpCode === 404) {
  // Task not found
  showTaskNotFoundCard(taskId)
} else if (httpCode === 409) {
  // Task already assigned or user not a member
  const error = JSON.parse(body).error
  if (error.code === "ALREADY_ASSIGNED") {
    showAlreadyAssignedCard(taskId, error.currentAssignee)
  } else if (error.code === "USER_NOT_MEMBER") {
    showUserNotMemberCard(assigneeEmail)
  }
} else if (httpCode === 403) {
  // Permission denied
  showPermissionDeniedCard()
} else {
  // Other error
  showGenericErrorCard()
}
```

---

### Step 6: Display Success Card

**Assignment Success Card (to other team member):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Task assigned!                                                              │
│                                                                              │
│  ── Assignment Details ──────────────────────────────────────────────────    │
│                                                                              │
│  📋 Task:        T2.1: Implement login API                                   │
│  👤 Assigned to: Jane Smith (jane@company.com)                               │
│  📁 Project:     Planflow Plugin                                             │
│                                                                              │
│  ╭───────────────────╮                                                       │
│  │ ✓ Assigned        │                                                       │
│  ╰───────────────────╯                                                       │
│                                                                              │
│  They'll be notified of this assignment.                                     │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Commands:                                                                │
│     • /pfUnassign T2.1         Remove assignment                             │
│     • /pfWorkload              View team workload                            │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Self-Assignment Success Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Task assigned to you!                                                       │
│                                                                              │
│  ── Assignment Details ──────────────────────────────────────────────────    │
│                                                                              │
│  📋 Task:        T2.1: Implement login API                                   │
│  👤 Assigned to: You (john@company.com)                                      │
│  📁 Project:     Planflow Plugin                                             │
│                                                                              │
│  ╭───────────────────╮                                                       │
│  │ ✓ Assigned        │                                                       │
│  ╰───────────────────╯                                                       │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Ready to start working?                                                  │
│     • /planUpdate T2.1 start                                                 │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Instructions for Claude:**

Use translation keys:
- `t.commands.assign.success` - "Task assigned!"
- `t.commands.assign.task` - "Task:"
- `t.commands.assign.assignedTo` - "Assigned to:"
- `t.commands.assign.project` - "Project:"
- `t.commands.assign.notifyHint` - "They'll be notified of this assignment."
- `t.commands.assign.selfAssignHint` - "Ready to start working? Run:"

---

## Error Handling

### Task Not Found Card (404)

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

**Translation keys:**
- `t.commands.assign.taskNotFound`
- `t.commands.assign.checkTaskId`

---

### User Not Team Member Card (409 - USER_NOT_MEMBER)

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  User is not a team member.                                                  │
│                                                                              │
│  jane@company.com is not part of this project.                               │
│                                                                              │
│  💡 Invite them first:                                                       │
│     • /pfTeamInvite jane@company.com                                         │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Translation keys:**
- `t.commands.assign.userNotMember`
- `t.commands.assign.notMemberHint`
- `t.commands.assign.inviteFirst`

---

### Task Already Assigned Card (409 - ALREADY_ASSIGNED)

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚠️  WARNING                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Task is already assigned.                                                   │
│                                                                              │
│  T2.1 is currently assigned to Bob Wilson (bob@company.com)                  │
│                                                                              │
│  💡 To reassign:                                                             │
│     • /pfUnassign T2.1                                                       │
│     • /pfAssign T2.1 jane@company.com                                        │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Translation keys:**
- `t.commands.assign.alreadyAssigned`
- `t.commands.assign.reassignHint`

---

### Permission Denied Card (403)

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  You don't have permission to assign tasks.                                  │
│                                                                              │
│  Only editors and above can assign tasks.                                    │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Translation keys:**
- `t.commands.assign.noPermission`
- `t.commands.assign.noPermissionHint`

---

### Network Error Card

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Could not connect to PlanFlow.                                              │
│                                                                              │
│  Please check your connection and try again.                                 │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Translation keys:**
- `t.commands.assign.tryAgain`

---

## Complete Flow Diagram

```
/pfAssign T2.1 jane@company.com
    │
    ▼
┌─────────────────────────────────────┐
│ Step 0: Load config & translations  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ Step 1: Check if args provided      │
│         No args → Show usage card   │
└──────────────┬──────────────────────┘
               │ Has args
               ▼
┌─────────────────────────────────────┐
│ Step 2: Check prerequisites         │
│         - Authenticated?            │
│         - Project linked?           │
└──────────────┬──────────────────────┘
               │ Yes
               ▼
┌─────────────────────────────────────┐
│ Step 3: Validate arguments          │
│         - Task ID format            │
│         - Email format or "me"      │
└──────────────┬──────────────────────┘
               │ Valid
               ▼
┌─────────────────────────────────────┐
│ Step 4: Make API request            │
│         POST /tasks/{id}/assign     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ Step 5: Handle response             │
│         - 200 → Success card        │
│         - 404 → Task not found      │
│         - 409 → Already assigned    │
│         - 403 → Permission denied   │
└─────────────────────────────────────┘
```

---

## Georgian Translations Reference

For Georgian output, use keys from `locales/ka.json`:

```
📋 ამოცანის მინიჭება

გამოყენება:
/pfAssign <task-id> <email>    მინიჭება გუნდის წევრზე ელფოსტით
/pfAssign <task-id> me         მინიჭება საკუთარ თავზე

მაგალითები:
/pfAssign T2.1 jane@company.com
/pfAssign T2.1 me
```

---

## Success Criteria

A successful implementation should:
- ✅ Load merged config (global + local)
- ✅ Load appropriate language translations
- ✅ Show usage card when no arguments
- ✅ Validate authentication and project link
- ✅ Validate task ID format (T1.1, T2.3, etc.)
- ✅ Validate email format or accept "me"
- ✅ Handle "me" → current user's email
- ✅ Make POST request to assign endpoint
- ✅ Show success card with task and assignee details
- ✅ Show different card for self-assignment
- ✅ Handle all error cases with appropriate cards
- ✅ Use translation keys for all user-facing text
