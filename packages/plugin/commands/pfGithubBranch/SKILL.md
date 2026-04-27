---
name: pfGithubBranch
description: Create a git branch from a PlanFlow task ID
---

# PlanFlow GitHub Branch

Create a git branch from a task ID. The branch name is automatically generated from the task ID and title.

## Usage

```bash
/pfGithubBranch T2.1           # Create branch: feature/T2.1-task-title-slug
/pfGithubBranch T2.1 --checkout # Create and checkout (default)
/pfGithubBranch T2.1 --no-checkout # Create without checkout
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

const t = JSON.parse(readFile(`../locales/${language}.json`))
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

const noCheckout = flags.includes("--no-checkout")
const shouldCheckout = !noCheckout  // Default is to checkout

if (!taskId || !taskIdPattern.test(taskId)) {
  showUsageError()
}
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
│  You must be logged in to create branches from tasks.                        │
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
│  {t.github.notLinked}                                                        │
│                                                                              │
│  No GitHub repository is linked to this project.                             │
│                                                                              │
│  💡 To link a repository:                                                    │
│     • /pfGithubLink owner/repo                                               │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### 2d: Check Git Repository

Verify we're in a git repository:

```bash
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  echo "❌ Not a git repository"
  echo ""
  echo "Please run this command from within a git repository."
  exit 1
fi
```

### 2e: Check for Uncommitted Changes

```bash
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
  echo "⚠️ Warning: You have uncommitted changes"
  echo ""
  echo "Consider committing or stashing your changes before switching branches."
  echo ""
fi
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
```

### 3b: Fallback to Local PROJECT_PLAN.md

If cloud API fails or task not found, parse from local file:

```bash
# Extract task title from PROJECT_PLAN.md
TASK_LINE=$(grep -E "^\s*####\s*\*\*${TASK_ID}\*\*:" PROJECT_PLAN.md | head -1)
# Or from table format:
# TASK_LINE=$(grep -E "^\|\s*${TASK_ID}\s*\|" PROJECT_PLAN.md | head -1)

if [ -z "$TASK_LINE" ]; then
  echo "❌ Task not found: $TASK_ID"
  exit 1
fi

# Extract task title
TASK_TITLE=$(echo "$TASK_LINE" | sed 's/.*\*\*:\s*//' | sed 's/\s*$//')
```

### 3c: Generate Branch Name

```bash
# Slugify the task title
slugify() {
  echo "$1" | \
    tr '[:upper:]' '[:lower:]' | \
    sed 's/[^a-z0-9]/-/g' | \
    sed 's/--*/-/g' | \
    sed 's/^-//' | \
    sed 's/-$//' | \
    cut -c1-50  # Limit length
}

TASK_SLUG=$(slugify "$TASK_TITLE")
BRANCH_NAME="feature/${TASK_ID}-${TASK_SLUG}"
```

## Step 4: Create Branch

### 4a: Check if Branch Already Exists

```bash
# Check local branches
if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
  BRANCH_EXISTS="local"
fi

# Check remote branches
if git show-ref --verify --quiet "refs/remotes/origin/$BRANCH_NAME"; then
  BRANCH_EXISTS="remote"
fi

if [ -n "$BRANCH_EXISTS" ]; then
  echo "⚠️ Branch already exists ($BRANCH_EXISTS): $BRANCH_NAME"
  echo ""
  if [ "$SHOULD_CHECKOUT" = "true" ]; then
    echo "Checking out existing branch..."
    git checkout "$BRANCH_NAME"
  fi
  exit 0
fi
```

### 4b: Create the Branch

```bash
# Create branch from current HEAD
git branch "$BRANCH_NAME"

if [ $? -ne 0 ]; then
  echo "❌ Failed to create branch: $BRANCH_NAME"
  exit 1
fi
```

### 4c: Checkout if Requested

```bash
if [ "$SHOULD_CHECKOUT" = "true" ]; then
  git checkout "$BRANCH_NAME"

  if [ $? -ne 0 ]; then
    echo "⚠️ Branch created but checkout failed"
    echo "Branch: $BRANCH_NAME"
    exit 1
  fi
