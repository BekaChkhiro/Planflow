---
name: pfGithubPr
description: Create a Pull Request from a PlanFlow task
---

# PlanFlow GitHub Pull Request

Create or open a Pull Request from a task ID. The PR title, body, and linked issue are automatically generated from task details.

## Usage

```bash
/pfGithubPr T2.1              # Create/open PR for task
/pfGithubPr T2.1 --draft      # Create as draft PR
/pfGithubPr T2.1 --no-open    # Create without opening browser
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

const noOpen = flags.includes("--no-open")
const isDraft = flags.includes("--draft")
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
│  {t.github.pr.invalidTaskId}                                                 │
│                                                                              │
│  Invalid or missing task ID.                                                 │
│                                                                              │
│  Usage: /pfGithubPr <task-id>                                                │
│                                                                              │
│  Examples:                                                                   │
│     • /pfGithubPr T2.1                                                       │
│     • /pfGithubPr T2.1 --draft                                               │
│     • /pfGithubPr T2.1 --no-open                                             │
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
│  You must be logged in to create Pull Requests.                              │
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

### 2e: Check Current Branch

Verify we're not on main/master:

```bash
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
  echo "⚠️  You're on the $CURRENT_BRANCH branch."
  echo ""
  echo "PRs are usually created from feature branches."
  echo ""
  echo "💡 Create a feature branch first:"
  echo "   • /pfGithubBranch $TASK_ID"
  echo ""
  # Continue anyway - user might want to create PR from main for specific cases
fi
```

### 2f: Check for Uncommitted Changes

```bash
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
  echo "⚠️  Warning: You have uncommitted changes"
  echo "   Consider committing before creating a PR."
  echo ""
fi
```

### 2g: Check Remote Tracking

```bash
# Check if current branch is pushed to remote
REMOTE_BRANCH=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null)

if [ -z "$REMOTE_BRANCH" ]; then
  echo "⚠️  Branch not pushed to remote yet."
  echo ""
  echo "Pushing branch to origin..."
  git push -u origin "$CURRENT_BRANCH"
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

## Step 4: Check for Existing PR

### 4a: Query Existing PRs

```bash
# Check if a PR already exists for this task
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 10 \
  -X GET \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "${API_URL}/projects/${PROJECT_ID}/tasks/${TASK_ID}/github-pr")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
  EXISTING_PR_NUMBER=$(echo "$BODY" | jq -r '.data.prNumber // empty')
  EXISTING_PR_URL=$(echo "$BODY" | jq -r '.data.prUrl // empty')
  EXISTING_PR_STATE=$(echo "$BODY" | jq -r '.data.state // empty')

  if [ -n "$EXISTING_PR_NUMBER" ]; then
    # PR already exists
    showExistingPR
  fi
fi
```

### 4b: Show Existing PR Info

If a PR already exists:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🐙 Existing Pull Request Found                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.github.pr.alreadyExists}                                                 │
│                                                                              │
│  ── Pull Request ────────────────────────────────────────────────────────    │
│                                                                              │
│  📝 Task:     T2.1 - Implement login API                                     │
│  🔀 PR:       #45                                                            │
│  🔗 URL:      https://github.com/owner/repo/pull/45                          │
│  📊 State:    open (awaiting review)                                         │
│                                                                              │
│  ╭────────────────────────────────────────────────────────────────────────╮  │
│  │ ✓ PR linked to task T2.1                                               │  │
│  ╰────────────────────────────────────────────────────────────────────────╯  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Options:                                                                 │
│     • View the existing PR in browser                                        │
│     • Close the existing PR to create a new one                              │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 5: Fetch GitHub Integration Details

### 5a: Get Repository Info

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

if [ "$HTTP_CODE" -eq 200 ]; then
  GITHUB_OWNER=$(echo "$BODY" | jq -r '.data.owner // empty')
  GITHUB_REPO=$(echo "$BODY" | jq -r '.data.repo // empty')
  DEFAULT_BRANCH=$(echo "$BODY" | jq -r '.data.defaultBranch // "main"')
