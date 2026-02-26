---
name: pfGithubIssue
description: Create a GitHub Issue from a PlanFlow task
---

# PlanFlow GitHub Issue

Create a GitHub Issue from a task ID. The issue title, body, and labels are automatically generated from task details.

## Usage

```bash
/pfGithubIssue T2.1              # Create GitHub issue from task
/pfGithubIssue T2.1 --open       # Create and open in browser (default)
/pfGithubIssue T2.1 --no-open    # Create without opening browser
```

## Step 0: Load Configuration

```javascript
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
const apiUrl = cloudConfig.apiUrl || "https://api.planflow.tools"
const projectId = cloudConfig.projectId || null
const githubConfig = localConfig.github || {}

const t = JSON.parse(readFile(`locales/${language}.json`))
```

## Step 0.5: Show Notification Badge

Only if authenticated AND linked to a project:

```bash
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

## Step 1: Parse Arguments

```javascript
const args = commandArgs.trim()
const taskIdPattern = /^T\d+\.\d+$/i

// Parse task ID and flags
const parts = args.split(/\s+/)
const taskId = parts[0]
const flags = parts.slice(1)

const noOpen = flags.includes("--no-open")
const shouldOpen = !noOpen  // Default is to open in browser

if (!taskId || !taskIdPattern.test(taskId)) {
  showUsageError()
}
```

**Usage error output:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.github.issue.invalidTaskId}                                              │
│                                                                              │
│  Invalid or missing task ID.                                                 │
│                                                                              │
│  Usage: /pfGithubIssue <task-id>                                             │
│                                                                              │
│  Examples:                                                                   │
│     • /pfGithubIssue T2.1                                                    │
│     • /pfGithubIssue T2.1 --no-open                                          │
│                                                                              │
│  Task ID should be like: T1.1, T2.3, T10.5                                   │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 2: Validate Prerequisites

### 2a: Check Authentication

If not authenticated:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.sync.notAuthenticated}                                          │
│                                                                              │
│  You must be logged in to create GitHub issues.                              │
│                                                                              │
│  💡 Next Steps:                                                              │
│     • /pfLogin               Sign in to PlanFlow                             │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### 2b: Check Project Link

If not linked to a cloud project:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.sync.notLinked}                                                 │
│                                                                              │
│  You must link to a cloud project first.                                     │
│                                                                              │
│  💡 Next Steps:                                                              │
│     • /pfCloudLink           Link to existing project                        │
│     • /pfCloudNew            Create new cloud project                        │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### 2c: Check GitHub Integration

If no GitHub repository is linked:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.github.notLinked}                                               │
│                                                                              │
│  No GitHub repository is linked to this project.                             │
│                                                                              │
│  💡 To link a repository:                                                    │
│     • /pfGithubLink owner/repo                                               │
│                                                                              │
│  Example:                                                                    │
│     • /pfGithubLink microsoft/vscode                                         │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 3: Fetch Task Details

### 3a: Try Cloud API First

```bash
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 10 \
  -X GET \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "${API_URL}/projects/${PROJECT_ID}/tasks/${TASK_ID}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
  TASK_TITLE=$(echo "$BODY" | jq -r '.data.task.name // .data.name // empty')
  TASK_DESCRIPTION=$(echo "$BODY" | jq -r '.data.task.description // .data.description // empty')
  TASK_STATUS=$(echo "$BODY" | jq -r '.data.task.status // .data.status // empty')
  TASK_COMPLEXITY=$(echo "$BODY" | jq -r '.data.task.complexity // .data.complexity // empty')
fi
```

### 3b: Fallback to Local PROJECT_PLAN.md

If cloud API fails or task not found, parse from local file:

```bash
# Extract task details from PROJECT_PLAN.md
# Try table format first: | T1.1 | Task Title | Complexity | Status | Dependencies |
TASK_LINE=$(grep -E "^\|\s*${TASK_ID}\s*\|" PROJECT_PLAN.md | head -1)

if [ -n "$TASK_LINE" ]; then
  TASK_TITLE=$(echo "$TASK_LINE" | cut -d'|' -f3 | sed 's/^\s*//' | sed 's/\s*$//')
  TASK_COMPLEXITY=$(echo "$TASK_LINE" | cut -d'|' -f4 | sed 's/^\s*//' | sed 's/\s*$//')
  TASK_STATUS=$(echo "$TASK_LINE" | cut -d'|' -f5 | sed 's/^\s*//' | sed 's/\s*$//')
