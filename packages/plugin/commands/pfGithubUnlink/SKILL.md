---
name: pfGithubUnlink
description: Unlink a GitHub repository from the current PlanFlow project
---

# PlanFlow GitHub Unlink

Remove the GitHub repository link from the current PlanFlow cloud project.

## Usage

```bash
/pfGithubUnlink                    # Unlink GitHub repository
/pfGithubUnlink --force            # Skip confirmation
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

## Step 1: Validate Prerequisites

### Check Authentication

If not authenticated:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.sync.notAuthenticated}                                          │
│                                                                              │
│  💡 Next Steps:                                                              │
│     • /pfLogin               Sign in to PlanFlow                             │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### Check Project Link

If not linked to a cloud project:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.sync.notLinked}                                                 │
│                                                                              │
│  💡 Next Steps:                                                              │
│     • /pfCloudLink           Link to existing project                        │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 2: Check Current GitHub Link

Fetch current GitHub integration status:

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

### Not Linked

If no GitHub repository is linked:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ℹ️  INFO                                                                    │
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

## Step 3: Confirm Unlink (Unless --force)

If `--force` flag is not provided, show confirmation:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚠️  Confirm Unlink                                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  You are about to unlink the GitHub repository:                              │
│                                                                              │
│  📦 Repository: owner/repo-name                                              │
│  🔗 URL: https://github.com/owner/repo-name                                  │
│                                                                              │
│  ⚠️  This will:                                                               │
│  • Disconnect the repository from this project                               │
│  • Stop auto-completion of tasks on PR merge                                 │
│  • Remove branch/issue linking features                                      │
│                                                                              │
│  Note: This does NOT affect your GitHub repository or issues.                │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

Use AskUserQuestion:

```javascript
AskUserQuestion({
  questions: [{
    question: t.commands.github.confirmUnlink || "Unlink this repository?",
    header: "Confirm",
    multiSelect: false,
    options: [
      { label: "Yes, unlink", description: "Remove GitHub connection" },
      { label: "Cancel", description: "Keep the connection" }
    ]
  }]
})
```

## Step 4: Unlink Repository

Make API call to remove the GitHub integration:

```bash
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 15 \
  -X DELETE \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "${API_URL}/projects/${PROJECT_ID}/integrations/github")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
```

## Step 5: Handle Response

### Success (200/204)

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.github.unlinkSuccess}                                           │
│                                                                              │
│  GitHub repository unlinked.                                                 │
│                                                                              │
│  📦 Removed: owner/repo-name                                                 │
│                                                                              │
│  The repository is no longer connected to this project.                      │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 To link a different repository:                                          │
│     • /pfGithubLink owner/repo                                               │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

### Permission Denied (403)

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.github.noPermission}                                            │
│                                                                              │
│  You don't have permission to unlink repositories.                           │
│                                                                              │
│  Only project Admins and Owners can manage integrations.                     │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### Not Found (404)

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ℹ️  INFO                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  No GitHub repository was linked to this project.                            │
│                                                                              │
│  💡 To link a repository:                                                    │
│     • /pfGithubLink owner/repo                                               │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 6: Update Local Config

Remove GitHub info from local config:

```javascript
// Read current local config
let localConfig = {}
try {
  localConfig = JSON.parse(readFile("./.plan-config.json"))
} catch {}

// Remove GitHub info
delete localConfig.github

// Save
writeFile("./.plan-config.json", JSON.stringify(localConfig, null, 2))
```

## Full Bash Implementation

```bash
#!/bin/bash

# Step 0: Load config
GLOBAL_CONFIG_PATH="$HOME/.config/claude/plan-plugin-config.json"
LOCAL_CONFIG_PATH="./.plan-config.json"

if [ -f "$GLOBAL_CONFIG_PATH" ]; then
  API_TOKEN=$(jq -r '.cloud.apiToken // empty' "$GLOBAL_CONFIG_PATH")
  API_URL=$(jq -r '.cloud.apiUrl // "https://api.planflow.tools"' "$GLOBAL_CONFIG_PATH")