fi

if [ -z "$GITHUB_OWNER" ] || [ -z "$GITHUB_REPO" ]; then
  echo "❌ No GitHub repository linked."
  echo ""
  echo "💡 Link a repository first:"
  echo "   • /pfGithubLink owner/repo"
  exit 1
fi
```

### 5b: Check for Linked Issue

```bash
# Check if there's a linked GitHub issue for this task
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 10 \
  -X GET \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "${API_URL}/projects/${PROJECT_ID}/tasks/${TASK_ID}/github-issue")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

LINKED_ISSUE_NUMBER=""
if [ "$HTTP_CODE" -eq 200 ]; then
  LINKED_ISSUE_NUMBER=$(echo "$BODY" | jq -r '.data.issueNumber // empty')
fi
```

## Step 6: Create Pull Request

### 6a: Build PR Title and Body

```javascript
function buildPRTitle(taskId, taskTitle) {
  return `[${taskId}] ${taskTitle}`
}

function buildPRBody(task, linkedIssue) {
  let body = `## Summary

This PR implements task **${task.id}**: ${task.title}

## Task Details

| Property | Value |
|----------|-------|
| Task ID | ${task.id} |
| Complexity | ${task.complexity || 'Not specified'} |
| Status | ${task.status || 'IN_PROGRESS'} |

## Description

${task.description || 'No description provided.'}

## Test Plan

- [ ] TODO: Add test plan

## Checklist

- [ ] Code follows project style guidelines
- [ ] Tests have been added/updated
- [ ] Documentation has been updated (if needed)

---

`

  // Add closes directive
  if (linkedIssue) {
    body += `Closes #${linkedIssue}\n`
  }
  body += `Closes ${task.id}\n\n`
  body += `*This PR was created from [PlanFlow](https://planflow.tools) task ${task.id}.*`

  return body
}
```

### 6b: Create PR via API (Preferred)

```bash
# Build PR title and body
PR_TITLE="[$TASK_ID] $TASK_TITLE"

# Build PR body with proper escaping
PR_BODY="## Summary

This PR implements task **$TASK_ID**: $TASK_TITLE

## Task Details

| Property | Value |
|----------|-------|
| Task ID | $TASK_ID |
| Complexity | ${TASK_COMPLEXITY:-Not specified} |
| Status | ${TASK_STATUS:-IN_PROGRESS} |

## Description

${TASK_DESCRIPTION:-No description provided.}

## Test Plan

- [ ] TODO: Add test plan

## Checklist

- [ ] Code follows project style guidelines
- [ ] Tests have been added/updated
- [ ] Documentation has been updated (if needed)

---

"

# Add closes directive
if [ -n "$LINKED_ISSUE_NUMBER" ]; then
  PR_BODY="${PR_BODY}Closes #${LINKED_ISSUE_NUMBER}
"
fi
PR_BODY="${PR_BODY}Closes $TASK_ID

*This PR was created from [PlanFlow](https://planflow.tools) task $TASK_ID.*"

# Create PR via API
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 15 \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "$(jq -n \
    --arg title "$PR_TITLE" \
    --arg body "$PR_BODY" \
    --arg head "$CURRENT_BRANCH" \
    --arg base "$DEFAULT_BRANCH" \
    --arg taskId "$TASK_ID" \
    --argjson draft "$IS_DRAFT_JSON" \
    '{
      title: $title,
      body: $body,
      head: $head,
      base: $base,
      taskId: $taskId,
      draft: $draft
    }')" \
  "${API_URL}/projects/${PROJECT_ID}/integrations/github/pulls")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
```

### 6c: Fallback to GitHub URL (if API not supported)

If the API doesn't support direct PR creation, generate a GitHub URL with pre-filled content:

```bash
# URL encode the PR body
urlencode() {
  python3 -c "import urllib.parse; print(urllib.parse.quote('''$1''', safe=''))"
}

