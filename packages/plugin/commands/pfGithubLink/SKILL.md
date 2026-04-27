---
name: pfGithubLink
description: Link a GitHub repository to the current PlanFlow project
---

# PlanFlow GitHub Link

Link a GitHub repository to the current PlanFlow cloud project for issue tracking, branch creation, and PR integration.

## Usage

```bash
/pfGithubLink owner/repo           # Link to GitHub repository
/pfGithubLink                       # Show current link status
/pfGithubLink autocomplete on      # Enable auto-complete tasks on PR merge
/pfGithubLink autocomplete off     # Disable auto-complete tasks on PR merge
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
const repoPattern = /^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/
const autocompletePattern = /^autocomplete\s+(on|off)$/i

if (args === "") {
  // Show current status
  showGitHubStatus()
} else if (autocompletePattern.test(args)) {
  // Toggle auto-complete setting
  const match = args.match(autocompletePattern)
  const enabled = match[1].toLowerCase() === "on"
  toggleAutoComplete(enabled)
} else if (repoPattern.test(args)) {
  // Link to repo
  const [owner, repo] = args.split("/")
  linkGitHubRepo(owner, repo)
} else {
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
│  You must be logged in to link GitHub repositories.                          │
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

### 2c: Check GitHub CLI (Optional Enhancement)

Optionally check if `gh` CLI is available for enhanced features:

```bash
if command -v gh &> /dev/null; then
  GH_AVAILABLE=true
  # Check if gh is authenticated
  if gh auth status &> /dev/null; then
    GH_AUTHENTICATED=true
  fi
fi
```

## Step 3: Show Current Status (No Arguments)

If no arguments provided, show current GitHub link status:

### 3a: Fetch Current Integration Status

```bash
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 10 \
  -X GET \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "${API_URL}/projects/${PROJECT_ID}/integrations/github")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
```

### 3b: Show Status Card

**If linked:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🐙 GitHub Integration                                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── Repository ────────────────────────────────────────────────────────────  │
│                                                                              │
│  📦 Repository:   owner/repo-name                                            │
│  🔗 URL:          https://github.com/owner/repo-name                         │
│  📅 Linked:       2026-02-15                                                 │
│                                                                              │
│  ╭────────────────╮                                                          │
│  │ ✓ Connected    │                                                          │
│  ╰────────────────╯                                                          │
│                                                                              │
│  ── Features ──────────────────────────────────────────────────────────────  │
│                                                                              │
│  ✅ Create branches from tasks                                               │
│  ✅ Create issues from tasks                                                 │
│  ✅ Link PRs to tasks                                                        │
│                                                                              │
│  ── Auto-Complete Settings ──────────────────────────────────────────────── │
│                                                                              │
│  ✅ Auto-complete on PR merge: Enabled                                       │
│     When a PR with "Closes TX.X" is merged, the task is marked DONE          │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Commands:                                                                │
│     • /pfGithubBranch T1.1       Create branch for task                      │
│     • /pfGithubIssue T1.1        Create GitHub issue                         │
│     • /pfGithubLink autocomplete Toggle auto-complete (on|off)               │
│     • /pfGithubUnlink            Disconnect repository                       │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**If not linked:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🐙 GitHub Integration                                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.github.notLinked}                                               │
│                                                                              │
│  No GitHub repository is linked to this project.                             │
│                                                                              │
│  ╭────────────────╮                                                          │
│  │ ○ Not Connected│                                                          │
│  ╰────────────────╯                                                          │
│                                                                              │
│  ── Benefits of Linking ───────────────────────────────────────────────────  │
│                                                                              │
│  • Create feature branches directly from tasks                               │
│  • Sync tasks to GitHub Issues                                               │
│  • Link Pull Requests to tasks                                               │
│  • Auto-complete tasks when PRs are merged                                   │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 To link a repository:                                                    │
│     • /pfGithubLink owner/repo                                               │
│                                                                              │
│  Example:                                                                    │
│     • /pfGithubLink acme/my-project                                          │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 4: Link GitHub Repository

### 4a: Validate Repository Format

```javascript
const repoRegex = /^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/
if (!repoRegex.test(repoArg)) {
  // Show error
}
```

**Invalid format error:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.github.invalidFormat}                                           │
│                                                                              │
│  Invalid repository format: {input}                                          │
│                                                                              │
│  Expected format: owner/repo                                                 │
│                                                                              │
│  Examples:                                                                   │
│     • /pfGithubLink microsoft/vscode                                         │
│     • /pfGithubLink facebook/react                                           │
│     • /pfGithubLink my-org/my-project                                        │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### 4b: Check if Already Linked

If project already has a GitHub repo linked:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚠️  WARNING                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.github.alreadyLinked}                                           │
│                                                                              │
│  This project is already linked to: {currentRepo}                            │
│                                                                              │
│  To switch repositories:                                                     │
│     1. /pfGithubUnlink        Remove current link                            │
│     2. /pfGithubLink {newRepo}  Link new repository                          │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### 4c: Verify Repository Exists (Optional)

If `gh` CLI is available, verify the repository exists:

```bash
if [ "$GH_AVAILABLE" = true ] && [ "$GH_AUTHENTICATED" = true ]; then
  if ! gh repo view "$OWNER/$REPO" &> /dev/null; then
    echo "Repository not found or inaccessible: $OWNER/$REPO"
    exit 1
  fi
