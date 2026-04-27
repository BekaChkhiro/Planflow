---
name: pfSyncPush
description: Push local PROJECT_PLAN.md to PlanFlow cloud
---

# PlanFlow Sync Push

Push local PROJECT_PLAN.md to PlanFlow cloud with progress animation.

## Usage

```bash
/pfSyncPush                 # Push local → cloud
/pfSyncPush --force         # Overwrite cloud without confirmation
```

## Step 0: Load Configuration

```javascript
function getConfig() {
  const localConfigPath = "./.plan-config.json"
  let localConfig = {}
  if (fileExists(localConfigPath)) {
    try { localConfig = JSON.parse(readFile(localConfigPath)) } catch {}
  }

  const globalConfigPath = expandPath("~/.config/claude/plan-plugin-config.json")
  let globalConfig = {}
  if (fileExists(globalConfigPath)) {
    try { globalConfig = JSON.parse(readFile(globalConfigPath)) } catch {}
  }

  return { ...globalConfig, ...localConfig }
}

const config = getConfig()
const language = config.language || "en"
const cloudConfig = config.cloud || {}
const isAuthenticated = !!cloudConfig.apiToken
const projectId = cloudConfig.projectId
const apiUrl = cloudConfig.apiUrl || "https://api.planflow.tools"

const t = JSON.parse(readFile(`../locales/${language}.json`))
```

## Step 1: Parse Arguments

```javascript
const args = commandArgs.trim().split(/\s+/)
const forceFlag = args.includes("--force")
```

## Step 2: Validate Prerequisites

**Not authenticated card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.sync.notAuthenticated}                                          │
│                                                                              │
│  You must be logged in to push to cloud.                                     │
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /pfLogin               Sign in to PlanFlow                             │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Not linked card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.sync.notLinked}                                                 │
│                                                                              │
│  This project is not linked to any cloud project.                            │
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /pfCloudLink           Link to a cloud project                         │
│     • /pfCloudNew            Create a new cloud project                      │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 3: Push to Cloud

**IMPORTANT: Follow these steps exactly!**

1. Read PROJECT_PLAN.md using the Read tool
2. Create JSON payload using Bash with jq
3. Make API call and parse response
4. Show task count from response
5. Update lastSyncedAt in config

**Loading Card (during push):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ☁️  Push to Cloud                                                           │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ⠹ {t.ui.labels.uploading}                                                   │
│                                                                              │
│  Progress: ████████████████████░░░░░░░░░░ 66%                                │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Step 3a: Create JSON payload**
```bash
cat PROJECT_PLAN.md > /tmp/plan_content.txt
jq -n --rawfile plan /tmp/plan_content.txt '{"plan": $plan}' > /tmp/payload.json
```

**Step 3b: Make API call**
```bash
RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {TOKEN}" \
  -d @/tmp/payload.json \
  "https://api.planflow.tools/projects/{PROJECT_ID}/plan")

# Separate body and status code
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Status: $HTTP_CODE"
echo "Response: $BODY"
```

**Step 3c: Parse response - CRITICAL!**

**IMPORTANT**: You MUST parse the JSON response to extract and display the task count!

The API returns:
```json
{
  "success": true,
  "data": {
    "projectId": "uuid",
    "projectName": "My Project",
    "tasksCount": 15,
    "completedCount": 3,
    "progress": 20
  }
}
```

**Use jq or manual parsing to extract values:**
```bash
# Extract values from response
TASKS_COUNT=$(echo "$BODY" | jq -r '.data.tasksCount')
COMPLETED_COUNT=$(echo "$BODY" | jq -r '.data.completedCount')
PROGRESS=$(echo "$BODY" | jq -r '.data.progress')
PROJECT_NAME=$(echo "$BODY" | jq -r '.data.projectName')

echo "Tasks: $TASKS_COUNT, Completed: $COMPLETED_COUNT, Progress: $PROGRESS%"
```