else
  # Try markdown heading format: #### **T1.1**: Task Title
  TASK_LINE=$(grep -E "^\s*####\s*\*\*${TASK_ID}\*\*:" PROJECT_PLAN.md | head -1)
  if [ -n "$TASK_LINE" ]; then
    TASK_TITLE=$(echo "$TASK_LINE" | sed 's/.*\*\*:\s*//' | sed 's/\s*$//')
  fi
fi

if [ -z "$TASK_TITLE" ]; then
  echo "❌ Task not found: $TASK_ID"
  exit 1
fi
```

## Step 4: Check if Issue Already Exists

### 4a: Query Existing Issues

```bash
# Check if an issue already exists for this task
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 10 \
  -X GET \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "${API_URL}/projects/${PROJECT_ID}/tasks/${TASK_ID}/github-issue")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
  EXISTING_ISSUE_NUMBER=$(echo "$BODY" | jq -r '.data.issueNumber // empty')
  EXISTING_ISSUE_URL=$(echo "$BODY" | jq -r '.data.issueUrl // empty')

  if [ -n "$EXISTING_ISSUE_NUMBER" ]; then
    # Issue already exists
    showExistingIssue
  fi
fi
```

### 4b: Show Existing Issue Warning

If an issue already exists:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚠️  Issue Already Exists                                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.github.issue.alreadyExists}                                              │
│                                                                              │
│  ── Existing Issue ────────────────────────────────────────────────────────  │
│                                                                              │
│  📝 Task:     T2.1 - Implement login API                                     │
│  🐙 Issue:    #42                                                            │
│  🔗 URL:      https://github.com/owner/repo/issues/42                        │
│  📊 State:    open                                                           │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Options:                                                                 │
│     • View the existing issue in browser                                     │
│     • Close the existing issue first to create a new one                     │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 5: Create GitHub Issue

### 5a: Build Issue Body

```javascript
function buildIssueBody(task) {
  const body = `## Task Details

**Task ID:** ${task.id}
**Complexity:** ${task.complexity || 'Not specified'}
**Status:** ${task.status || 'TODO'}

## Description

${task.description || 'No description provided.'}

## Dependencies

${task.dependencies && task.dependencies.length > 0
  ? task.dependencies.map(d => `- ${d}`).join('\n')
  : 'None'}

---

*This issue was created from [PlanFlow](https://planflow.tools) task ${task.id}.*
*Closes ${task.id} when merged.*
`
  return body
}
```

### 5b: Determine Labels

```javascript
function getLabels(task) {
  const labels = []

  // Add complexity label
  if (task.complexity) {
    const complexity = task.complexity.toLowerCase()
    if (complexity === 'low') labels.push('easy')
    else if (complexity === 'medium') labels.push('medium')
    else if (complexity === 'high') labels.push('hard')
  }

  // Add status label
  if (task.status === 'TODO') labels.push('todo')
  else if (task.status === 'IN_PROGRESS') labels.push('in-progress')
  else if (task.status === 'BLOCKED') labels.push('blocked')

  return labels
}
```

### 5c: Create Issue via API

```bash
# Build request body
ISSUE_TITLE="[$TASK_ID] $TASK_TITLE"
ISSUE_BODY=$(cat <<EOF
## Task Details

**Task ID:** $TASK_ID
**Complexity:** $TASK_COMPLEXITY
**Status:** $TASK_STATUS

## Description

${TASK_DESCRIPTION:-No description provided.}

---

*This issue was created from [PlanFlow](https://planflow.tools) task $TASK_ID.*
*Closes $TASK_ID when merged.*
EOF
)

# Create issue
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 15 \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "$(jq -n \
    --arg title "$ISSUE_TITLE" \
    --arg body "$ISSUE_BODY" \
    --arg taskId "$TASK_ID" \
    '{title: $title, body: $body, taskId: $taskId}')" \
  "${API_URL}/projects/${PROJECT_ID}/integrations/github/issues")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