PR_BODY_ENCODED=$(urlencode "$PR_BODY")
PR_TITLE_ENCODED=$(urlencode "$PR_TITLE")

# Generate GitHub compare/PR URL
COMPARE_URL="https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/compare/${DEFAULT_BRANCH}...${CURRENT_BRANCH}?expand=1&title=${PR_TITLE_ENCODED}&body=${PR_BODY_ENCODED}"

# If draft mode
if [ "$IS_DRAFT" = "true" ]; then
  COMPARE_URL="${COMPARE_URL}&draft=1"
fi

echo "Opening GitHub to create PR..."
echo ""
echo "🔗 $COMPARE_URL"
```

### 6d: Handle API Response

**Success (201):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.github.pr.created}                                                       │
│                                                                              │
│  ── Pull Request Created ─────────────────────────────────────────────────   │
│                                                                              │
│  📝 Task:     T2.1 - Implement login API                                     │
│  🔀 PR:       #45                                                            │
│  🌿 Branch:   feature/T2.1-implement-login-api → main                        │
│  🔗 URL:      https://github.com/owner/repo/pull/45                          │
│  📊 State:    open                                                           │
│                                                                              │
│  ╭────────────────────────────────────────────────────────────────────────╮  │
│  │ ✓ PR linked to task T2.1                                               │  │
│  │ ✓ Will auto-close issue #42 when merged                                │  │
│  ╰────────────────────────────────────────────────────────────────────────╯  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 What's Next?                                                             │
│                                                                              │
│  • Request reviews from team members                                         │
│  • Address any CI/CD feedback                                                │
│  • When approved, merge the PR                                               │
│                                                                              │
│  💡 Tip: When the PR is merged, task T2.1 will be                            │
│     automatically marked as complete!                                        │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Draft PR Created:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.github.pr.draftCreated}                                                  │
│                                                                              │
│  ── Draft Pull Request Created ───────────────────────────────────────────   │
│                                                                              │
│  📝 Task:     T2.1 - Implement login API                                     │
│  🔀 PR:       #45 (draft)                                                    │
│  🌿 Branch:   feature/T2.1-implement-login-api → main                        │
│  🔗 URL:      https://github.com/owner/repo/pull/45                          │
│  📊 State:    draft                                                          │
│                                                                              │
│  💡 Mark as "Ready for Review" when you're done:                             │
│     • Open the PR in GitHub and click "Ready for review"                     │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Branch Not Pushed Error:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.github.pr.branchNotPushed}                                               │
│                                                                              │
│  Branch not found on remote: feature/T2.1-implement-login-api                │
│                                                                              │
│  💡 Push your branch first:                                                  │
│     • git push -u origin feature/T2.1-implement-login-api                    │
│                                                                              │
│  Then try again:                                                             │
│     • /pfGithubPr T2.1                                                       │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**No Commits Difference:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚠️  WARNING                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.github.pr.noCommits}                                                     │
│                                                                              │
│  No commits difference between your branch and main.                         │
│                                                                              │
│  Your branch appears to be up-to-date with main.                             │
│  Make some commits before creating a PR.                                     │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 7: Open PR in Browser

If `--no-open` flag is not set:

```bash
# Open in default browser
if [ "$SHOULD_OPEN" = "true" ] && [ -n "$PR_URL" ]; then
  # macOS
  if command -v open &> /dev/null; then
    open "$PR_URL"
  # Linux
  elif command -v xdg-open &> /dev/null; then
    xdg-open "$PR_URL"
  # Windows (WSL)
  elif command -v wslview &> /dev/null; then
    wslview "$PR_URL"
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
│     • /pfGithubPr T2.1                                                       │
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
│  Permission denied. You don't have access to create Pull Requests.           │
│                                                                              │
│  To create GitHub PRs, you need:                                             │
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
    "pr": {
      "title": "Create Pull Request",
      "created": "Pull Request created successfully!",
      "draftCreated": "Draft Pull Request created!",
      "alreadyExists": "A Pull Request already exists for this task.",
      "taskNotFound": "Task not found.",
      "invalidTaskId": "Invalid task ID format.",
      "branchNotPushed": "Branch not pushed to remote.",
      "noCommits": "No commits difference between branches.",
      "githubError": "GitHub API error.",
      "permissionDenied": "Permission denied.",
      "notLinked": "No GitHub repository linked.",
      "notGitRepo": "Not a git repository.",
      "onMainBranch": "You're on the main branch.",
      "uncommittedChanges": "You have uncommitted changes.",
      "usage": "Usage: /pfGithubPr <task-id>",
      "example": "Example: /pfGithubPr T2.1",
      "task": "Task:",
      "pr": "PR:",
      "branch": "Branch:",
      "url": "URL:",
      "state": "State:",
      "linked": "PR linked to task",
      "willAutoClose": "Will auto-close issue when merged",
      "autoCompleteTip": "When the PR is merged, the task will be automatically marked as complete!",
      "whatsNext": "What's Next?",
      "requestReviews": "Request reviews from team members",
      "addressCI": "Address any CI/CD feedback",
      "mergePR": "When approved, merge the PR",
      "markReady": "Mark as \"Ready for Review\" when done"
    }
  }
}
```

**Georgian translations:**

```json
{
  "github": {
    "pr": {
      "title": "Pull Request-ის შექმნა",
      "created": "Pull Request წარმატებით შეიქმნა!",
      "draftCreated": "Draft Pull Request შეიქმნა!",
      "alreadyExists": "ამ ამოცანისთვის Pull Request უკვე არსებობს.",
      "taskNotFound": "ამოცანა ვერ მოიძებნა.",
      "invalidTaskId": "ამოცანის ID-ის არასწორი ფორმატი.",
      "branchNotPushed": "ბრანჩი არ არის push-ული remote-ზე.",
      "noCommits": "ბრანჩებს შორის კომიტების სხვაობა არ არის.",
      "githubError": "GitHub API-ის შეცდომა.",
      "permissionDenied": "წვდომა აკრძალულია.",
      "notLinked": "GitHub რეპოზიტორია არ არის დაკავშირებული.",
      "notGitRepo": "ეს არ არის git რეპოზიტორია.",
      "onMainBranch": "თქვენ main ბრანჩზე ხართ.",
      "uncommittedChanges": "გაქვთ შეუნახავი ცვლილებები.",
      "usage": "გამოყენება: /pfGithubPr <task-id>",
      "example": "მაგალითი: /pfGithubPr T2.1",
      "task": "ამოცანა:",
      "pr": "PR:",
      "branch": "ბრანჩი:",
      "url": "URL:",
      "state": "სტატუსი:",
      "linked": "PR დაკავშირებულია ამოცანასთან",
      "willAutoClose": "Issue ავტომატურად დაიხურება merge-ისას",
      "autoCompleteTip": "PR-ის merge-ისას ამოცანა ავტომატურად დასრულდება!",
      "whatsNext": "შემდეგი ნაბიჯები?",
      "requestReviews": "მოითხოვეთ review გუნდის წევრებისგან",
      "addressCI": "გაითვალისწინეთ CI/CD feedback",
      "mergePR": "დამტკიცებისას გააერთიანეთ PR",
      "markReady": "მონიშნეთ \"Ready for Review\" დასრულებისას"
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
IS_DRAFT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-open)
      NO_OPEN=true
      shift
      ;;
    --draft)
      IS_DRAFT=true
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

# Convert draft flag to JSON boolean
if [ "$IS_DRAFT" = "true" ]; then
  IS_DRAFT_JSON="true"
else
  IS_DRAFT_JSON="false"
fi

# Validate task ID format
if [ -z "$TASK_ID" ] || ! echo "$TASK_ID" | grep -qiE '^T[0-9]+\.[0-9]+$'; then
  echo "╭──────────────────────────────────────────────────────────────────────────────╮"
  echo "│  ❌ ERROR                                                                    │"
  echo "├──────────────────────────────────────────────────────────────────────────────┤"
  echo "│                                                                              │"
  echo "│  Invalid or missing task ID: $TASK_ID"
  echo "│                                                                              │"
  echo "│  Usage: /pfGithubPr <task-id>                                                │"
  echo "│                                                                              │"
  echo "│  Examples:                                                                   │"
  echo "│     • /pfGithubPr T2.1                                                       │"
  echo "│     • /pfGithubPr T2.1 --draft                                               │"
  echo "│     • /pfGithubPr T2.1 --no-open                                             │"
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

# Check if in git repo
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  echo "❌ Not a git repository"
  echo ""
  echo "Please run this command from within a git repository."
  exit 1
fi

# Get current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Warn if on main/master
if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
  echo "⚠️  You're on the $CURRENT_BRANCH branch."
  echo ""
  echo "PRs are usually created from feature branches."
  echo ""
  echo "💡 Create a feature branch first:"
  echo "   • /pfGithubBranch $TASK_ID"
  echo ""
  read -p "Continue anyway? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 0
  fi
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
  echo "⚠️  Warning: You have uncommitted changes"
  echo "   Consider committing before creating a PR."
  echo ""
fi

# Check if branch is pushed to remote
REMOTE_BRANCH=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null)
if [ -z "$REMOTE_BRANCH" ]; then
  echo "📤 Branch not pushed to remote. Pushing now..."
  if ! git push -u origin "$CURRENT_BRANCH" 2>/dev/null; then
    echo ""
    echo "╭──────────────────────────────────────────────────────────────────────────────╮"
    echo "│  ❌ ERROR                                                                    │"
    echo "├──────────────────────────────────────────────────────────────────────────────┤"
    echo "│                                                                              │"
    echo "│  Failed to push branch to remote.                                            │"
    echo "│                                                                              │"
    echo "│  💡 Push manually first:                                                     │"
    echo "│     • git push -u origin $CURRENT_BRANCH"
    echo "│                                                                              │"
    echo "│  Then try again:                                                             │"
    echo "│     • /pfGithubPr $TASK_ID                                                   │"
    echo "│                                                                              │"
    echo "╰──────────────────────────────────────────────────────────────────────────────╯"
    exit 1
  fi
  echo "✅ Branch pushed to origin/$CURRENT_BRANCH"
  echo ""
