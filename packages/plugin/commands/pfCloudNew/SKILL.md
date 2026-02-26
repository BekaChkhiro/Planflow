---
name: pfCloudNew
description: Create a new cloud project in PlanFlow
---

# PlanFlow Cloud New

Create a new cloud project in PlanFlow with creation wizard.

## Usage

```bash
/pfCloudNew                 # Create from local plan (uses plan name)
/pfCloudNew "Project Name"  # Create with custom name
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

  return { ...globalConfig, ...localConfig, _localConfig: localConfig, _globalConfig: globalConfig }
}

const config = getConfig()
const language = config.language || "en"
const cloudConfig = config.cloud || {}
const isAuthenticated = !!cloudConfig.apiToken
const apiUrl = cloudConfig.apiUrl || "https://api.planflow.tools"

const t = JSON.parse(readFile(`locales/${language}.json`))
```

## Step 1: Parse Arguments

```javascript
const projectName = commandArgs.trim().replace(/^["']|["']$/g, '') || null
```

## Step 2: Validate Authentication

If not authenticated, display error card:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.sync.notAuthenticated}                                          │
│                                                                              │
│  You must be logged in to create projects.                                   │
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /pfLogin               Sign in to PlanFlow                             │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 3: Check for PROJECT_PLAN.md

**If no PROJECT_PLAN.md:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.cloud.noPlan}                                                   │
│                                                                              │
│  No PROJECT_PLAN.md found in current directory.                              │
│                                                                              │
│  Create a project plan first before syncing to cloud.                        │
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /planNew               Create a new project plan                       │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 4: Show Creation Card

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ☁️  Create Cloud Project                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ⠹ Creating project on cloud...                                              │
│                                                                              │
│  Project name: {projectName}                                                 │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**API Call:**
```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {TOKEN}" \
  -d '{"name": "Project Name"}' \
  "https://api.planflow.tools/projects"
```

## Step 5: Link and Push

1. Link to new project (save projectId to config)
2. Push current plan

**Progress Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ☁️  Create Cloud Project                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ✓ Step 1: Project created                                                   │
│  ✓ Step 2: Project linked                                                    │
│  ⠹ Step 3: Uploading plan...                                                 │
│                                                                              │
│  Progress: ██████████████████████░░░░░░░░ 66%                                │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 6: Show Success Card

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.cloud.created}                                                  │
│                                                                              │
│  ── Project Details ─────────────────────────────────────────────────────    │
│                                                                              │
│  📁 Project:  My New Project                                                 │
│  🆔 ID:       xyz789                                                         │
│  📊 Tasks:    15                                                             │
│                                                                              │
│  ── Sync Status ─────────────────────────────────────────────────────────    │
│                                                                              │
│  ╭─────────────────╮                                                         │
│  │ ✓ Synced        │                                                         │
│  ╰─────────────────╯                                                         │
│                                                                              │
│  🔗 View at: https://app.planflow.tools/projects/xyz789                      │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /pfTeamInvite          Invite team members                             │
│     • /planNext              Get task recommendation                         │
│     • /planSettingsAutoSync  Enable auto-sync                                │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

## Error Handling

**API Error Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Failed to create project.                                                   │
│                                                                              │
│  The server returned an error. Please try again.                             │
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • Check your internet connection                                         │
│     • Try again later                                                        │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```
