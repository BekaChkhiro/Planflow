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

const t = JSON.parse(readFile(`../locales/${language}.json`))
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

## Step 4: Fetch User's Organizations

**API Call:**
```bash
curl -s -X GET \
  -H "Authorization: Bearer {TOKEN}" \
  "https://api.planflow.tools/organizations"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "organizations": [
      {
        "id": "org-uuid-1",
        "name": "My Company",
        "slug": "my-company",
        "role": "owner"
      },
      {
        "id": "org-uuid-2",
        "name": "Personal",
        "slug": "personal",
        "role": "owner"
      }
    ]
  }
}
```

## Step 5: Select or Create Organization

**If user has NO organizations:**

Create a "Personal" organization first:

```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {TOKEN}" \
  -d '{"name": "Personal", "slug": "personal"}' \
  "https://api.planflow.tools/organizations"
```

Then use the returned `organization.id` as `organizationId`.

**If user has ONE organization:**

Use that organization's `id` as `organizationId` automatically.

**If user has MULTIPLE organizations:**

Ask user to select which organization to create the project in:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ☁️  Select Organization                                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Which organization should this project belong to?                           │
│                                                                              │
│  1. My Company (owner)                                                       │
│  2. Personal (owner)                                                         │
│  3. Team Alpha (editor)                                                      │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

Use the `AskUserQuestion` tool to let the user choose.

**NOTE:** Only organizations where user has `owner`, `admin`, or `editor` role can be used to create projects. Filter out organizations where user has `viewer` role.

## Step 6: Show Creation Card

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ☁️  Create Cloud Project                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ⠹ Creating project on cloud...                                              │
│                                                                              │
│  Project name: {projectName}                                                 │
│  Organization: {organizationName}                                            │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**API Call:**
```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {TOKEN}" \
  -d '{"name": "Project Name", "organizationId": "org-uuid"}' \
  "https://api.planflow.tools/projects"
```

## Step 7: Link and Push

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

## Step 8: Show Success Card

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
