---
name: pfSyncStatus
description: Show synchronization status between local and PlanFlow cloud
---

# PlanFlow Sync Status

Show synchronization status between local PROJECT_PLAN.md and PlanFlow cloud with comparison card.

## Usage

```bash
/pfSyncStatus
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

## Step 1: Validate Prerequisites

**Not authenticated card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.sync.notAuthenticated}                                          │
│                                                                              │
│  You must be logged in to check sync status.                                 │
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
│     • /pfCloudList           View available projects                         │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 2: Fetch and Compare Status

**Loading Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  📊 Sync Status                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ⠹ {t.ui.labels.fetching}                                                    │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 3: Display Sync Status Card

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  📊 {t.commands.sync.status}                                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── Local vs Cloud ──────────────────────────────────────────────────────    │
│                                                                              │
│  ┌─────────────────────────────────┬─────────────────────────────────────┐   │
│  │ 📁 LOCAL                        │ ☁️  CLOUD                            │   │
│  ├─────────────────────────────────┼─────────────────────────────────────┤   │
│  │ PROJECT_PLAN.md                 │ {projectName}                       │   │
│  │ Modified: 5 min ago             │ Synced: 2 hours ago                 │   │
│  │ Tasks: 15 done, 5 in progress   │ Tasks: 13 done, 7 in progress       │   │
│  └─────────────────────────────────┴─────────────────────────────────────┘   │
│                                                                              │
│  ── Sync Status ─────────────────────────────────────────────────────────    │
│                                                                              │
│  ╭───────────────────╮                                                       │
│  │ ⚠️  Local Ahead    │                                                       │
│  ╰───────────────────╯                                                       │
│                                                                              │
│  ── Changes Detected ────────────────────────────────────────────────────    │
│                                                                              │
│  Local changes (not synced):                                                 │
│  • ✅ T2.1 marked as done                                                    │
│  • ✅ T2.2 marked as done                                                    │
│  • 📝 T3.1 description changed                                               │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /pfSyncPush            Push local changes to cloud                     │
│     • /pfSyncPull            Pull cloud changes (overwrites local)           │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**In Sync Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  📊 Sync Status                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── Local vs Cloud ──────────────────────────────────────────────────────    │
│                                                                              │
│  ┌─────────────────────────────────┬─────────────────────────────────────┐   │
│  │ 📁 LOCAL                        │ ☁️  CLOUD                            │   │
│  ├─────────────────────────────────┼─────────────────────────────────────┤   │
│  │ PROJECT_PLAN.md                 │ E-commerce App                      │   │
│  │ Modified: 30 min ago            │ Synced: 30 min ago                  │   │
│  │ Tasks: 15 done, 5 in progress   │ Tasks: 15 done, 5 in progress       │   │
│  └─────────────────────────────────┴─────────────────────────────────────┘   │
│                                                                              │
│  ── Sync Status ─────────────────────────────────────────────────────────    │
│                                                                              │
│  ╭──────────────────╮                                                        │
│  │ ✓ In Sync        │                                                        │
│  ╰──────────────────╯                                                        │
│                                                                              │
│  Local and cloud are synchronized. No action needed.                         │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Cloud Ahead Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  📊 Sync Status                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── Local vs Cloud ──────────────────────────────────────────────────────    │
│                                                                              │
│  ┌─────────────────────────────────┬─────────────────────────────────────┐   │
│  │ 📁 LOCAL                        │ ☁️  CLOUD                            │   │
│  ├─────────────────────────────────┼─────────────────────────────────────┤   │
│  │ PROJECT_PLAN.md                 │ E-commerce App                      │   │
│  │ Modified: 2 hours ago           │ Synced: 15 min ago                  │   │
│  │ Tasks: 13 done, 7 in progress   │ Tasks: 15 done, 5 in progress       │   │
│  └─────────────────────────────────┴─────────────────────────────────────┘   │
│                                                                              │
│  ── Sync Status ─────────────────────────────────────────────────────────    │
│                                                                              │
│  ╭───────────────────╮                                                       │
│  │ ☁️  Cloud Ahead    │                                                       │
│  ╰───────────────────╯                                                       │
│                                                                              │
│  Cloud has newer changes from team members.                                  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Next Steps:                                                              │
│     • /pfSyncPull            Pull cloud changes to local                     │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

## Error Handling

**Network Error Card:**

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
