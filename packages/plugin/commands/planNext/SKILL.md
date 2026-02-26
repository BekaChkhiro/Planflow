---
name: planNext
description: Plan Next Task Recommendation
---

# Plan Next Task Recommendation

You are an intelligent task prioritization assistant. Your role is to analyze the project plan and recommend the best next task to work on.

## Objective

Analyze PROJECT_PLAN.md to find the optimal next task based on dependencies, current phase, complexity, and project momentum.

## Usage

```bash
/planNext
```

No arguments needed - analyzes the entire project state.

## Process

### Step 0: Load User Language & Translations

**CRITICAL: Execute this step FIRST, before any output!**

Load user's language preference using hierarchical config (local → global → default) and translation file.

**Pseudo-code:**
```javascript
// Read config with hierarchy (v1.1.1+)
function getConfig() {
  // Try local config first
  if (fileExists("./.plan-config.json")) {
    try {
      return JSON.parse(readFile("./.plan-config.json"))
    } catch (error) {}
  }

  // Fall back to global config
  const globalPath = expandPath("~/.config/claude/plan-plugin-config.json")
  if (fileExists(globalPath)) {
    try {
      return JSON.parse(readFile(globalPath))
    } catch (error) {}
  }

  // Fall back to defaults
  return { "language": "en" }
}

const config = getConfig()
const language = config.language || "en"

// Cloud config (v1.2.0+) - MERGE global and local configs
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

const mergedConfig = getMergedConfig()
const cloudConfig = mergedConfig.cloud || {}
const isAuthenticated = !!cloudConfig.apiToken
const apiUrl = cloudConfig.apiUrl || "https://api.planflow.tools"
const autoSync = cloudConfig.autoSync || false
const projectId = cloudConfig.projectId || null
const currentUserEmail = cloudConfig.userEmail || null

// Load translations
const translationPath = `locales/${language}.json`
const t = JSON.parse(readFile(translationPath))
```

**Instructions for Claude:**

1. Try to read `./.plan-config.json` (local, highest priority)
2. If not found/corrupted, try `~/.config/claude/plan-plugin-config.json` (global)
3. If not found/corrupted, use default: `language = "en"`
4. Use Read tool: `locales/{language}.json`
5. Store as `t` variable

### Step 0.5: Show Notification Badge (v1.6.0+)

**Purpose:** Display unread notification count to keep users informed of team activity.

**When to Execute:** Only if authenticated AND linked to a project.

**Pseudo-code:**
```javascript
async function showNotificationBadge(cloudConfig, t) {
  // Skip if not authenticated or not linked
  if (!cloudConfig.apiToken || !cloudConfig.projectId) {
    return  // Silently skip
  }

  const apiUrl = cloudConfig.apiUrl || "https://api.planflow.tools"

  try {
    // Fetch unread count (lightweight call with short timeout)
    const response = await fetch(
      `${apiUrl}/projects/${cloudConfig.projectId}/notifications?limit=1&unread=true`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${cloudConfig.apiToken}`,
          "Accept": "application/json"
        },
        timeout: 5000  // 5 second max
      }
    )

    if (response.ok) {
      const data = response.data
      const unreadCount = data.unreadCount || 0

      if (unreadCount > 0) {
        // Display badge
        const label = unreadCount === 1
          ? t.skills.notificationBadge.unreadOne
          : t.skills.notificationBadge.unreadMultiple
        console.log(`🔔 ${unreadCount} ${label} — /pfNotifications ${t.skills.notificationBadge.toView}`)
        console.log("")  // Blank line before main output
      }
    }
  } catch (error) {
    // Silently fail - don't block the command
  }
}
```

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

╭──────────────────────────────────────────────────────────────────────────────╮
│  🎯 Recommended Next Task                                                    │
...
```

**Instructions for Claude:**

1. After loading config and translations (Step 0), check if `cloudConfig.apiToken` AND `cloudConfig.projectId` exist
2. If yes, make a quick API call to fetch notification count
3. If unreadCount > 0, display the badge line with a blank line after
4. If any error occurs (timeout, network, auth), silently skip and continue
5. Proceed to Step 1 regardless of badge result

**Important:** Never let this step block or delay the main command. Use short timeouts and fail silently.

### Step 1: Read PROJECT_PLAN.md

Use the Read tool to read PROJECT_PLAN.md from the current working directory.

If file doesn't exist, output:
```
{t.commands.update.planNotFound}

{t.commands.update.runPlanNew}
```