fi
```

### 4d: Link Repository via API

```bash
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 15 \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"owner\": \"$OWNER\", \"repo\": \"$REPO\"}" \
  "${API_URL}/projects/${PROJECT_ID}/integrations/github")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
```

### 4e: Handle Response

**Success (200/201):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.github.linkSuccess}                                             │
│                                                                              │
│  ── Repository Linked ─────────────────────────────────────────────────────  │
│                                                                              │
│  📦 Repository:   owner/repo-name                                            │
│  🔗 URL:          https://github.com/owner/repo-name                         │
│  📁 Project:      {projectName}                                              │
│                                                                              │
│  ╭────────────────╮                                                          │
│  │ ✓ Connected    │                                                          │
│  ╰────────────────╯                                                          │
│                                                                              │
│  ── What's Next? ──────────────────────────────────────────────────────────  │
│                                                                              │
│  You can now:                                                                │
│  • Create branches: /pfGithubBranch T1.1                                     │
│  • Create issues:   /pfGithubIssue T1.1                                      │
│  • View status:     /pfGithubLink                                            │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Tip: When you merge a PR with "Closes T1.1" in the description,          │
│     the task will automatically be marked as complete!                       │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Repository Not Found (404):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.github.repoNotFound}                                            │
│                                                                              │
│  Repository not found: owner/repo                                            │
│                                                                              │
│  Possible reasons:                                                           │
│  • Repository doesn't exist                                                  │
│  • Repository is private and you don't have access                           │
│  • Typo in owner or repository name                                          │
│                                                                              │
│  💡 Tip: Check the repository URL in your browser first.                     │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Permission Denied (403):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.github.noPermission}                                            │
│                                                                              │
│  You don't have permission to link this repository.                          │
│                                                                              │
│  To link a GitHub repository, you need:                                      │
│  • Admin or Editor role in the PlanFlow project                              │
│  • Read access to the GitHub repository                                      │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Already Linked to Different Project (409):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.github.repoAlreadyLinked}                                       │
│                                                                              │
│  This repository is already linked to another project.                       │
│                                                                              │
│  Repository: owner/repo                                                      │
│  Linked to:  Other Project Name                                              │
│                                                                              │
│  💡 A repository can only be linked to one project at a time.                │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 5: Toggle Auto-Complete Setting

When the user runs `/pfGithubLink autocomplete on` or `/pfGithubLink autocomplete off`:

### 5a: Validate Auto-Complete Toggle Value

```bash
if [[ ! "$ACTION" =~ ^(on|off)$ ]]; then
  echo "❌ {t.github.autoComplete.invalidAction}"
  echo ""
  echo "Usage: /pfGithubLink autocomplete on|off"
  exit 1