```

### 5d: Handle Response

**Success (201):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.github.issue.created}                                                    │
│                                                                              │
│  ── Issue Created ──────────────────────────────────────────────────────     │
│                                                                              │
│  📝 Task:     T2.1 - Implement login API                                     │
│  🐙 Issue:    #42                                                            │
│  🔗 URL:      https://github.com/owner/repo/issues/42                        │
│  📊 State:    open                                                           │
│                                                                              │
│  ╭────────────────────────────────────────────────────────────────────────╮  │
│  │ ✓ Issue linked to task T2.1                                            │  │
│  ╰────────────────────────────────────────────────────────────────────────╯  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 What's Next?                                                             │
│                                                                              │
│  Create a branch to work on this issue:                                      │
│     • /pfGithubBranch T2.1                                                   │
│                                                                              │
│  When done, create a pull request:                                           │
│     • /pfGithubPr T2.1                                                       │
│                                                                              │
│  💡 Tip: Include "Closes #42" in your PR description                         │
│     to auto-close the issue when merged!                                     │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**GitHub Not Linked (400):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.github.notLinked}                                               │
│                                                                              │
│  No GitHub repository is linked to this project.                             │
│                                                                              │
│  💡 To link a repository:                                                    │
│     • /pfGithubLink owner/repo                                               │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Task Not Found (404):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.github.issue.taskNotFound}                                               │
│                                                                              │
│  Task not found: T99.1                                                       │
│                                                                              │
│  Make sure the task exists in your PROJECT_PLAN.md or cloud project.         │
│                                                                              │
│  💡 Try:                                                                     │
│     • /pfSyncPush   Sync your local tasks to cloud                           │
│     • Check PROJECT_PLAN.md for valid task IDs                               │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**GitHub API Error (502/503):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.github.issue.githubError}                                                │
│                                                                              │
│  GitHub API error. Could not create the issue.                               │
│                                                                              │
│  Possible reasons:                                                           │
│  • GitHub API rate limit exceeded                                            │
│  • GitHub integration token expired                                          │
│  • Repository permissions issue                                              │
│                                                                              │
│  💡 Try again in a few moments, or check:                                    │
│     • /pfGithubLink   Verify GitHub integration status                       │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 6: Open Issue in Browser (Optional)

If `--no-open` flag is not set and issue was created successfully:

```bash
# Open in default browser
if [ "$SHOULD_OPEN" = "true" ] && [ -n "$ISSUE_URL" ]; then
  # macOS
  if command -v open &> /dev/null; then
    open "$ISSUE_URL"
  # Linux
  elif command -v xdg-open &> /dev/null; then
    xdg-open "$ISSUE_URL"
  # Windows (WSL)
  elif command -v wslview &> /dev/null; then
    wslview "$ISSUE_URL"
  fi