## Step 4: Show Success Card

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.sync.pushSuccess}                                               │
│                                                                              │
│  ── Sync Details ────────────────────────────────────────────────────────    │
│                                                                              │
│  📁 Project:      {projectName}                                              │
│  📊 Tasks synced: {tasksCount}                                               │
│  ✅ Completed:    {completedCount}                                           │
│                                                                              │
│  Progress: ████████████████████░░░░░░░░░░ {progress}%                        │
│                                                                              │
│  ╭─────────────────╮                                                         │
│  │ ✓ Synced        │  at {timestamp}                                         │
│  ╰─────────────────╯                                                         │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /pfSyncStatus          View sync status                                │
│     • /planNext              Get next task recommendation                    │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**If tasksCount is 0 or null, run automatic format validation (Step 3d):**

## Step 3d: Automatic Format Validation (if tasksCount is 0)

**CRITICAL: If no tasks were parsed, automatically validate and fix the format!**

When tasksCount is 0, you MUST:

1. **Read PROJECT_PLAN.md and scan for potential tasks**
2. **Check for common format issues**
3. **Offer to auto-fix if fixable**

### Format Detection Logic

```javascript
// Read the plan content
const planContent = readFile("PROJECT_PLAN.md")

// Check for tasks in various formats
const validHeaderFormat = /^#{2,4}\s*\*{0,2}T\d+[A-Za-z]?\.\d+\*{0,2}[:\s]+.+/gm
const validTableFormat = /\|\s*T\d+[A-Za-z]?\.\d+\s*\|/g

// Check for INVALID formats (common mistakes)
const wrongFormat1 = /^[-*]\s*T\d+[A-Za-z]?\.\d+[:\s]+.+/gm  // Bullet list format
const wrongFormat2 = /^\d+\.\s*T\d+[A-Za-z]?\.\d+[:\s]+.+/gm // Numbered list format
const wrongFormat3 = /^T\d+[A-Za-z]?\.\d+[:\s]+.+/gm         // No header prefix

const validTasks = (planContent.match(validHeaderFormat) || []).length +
                   (planContent.match(validTableFormat) || []).length
const invalidTasks = (planContent.match(wrongFormat1) || []).length +
                     (planContent.match(wrongFormat2) || []).length +
                     (planContent.match(wrongFormat3) || []).length

if (invalidTasks > 0 && validTasks === 0) {
  // Tasks exist but in wrong format - offer to fix
  showFormatFixCard()
} else if (validTasks === 0 && invalidTasks === 0) {
  // No tasks at all
  showNoTasksCard()
}
```

### If wrong format detected, show fix offer card:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚠️  FORMAT ISSUE DETECTED                                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Found {invalidTasks} tasks in incorrect format.                             │
│                                                                              │
│  ── Current Format (incorrect) ─────────────────────────────────────────     │
│                                                                              │
│  - T1.1: Task Name           ❌ Bullet list not supported                    │
│  1. T1.2: Another Task       ❌ Numbered list not supported                  │
│  T1.3: Direct task           ❌ Missing header prefix                        │
│                                                                              │
│  ── Required Format ────────────────────────────────────────────────────     │
│                                                                              │
│  #### T1.1: Task Name        ✅ Header format                                │
│  - [ ] **Status**: TODO                                                      │
│  - **Complexity**: Low                                                       │
│  - **Dependencies**: None                                                    │
│                                                                              │
│  OR table format:                                                            │
│  | ID    | Task      | Complexity | Status | Dependencies |                 │
│  |-------|-----------|------------|--------|--------------|                 │
│  | T1.1  | Task Name | Low        | TODO   | -            |                 │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  🔧 Would you like me to auto-fix the format?                                │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Use AskUserQuestion:**
```javascript
AskUserQuestion({
  questions: [{
    question: "Would you like me to convert tasks to the correct format?",
    header: "Fix Format",
    multiSelect: false,
    options: [
      {
        label: "Yes, auto-fix (Recommended)",
        description: "Convert all tasks to header format and re-sync"
      },
      {
        label: "No, I'll fix manually",
        description: "Keep current format, sync without tasks"
      }
    ]
  }]
})
```