fi
```

### 5b: Send PATCH Request to Update Setting

```bash
toggle_autocomplete() {
  local ENABLED="$1"
  local AUTO_COMPLETE_VALUE="false"
  [ "$ENABLED" = "on" ] && AUTO_COMPLETE_VALUE="true"

  RESPONSE=$(curl -s -w "\n%{http_code}" \
    --connect-timeout 5 \
    --max-time 15 \
    -X PATCH \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -H "Authorization: Bearer $API_TOKEN" \
    -d "{\"autoComplete\": $AUTO_COMPLETE_VALUE}" \
    "${API_URL}/projects/${PROJECT_ID}/integrations/github")

  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
    if [ "$ENABLED" = "on" ]; then
      echo "✅ {t.github.autoComplete.enabled}"
      echo ""
      echo "💡 {t.github.autoComplete.tip}"
    else
      echo "{t.github.autoComplete.disabled}"
    fi
  elif [ "$HTTP_CODE" -eq 401 ]; then
    echo "❌ Authentication failed. Run /pfLogin to refresh."
  elif [ "$HTTP_CODE" -eq 403 ]; then
    echo "❌ Permission denied. You need Editor role or higher."
  elif [ "$HTTP_CODE" -eq 404 ]; then
    echo "❌ GitHub integration not found. Link a repository first with /pfGithubLink owner/repo"
  else
    echo "❌ Failed to update auto-complete setting (HTTP $HTTP_CODE)"
  fi
}
```

### 5c: Display Success Cards

**Auto-complete enabled:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ {t.github.autoComplete.enabled}                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.github.autoComplete.description}                                         │
│                                                                              │
│  ╭────────────────╮                                                          │
│  │ ✓ Enabled      │                                                          │
│  ╰────────────────╯                                                          │
│                                                                              │
│  💡 {t.github.autoComplete.tip}                                              │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Auto-complete disabled:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  {t.github.autoComplete.disabled}                                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Auto-complete on PR merge is now disabled.                                  │
│                                                                              │
│  ╭────────────────╮                                                          │
│  │ ○ Disabled     │                                                          │
│  ╰────────────────╯                                                          │
│                                                                              │
│  💡 To re-enable:                                                            │
│     • /pfGithubLink autocomplete on                                          │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 6: Update Local Config (Optional)

Store GitHub link info locally for offline reference:

```javascript
// Read current local config
let localConfig = {}
try {
  localConfig = JSON.parse(readFile("./.plan-config.json"))
} catch {}

// Add GitHub info
localConfig.github = {
  owner: owner,
  repo: repo,
  linkedAt: new Date().toISOString()
}

// Save
writeFile("./.plan-config.json", JSON.stringify(localConfig, null, 2))
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
│     • /pfGithubLink owner/repo                                               │
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

## Translation Keys

Add to `locales/en.json` and `locales/ka.json`:

```json
{
  "commands": {
    "github": {
      "title": "GitHub Integration",
      "linkSuccess": "GitHub repository linked successfully!",
      "unlinkSuccess": "GitHub repository unlinked.",
      "notLinked": "No GitHub repository linked.",
      "alreadyLinked": "A GitHub repository is already linked.",
      "invalidFormat": "Invalid repository format.",
      "formatHint": "Use format: owner/repo",
      "repoNotFound": "Repository not found.",
      "noPermission": "You don't have permission to link repositories.",
      "repoAlreadyLinked": "This repository is linked to another project.",
      "repository": "Repository:",
      "url": "URL:",
      "linkedAt": "Linked:",
      "connected": "Connected",
      "notConnected": "Not Connected",
      "features": "Features",
      "featureBranch": "Create branches from tasks",
      "featureIssue": "Create issues from tasks",
      "featurePR": "Link PRs to tasks",
      "featureAutoComplete": "Auto-complete tasks on PR merge",
      "benefits": "Benefits of Linking",
      "benefitBranch": "Create feature branches directly from tasks",
      "benefitIssue": "Sync tasks to GitHub Issues",
      "benefitPR": "Link Pull Requests to tasks",
      "benefitAuto": "Auto-complete tasks when PRs are merged",
      "toLink": "To link a repository:",
      "example": "Example:",
      "tip": "Tip:",
      "autoCompleteTip": "When you merge a PR with \"Closes TX.X\" in the description, the task will automatically be marked as complete!",
      "commands": "Commands:",
      "branchCommand": "Create branch for task",
      "issueCommand": "Create GitHub issue",
      "unlinkCommand": "Disconnect repository",
      "statusCommand": "View integration status"
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
ARGS="$*"

# Validate prerequisites
if [ -z "$API_TOKEN" ]; then
  echo "❌ Not authenticated. Run /pfLogin first."
  exit 1
fi

if [ -z "$PROJECT_ID" ]; then
  echo "❌ No project linked. Run /pfCloudLink first."
  exit 1
fi

# Check for autocomplete toggle command
if echo "$ARGS" | grep -qiE '^autocomplete[[:space:]]+(on|off)$'; then
  ACTION=$(echo "$ARGS" | sed -E 's/^autocomplete[[:space:]]+//i' | tr '[:upper:]' '[:lower:]')
  AUTO_COMPLETE_VALUE="false"
  [ "$ACTION" = "on" ] && AUTO_COMPLETE_VALUE="true"

  RESPONSE=$(curl -s -w "\n%{http_code}" \
    --connect-timeout 5 \
    --max-time 15 \
    -X PATCH \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -H "Authorization: Bearer $API_TOKEN" \
    -d "{\"autoComplete\": $AUTO_COMPLETE_VALUE}" \
    "${API_URL}/projects/${PROJECT_ID}/integrations/github")

  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
    if [ "$ACTION" = "on" ]; then
      echo "✅ Auto-complete is now enabled!"
      echo ""
      echo "💡 When a PR with \"Closes T1.1\" is merged, T1.1 will be marked DONE automatically!"
    else
      echo "Auto-complete is now disabled."
    fi
  elif [ "$HTTP_CODE" -eq 401 ]; then
    echo "❌ Authentication failed. Run /pfLogin to refresh."
  elif [ "$HTTP_CODE" -eq 403 ]; then
    echo "❌ Permission denied. You need Editor role or higher."
  elif [ "$HTTP_CODE" -eq 404 ]; then
    echo "❌ GitHub integration not found. Link a repository first."
  else
    echo "❌ Failed to update auto-complete setting (HTTP $HTTP_CODE)"
  fi
  exit 0
fi

REPO_ARG="$1"

# If no argument, show status
if [ -z "$REPO_ARG" ]; then
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    --connect-timeout 5 \
    --max-time 10 \
    -X GET \
    -H "Accept: application/json" \
    -H "Authorization: Bearer $API_TOKEN" \
    "${API_URL}/projects/${PROJECT_ID}/integrations/github")

  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  if [ "$HTTP_CODE" -eq 200 ]; then
    OWNER=$(echo "$BODY" | jq -r '.data.owner // empty')
    REPO=$(echo "$BODY" | jq -r '.data.repo // empty')

    if [ -n "$OWNER" ] && [ -n "$REPO" ]; then
      AUTO_COMPLETE=$(echo "$BODY" | jq -r '.data.autoComplete // false')
      echo "🐙 GitHub Integration"
      echo ""
      echo "  Repository: $OWNER/$REPO"
      echo "  URL: https://github.com/$OWNER/$REPO"
      echo "  Status: ✓ Connected"
      echo ""
      if [ "$AUTO_COMPLETE" = "true" ]; then
        echo "  ✅ Auto-complete on PR merge: Enabled"
      else
        echo "  ○ Auto-complete on PR merge: Disabled"
      fi
    else
      echo "🐙 GitHub Integration"
      echo ""
      echo "  Status: ○ Not Connected"
      echo ""
      echo "  To link: /pfGithubLink owner/repo"
    fi
  else
    echo "🐙 GitHub Integration"
    echo ""
    echo "  Status: ○ Not Connected"
    echo ""
    echo "  To link: /pfGithubLink owner/repo"
  fi
  exit 0
fi

# Validate repo format
if ! echo "$REPO_ARG" | grep -qE '^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$'; then
  echo "❌ Invalid format: $REPO_ARG"
  echo ""
  echo "Expected: owner/repo"
  echo "Example: /pfGithubLink microsoft/vscode"
  exit 1
fi

# Extract owner and repo
OWNER=$(echo "$REPO_ARG" | cut -d'/' -f1)
REPO=$(echo "$REPO_ARG" | cut -d'/' -f2)

# Link repository
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 15 \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $API_TOKEN" \
  -d "{\"owner\": \"$OWNER\", \"repo\": \"$REPO\"}" \
  "${API_URL}/projects/${PROJECT_ID}/integrations/github")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "✅ GitHub repository linked!"
  echo ""
  echo "  Repository: $OWNER/$REPO"
  echo "  URL: https://github.com/$OWNER/$REPO"
  echo ""
  echo "  You can now:"
  echo "  • /pfGithubBranch T1.1  - Create branch"
  echo "  • /pfGithubIssue T1.1   - Create issue"
elif [ "$HTTP_CODE" -eq 404 ]; then
  echo "❌ Repository not found: $OWNER/$REPO"
elif [ "$HTTP_CODE" -eq 401 ]; then
  echo "❌ Authentication failed. Run /pfLogin to refresh."
elif [ "$HTTP_CODE" -eq 403 ]; then
  echo "❌ Permission denied. You need Editor role or higher."
elif [ "$HTTP_CODE" -eq 409 ]; then
  echo "❌ This repository is already linked to another project."
else
  echo "❌ Failed to link repository (HTTP $HTTP_CODE)"
  echo "$BODY"
fi
```