fi

echo "🔍 Fetching task and repository details..."

# Fetch task details from cloud
TASK_TITLE=""
TASK_DESCRIPTION=""
TASK_STATUS=""
TASK_COMPLEXITY=""

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
  echo "│  Task not found: $TASK_ID"
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

# Fetch GitHub integration info
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 10 \
  -X GET \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $API_TOKEN" \
  "${API_URL}/projects/${PROJECT_ID}/integrations/github" 2>/dev/null)

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

GITHUB_OWNER=""
GITHUB_REPO=""
DEFAULT_BRANCH="main"

if [ "$HTTP_CODE" -eq 200 ]; then
  GITHUB_OWNER=$(echo "$BODY" | jq -r '.data.owner // empty' 2>/dev/null)
  GITHUB_REPO=$(echo "$BODY" | jq -r '.data.repo // empty' 2>/dev/null)
  DEFAULT_BRANCH=$(echo "$BODY" | jq -r '.data.defaultBranch // "main"' 2>/dev/null)
fi

if [ -z "$GITHUB_OWNER" ] || [ -z "$GITHUB_REPO" ]; then
  echo "╭──────────────────────────────────────────────────────────────────────────────╮"
  echo "│  ❌ ERROR                                                                    │"
  echo "├──────────────────────────────────────────────────────────────────────────────┤"
  echo "│                                                                              │"
  echo "│  No GitHub repository is linked to this project.                             │"
  echo "│                                                                              │"
  echo "│  💡 To link a repository:                                                    │"
  echo "│     • /pfGithubLink owner/repo                                               │"
  echo "│                                                                              │"
  echo "╰──────────────────────────────────────────────────────────────────────────────╯"
  exit 1