fi
```

## Error Handling

### Network Error

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Network error. Could not connect to PlanFlow API.                           │
│                                                                              │
│  Please check your internet connection and try again.                        │
│                                                                              │
│  💡 To retry:                                                                │
│     • /pfGithubIssue T2.1                                                    │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### Token Expired (401)

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Authentication failed. Your session may have expired.                       │
│                                                                              │
│  💡 To re-authenticate:                                                      │
│     • /pfLogin                                                               │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### Permission Denied (403)

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Permission denied. You don't have access to create issues.                  │
│                                                                              │
│  To create GitHub issues, you need:                                          │
│  • Editor role or higher in the PlanFlow project                             │
│  • Write access to the linked GitHub repository                              │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Translation Keys

Add to `locales/en.json` and `locales/ka.json`:

```json
{
  "github": {
    "issue": {
      "title": "Create GitHub Issue",
      "created": "GitHub issue created successfully!",
      "alreadyExists": "An issue already exists for this task.",
      "taskNotFound": "Task not found.",
      "invalidTaskId": "Invalid task ID format.",
      "githubError": "GitHub API error.",
      "permissionDenied": "Permission denied.",
      "notLinked": "No GitHub repository linked.",
      "usage": "Usage: /pfGithubIssue <task-id>",
      "example": "Example: /pfGithubIssue T2.1",
      "task": "Task:",
      "issue": "Issue:",
      "url": "URL:",
      "state": "State:",
      "linked": "Issue linked to task",
      "whatsNext": "What's Next?",
      "createBranch": "Create a branch to work on this issue:",
      "createPr": "When done, create a pull request:",
      "autoCloseTip": "Include \"Closes #{issue}\" in your PR description to auto-close the issue!"
    }
  }
}
```

**Georgian translations:**

```json
{
  "github": {
    "issue": {
      "title": "GitHub Issue-ის შექმნა",
      "created": "GitHub issue წარმატებით შეიქმნა!",
      "alreadyExists": "ამ ამოცანისთვის issue უკვე არსებობს.",
      "taskNotFound": "ამოცანა ვერ მოიძებნა.",
      "invalidTaskId": "ამოცანის ID-ის არასწორი ფორმატი.",
      "githubError": "GitHub API-ის შეცდომა.",
      "permissionDenied": "წვდომა აკრძალულია.",
      "notLinked": "GitHub რეპოზიტორია არ არის დაკავშირებული.",
      "usage": "გამოყენება: /pfGithubIssue <task-id>",
      "example": "მაგალითი: /pfGithubIssue T2.1",
      "task": "ამოცანა:",
      "issue": "Issue:",
      "url": "URL:",
      "state": "სტატუსი:",
      "linked": "Issue დაკავშირებულია ამოცანასთან",
      "whatsNext": "შემდეგი ნაბიჯები?",
      "createBranch": "შექმენი ბრანჩი ამ issue-ზე სამუშაოდ:",
      "createPr": "დასრულებისას შექმენი pull request:",
      "autoCloseTip": "ჩასვი \"Closes #{issue}\" PR-ის აღწერაში issue-ის ავტომატურად დასახურად!"
    }
  }
}
```

## Full Bash Implementation

```bash
#!/bin/bash

# Step 0: Load config
GLOBAL_CONFIG_PATH="$HOME/.config/claude/plan-plugin-config.json"
LOCAL_CONFIG_PATH="./.plan-config.json"

# Read configs and merge
if [ -f "$GLOBAL_CONFIG_PATH" ]; then
  API_TOKEN=$(jq -r '.cloud.apiToken // empty' "$GLOBAL_CONFIG_PATH")
  API_URL=$(jq -r '.cloud.apiUrl // "https://api.planflow.tools"' "$GLOBAL_CONFIG_PATH")
fi

if [ -f "$LOCAL_CONFIG_PATH" ]; then
  PROJECT_ID=$(jq -r '.cloud.projectId // empty' "$LOCAL_CONFIG_PATH")
  # Local can override global
  LOCAL_TOKEN=$(jq -r '.cloud.apiToken // empty' "$LOCAL_CONFIG_PATH")
  [ -n "$LOCAL_TOKEN" ] && API_TOKEN="$LOCAL_TOKEN"
fi

# Parse arguments
TASK_ID="$1"
shift
NO_OPEN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-open)
      NO_OPEN=true
      shift
      ;;
    --open)
      NO_OPEN=false
      shift
      ;;
    *)
      shift
      ;;
  esac
done

# Validate task ID format
if [ -z "$TASK_ID" ] || ! echo "$TASK_ID" | grep -qiE '^T[0-9]+\.[0-9]+$'; then
  echo "╭──────────────────────────────────────────────────────────────────────────────╮"
  echo "│  ❌ ERROR                                                                    │"
  echo "├──────────────────────────────────────────────────────────────────────────────┤"
  echo "│                                                                              │"
  echo "│  Invalid or missing task ID: $TASK_ID                                        │"
  echo "│                                                                              │"
  echo "│  Usage: /pfGithubIssue <task-id>                                             │"
  echo "│                                                                              │"
  echo "│  Examples:                                                                   │"
  echo "│     • /pfGithubIssue T2.1                                                    │"
  echo "│     • /pfGithubIssue T2.1 --no-open                                          │"
  echo "│                                                                              │"
  echo "│  Task ID should be like: T1.1, T2.3, T10.5                                   │"
  echo "│                                                                              │"
  echo "╰──────────────────────────────────────────────────────────────────────────────╯"
  exit 1
fi

# Normalize task ID to uppercase
TASK_ID=$(echo "$TASK_ID" | tr '[:lower:]' '[:upper:]')

# Validate prerequisites
if [ -z "$API_TOKEN" ]; then
  echo "❌ Not authenticated. Run /pfLogin first."
  exit 1