**Example:**
- EN: "❌ Error: PROJECT_PLAN.md not found in current directory. Please run /planNew first to create a project plan."
- KA: "❌ შეცდომა: PROJECT_PLAN.md არ მოიძებნა მიმდინარე დირექტორიაში. გთხოვთ ჯერ გაუშვათ /planNew პროექტის გეგმის შესაქმნელად."

### Step 2: Parse All Tasks

Extract all tasks with their properties:

For each task (`#### TX.Y: Task Name`), extract:
- **Task ID**: e.g., T1.1
- **Task Name**: e.g., "Project Setup"
- **Status**: TODO, IN_PROGRESS, DONE, BLOCKED
- **Complexity**: Low, Medium, High
- **Estimated**: Hours (e.g., "2 hours")
- **Dependencies**: List of task IDs or "None"
- **Phase**: Derived from task ID (T1.X = Phase 1, T2.X = Phase 2, etc.)
- **Description**: Task details

Create a mental model of all tasks.

### Step 3: Filter Available Tasks

A task is **available** if:
1. ✅ Status is TODO (not DONE, not IN_PROGRESS, not BLOCKED)
2. ✅ All dependencies are completed (status = DONE)
3. ✅ Task is in current phase or earlier incomplete phase

**Current Phase** = Lowest phase number that still has incomplete tasks

Example:
- Phase 1: 3/4 tasks done → Phase 1 is current
- Phase 2: 0/5 tasks done → Not current yet
- Phase 3: 0/3 tasks done → Not current yet

### Step 4: Rank Available Tasks

Score each available task using multiple factors:

#### Factor 1: Phase Priority (Weight: 40%)
```
Score = 100 if in current phase
Score = 50 if in next phase
Score = 0 if beyond next phase
```

Complete earlier phases before starting later ones (mostly).

#### Factor 2: Dependency Impact (Weight: 30%)
```
Count how many tasks depend on this task (directly or indirectly)
Score = (dependent_count / max_dependent_count) × 100
```

Prioritize tasks that unlock many others (critical path).

#### Factor 3: Complexity Balance (Weight: 20%)
```
Check recently completed tasks' complexity:
- If last task was High → prefer Low or Medium (Score: 100)
- If last task was Low → prefer Medium or High (Score: 100)
- Otherwise → Medium complexity gets Score: 100

Prevents burnout and maintains momentum.
```

#### Factor 4: Natural Flow (Weight: 10%)
```
Score = 100 if task ID is sequential (e.g., T1.1, T1.2, T1.3)
Score = 50 otherwise

Following sequential order often makes sense.
```

#### Calculate Total Score
```
Total = (Phase × 0.4) + (Dependencies × 0.3) + (Complexity × 0.2) + (Flow × 0.1)
```

Sort tasks by total score (highest first).

### Step 5: Select Top Recommendation

Pick the highest-scored task as the primary recommendation.

Also identify 2-3 alternative tasks (next highest scores).

### Step 5.5: Fetch Task Assignments (v1.6.0+)

If authenticated and linked to a cloud project, fetch task assignments to show who is working on what.

**Pseudo-code:**
```javascript
let taskAssignments = {}  // Map of taskId -> assignee info

if (isAuthenticated && projectId) {
  // Fetch tasks with assignments from cloud
  const response = await fetch(
    `${apiUrl}/projects/${projectId}/tasks`,
    {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${cloudConfig.apiToken}`,
        "Accept": "application/json"
      }
    }
  )

  if (response.ok) {
    const data = response.data
    const tasks = data.tasks || []

    for (const task of tasks) {
      if (task.assignee) {
        taskAssignments[task.taskId] = {
          email: task.assignee.email,
          name: task.assignee.name || task.assignee.email,
          isCurrentUser: task.assignee.email === currentUserEmail
        }
      }
    }
  }
}
```

**Bash Implementation:**
```bash
API_URL="https://api.planflow.tools"
TOKEN="$API_TOKEN"
PROJECT_ID="$PROJECT_ID"

# Fetch tasks with assignments
RESPONSE=$(curl -s \
  --connect-timeout 5 \
  --max-time 10 \
  -X GET \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "${API_URL}/projects/${PROJECT_ID}/tasks")

# Parse assignee info from response
# Each task has: taskId, assignee: { email, name }
```

**Instructions for Claude:**

1. Only fetch assignments if authenticated AND projectId exists
2. Use a short timeout (5s connect, 10s max) to avoid blocking
3. If fetch fails, continue without assignments (graceful degradation)
4. Store assignments in a map for quick lookup by taskId
5. Track if assignee is the current user for special messaging

### Step 5.6: Fetch GitHub Status (v1.6.0+ - T13.6)

If authenticated, linked to a cloud project, and GitHub is integrated, fetch GitHub-related data for tasks (branches, issues, PRs).

**Pseudo-code:**
```javascript
let githubIntegration = null  // GitHub integration info
let taskGithubStatus = {}     // Map of taskId -> { branch, issue, pr }

