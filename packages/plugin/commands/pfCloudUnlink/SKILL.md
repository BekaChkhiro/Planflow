---
name: pfCloudUnlink
description: Disconnect from current PlanFlow cloud project
---

# PlanFlow Cloud Unlink

Disconnect from current PlanFlow cloud project with confirmation card.

## Usage

```bash
/pfCloudUnlink
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

## Step 1: Check if Linked

**If not linked, display info card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ℹ️  INFO                                                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.cloud.notLinked}                                                │
│                                                                              │
│  Not currently linked to any cloud project.                                  │
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /pfCloudLink           Link to a cloud project                         │
│     • /pfCloudList           View available projects                         │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 2: Remove Link

**Remove from local config:**
Remove `cloud.projectId` from `.plan-config.json`

## Step 3: Show Success Card

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.cloud.unlinkSuccess}                                            │
│                                                                              │
│  {t.commands.cloud.unlinkDetails}                                            │
│                                                                              │
│  ── What's Changed ──────────────────────────────────────────────────────    │
│                                                                              │
│  • Project unlinked from cloud                                               │
│  • LOCAL PROJECT_PLAN.md is now independent                                  │
│  • Cloud project data NOT deleted                                            │
│  • Auto-sync disabled for this project                                       │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /pfCloudLink           Link to a different project                     │
│     • /pfCloudList           View your cloud projects                        │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Example Output (English):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Project unlinked.                                                           │
│                                                                              │
│  Local project is no longer linked to cloud.                                 │
│                                                                              │
│  ── What's Changed ──────────────────────────────────────────────────────    │
│                                                                              │
│  • Project unlinked from cloud                                               │
│  • LOCAL PROJECT_PLAN.md is now independent                                  │
│  • Cloud project data NOT deleted                                            │
│  • Auto-sync disabled for this project                                       │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Next Steps:                                                              │
│     • /pfCloudLink           Link to a different project                     │
│     • /pfCloudList           View your cloud projects                        │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Example Output (Georgian):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ წარმატება                                                                │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  პროექტი გაითიშა.                                                            │
│                                                                              │
│  ლოკალური პროექტი აღარ არის დაკავშირებული cloud-თან.                         │
│                                                                              │
│  ── რა შეიცვალა ─────────────────────────────────────────────────────────    │
│                                                                              │
│  • პროექტი გათიშულია cloud-დან                                               │
│  • ლოკალური PROJECT_PLAN.md დამოუკიდებელია                                   │
│  • Cloud პროექტის მონაცემები არ წაშლილა                                      │
│  • ავტო-სინქრონიზაცია გამორთულია                                             │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 შემდეგი ნაბიჯები:                                                        │
│     • /pfCloudLink           სხვა პროექტთან დაკავშირება                      │
│     • /pfCloudList           Cloud პროექტების ნახვა                          │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```