fi

if [ -z "$PROJECT_ID" ]; then
  echo "❌ No project linked. Run /pfCloudLink first."
  exit 1
fi

# Fetch task details from cloud
TASK_TITLE=""
TASK_DESCRIPTION=""
TASK_STATUS=""
TASK_COMPLEXITY=""

echo "🔍 Fetching task details..."

RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 10 \
  -X GET \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $API_TOKEN" \
  "${API_URL}/projects/${PROJECT_ID}/tasks/${TASK_ID}" 2>/dev/null)

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
  TASK_TITLE=$(echo "$BODY" | jq -r '.data.task.name // .data.name // empty' 2>/dev/null)
  TASK_DESCRIPTION=$(echo "$BODY" | jq -r '.data.task.description // .data.description // empty' 2>/dev/null)
  TASK_STATUS=$(echo "$BODY" | jq -r '.data.task.status // .data.status // empty' 2>/dev/null)
  TASK_COMPLEXITY=$(echo "$BODY" | jq -r '.data.task.complexity // .data.complexity // empty' 2>/dev/null)
fi

# Fallback to local PROJECT_PLAN.md
if [ -z "$TASK_TITLE" ] && [ -f "PROJECT_PLAN.md" ]; then
  echo "⚠️  Cloud task not found, using local PROJECT_PLAN.md..."

  # Try table format: | T1.1 | Task Title | Complexity | Status | Dependencies |
  TASK_LINE=$(grep -E "^\|\s*${TASK_ID}\s*\|" PROJECT_PLAN.md | head -1)

  if [ -n "$TASK_LINE" ]; then
    TASK_TITLE=$(echo "$TASK_LINE" | cut -d'|' -f3 | sed 's/^\s*//' | sed 's/\s*$//')
    TASK_COMPLEXITY=$(echo "$TASK_LINE" | cut -d'|' -f4 | sed 's/^\s*//' | sed 's/\s*$//')
    TASK_STATUS=$(echo "$TASK_LINE" | cut -d'|' -f5 | sed 's/^\s*//' | sed 's/\s*$//')
  else
    # Try markdown heading format: #### **T1.1**: Task Title
    TASK_LINE=$(grep -E "^\s*####\s*\*\*${TASK_ID}\*\*:" PROJECT_PLAN.md | head -1)
    if [ -n "$TASK_LINE" ]; then
      TASK_TITLE=$(echo "$TASK_LINE" | sed 's/.*\*\*:\s*//' | sed 's/\s*$//')
    fi
  fi
fi

if [ -z "$TASK_TITLE" ]; then
  echo "╭──────────────────────────────────────────────────────────────────────────────╮"
  echo "│  ❌ ERROR                                                                    │"
  echo "├──────────────────────────────────────────────────────────────────────────────┤"
  echo "│                                                                              │"
  echo "│  Task not found: $TASK_ID                                                    │"
  echo "│                                                                              │"
  echo "│  Make sure the task exists in PROJECT_PLAN.md or is synced to cloud.         │"
  echo "│                                                                              │"
  echo "│  💡 Try:                                                                     │"
  echo "│     • /pfSyncPush   Sync your local tasks to cloud                           │"
  echo "│     • Check PROJECT_PLAN.md for valid task IDs                               │"
  echo "│                                                                              │"
  echo "╰──────────────────────────────────────────────────────────────────────────────╯"
  exit 1
fi

echo "📝 Creating GitHub issue for: $TASK_ID - $TASK_TITLE"

# Build issue title and body
ISSUE_TITLE="[$TASK_ID] $TASK_TITLE"

# Handle null/empty description
if [ -z "$TASK_DESCRIPTION" ] || [ "$TASK_DESCRIPTION" = "null" ]; then
  TASK_DESCRIPTION="No description provided."
fi