### If user chooses auto-fix:

**Convert tasks to correct format:**

```javascript
// Find all tasks in wrong format and convert
let fixedContent = planContent

// Convert bullet format: "- T1.1: Task" → "#### T1.1: Task\n- [ ] **Status**: TODO\n- **Complexity**: Medium\n- **Dependencies**: None"
fixedContent = fixedContent.replace(
  /^[-*]\s*(T\d+[A-Za-z]?\.\d+)[:\s]+(.+)$/gm,
  (match, taskId, taskName) => {
    return `#### ${taskId}: ${taskName}
- [ ] **Status**: TODO
- **Complexity**: Medium
- **Dependencies**: None`
  }
)

// Convert numbered format: "1. T1.1: Task" → header format
fixedContent = fixedContent.replace(
  /^\d+\.\s*(T\d+[A-Za-z]?\.\d+)[:\s]+(.+)$/gm,
  (match, taskId, taskName) => {
    return `#### ${taskId}: ${taskName}
- [ ] **Status**: TODO
- **Complexity**: Medium
- **Dependencies**: None`
  }
)

// Convert plain format: "T1.1: Task" → header format
fixedContent = fixedContent.replace(
  /^(T\d+[A-Za-z]?\.\d+)[:\s]+(.+)$/gm,
  (match, taskId, taskName) => {
    return `#### ${taskId}: ${taskName}
- [ ] **Status**: TODO
- **Complexity**: Medium
- **Dependencies**: None`
  }
)

// Write fixed content
writeFile("PROJECT_PLAN.md", fixedContent)
```

**After fixing, re-push automatically:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🔧 FORMAT FIXED                                                             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Converted {fixedCount} tasks to correct format.                             │
│                                                                              │
│  Re-syncing to cloud...                                                      │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

Then repeat Step 3b (API call) with the fixed content.

### If no tasks found at all:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚠️  NO TASKS FOUND                                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  The plan was synced but no tasks were detected.                             │
│                                                                              │
│  Your plan may be missing the Tasks section.                                 │
│                                                                              │
│  ── Expected Task Format ───────────────────────────────────────────────     │
│                                                                              │
│  ## Tasks & Implementation Plan                                              │
│                                                                              │
│  ### Phase 1: Foundation                                                     │
│                                                                              │
│  #### T1.1: Setup Project                                                    │
│  - [ ] **Status**: TODO                                                      │
│  - **Complexity**: Low                                                       │
│  - **Dependencies**: None                                                    │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /planNew               Create a new plan with tasks                    │
│     • Manually add tasks in the format shown above                           │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 5: Update Local Config

After successful sync, update `.plan-config.json` with the sync timestamp:

```javascript
// Read current config
const configPath = "./.plan-config.json"
let config = {}
if (fileExists(configPath)) {
  config = JSON.parse(readFile(configPath))
}

// Update lastSyncedAt
if (!config.cloud) config.cloud = {}
config.cloud.lastSyncedAt = new Date().toISOString()

// Write back
writeFile(configPath, JSON.stringify(config, null, 2))
```

## Error Handling

**No PROJECT_PLAN.md card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.sync.noPlan}                                                    │
│                                                                              │
│  No PROJECT_PLAN.md found in current directory.                              │
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /planNew               Create a new plan first                         │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**HTTP 401 - Unauthorized card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Authentication failed. Your token may have expired.                         │
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /pfLogin               Re-authenticate                                 │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**HTTP 404 - Project not found card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Project not found on cloud.                                                 │
│                                                                              │
│  The linked project may have been deleted.                                   │
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /pfCloudLink           Link to a different project                     │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Network Error card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Network error. Could not connect to PlanFlow API.                           │
│                                                                              │
│  Please check your internet connection and try again.                        │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```
