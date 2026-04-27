---
name: planSettingsAutoSync
description: Manage automatic synchronization after planUpdate commands
---

# Plan Settings Auto-Sync

Manage automatic synchronization after /planUpdate commands with toggle card.

## Usage

```bash
/planSettingsAutoSync           # Show auto-sync status
/planSettingsAutoSync on        # Enable auto-sync
/planSettingsAutoSync off       # Disable auto-sync
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
const autoSync = cloudConfig.autoSync || false

const t = JSON.parse(readFile(`../locales/${language}.json`))
```

## Step 1: Parse Arguments

```javascript
const autoSyncValue = commandArgs.trim().toLowerCase() || null  // "on", "off", or null
```

## Step 2: Check Authentication

**If not authenticated, display error card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.settings.autoSyncNotAuthenticated}                              │
│                                                                              │
│  Auto-sync requires a cloud connection.                                      │
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /pfLogin               Sign in first                                   │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 3: Handle Based on Value

### If null (show status)

Display status card:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🔄 {t.commands.settings.autoSyncTitle}                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── Current Status ──────────────────────────────────────────────────────    │
│                                                                              │
│  ╭─────────────────────╮                                                     │
│  │ {autoSync ? "✓ Enabled" : "✕ Disabled"} │                                 │
│  ╰─────────────────────╯                                                     │
│                                                                              │
│  ── What is Auto-Sync? ──────────────────────────────────────────────────    │
│                                                                              │
│  When enabled, changes from /planUpdate commands are automatically           │
│  synced to cloud without running /pfSyncPush.                                │
│                                                                              │
│  Example:                                                                    │
│    /planUpdate T1.1 done  →  Updates cloud automatically                     │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.commands}                                                   │
│     • /planSettingsAutoSync on      Enable auto-sync                         │
│     • /planSettingsAutoSync off     Disable auto-sync                        │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### If "on" (enable)

1. Read `./.plan-config.json`
2. Set `cloud.autoSync = true`
3. Update `lastUsed`
4. Write back

**Success Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.settings.autoSyncEnabledSuccess}                                │
│                                                                              │
│  ── Auto-Sync Status ────────────────────────────────────────────────────    │
│                                                                              │
│  ╭─────────────────╮                                                         │
│  │ ✓ Enabled       │                                                         │
│  ╰─────────────────╯                                                         │
│                                                                              │
│  ── What Happens Now ────────────────────────────────────────────────────    │
│                                                                              │
│  /planUpdate commands will automatically sync to cloud:                      │
│                                                                              │
│  /planUpdate T1.1 done                                                       │
│       ↓                                                                      │
│  ✓ Local PROJECT_PLAN.md updated                                             │
│  ✓ Cloud synced automatically                                                │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 To disable: /planSettingsAutoSync off                                    │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

### If "off" (disable)

1. Read `./.plan-config.json`
2. Set `cloud.autoSync = false`
3. Update `lastUsed`
4. Write back

**Success Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.settings.autoSyncDisabledSuccess}                               │
│                                                                              │
│  ── Auto-Sync Status ────────────────────────────────────────────────────    │
│                                                                              │
│  ╭──────────────────╮                                                        │
│  │ ✕ Disabled       │                                                        │
│  ╰──────────────────╯                                                        │
│                                                                              │
│  ── Manual Sync Required ────────────────────────────────────────────────    │
│                                                                              │
│  Changes will only be saved locally.                                         │
│  To sync to cloud, run:                                                      │
│                                                                              │
│     /pfSyncPush                                                              │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 To enable: /planSettingsAutoSync on                                      │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

### If invalid value

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.settings.autoSyncInvalidValue}                                  │
│                                                                              │
│  Invalid value: "{autoSyncValue}"                                            │
│                                                                              │
│  Valid options: on, off                                                      │
│                                                                              │
│  💡 {t.ui.labels.commands}                                                   │
│     • /planSettingsAutoSync on                                               │
│     • /planSettingsAutoSync off                                              │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```
