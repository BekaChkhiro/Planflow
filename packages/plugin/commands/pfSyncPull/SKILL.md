---
name: pfSyncPull
description: Pull plan from PlanFlow cloud to local PROJECT_PLAN.md
---

# PlanFlow Sync Pull

Pull plan from PlanFlow cloud to local PROJECT_PLAN.md with progress animation.

## Usage

```bash
/pfSyncPull                 # Pull cloud → local
/pfSyncPull --force         # Overwrite local without confirmation
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
│  You must be logged in to pull from cloud.                                   │
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
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 3: Pull from Cloud

**Loading Card (during pull):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ☁️  Pull from Cloud                                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ⠹ {t.ui.labels.downloading}                                                 │
│                                                                              │
│  Progress: ████████████████████░░░░░░░░░░ 66%                                │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

1. GET plan from API
2. Show diff if local exists (unless --force)
3. Write to PROJECT_PLAN.md

**API Call:**
```bash
curl -s \
  -H "Authorization: Bearer {TOKEN}" \
  "https://api.planflow.tools/projects/{PROJECT_ID}/plan"
```

## Step 4: Show Diff Card (if local exists and differs)

**If local exists and differs (without --force):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚠️  Confirm Overwrite                                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.sync.localChanges}                                              │
│                                                                              │
│  Local PROJECT_PLAN.md has changes that will be overwritten.                 │
│                                                                              │
│  ── Changes ─────────────────────────────────────────────────────────────    │
│                                                                              │
│  Local → Cloud differences:                                                  │
│  - T1.1: IN_PROGRESS → DONE (local)                                          │
│  + T1.2: Added description (cloud)                                           │
│  ~ T2.1: Status differs                                                      │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────   │
│                                                                              │
│  [1] Pull and overwrite local                                                │
│  [2] Cancel                                                                  │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

Use AskUserQuestion to confirm.

## Step 5: Show Success Card

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.sync.pullSuccess}                                               │
│                                                                              │
│  ── Download Details ────────────────────────────────────────────────────    │
│                                                                              │
│  📁 File:         PROJECT_PLAN.md                                            │
│  ☁️  From:         {projectName}                                              │
│  📊 Tasks:        {tasksCount}                                               │
│  ✅ Completed:    {completedCount}                                           │
│                                                                              │
│  Progress: ████████████████████░░░░░░░░░░ {progress}%                        │
│                                                                              │
│  ╭────────────────────╮                                                      │
│  │ ✓ Downloaded       │  at {timestamp}                                      │
│  ╰────────────────────╯                                                      │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /planNext              Get next task recommendation                    │
│     • /planUpdate            Update task status                              │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

## Error Handling

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

**Project not found card:**

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
│     • /pfCloudList           View available projects                         │
│     • /pfCloudLink           Link to a different project                     │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```
