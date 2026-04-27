---
name: pfCloudList
description: List all cloud projects in your PlanFlow account
---

# PlanFlow Cloud List

List all cloud projects in your PlanFlow account with project cards grid.

## Usage

```bash
/pfCloudList
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

const t = JSON.parse(readFile(`../locales/${language}.json`))
```

## Step 1: Validate Authentication

If not authenticated, display error card:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.sync.notAuthenticated}                                          │
│                                                                              │
│  You must be logged in to view cloud projects.                               │
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /pfLogin               Sign in to PlanFlow                             │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 2: Fetch User's Organizations

First, fetch the user's organizations to get the default organization ID:

**API Call:**
```bash
curl -s \
  -H "Authorization: Bearer {TOKEN}" \
  "https://api.planflow.tools/organizations"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "organizations": [
      { "id": "org-uuid", "name": "My Org", "role": "owner" }
    ]
  }
}
```

Use the first organization with `owner` role, or fall back to the first organization.

## Step 3: Fetch Projects (with Loading)

**Loading Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ☁️  Cloud Projects                                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ⠹ {t.ui.labels.fetching}                                                    │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**API Call:**
```bash
curl -s \
  -H "Authorization: Bearer {TOKEN}" \
  "https://api.planflow.tools/projects?organizationId={ORG_ID}"
```

## Step 4: Display Projects Card

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ☁️  {t.commands.cloud.listProjects}                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── Your Projects ({count}) ─────────────────────────────────────────────    │
│                                                                              │
│  ┌─────────┬─────────────────────────┬─────────┬─────────────────────────┐   │
│  │ ID      │ Name                    │ Tasks   │ Progress                │   │
│  ├─────────┼─────────────────────────┼─────────┼─────────────────────────┤   │
│  │ abc123  │ E-commerce App          │  24/45  │ ██████████░░░░░░░░ 53%  │   │
│  │ def456  │ Mobile API              │  12/18  │ █████████████░░░░░ 67%  │   │
│  │ ghi789  │ Dashboard               │   8/12  │ ███████████████░░░ 75%  │   │
│  └─────────┴─────────────────────────┴─────────┴─────────────────────────┘   │
│                                                                              │
│  ── Current Link ────────────────────────────────────────────────────────    │
│                                                                              │
│  ╭─────────────────────────────────╮                                         │
│  │ ✓ abc123 (E-commerce App)       │                                         │
│  ╰─────────────────────────────────╯                                         │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.commands}                                                   │
│     • /pfCloudLink <id>      Link to a project                               │
│     • /pfCloudUnlink         Disconnect current                              │
│     • /pfCloudNew            Create new project                              │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Example Output (English):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ☁️  Cloud Projects                                                           │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── Your Projects (3) ───────────────────────────────────────────────────    │
│                                                                              │
│  ┌─────────┬─────────────────────────┬─────────┬─────────────────────────┐   │
│  │ ID      │ Name                    │ Tasks   │ Progress                │   │
│  ├─────────┼─────────────────────────┼─────────┼─────────────────────────┤   │
│  │ abc123  │ E-commerce App          │  24/45  │ ██████████░░░░░░░░ 53%  │   │
│  │ def456  │ Mobile API              │  12/18  │ █████████████░░░░░ 67%  │   │
│  │ ghi789  │ Dashboard               │   8/12  │ ███████████████░░░ 75%  │   │
│  └─────────┴─────────────────────────┴─────────┴─────────────────────────┘   │
│                                                                              │
│  ── Current Link ────────────────────────────────────────────────────────    │
│                                                                              │
│  ╭─────────────────────────────────╮                                         │
│  │ ✓ abc123 (E-commerce App)       │                                         │
│  ╰─────────────────────────────────╯                                         │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Commands:                                                                │
│     • /pfCloudLink <id>      Link to a project                               │
│     • /pfCloudUnlink         Disconnect current                              │
│     • /pfCloudNew            Create new project                              │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**No Projects Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ☁️  Cloud Projects                                                           │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── Your Projects (0) ───────────────────────────────────────────────────    │
│                                                                              │
│  No cloud projects yet.                                                      │
│                                                                              │
│  Create your first project to start syncing your plans!                      │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Next Steps:                                                              │
│     • /pfCloudNew            Create a new project                            │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Example Output (Georgian):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ☁️  Cloud პროექტები                                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── თქვენი პროექტები (3) ────────────────────────────────────────────────    │
│                                                                              │
│  ┌─────────┬─────────────────────────┬─────────┬─────────────────────────┐   │
│  │ ID      │ სახელი                  │ ამოცანები│ პროგრესი               │   │
│  ├─────────┼─────────────────────────┼─────────┼─────────────────────────┤   │
│  │ abc123  │ E-commerce App          │  24/45  │ ██████████░░░░░░░░ 53%  │   │
│  │ def456  │ Mobile API              │  12/18  │ █████████████░░░░░ 67%  │   │
│  │ ghi789  │ Dashboard               │   8/12  │ ███████████████░░░ 75%  │   │
│  └─────────┴─────────────────────────┴─────────┴─────────────────────────┘   │
│                                                                              │
│  ── მიმდინარე კავშირი ───────────────────────────────────────────────────    │
│                                                                              │
│  ╭─────────────────────────────────╮                                         │
│  │ ✓ abc123 (E-commerce App)       │                                         │
│  ╰─────────────────────────────────╯                                         │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 ბრძანებები:                                                              │
│     • /pfCloudLink <id>      პროექტთან დაკავშირება                           │
│     • /pfCloudUnlink         გათიშვა                                         │
│     • /pfCloudNew            ახალი პროექტის შექმნა                           │
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