fi

if [ -f "$LOCAL_CONFIG_PATH" ]; then
  PROJECT_ID=$(jq -r '.cloud.projectId // empty' "$LOCAL_CONFIG_PATH")
  LOCAL_TOKEN=$(jq -r '.cloud.apiToken // empty' "$LOCAL_CONFIG_PATH")
  [ -n "$LOCAL_TOKEN" ] && API_TOKEN="$LOCAL_TOKEN"
fi

# Parse flags
FORCE=false
if [ "$1" = "--force" ]; then
  FORCE=true
fi

# Validate prerequisites
if [ -z "$API_TOKEN" ]; then
  echo "❌ Not authenticated. Run /pfLogin first."
  exit 1
fi

if [ -z "$PROJECT_ID" ]; then
  echo "❌ No project linked. Run /pfCloudLink first."
  exit 1
fi

# Check current GitHub link
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 10 \
  -X GET \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $API_TOKEN" \
  "${API_URL}/projects/${PROJECT_ID}/integrations/github")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ne 200 ]; then
  echo "ℹ️ No GitHub repository is linked to this project."
  echo ""
  echo "To link: /pfGithubLink owner/repo"
  exit 0
fi

OWNER=$(echo "$BODY" | jq -r '.data.owner // empty')
REPO=$(echo "$BODY" | jq -r '.data.repo // empty')

if [ -z "$OWNER" ] || [ -z "$REPO" ]; then
  echo "ℹ️ No GitHub repository is linked to this project."
  echo ""
  echo "To link: /pfGithubLink owner/repo"
  exit 0
fi

# Show current link and confirm (unless --force)
if [ "$FORCE" != true ]; then
  echo "⚠️ Confirm Unlink"
  echo ""
  echo "  Repository: $OWNER/$REPO"
  echo "  URL: https://github.com/$OWNER/$REPO"
  echo ""
  echo "This will disconnect the repository from this project."
  echo ""
  # In actual implementation, use AskUserQuestion tool
  # For bash script, we proceed
fi

# Unlink
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 15 \
  -X DELETE \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $API_TOKEN" \
  "${API_URL}/projects/${PROJECT_ID}/integrations/github")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "✅ GitHub repository unlinked!"
  echo ""
  echo "  Removed: $OWNER/$REPO"
  echo ""
  echo "  To link a different repository:"
  echo "  • /pfGithubLink owner/repo"

  # Remove from local config
  if [ -f "$LOCAL_CONFIG_PATH" ]; then
    jq 'del(.github)' "$LOCAL_CONFIG_PATH" > "${LOCAL_CONFIG_PATH}.tmp" && \
      mv "${LOCAL_CONFIG_PATH}.tmp" "$LOCAL_CONFIG_PATH"
  fi
elif [ "$HTTP_CODE" -eq 403 ]; then
  echo "❌ Permission denied. Only Admins can manage integrations."
elif [ "$HTTP_CODE" -eq 401 ]; then
  echo "❌ Authentication failed. Run /pfLogin to refresh."
else
  echo "❌ Failed to unlink repository (HTTP $HTTP_CODE)"
fi
```

## Testing

```bash
# Test 1: Unlink when linked
/pfGithubUnlink
# Expected: Confirmation prompt, then success

# Test 2: Unlink with --force
/pfGithubUnlink --force
# Expected: Skip confirmation, direct unlink

# Test 3: Unlink when not linked
/pfGithubUnlink
# Expected: Info message "No repository linked"

# Test 4: Not authenticated
/pfGithubUnlink
# Expected: Error "Not authenticated"

# Test 5: Permission denied
# (As viewer role)
/pfGithubUnlink
# Expected: Error "Permission denied"
```

## Success Criteria

- [ ] Unlinks GitHub repository from project
- [ ] Shows confirmation before unlinking (unless --force)
- [ ] Handles "not linked" case gracefully
- [ ] Removes GitHub info from local config
- [ ] Shows helpful next steps
- [ ] Works in both English and Georgian
