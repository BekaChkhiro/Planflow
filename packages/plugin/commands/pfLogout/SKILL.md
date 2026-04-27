---
name: pfLogout
description: PlanFlow Logout
---

# PlanFlow Logout

Clear PlanFlow credentials and disconnect from cloud with confirmation card.

**IMPORTANT:** This is ONLY for PlanFlow (planflow.tools) - NOT for Claude or Claude Code logout.

## Usage

```bash
/pfLogout                   # Clear credentials
```

## Step 0: Load Configuration

```javascript
function getConfig() {
  const globalConfigPath = expandPath("~/.config/claude/plan-plugin-config.json")
  if (fileExists(globalConfigPath)) {
    try {
      return JSON.parse(readFile(globalConfigPath))
    } catch (error) {}
  }
  return { "language": "en" }
}

const config = getConfig()
const language = config.language || "en"
const cloudConfig = config.cloud || {}
const isAuthenticated = !!cloudConfig.apiToken

const t = JSON.parse(readFile(`../locales/${language}.json`))
```

## Step 1: Check Auth Status

If not authenticated, display info card:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ℹ️  INFO                                                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.logout.notLoggedIn}                                             │
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /pfLogin               Sign in to PlanFlow                             │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Example (English):**
```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ℹ️  INFO                                                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  You are not currently logged in.                                            │
│                                                                              │
│  💡 Next Steps:                                                              │
│     • /pfLogin               Sign in to PlanFlow                             │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 2: Clear Credentials

Remove from global config (`~/.config/claude/plan-plugin-config.json`):
- `cloud.apiToken`
- `cloud.userId`
- `cloud.userEmail`

Keep other settings like `language` and `cloud.apiUrl`.

## Step 3: Show Success Card

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.logout.success}                                                 │
│                                                                              │
│  {t.commands.logout.cleared}                                                 │
│                                                                              │
│  ── What's Changed ──────────────────────────────────────────────────────    │
│                                                                              │
│  • API token removed                                                         │
│  • Cloud sync disabled                                                       │
│  • Local settings preserved                                                  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /pfLogin               Sign in again                                   │
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
│  Successfully logged out from PlanFlow.                                      │
│                                                                              │
│  Credentials cleared from global config.                                     │
│                                                                              │
│  ── What's Changed ──────────────────────────────────────────────────────    │
│                                                                              │
│  • API token removed                                                         │
│  • Cloud sync disabled                                                       │
│  • Local settings preserved                                                  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Next Steps:                                                              │
│     • /pfLogin               Sign in again                                   │
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
│  წარმატებით გამოხვედით PlanFlow-დან.                                         │
│                                                                              │
│  კრედენციალები წაიშალა გლობალური კონფიგურაციიდან.                            │
│                                                                              │
│  ── რა შეიცვალა ─────────────────────────────────────────────────────────    │
│                                                                              │
│  • API ტოკენი წაშლილია                                                       │
│  • Cloud სინქრონიზაცია გამორთულია                                            │
│  • ლოკალური პარამეტრები შენარჩუნებულია                                       │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 შემდეგი ნაბიჯები:                                                        │
│     • /pfLogin               ხელახლა შესვლა                                  │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```