# Create issue via API
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 15 \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $API_TOKEN" \
  -d "$(jq -n \
    --arg title "$ISSUE_TITLE" \
    --arg taskId "$TASK_ID" \
    --arg complexity "${TASK_COMPLEXITY:-Not specified}" \
    --arg status "${TASK_STATUS:-TODO}" \
    --arg description "$TASK_DESCRIPTION" \
    '{
      title: $title,
      taskId: $taskId,
      body: "## Task Details\n\n**Task ID:** \($taskId)\n**Complexity:** \($complexity)\n**Status:** \($status)\n\n## Description\n\n\($description)\n\n---\n\n*This issue was created from [PlanFlow](https://planflow.tools) task \($taskId).*\n*Closes \($taskId) when merged.*"
    }')" \
  "${API_URL}/projects/${PROJECT_ID}/integrations/github/issues")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  ISSUE_NUMBER=$(echo "$BODY" | jq -r '.data.issueNumber // .data.number // empty')
  ISSUE_URL=$(echo "$BODY" | jq -r '.data.issueUrl // .data.url // .data.html_url // empty')
  ISSUE_STATE=$(echo "$BODY" | jq -r '.data.state // "open"')

  echo ""
  echo "╭──────────────────────────────────────────────────────────────────────────────╮"
  echo "│  ✅ SUCCESS                                                                  │"
  echo "├──────────────────────────────────────────────────────────────────────────────┤"
  echo "│                                                                              │"
  echo "│  GitHub issue created successfully!                                          │"
  echo "│                                                                              │"
  echo "│  ── Issue Created ────────────────────────────────────────────────────────   │"
  echo "│                                                                              │"
  echo "│  📝 Task:     $TASK_ID - $TASK_TITLE"
  echo "│  🐙 Issue:    #$ISSUE_NUMBER"
  echo "│  🔗 URL:      $ISSUE_URL"
  echo "│  📊 State:    $ISSUE_STATE"
  echo "│                                                                              │"
  echo "│  ╭────────────────────────────────────────────────────────────────────────╮  │"
  echo "│  │ ✓ Issue linked to task $TASK_ID                                        │  │"
  echo "│  ╰────────────────────────────────────────────────────────────────────────╯  │"
  echo "│                                                                              │"
  echo "├──────────────────────────────────────────────────────────────────────────────┤"
  echo "│                                                                              │"
  echo "│  💡 What's Next?                                                             │"
  echo "│                                                                              │"
  echo "│  Create a branch to work on this issue:                                      │"
  echo "│     • /pfGithubBranch $TASK_ID                                               │"
  echo "│                                                                              │"
  echo "│  When done, create a pull request:                                           │"
  echo "│     • /pfGithubPr $TASK_ID                                                   │"
  echo "│                                                                              │"
  echo "│  💡 Tip: Include \"Closes #$ISSUE_NUMBER\" in your PR description              │"
  echo "│     to auto-close the issue when merged!                                     │"
  echo "│                                                                              │"
  echo "╰──────────────────────────────────────────────────────────────────────────────╯"

  # Open in browser if requested
  if [ "$NO_OPEN" = "false" ] && [ -n "$ISSUE_URL" ]; then
    if command -v open &> /dev/null; then
      open "$ISSUE_URL" 2>/dev/null
    elif command -v xdg-open &> /dev/null; then
      xdg-open "$ISSUE_URL" 2>/dev/null
    elif command -v wslview &> /dev/null; then
      wslview "$ISSUE_URL" 2>/dev/null
    fi
  fi

  exit 0
elif [ "$HTTP_CODE" -eq 400 ]; then
  ERROR_MSG=$(echo "$BODY" | jq -r '.error.message // .message // "Bad request"')
  echo ""
  echo "╭──────────────────────────────────────────────────────────────────────────────╮"
  echo "│  ❌ ERROR                                                                    │"
  echo "├──────────────────────────────────────────────────────────────────────────────┤"
  echo "│                                                                              │"
  echo "│  $ERROR_MSG"
  echo "│                                                                              │"
  echo "│  💡 Make sure GitHub is linked:                                              │"
  echo "│     • /pfGithubLink owner/repo                                               │"
  echo "│                                                                              │"
  echo "╰──────────────────────────────────────────────────────────────────────────────╯"
  exit 1
elif [ "$HTTP_CODE" -eq 401 ]; then
  echo "❌ Authentication failed. Run /pfLogin to refresh."
  exit 1
elif [ "$HTTP_CODE" -eq 403 ]; then
  echo "❌ Permission denied. You need Editor role and GitHub write access."
  exit 1