## Testing

```bash
# Test 1: Show status (not linked)
/pfGithubLink
# Expected: Shows "Not Connected" status

# Test 2: Link repository
/pfGithubLink microsoft/vscode
# Expected: Success message with repo details

# Test 3: Show status (linked)
/pfGithubLink
# Expected: Shows connected repository details with auto-complete status

# Test 4: Invalid format
/pfGithubLink invalid-format
# Expected: Error with format hint

# Test 5: Repo not found
/pfGithubLink nonexistent/nonexistent-repo-12345
# Expected: Error "Repository not found"

# Test 6: Not authenticated
# (Clear token first)
/pfGithubLink owner/repo
# Expected: Error "Not authenticated"

# Test 7: No project linked
# (Clear projectId first)
/pfGithubLink owner/repo
# Expected: Error "No project linked"

# Test 8: Enable auto-complete
/pfGithubLink autocomplete on
# Expected: "✅ Auto-complete is now enabled!"

# Test 9: Disable auto-complete
/pfGithubLink autocomplete off
# Expected: "Auto-complete is now disabled."

# Test 10: Show status (verify auto-complete setting)
/pfGithubLink
# Expected: Shows "✅ Auto-complete on PR merge: Enabled" or "○ Auto-complete on PR merge: Disabled"

# Test 11: Invalid autocomplete argument
/pfGithubLink autocomplete maybe
# Expected: Error with usage hint
```

## Success Criteria

- [ ] Shows current GitHub link status when no arguments
- [ ] Links GitHub repository with owner/repo format
- [ ] Validates repository format before API call
- [ ] Handles all error cases gracefully
- [ ] Updates local config with GitHub info
- [ ] Shows helpful next steps after linking
- [ ] Works in both English and Georgian
- [ ] `/pfGithubLink autocomplete on` enables auto-complete
- [ ] `/pfGithubLink autocomplete off` disables auto-complete
- [ ] Status display shows auto-complete setting