fi
```

## Step 5: Show Success Output

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.github.branch.created}                                                   │
│                                                                              │
│  ── Branch Created ──────────────────────────────────────────────────────    │
│                                                                              │
│  📝 Task:     T2.1 - Implement login API                                     │
│  🌿 Branch:   feature/T2.1-implement-login-api                               │
│  📂 Status:   Checked out ✓                                                  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 What's Next?                                                             │
│                                                                              │
│  Start working on the task:                                                  │
│     • /planUpdate T2.1 start                                                 │
│                                                                              │
│  When done, create a pull request:                                           │
│     • git push -u origin feature/T2.1-implement-login-api                    │
│     • /pfGithubPr T2.1                                                       │
│                                                                              │
│  💡 Tip: Include "Closes T2.1" in your PR description                        │
│     to auto-complete the task when the PR is merged!                         │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Error Handling

### Task Not Found

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.github.branch.taskNotFound}                                              │
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

### Invalid Task ID Format

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.github.branch.invalidTaskId}                                             │
│                                                                              │
│  Invalid task ID format: {input}                                             │
│                                                                              │
│  Task ID should be like: T1.1, T2.3, T10.5                                   │
│                                                                              │
│  Usage:                                                                      │
│     • /pfGithubBranch T2.1                                                   │
│     • /pfGithubBranch T2.1 --no-checkout                                     │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### Git Error

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.github.branch.gitError}                                                  │
│                                                                              │
│  Git operation failed.                                                       │
│                                                                              │
│  Error: {error_message}                                                      │
│                                                                              │
│  💡 Try:                                                                     │
│     • Make sure you're in a git repository                                   │
│     • Check for uncommitted changes                                          │
│     • Verify you have write permissions                                      │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### Network Error

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚠️ WARNING                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Could not fetch task from cloud. Using local PROJECT_PLAN.md.               │
│                                                                              │
│  Branch created from local task data.                                        │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Translation Keys

Add to `locales/en.json` and `locales/ka.json`:

```json
{
  "github": {
    "branch": {
      "title": "Create Branch",
      "created": "Branch created successfully!",
      "alreadyExists": "Branch already exists.",
      "checkedOut": "Checked out to branch.",
      "taskNotFound": "Task not found.",
      "invalidTaskId": "Invalid task ID format.",
      "gitError": "Git operation failed.",
      "notGitRepo": "Not a git repository.",
      "uncommittedChanges": "You have uncommitted changes.",
      "usage": "Usage: /pfGithubBranch <task-id>",
      "example": "Example: /pfGithubBranch T2.1",
      "task": "Task:",
      "branch": "Branch:",
      "status": "Status:",
      "whatsNext": "What's Next?",
      "startWorking": "Start working on the task:",
      "whenDone": "When done, create a pull request:",
      "autoCompleteTip": "Include \"Closes TX.X\" in your PR description to auto-complete the task!"
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
  GITHUB_OWNER=$(jq -r '.github.owner // empty' "$LOCAL_CONFIG_PATH")
  GITHUB_REPO=$(jq -r '.github.repo // empty' "$LOCAL_CONFIG_PATH")
  # Local can override global
  LOCAL_TOKEN=$(jq -r '.cloud.apiToken // empty' "$LOCAL_CONFIG_PATH")
  [ -n "$LOCAL_TOKEN" ] && API_TOKEN="$LOCAL_TOKEN"
fi

# Parse arguments
TASK_ID="$1"
shift
NO_CHECKOUT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-checkout)
      NO_CHECKOUT=true
      shift
      ;;
    *)
      shift
      ;;
  esac
done

# Validate task ID format
if [ -z "$TASK_ID" ] || ! echo "$TASK_ID" | grep -qiE '^T[0-9]+\.[0-9]+$'; then
  echo "❌ Invalid task ID format: $TASK_ID"
  echo ""
  echo "Task ID should be like: T1.1, T2.3, T10.5"
  echo ""
  echo "Usage: /pfGithubBranch <task-id>"
  echo "Example: /pfGithubBranch T2.1"
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

# Check if in git repo
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  echo "❌ Not a git repository"
  echo ""
  echo "Please run this command from within a git repository."
  exit 1
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
  echo "⚠️  Warning: You have uncommitted changes"
  echo "   Consider committing or stashing before switching branches."
  echo ""
fi

# Slugify function
slugify() {
  echo "$1" | \
    tr '[:upper:]' '[:lower:]' | \
    sed 's/[^a-z0-9]/-/g' | \
    sed 's/--*/-/g' | \
    sed 's/^-//' | \
    sed 's/-$//' | \
    cut -c1-50
}

# Try to get task from cloud API
TASK_TITLE=""
if [ -n "$API_TOKEN" ] && [ -n "$PROJECT_ID" ]; then
  RESPONSE=$(curl -s --connect-timeout 5 --max-time 10 \
    -X GET \
    -H "Accept: application/json" \
    -H "Authorization: Bearer $API_TOKEN" \
    "${API_URL}/projects/${PROJECT_ID}/tasks/${TASK_ID}" 2>/dev/null)

  if [ $? -eq 0 ]; then
    TASK_TITLE=$(echo "$RESPONSE" | jq -r '.data.title // .title // empty' 2>/dev/null)
  fi
fi

# Fallback to local PROJECT_PLAN.md
if [ -z "$TASK_TITLE" ] && [ -f "PROJECT_PLAN.md" ]; then
  # Try markdown heading format: #### **T1.1**: Task Title
  TASK_LINE=$(grep -E "^\s*####\s*\*\*${TASK_ID}\*\*:" PROJECT_PLAN.md | head -1)
  if [ -n "$TASK_LINE" ]; then
    TASK_TITLE=$(echo "$TASK_LINE" | sed 's/.*\*\*:\s*//' | sed 's/\s*$//')
  else
    # Try table format: | T1.1 | Task Title | ...
    TASK_LINE=$(grep -E "^\|\s*${TASK_ID}\s*\|" PROJECT_PLAN.md | head -1)
    if [ -n "$TASK_LINE" ]; then
      TASK_TITLE=$(echo "$TASK_LINE" | cut -d'|' -f3 | sed 's/^\s*//' | sed 's/\s*$//')
    fi
  fi
fi

if [ -z "$TASK_TITLE" ]; then
  echo "❌ Task not found: $TASK_ID"
  echo ""
  echo "Make sure the task exists in PROJECT_PLAN.md or is synced to cloud."
  echo ""
  echo "💡 Try:"
  echo "   • /pfSyncPush to sync local tasks"
  echo "   • Check PROJECT_PLAN.md for valid task IDs"
  exit 1
fi

# Generate branch name
TASK_SLUG=$(slugify "$TASK_TITLE")
BRANCH_NAME="feature/${TASK_ID}-${TASK_SLUG}"

# Check if branch already exists
BRANCH_EXISTS=""
if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME" 2>/dev/null; then
  BRANCH_EXISTS="local"
elif git show-ref --verify --quiet "refs/remotes/origin/$BRANCH_NAME" 2>/dev/null; then
  BRANCH_EXISTS="remote"
fi

if [ -n "$BRANCH_EXISTS" ]; then
  echo "⚠️  Branch already exists ($BRANCH_EXISTS): $BRANCH_NAME"
  echo ""
  if [ "$NO_CHECKOUT" = "false" ]; then
    echo "Checking out existing branch..."
    git checkout "$BRANCH_NAME"
    echo ""
    echo "💡 Ready to continue working on:"
    echo "   📝 Task:   $TASK_ID - $TASK_TITLE"
    echo "   🌿 Branch: $BRANCH_NAME"
  fi
  exit 0
fi

# Create the branch
if ! git branch "$BRANCH_NAME" 2>/dev/null; then
  echo "❌ Failed to create branch: $BRANCH_NAME"
  echo ""
  echo "Git error occurred. Check your git configuration."
  exit 1
fi

# Checkout if requested
CHECKOUT_STATUS="Created (not checked out)"
if [ "$NO_CHECKOUT" = "false" ]; then
  if git checkout "$BRANCH_NAME" 2>/dev/null; then
    CHECKOUT_STATUS="Checked out ✓"
  else
    CHECKOUT_STATUS="Created but checkout failed"
  fi
fi

# Success output
echo "✅ Branch created successfully!"
echo ""
echo "── Branch Created ──────────────────────────────────────────────────────"
echo ""
echo "  📝 Task:     $TASK_ID - $TASK_TITLE"
echo "  🌿 Branch:   $BRANCH_NAME"
echo "  📂 Status:   $CHECKOUT_STATUS"
echo ""
echo "── What's Next? ─────────────────────────────────────────────────────────"
echo ""
echo "  Start working on the task:"
echo "     • /planUpdate $TASK_ID start"
echo ""
echo "  When done, push and create a PR:"
echo "     • git push -u origin $BRANCH_NAME"
echo "     • /pfGithubPr $TASK_ID"
echo ""
echo "  💡 Tip: Include \"Closes $TASK_ID\" in your PR description"
echo "     to auto-complete the task when merged!"
echo ""
```

## Testing

```bash
# Test 1: Create branch for valid task
/pfGithubBranch T2.1
# Expected: Creates feature/T2.1-task-title-slug and checks out

# Test 2: Create without checkout
/pfGithubBranch T2.1 --no-checkout
# Expected: Creates branch but stays on current branch

# Test 3: Branch already exists
/pfGithubBranch T2.1
# Expected: Checks out existing branch with warning

# Test 4: Invalid task ID
/pfGithubBranch invalid
# Expected: Error with format hint

# Test 5: Task not found
/pfGithubBranch T99.99
# Expected: Error with suggestions

# Test 6: Not in git repo
cd /tmp && /pfGithubBranch T2.1
# Expected: Error "Not a git repository"

# Test 7: Not authenticated
# (Clear token first)
/pfGithubBranch T2.1
# Expected: Error "Not authenticated"

# Test 8: GitHub not linked
# (Clear github config)
/pfGithubBranch T2.1
# Expected: Works using local PROJECT_PLAN.md only
```

## Success Criteria

- [ ] Creates branch from task ID with slugified title
- [ ] Checks out to new branch by default
- [ ] --no-checkout flag works
- [ ] Handles existing branches gracefully
- [ ] Falls back to local PROJECT_PLAN.md when cloud unavailable
- [ ] Shows helpful next steps after creation
- [ ] Validates prerequisites (auth, project, git)
- [ ] Works in both English and Georgian
