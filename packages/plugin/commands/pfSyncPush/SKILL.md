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

const t = JSON.parse(readFile(`locales/${language}.json`))
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

**If tasksCount is 0 or null, show warning card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚠️  WARNING                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  No tasks were parsed from the plan.                                         │
│                                                                              │
│  This could mean:                                                            │
│  • The plan format is not recognized                                         │
│  • Tasks should use format: #### T1.1: Task Name                             │
│  • Or table format: | T1.1 | Task Name | Low | TODO | - |                    │
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /planNext              Verify your plan format                         │
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