fi

# Check for linked GitHub issue
LINKED_ISSUE_NUMBER=""
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 10 \
  -X GET \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $API_TOKEN" \
  "${API_URL}/projects/${PROJECT_ID}/tasks/${TASK_ID}/github-issue" 2>/dev/null)

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
  LINKED_ISSUE_NUMBER=$(echo "$BODY" | jq -r '.data.issueNumber // empty' 2>/dev/null)
fi

echo "🔀 Creating Pull Request for: $TASK_ID - $TASK_TITLE"

# Build PR title
PR_TITLE="[$TASK_ID] $TASK_TITLE"

# Handle null/empty description
if [ -z "$TASK_DESCRIPTION" ] || [ "$TASK_DESCRIPTION" = "null" ]; then
  TASK_DESCRIPTION="No description provided."
fi

# Build closes directive
CLOSES_DIRECTIVE=""
if [ -n "$LINKED_ISSUE_NUMBER" ]; then
  CLOSES_DIRECTIVE="Closes #${LINKED_ISSUE_NUMBER}"$'\n'
fi
CLOSES_DIRECTIVE="${CLOSES_DIRECTIVE}Closes $TASK_ID"

# Create PR via API
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 15 \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $API_TOKEN" \
  -d "$(jq -n \
    --arg title "$PR_TITLE" \
    --arg head "$CURRENT_BRANCH" \
    --arg base "$DEFAULT_BRANCH" \
    --arg taskId "$TASK_ID" \
    --arg complexity "${TASK_COMPLEXITY:-Not specified}" \
    --arg status "${TASK_STATUS:-IN_PROGRESS}" \
    --arg description "$TASK_DESCRIPTION" \
    --arg closes "$CLOSES_DIRECTIVE" \
    --argjson draft "$IS_DRAFT_JSON" \
    '{
      title: $title,
      head: $head,
      base: $base,
      taskId: $taskId,
      draft: $draft,
      body: "## Summary\n\nThis PR implements task **\($taskId)**: \($title | split("] ") | .[1] // $title)\n\n## Task Details\n\n| Property | Value |\n|----------|-------|\n| Task ID | \($taskId) |\n| Complexity | \($complexity) |\n| Status | \($status) |\n\n## Description\n\n\($description)\n\n## Test Plan\n\n- [ ] TODO: Add test plan\n\n## Checklist\n\n- [ ] Code follows project style guidelines\n- [ ] Tests have been added/updated\n- [ ] Documentation has been updated (if needed)\n\n---\n\n\($closes)\n\n*This PR was created from [PlanFlow](https://planflow.tools) task \($taskId).*"
    }')" \
  "${API_URL}/projects/${PROJECT_ID}/integrations/github/pulls")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  PR_NUMBER=$(echo "$BODY" | jq -r '.data.prNumber // .data.number // empty')
  PR_URL=$(echo "$BODY" | jq -r '.data.prUrl // .data.url // .data.html_url // empty')
  PR_STATE=$(echo "$BODY" | jq -r '.data.state // "open"')

  if [ "$IS_DRAFT" = "true" ]; then
    PR_STATE="draft"
  fi

  echo ""
  echo "╭──────────────────────────────────────────────────────────────────────────────╮"
  echo "│  ✅ SUCCESS                                                                  │"
  echo "├──────────────────────────────────────────────────────────────────────────────┤"
  echo "│                                                                              │"
  if [ "$IS_DRAFT" = "true" ]; then
    echo "│  Draft Pull Request created!                                                 │"
  else
    echo "│  Pull Request created successfully!                                          │"
  fi
  echo "│                                                                              │"
  echo "│  ── Pull Request Created ─────────────────────────────────────────────────   │"
  echo "│                                                                              │"
  echo "│  📝 Task:     $TASK_ID - $TASK_TITLE"
  echo "│  🔀 PR:       #$PR_NUMBER"
  echo "│  🌿 Branch:   $CURRENT_BRANCH → $DEFAULT_BRANCH"
  echo "│  🔗 URL:      $PR_URL"
  echo "│  📊 State:    $PR_STATE"
  echo "│                                                                              │"
  echo "│  ╭────────────────────────────────────────────────────────────────────────╮  │"
  echo "│  │ ✓ PR linked to task $TASK_ID                                           │  │"
  if [ -n "$LINKED_ISSUE_NUMBER" ]; then
    echo "│  │ ✓ Will auto-close issue #$LINKED_ISSUE_NUMBER when merged                │  │"
  fi
  echo "│  ╰────────────────────────────────────────────────────────────────────────╯  │"
  echo "│                                                                              │"
  echo "├──────────────────────────────────────────────────────────────────────────────┤"
  echo "│                                                                              │"
  echo "│  💡 What's Next?                                                             │"
  echo "│                                                                              │"
  if [ "$IS_DRAFT" = "true" ]; then
    echo "│  • Mark as \"Ready for Review\" when done                                     │"
  fi
  echo "│  • Request reviews from team members                                         │"
  echo "│  • Address any CI/CD feedback                                                │"
  echo "│  • When approved, merge the PR                                               │"
  echo "│                                                                              │"
  echo "│  💡 Tip: When the PR is merged, task $TASK_ID will be                         │"
  echo "│     automatically marked as complete!                                        │"
  echo "│                                                                              │"
  echo "╰──────────────────────────────────────────────────────────────────────────────╯"

  # Open in browser if requested
  if [ "$NO_OPEN" = "false" ] && [ -n "$PR_URL" ]; then
    if command -v open &> /dev/null; then
      open "$PR_URL" 2>/dev/null
    elif command -v xdg-open &> /dev/null; then
      xdg-open "$PR_URL" 2>/dev/null
    elif command -v wslview &> /dev/null; then
      wslview "$PR_URL" 2>/dev/null
    fi
  fi

  exit 0
