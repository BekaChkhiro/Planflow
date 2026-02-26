---
name: pfCloudLink
description: Link local directory to a PlanFlow cloud project
---

# PlanFlow Cloud Link

Link local directory to a PlanFlow cloud project with selection interface.

## Usage

```bash
/pfCloudLink                # Interactive project selection
/pfCloudLink <project-id>   # Link to specific project
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
const currentProjectId = cloudConfig.projectId
const apiUrl = cloudConfig.apiUrl || "https://api.planflow.tools"

const t = JSON.parse(readFile(`locales/${language}.json`))
```

## Step 1: Parse Arguments

```javascript
const projectIdArg = commandArgs.trim()  // project ID if provided
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
│  You must be logged in to link projects.                                     │
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /pfLogin               Sign in to PlanFlow                             │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 3: Check Current Link

**If already linked, display warning card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚠️  WARNING                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Already linked to: {projectName}                                            │
│                                                                              │
│  Project ID: {currentProjectId}                                              │
│                                                                              │
│  To switch projects, unlink first.                                           │
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /pfCloudUnlink         Unlink current project                          │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 4: Select Project

**If no ID provided, show selection card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🔗 Link to Cloud Project                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── Available Projects ──────────────────────────────────────────────────    │
│                                                                              │
│  [1] E-commerce App                                                          │
│      ID: abc123 | 24/45 tasks | 53%                                          │
│                                                                              │
│  [2] Mobile API                                                              │
│      ID: def456 | 12/18 tasks | 67%                                          │
│                                                                              │
│  [3] Dashboard                                                               │
│      ID: ghi789 | 8/12 tasks | 75%                                           │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

Use AskUserQuestion to select:
```javascript
AskUserQuestion({
  questions: [{
    question: t.commands.cloud.selectProject,
    header: "Project",
    multiSelect: false,
    options: projects.map(p => ({
      label: p.name,
      description: `ID: ${p.id} | ${p.tasksDone}/${p.tasksTotal} tasks`
    }))
  }]
})
```

**If ID provided:**
Verify project exists via API call.

## Step 5: Save Link

**Save to local config (`.plan-config.json`):**
```json
{
  "cloud": {
    "projectId": "selected-uuid"
  }
}
```

## Step 6: Show Success Card

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.cloud.linked}                                                   │
│                                                                              │
│  ── Project Details ─────────────────────────────────────────────────────    │
│                                                                              │
│  📁 Project:  E-commerce App                                                 │
│  🆔 ID:       abc123                                                         │
│  📊 Tasks:    24/45 (53%)                                                    │
│                                                                              │
│  ╭────────────────╮                                                          │
│  │ ✓ Linked       │                                                          │
│  ╰────────────────╯                                                          │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /pfSyncPull            Download cloud plan to local                    │
│     • /pfSyncPush            Upload local plan to cloud                      │
│     • /pfSyncStatus          Check sync status                               │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

## Error Handling

**Project not found card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Project not found: {id}                                                     │
│                                                                              │
│  The project ID doesn't exist or you don't have access.                      │
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /pfCloudList           View available projects                         │
│     • /pfCloudNew            Create a new project                            │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```