elif [ "$HTTP_CODE" -eq 404 ]; then
  echo "❌ Task or project not found."
  exit 1
elif [ "$HTTP_CODE" -eq 409 ]; then
  # Issue already exists
  EXISTING_URL=$(echo "$BODY" | jq -r '.data.existingIssueUrl // .data.issueUrl // empty')
  EXISTING_NUMBER=$(echo "$BODY" | jq -r '.data.existingIssueNumber // .data.issueNumber // empty')

  echo ""
  echo "╭──────────────────────────────────────────────────────────────────────────────╮"
  echo "│  ⚠️  Issue Already Exists                                                     │"
  echo "├──────────────────────────────────────────────────────────────────────────────┤"
  echo "│                                                                              │"
  echo "│  An issue already exists for this task.                                      │"
  echo "│                                                                              │"
  echo "│  ── Existing Issue ────────────────────────────────────────────────────────  │"
  echo "│                                                                              │"
  echo "│  📝 Task:     $TASK_ID - $TASK_TITLE"
  echo "│  🐙 Issue:    #$EXISTING_NUMBER"
  echo "│  🔗 URL:      $EXISTING_URL"
  echo "│                                                                              │"
  echo "├──────────────────────────────────────────────────────────────────────────────┤"
  echo "│                                                                              │"
  echo "│  💡 Options:                                                                 │"
  echo "│     • View the existing issue in browser                                     │"
  echo "│     • Close the existing issue first to create a new one                     │"
  echo "│                                                                              │"
  echo "╰──────────────────────────────────────────────────────────────────────────────╯"

  # Open existing issue
  if [ "$NO_OPEN" = "false" ] && [ -n "$EXISTING_URL" ]; then
    if command -v open &> /dev/null; then
      open "$EXISTING_URL" 2>/dev/null
    elif command -v xdg-open &> /dev/null; then
      xdg-open "$EXISTING_URL" 2>/dev/null
    fi
  fi
  exit 0
else
  echo "╭──────────────────────────────────────────────────────────────────────────────╮"
  echo "│  ❌ ERROR                                                                    │"
  echo "├──────────────────────────────────────────────────────────────────────────────┤"
  echo "│                                                                              │"
  echo "│  Failed to create GitHub issue (HTTP $HTTP_CODE)                             │"
  echo "│                                                                              │"
  echo "│  Possible reasons:                                                           │"
  echo "│  • GitHub API rate limit exceeded                                            │"
  echo "│  • GitHub integration token expired                                          │"
  echo "│  • Repository permissions issue                                              │"
  echo "│                                                                              │"
  echo "│  💡 Try again later, or check:                                               │"
  echo "│     • /pfGithubLink   Verify GitHub integration status                       │"
  echo "│                                                                              │"
  echo "╰──────────────────────────────────────────────────────────────────────────────╯"
  exit 1
fi
```

## Testing

```bash
# Test 1: Create issue for valid task
/pfGithubIssue T2.1
# Expected: Creates issue and opens in browser

# Test 2: Create without opening browser
/pfGithubIssue T2.1 --no-open
# Expected: Creates issue, shows URL but doesn't open

# Test 3: Issue already exists
/pfGithubIssue T2.1
# Expected: Shows existing issue info

# Test 4: Invalid task ID
/pfGithubIssue invalid
# Expected: Error with format hint

# Test 5: Task not found
/pfGithubIssue T99.99
# Expected: Error with suggestions

# Test 6: Not authenticated
# (Clear token first)
/pfGithubIssue T2.1
# Expected: Error "Not authenticated"

# Test 7: No project linked
# (Clear projectId first)
/pfGithubIssue T2.1
# Expected: Error "No project linked"

# Test 8: GitHub not linked
# (Unlink GitHub first)
/pfGithubIssue T2.1
# Expected: Error "No GitHub repository linked"
```

## Success Criteria

- [ ] Creates GitHub issue from task ID with proper title/body
- [ ] Opens created issue in browser by default
- [ ] --no-open flag prevents browser opening
- [ ] Handles existing issues gracefully (shows link)
- [ ] Falls back to local PROJECT_PLAN.md when cloud unavailable
- [ ] Shows helpful next steps after creation
- [ ] Validates prerequisites (auth, project, GitHub link)
- [ ] Works in both English and Georgian