elif [ "$HTTP_CODE" -eq 401 ]; then
  echo "❌ Authentication failed. Run /pfLogin to refresh."
  exit 1
elif [ "$HTTP_CODE" -eq 403 ]; then
  echo "❌ Permission denied. You need Editor role and GitHub write access."
  exit 1
elif [ "$HTTP_CODE" -eq 404 ]; then
  echo "❌ Task, project, or branch not found."
  exit 1
elif [ "$HTTP_CODE" -eq 409 ]; then
  # PR already exists
  EXISTING_URL=$(echo "$BODY" | jq -r '.data.existingPrUrl // .data.prUrl // empty')
  EXISTING_NUMBER=$(echo "$BODY" | jq -r '.data.existingPrNumber // .data.prNumber // empty')
  EXISTING_STATE=$(echo "$BODY" | jq -r '.data.state // "open"')

  echo ""
  echo "╭──────────────────────────────────────────────────────────────────────────────╮"
  echo "│  🐙 Existing Pull Request Found                                              │"
  echo "├──────────────────────────────────────────────────────────────────────────────┤"
  echo "│                                                                              │"
  echo "│  A Pull Request already exists for this task.                                │"
  echo "│                                                                              │"
  echo "│  ── Pull Request ────────────────────────────────────────────────────────    │"
  echo "│                                                                              │"
  echo "│  📝 Task:     $TASK_ID - $TASK_TITLE"
  echo "│  🔀 PR:       #$EXISTING_NUMBER"
  echo "│  🔗 URL:      $EXISTING_URL"
  echo "│  📊 State:    $EXISTING_STATE"
  echo "│                                                                              │"
  echo "│  ╭────────────────────────────────────────────────────────────────────────╮  │"
  echo "│  │ ✓ PR linked to task $TASK_ID                                           │  │"
  echo "│  ╰────────────────────────────────────────────────────────────────────────╯  │"
  echo "│                                                                              │"
  echo "├──────────────────────────────────────────────────────────────────────────────┤"
  echo "│                                                                              │"
  echo "│  💡 Options:                                                                 │"
  echo "│     • View the existing PR in browser                                        │"
  echo "│     • Close the existing PR to create a new one                              │"
  echo "│                                                                              │"
  echo "╰──────────────────────────────────────────────────────────────────────────────╯"

  # Open existing PR
  if [ "$NO_OPEN" = "false" ] && [ -n "$EXISTING_URL" ]; then
    if command -v open &> /dev/null; then
      open "$EXISTING_URL" 2>/dev/null
    elif command -v xdg-open &> /dev/null; then
      xdg-open "$EXISTING_URL" 2>/dev/null
    fi
  fi
  exit 0