if (isAuthenticated && projectId) {
  // Step 1: Check if GitHub is integrated
  const integrationResponse = await fetch(
    `${apiUrl}/projects/${projectId}/integrations/github`,
    {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${cloudConfig.apiToken}`,
        "Accept": "application/json"
      },
      timeout: 5000
    }
  )

  if (integrationResponse.ok) {
    const data = integrationResponse.data
    if (data.owner && data.repo) {
      githubIntegration = {
        owner: data.owner,
        repo: data.repo,
        url: `https://github.com/${data.owner}/${data.repo}`
      }

      // Step 2: Fetch GitHub status for all tasks
      const githubStatusResponse = await fetch(
        `${apiUrl}/projects/${projectId}/github/status`,
        {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${cloudConfig.apiToken}`,
            "Accept": "application/json"
          },
          timeout: 5000
        }
      )

      if (githubStatusResponse.ok) {
        const statusData = githubStatusResponse.data
        const tasks = statusData.tasks || []

        for (const task of tasks) {
          taskGithubStatus[task.taskId] = {
            branch: task.branch || null,      // e.g., "feature/T2.1-implement-login"
            issue: task.issue || null,        // e.g., { number: 42, state: "open", url: "..." }
            pr: task.pr || null               // e.g., { number: 45, state: "open", url: "...", reviewStatus: "awaiting" }
          }
        }
      }
    }
  }
}
```

**Bash Implementation:**
```bash
API_URL="https://api.planflow.tools"
TOKEN="$API_TOKEN"
PROJECT_ID="$PROJECT_ID"

# Step 1: Check if GitHub is integrated
GITHUB_RESPONSE=$(curl -s --connect-timeout 3 --max-time 5 \
  -X GET \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "${API_URL}/projects/${PROJECT_ID}/integrations/github" 2>/dev/null)

GITHUB_OWNER=$(echo "$GITHUB_RESPONSE" | jq -r '.data.owner // empty' 2>/dev/null)
GITHUB_REPO=$(echo "$GITHUB_RESPONSE" | jq -r '.data.repo // empty' 2>/dev/null)

if [ -n "$GITHUB_OWNER" ] && [ -n "$GITHUB_REPO" ]; then
  GITHUB_LINKED=true

  # Step 2: Fetch task GitHub status
  STATUS_RESPONSE=$(curl -s --connect-timeout 3 --max-time 5 \
    -X GET \
    -H "Accept: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    "${API_URL}/projects/${PROJECT_ID}/github/status" 2>/dev/null)

  # Parse GitHub status for each task
  # Response format: { tasks: [{ taskId, branch, issue: { number, state }, pr: { number, state, reviewStatus } }] }
fi
```

**Fallback: Check Local Git Repository:**

If cloud GitHub status is unavailable, check for local branches:

```bash
# Check if we're in a git repo and have branches for tasks
if git rev-parse --git-dir > /dev/null 2>&1; then
  for TASK_ID in $RECOMMENDED_TASKS; do
    # Check for branches matching pattern: feature/T1.1-*, feat/T1.1-*, T1.1-*
    BRANCH=$(git branch --list "feature/${TASK_ID}-*" "feat/${TASK_ID}-*" "${TASK_ID}-*" 2>/dev/null | head -1 | sed 's/^[* ]*//')
    if [ -n "$BRANCH" ]; then
      TASK_BRANCHES["$TASK_ID"]="$BRANCH"
    fi
  done
fi
```

**Instructions for Claude:**

1. Only fetch GitHub status if authenticated AND projectId exists
2. First check if GitHub is integrated (via `/integrations/github`)
3. If integrated, fetch task-specific GitHub data (via `/github/status`)
4. Use short timeouts (3s connect, 5s max) to avoid blocking
5. If cloud fetch fails, try to detect local branches as fallback
6. Store status in a map for quick lookup by taskId
7. Continue without GitHub status if any step fails (graceful degradation)

### Step 6: Generate Recommendation

Display a detailed recommendation using translations.

**Pseudo-code:**
```javascript
const task = recommendedTask
const complexityText = t.templates.complexity[task.complexity.toLowerCase()]
// EN: "Low", "Medium", "High"
// KA: "დაბალი", "საშუალო", "მაღალი"

// Get assignee info for this task (v1.6.0+)
const assignee = taskAssignments[`T${task.id}`] || null

// Get GitHub status for this task (v1.6.0+ T13.6)
const github = taskGithubStatus[`T${task.id}`] || null

let output = t.commands.next.title + "\n\n"
output += t.commands.next.recommendedTask + "\n"
output += `T${task.id}: ${task.name}\n\n`
output += t.commands.next.complexity + " " + complexityText + "\n"
output += t.commands.next.estimated + " " + task.estimated + "\n"
output += t.commands.next.phase + " " + task.phase + "\n"

// Show assignee (v1.6.0+)
if (assignee) {
  if (assignee.isCurrentUser) {
    output += t.commands.next.assignedToYou + "\n"
  } else {
    output += t.commands.next.assignedTo + " " + assignee.name + "\n"
  }
} else {
  output += t.commands.next.unassigned + "\n"
}

// Show GitHub status (v1.6.0+ T13.6)
if (githubIntegration && github) {
  output += formatGithubStatus(github, t)
}

output += "\n" + t.commands.next.dependenciesCompleted + "\n\n"
output += t.commands.next.whyThisTask + "\n"
output += reasons.map(r => "• " + r).join("\n") + "\n"

// Add assignee-specific hints (v1.6.0+)
if (assignee && !assignee.isCurrentUser) {
  output += "• " + t.commands.next.assignedHint + "\n"
} else if (assignee && assignee.isCurrentUser) {
  output += "• " + t.commands.next.youAreAssigned + "\n"
}

output += "\n" + t.commands.next.taskDetails + "\n"
output += task.description + "\n\n"
output += t.commands.next.readyToStart + "\n"
output += `/planUpdate T${task.id} start\n\n`
output += "─".repeat(60) + "\n\n"
output += t.commands.next.alternatives + "\n\n"

// Show assignee and GitHub status in alternatives too (v1.6.0+)
output += alternatives.map((alt, i) => {
  const altAssignee = taskAssignments[`T${alt.id}`]
  const altGithub = taskGithubStatus[`T${alt.id}`]
  let suffixInfo = ""

  // Add assignee info
  if (altAssignee) {
    if (altAssignee.isCurrentUser) {
      suffixInfo += " 👤 (you)"
    } else {
      suffixInfo += ` 👤 ${altAssignee.name}`
    }
  }

  // Add compact GitHub info
  if (githubIntegration && altGithub) {
    suffixInfo += formatGithubStatusCompact(altGithub)
  }

  return `${i+1}. T${alt.id}: ${alt.name} - ${alt.complexity} - ${alt.estimated}${suffixInfo}`
}).join("\n")

// Helper function to format GitHub status for main recommendation
function formatGithubStatus(github, t) {
  let output = ""

  if (github.branch) {
    // Show branch name (truncate if too long)
    const branchName = github.branch.length > 35
      ? github.branch.substring(0, 32) + "..."
      : github.branch
    output += `  🌿 ${t.commands.next.github.branch}: ${branchName}\n`
  }

  if (github.issue) {
    const issueState = github.issue.state === "open"
      ? t.commands.next.github.open
      : t.commands.next.github.closed
    output += `  📋 ${t.commands.next.github.issue}: #${github.issue.number} (${issueState})\n`
  }

  if (github.pr) {
    let prStatus = ""
    if (github.pr.state === "merged") {
      prStatus = t.commands.next.github.merged
    } else if (github.pr.state === "closed") {
      prStatus = t.commands.next.github.closed
    } else if (github.pr.reviewStatus === "approved") {
      prStatus = t.commands.next.github.approved
    } else if (github.pr.reviewStatus === "changes_requested") {
      prStatus = t.commands.next.github.changesRequested
    } else if (github.pr.reviewStatus === "awaiting") {
      prStatus = t.commands.next.github.awaitingReview
    } else {
      prStatus = t.commands.next.github.open
    }
    output += `  🔀 ${t.commands.next.github.pr}: #${github.pr.number} (${prStatus})\n`
  }

  if (!github.branch && !github.issue && !github.pr) {
    // No GitHub activity yet
    output += `  🐙 ${t.commands.next.github.noActivity}\n`
  }

  return output
}

// Helper function for compact GitHub status (used in alternatives list)
function formatGithubStatusCompact(github) {
  const parts = []

  if (github.branch) {
    parts.push("🌿")  // Has branch
  }

  if (github.issue) {
    const state = github.issue.state === "open" ? "" : "✓"
    parts.push(`#${github.issue.number}${state}`)
  }

  if (github.pr) {
    let prIcon = "🔀"
    if (github.pr.state === "merged") {
      prIcon = "✅"
    } else if (github.pr.reviewStatus === "approved") {
      prIcon = "👍"
    } else if (github.pr.reviewStatus === "changes_requested") {
      prIcon = "⚠️"
    }
    parts.push(`${prIcon}PR#${github.pr.number}`)
  }

  return parts.length > 0 ? ` [${parts.join(" ")}]` : ""
}
```

**Example output (English - Unassigned task, no GitHub activity):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🎯 Recommended Next Task                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  T1.2: Database Setup                                                        │
│                                                                              │
│  ── Task Details ──────────────────────────────────────────────────────────  │
│                                                                              │
│  📊 Complexity:   Medium                                                     │
│  ⏱️  Estimated:    4 hours                                                   │
│  🎯 Phase:        1 - Foundation                                             │
│  👤 Assigned:     Unassigned                                                 │
│  🐙 GitHub:       No activity yet                                            │
│                                                                              │
│  ✅ All dependencies completed                                               │
│                                                                              │
│  ── Why This Task? ────────────────────────────────────────────────────────  │
│                                                                              │
│  • Unlocks 3 other tasks                                                     │
│  • Critical for Phase 2 progress                                             │
│  • Good complexity balance after previous task                               │
│                                                                              │
│  ── Description ───────────────────────────────────────────────────────────  │
│                                                                              │
│  Configure PostgreSQL database with connection pooling                       │
│  and initial schema setup...                                                 │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Ready to start?                                                          │
│     • /planUpdate T1.2 start                                                 │
│     • /pfGithubBranch T1.2     Create a branch                               │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

── Alternative Tasks ────────────────────────────────────────────────────────

1. T1.3: Authentication Setup - High - 6 hours
2. T2.1: API Endpoints - Medium - 5 hours 👤 jane@company.com [🌿 #42]
```

**Example output (English - With GitHub branch, issue, and PR):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🎯 Recommended Next Task                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  T2.1: Implement Login API                                                   │
│                                                                              │
│  ── Task Details ──────────────────────────────────────────────────────────  │
│                                                                              │
│  📊 Complexity:   High                                                       │
│  ⏱️  Estimated:    6 hours                                                   │
│  🎯 Phase:        2 - Core Features                                          │
│  👤 Assigned to you                                                          │
│  🌿 Branch:       feature/T2.1-implement-login-api                           │
│  📋 Issue:        #42 (open)                                                 │
│  🔀 PR:           #45 (awaiting review)                                      │
│                                                                              │
│  ✅ All dependencies completed                                               │
│                                                                              │
│  ── Why This Task? ────────────────────────────────────────────────────────  │
│                                                                              │
│  • PR is awaiting review - finish the review cycle!                          │
│  • This task is assigned to you                                              │
│  • Unlocks 3 other tasks                                                     │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Continue working:                                                        │
│     • git checkout feature/T2.1-implement-login-api                          │
│     • Address PR review comments                                             │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Example output (English - Assigned to current user):**
```
🎯 Recommended Next Task

T2.1: API Endpoints

Complexity: Medium
Estimated: 5 hours
Phase: 2 - Core Features
👤 Assigned to you

✅ All dependencies completed

🎯 Why this task?
• Unlocks 3 other tasks
• Critical for Phase 2 progress
• This task is assigned to you - ready to work on!

📝 Task Details:
Implement REST API endpoints for user management...

Ready to start?
/planUpdate T2.1 start

────────────────────────────────────────────────────────────

💡 Alternative Tasks (if this doesn't fit):

1. T2.2: Data Validation - Low - 2 hours
2. T2.3: Error Handling - Medium - 3 hours 👤 bob@company.com
```

**Example output (English - Assigned to someone else):**
```
🎯 Recommended Next Task

T2.3: Error Handling

Complexity: Medium
Estimated: 3 hours
Phase: 2 - Core Features
👤 Assigned to: Jane Smith

✅ All dependencies completed

🎯 Why this task?
• Unlocks 2 other tasks
• This task is already assigned. Consider picking an unassigned task.

📝 Task Details:
Implement global error handling middleware...

Ready to start?
/planUpdate T2.3 start

────────────────────────────────────────────────────────────

💡 Alternative Tasks (if this doesn't fit):

1. T2.4: Logging Setup - Low - 2 hours
2. T2.5: Rate Limiting - Medium - 4 hours 👤 (you)
```

**Example output (Georgian):**
```
🎯 რეკომენდებული შემდეგი ამოცანა

T1.2: მონაცემთა ბაზის დაყენება

სირთულე: საშუალო
შეფასებული: 4 საათი
ეტაპი: 1 - საფუძველი
👤 დაუნიშნავი

✅ ყველა დამოკიდებულება დასრულდა

🎯 რატომ ეს ამოცანა?
• ხსნის 3 სხვა ამოცანას
• კრიტიკული მე-2 ეტაპის პროგრესისთვის
• კარგი სირთულის ბალანსი წინა ამოცანის შემდეგ

📝 ამოცანის დეტალები:
PostgreSQL-ის დაყენება connection pooling-ით
და საწყისი სქემის დაყენებით...

მზად ხართ დასაწყებად?
/planUpdate T1.2 start

────────────────────────────────────────────────────────────

💡 ალტერნატიული ამოცანები (თუ ეს არ გიხდებათ):

1. T1.3: ავთენტიფიკაციის დაყენება - მაღალი - 6 საათი
2. T2.1: API Endpoints - საშუალო - 5 საათი 👤 jane@company.com
```

**Instructions for Claude:**

Use translation keys for all output:
- Title: `t.commands.next.title`
- Recommended task: `t.commands.next.recommendedTask`
- Complexity: `t.commands.next.complexity` + `t.templates.complexity.{low/medium/high}`
- Estimated: `t.commands.next.estimated`
- Phase: `t.commands.next.phase`
- Dependencies: `t.commands.next.dependenciesCompleted`
- Why: `t.commands.next.whyThisTask`
- Details: `t.commands.next.taskDetails`
- Ready: `t.commands.next.readyToStart`
- Alternatives: `t.commands.next.alternatives`

**Assignee translation keys (v1.6.0+):**
- Assigned to: `t.commands.next.assignedTo` + assignee name
- Unassigned: `t.commands.next.unassigned`
- Assigned to you: `t.commands.next.assignedToYou`
- Assigned hint: `t.commands.next.assignedHint` (shown when task is assigned to someone else)
- You are assigned: `t.commands.next.youAreAssigned` (shown when task is assigned to current user)

**GitHub status translation keys (v1.6.0+ T13.6):**
- Branch: `t.commands.next.github.branch`
- Issue: `t.commands.next.github.issue`
- PR: `t.commands.next.github.pr`
- Open: `t.commands.next.github.open`
- Closed: `t.commands.next.github.closed`
- Merged: `t.commands.next.github.merged`
- Approved: `t.commands.next.github.approved`
- Changes Requested: `t.commands.next.github.changesRequested`
- Awaiting Review: `t.commands.next.github.awaitingReview`
- No activity: `t.commands.next.github.noActivity`
- Create branch hint: `t.commands.next.github.createBranchHint`
- Continue working: `t.commands.next.github.continueWorking`
- PR awaiting hint: `t.commands.next.github.prAwaitingHint`

### Step 7: Handle Special Cases

#### Case 1: No Available Tasks (All Blocked or Waiting)

**Pseudo-code:**
```javascript
let output = t.commands.next.noTasks + "\n\n"
output += t.commands.next.projectStatus + "\n"
output += t.commands.next.completed + " " + completedCount + "/" + totalCount + "\n"
output += t.commands.next.inProgress + " " + inProgressCount + "\n"
output += t.commands.next.blocked + " " + blockedCount + "\n"
output += t.commands.next.waitingOnDeps + " " + waitingCount + "\n\n"

if (inProgressTasks.length > 0) {
  output += t.commands.next.tasksInProgress + "\n"
  output += inProgressTasks.map(t => `   ${t.id}: ${t.name}`).join("\n") + "\n\n"
}

if (blockedTasks.length > 0) {
  output += t.commands.next.blockedTasks + "\n"
  output += blockedTasks.map(t => `   ${t.id}: ${t.name}`).join("\n") + "\n\n"
}

output += t.commands.next.suggestedActions + "\n"
output += "1. " + t.commands.next.completeInProgress + "\n"
output += "2. " + t.commands.next.resolveBlockers + "\n"
output += "3. " + t.commands.next.reviewDependencies
```

**Example output (English):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚠️  No Tasks Available                                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  No tasks currently available to work on.                                    │
│                                                                              │
│  ── Project Status ────────────────────────────────────────────────────────  │
│                                                                              │
│  ✅ Completed:              5/18                                             │
│  🔄 In Progress:            2                                                │
│  🚫 Blocked:                1                                                │
│  ⏳ Waiting on Dependencies: 10                                              │
│                                                                              │
│  ── Tasks In Progress ─────────────────────────────────────────────────────  │
│                                                                              │
│  • T1.2: Database Setup                                                      │
│  • T1.3: Authentication                                                      │
│                                                                              │
│  ── Blocked Tasks ─────────────────────────────────────────────────────────  │
│                                                                              │
│  • T2.1: API Endpoints (waiting on design)                                   │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Suggested Actions:                                                       │
│     1. Complete in-progress tasks                                            │
│     2. Resolve blockers on blocked tasks                                     │
│     3. Review dependencies if tasks seem stuck                               │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Instructions for Claude:**

Use translation keys:
- `t.commands.next.noTasks`
- `t.commands.next.projectStatus`
- `t.commands.next.completed`
- `t.commands.next.inProgress`
- `t.commands.next.blocked`
- `t.commands.next.waitingOnDeps`
- `t.commands.next.tasksInProgress`
- `t.commands.next.blockedTasks`
- `t.commands.next.suggestedActions`
- `t.commands.next.completeInProgress`
- `t.commands.next.resolveBlockers`
- `t.commands.next.reviewDependencies`

#### Case 2: All Tasks Complete

**Pseudo-code:**
```javascript
let output = t.commands.next.allComplete + "\n\n"
output += t.commands.next.projectComplete + "\n\n"
output += t.commands.next.whatsNext + "\n"
output += t.commands.next.deploy + "\n"
output += t.commands.next.postMortem + "\n"
output += t.commands.next.gatherFeedback + "\n"
output += t.commands.next.planNextVersion + "\n"
output += t.commands.next.celebrate + "\n\n"
output += t.commands.next.greatWork
```

**Example output (English):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🎉 PROJECT COMPLETE                                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Congratulations! All tasks are complete!                                    │
│                                                                              │
│  ── Project Summary ───────────────────────────────────────────────────────  │
│                                                                              │
│  ✅ Project:   [PROJECT_NAME]                                                │
│  📊 Progress:  ████████████████████████████████ 100%                         │
│  🏆 Tasks:     [Total] completed across [N] phases                           │
│                                                                              │
│  ╭────────────────────────────────────────────────────────────────────────╮  │
│  │  ✨ Project Status: COMPLETE                                           │  │
│  ╰────────────────────────────────────────────────────────────────────────╯  │
│                                                                              │
│  ── What's Next? ──────────────────────────────────────────────────────────  │
│                                                                              │
│  • Deploy to production (if not already)                                     │
│  • Write post-mortem / lessons learned                                       │
│  • Gather user feedback                                                      │
│  • Plan next version/features                                                │
│  • Celebrate your success! 🎊                                                │
│                                                                              │
│  Great work on completing this project! 🚀                                   │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

#### Case 3: Only High-Complexity Tasks Left

```
🎯 Recommended Next Task

╔══════════════════════════════════════════════════════════╗
║  T[X].[Y]: [Task Name]                                   ║
║  📊 Complexity: High ⚠️                                   ║
║  ⏱️  Estimated: [X] hours                                ║
╚══════════════════════════════════════════════════════════╝

⚠️ Note: This is a complex task. Consider:
   • Breaking it down into subtasks
   • Setting aside focused time
   • Getting help if needed
   • Taking breaks during implementation

[Rest of normal recommendation]
```

#### Case 4: Many In-Progress Tasks

If 3+ tasks are IN_PROGRESS:

```
⚠️ You have [N] tasks in progress.

💡 Tip: Consider finishing in-progress tasks before starting new ones:

🔄 In Progress:
   1. T[X].[Y]: [Name] ([Complexity])
   2. T[A].[B]: [Name] ([Complexity])
   3. T[C].[D]: [Name] ([Complexity])

Benefits of finishing first:
   • Clear sense of progress
   • Unlock dependent tasks
   • Maintain focus and momentum
   • Avoid context switching

────────────────────────────────────────────────────────────

Still want to start something new? Here's the recommendation:
[Normal recommendation follows]
```

### Step 8: Consider Context

Provide context-aware advice based on project state:

#### Early in Project (< 25% complete)
```
🌟 Early Stage Tips:
   • Focus on foundation tasks
   • Don't skip setup steps
   • Document as you go
   • Test early and often
```

#### Mid Project (25-75% complete)
```
🚀 Building Momentum:
   • You're making great progress!
   • Keep quality high
   • Watch for scope creep
   • Refactor if needed
```

#### Late Project (> 75% complete)
```
🏁 Final Sprint:
   • Almost there!
   • Don't rush quality
   • Test thoroughly
   • Update documentation
   • Plan deployment
```

## Reasoning Examples

### Example 1: Dependency Unlock

```
🎯 Why this task?
   • Unlocks 3 other tasks (T2.2, T2.3, T2.4)
   • Critical path item - other work depends on this
   • Completing this opens up parallel work opportunities
```

### Example 2: Complexity Balance

```
🎯 Why this task?
   • Medium complexity - good after completing complex T1.3
   • Prevents burnout with more manageable scope
   • Maintains momentum without overwhelming difficulty
```

### Example 3: Phase Progression

```
🎯 Why this task?
   • Last task in Phase 1 - completes foundation
   • Allows moving to Phase 2 (core features)
   • Natural progression point in project
```

### Example 4: Quick Win

```
🎯 Why this task?
   • Low complexity - quick win opportunity
   • Boosts progress percentage significantly
   • Good for maintaining motivation
   • Easy to fit into short work session
```

## Algorithms

### Finding Dependent Tasks

For a given task TX.Y, find tasks that list it in dependencies:

```
For each task T:
  If T.dependencies contains TX.Y:
    Add T to dependents list
```

Count these to determine "unlock value".

### Checking Dependency Satisfaction

For a task to be available, check each dependency:

```
For each dependency D in task.dependencies:
  Find task with ID = D
  If task.status != DONE:
    Return False (not satisfied)
Return True (all satisfied)
```

### Phase Detection

```
Extract phase number from task ID:
  T1.1 → Phase 1
  T2.3 → Phase 2
  T15.7 → Phase 15

Find current phase:
  For phase in [1, 2, 3, 4, ...]:
    If any task in phase is not DONE:
      Return phase
```

## Edge Cases

1. **Circular Dependencies**: Detect and warn user
   ```
   ⚠️ Warning: Circular dependency detected between T2.1 and T2.3
   Please review and fix the dependencies in PROJECT_PLAN.md
   ```

2. **Missing Dependencies**: Task references non-existent task
   ```
   ⚠️ Warning: Task T2.3 depends on T1.5, which doesn't exist
   Treating as satisfied for now.
   ```

3. **Empty Plan**: No tasks defined
   ```
   ⚠️ No tasks found in PROJECT_PLAN.md
   Please add tasks to the "Tasks & Implementation Plan" section.
   ```

## Output Formatting

Use visual elements for clarity:
- ✅ Checkmarks for completed items
- 🔄 In progress indicator
- 🚫 Blocked indicator
- 📊 Complexity indicator
- ⏱️ Time estimate
- 🎯 Goal/recommendation
- 💡 Tips and suggestions
- ⚠️ Warnings
- 🎉 Celebrations

Keep output scannable and actionable.

## Success Criteria

A good recommendation should:
- ✅ Consider all relevant factors (dependencies, phase, complexity)
- ✅ Provide clear reasoning
- ✅ Show task details
- ✅ Offer alternatives
- ✅ Give actionable next steps
- ✅ Be contextually aware
- ✅ Help maintain project momentum
- ✅ Show assignee information when connected to cloud (v1.6.0+)
- ✅ Indicate if task is assigned to current user or someone else
- ✅ Gracefully degrade when not authenticated (no assignee info shown)
- ✅ Show GitHub status when GitHub is integrated (v1.6.0+ T13.6)
- ✅ Display branch name if created for the task
- ✅ Display linked GitHub issue number and state
- ✅ Display linked PR number, state, and review status
- ✅ Provide GitHub-aware hints (create branch, address PR comments)
- ✅ Show compact GitHub info in alternatives list
- ✅ Gracefully degrade when GitHub is not integrated

## Implementation Notes

1. **Parse carefully**: Use regex or string matching to extract task details
2. **Handle variations**: Tasks may have slightly different formatting
3. **Be robust**: Don't fail on minor formatting issues
4. **Calculate accurately**: Ensure dependency logic is correct
5. **Explain well**: Users should understand WHY this task is recommended
6. **Stay positive**: Encourage users and maintain motivation
7. **Fetch assignments gracefully (v1.6.0+)**: Only fetch when authenticated and linked; use short timeouts; continue without assignments if fetch fails
8. **Show assignee context**: Help users understand who is working on what to avoid conflicts
9. **Prioritize unassigned tasks**: When recommending, consider that unassigned tasks may be better choices for the user
10. **Fetch GitHub status gracefully (v1.6.0+ T13.6)**: Check GitHub integration first; use short timeouts; fallback to local git branch detection if cloud unavailable
11. **Provide GitHub-aware hints**: When a task has a branch, suggest checkout; when PR exists, suggest addressing reviews; when no activity, suggest creating a branch
12. **Show compact GitHub info in alternatives**: Use icons (🌿, 🔀, ✅, ⚠️) to indicate GitHub status without overwhelming the list

This command is about **intelligent guidance**, not just listing tasks!