elif [ "$HTTP_CODE" -eq 422 ]; then
  # Validation error - possibly no commits or branch issue
  ERROR_MSG=$(echo "$BODY" | jq -r '.error.message // .message // "Validation failed"')
  echo ""
  echo "╭──────────────────────────────────────────────────────────────────────────────╮"
  echo "│  ❌ ERROR                                                                    │"
  echo "├──────────────────────────────────────────────────────────────────────────────┤"
  echo "│                                                                              │"
  echo "│  Cannot create Pull Request: $ERROR_MSG"
  echo "│                                                                              │"
  echo "│  Possible reasons:                                                           │"
  echo "│  • No commits between branches                                               │"
  echo "│  • Branch doesn't exist on remote                                            │"
  echo "│  • A PR already exists for this branch                                       │"
  echo "│                                                                              │"
  echo "│  💡 Try:                                                                     │"
  echo "│     • Make sure you have commits to include                                  │"
  echo "│     • git push origin $CURRENT_BRANCH"
  echo "│     • Check existing PRs on GitHub                                           │"
  echo "│                                                                              │"
  echo "╰──────────────────────────────────────────────────────────────────────────────╯"
  exit 1
else
  echo "╭──────────────────────────────────────────────────────────────────────────────╮"
  echo "│  ❌ ERROR                                                                    │"
  echo "├──────────────────────────────────────────────────────────────────────────────┤"
  echo "│                                                                              │"
  echo "│  Failed to create Pull Request (HTTP $HTTP_CODE)"
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
# Test 1: Create PR for valid task
/pfGithubPr T2.1
# Expected: Creates PR and opens in browser

# Test 2: Create draft PR
/pfGithubPr T2.1 --draft
# Expected: Creates draft PR

# Test 3: Create without opening browser
/pfGithubPr T2.1 --no-open
# Expected: Creates PR, shows URL but doesn't open

# Test 4: PR already exists
/pfGithubPr T2.1
# Expected: Shows existing PR info

# Test 5: Invalid task ID
/pfGithubPr invalid
# Expected: Error with format hint

# Test 6: Task not found
/pfGithubPr T99.99
# Expected: Error with suggestions

# Test 7: Not on feature branch
git checkout main
/pfGithubPr T2.1
# Expected: Warning about being on main

# Test 8: Branch not pushed
git checkout -b new-branch
/pfGithubPr T2.1
# Expected: Pushes branch first, then creates PR

# Test 9: Not authenticated
# (Clear token first)
/pfGithubPr T2.1
# Expected: Error "Not authenticated"

# Test 10: GitHub not linked
# (Unlink GitHub first)
/pfGithubPr T2.1
# Expected: Error "No GitHub repository linked"
```

## Success Criteria

- [ ] Creates GitHub PR from task ID with proper title/body
- [ ] Opens created PR in browser by default
- [ ] --draft flag creates draft PR
- [ ] --no-open flag prevents browser opening
- [ ] Handles existing PRs gracefully (shows link)
- [ ] Links to related GitHub issue if one exists
- [ ] Auto-pushes branch if not on remote
- [ ] Warns if on main/master branch
- [ ] Falls back to local PROJECT_PLAN.md when cloud unavailable
- [ ] Shows helpful next steps after creation
- [ ] Validates prerequisites (auth, project, GitHub link, git repo)
- [ ] Works in both English and Georgian
