---
name: planSettingsShow
description: Display current plugin configuration
---

# Plan Settings Show

Display current plugin configuration including language, cloud status, auto-sync settings, and notification preferences with modern dashboard cards.

## Usage

```bash
/planSettingsShow                    # Show general settings
/planSettingsShow notifications      # Show notification settings
```

## Step 0: Load Configuration

```javascript
function getConfig() {
  const localConfigPath = "./.plan-config.json"
  if (fileExists(localConfigPath)) {
    try {
      const config = JSON.parse(readFile(localConfigPath))
      config._source = "local"
      return config
    } catch {}
  }

  const globalConfigPath = expandPath("~/.config/claude/plan-plugin-config.json")
  if (fileExists(globalConfigPath)) {
    try {
      const config = JSON.parse(readFile(globalConfigPath))
      config._source = "global"
      return config
    } catch {}
  }

  return { "language": "en", "_source": "default" }
}

const config = getConfig()
const language = config.language || "en"
const cloudConfig = config.cloud || {}
const isAuthenticated = !!cloudConfig.apiToken
const autoSync = cloudConfig.autoSync || false
const storageMode = cloudConfig.storageMode || "local"

// Also load both configs for display
const localConfig = fileExists("./.plan-config.json")
  ? JSON.parse(readFile("./.plan-config.json")) : null
const globalConfig = fileExists(expandPath("~/.config/claude/plan-plugin-config.json"))
  ? JSON.parse(readFile(expandPath("~/.config/claude/plan-plugin-config.json"))) : null

const t = JSON.parse(readFile(`../locales/${language}.json`))

// Parse arguments
const args = commandArgs ? commandArgs.trim().toLowerCase() : ""
const subCommand = args.split(/\s+/)[0] || null  // "notifications" or null
```

## Step 0.5: Handle Sub-Commands

If `subCommand === "notifications"`, go to **Step 2: Notification Settings**.

Otherwise, proceed to **Step 1: Display General Settings**.

## Step 1: Display Settings Dashboard Card

```javascript
const languageNames = {
  "en": "English",
  "ka": "ქართული (Georgian)",
  "ru": "Русский (Russian)"
}

const currentLanguageName = languageNames[config.language] || "English"
```

**Output Format:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚙️  {t.commands.settings.title}                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── Active Configuration ────────────────────────────────────────────────    │
│                                                                              │
│  🌍 Language:      {currentLanguageName}                                     │
│     Source:        {config._source}                                          │
│                                                                              │
│  ── Cloud Status ────────────────────────────────────────────────────────    │
│                                                                              │
│  ╭────────────────╮                                                          │
│  │ ✓ Connected    │  {cloudConfig.userEmail}                                 │
│  ╰────────────────╯                                                          │
│                                                                              │
│  📁 Linked Project:  {cloudConfig.projectId || "None"}                       │
│  🔄 Auto-sync:       {autoSync ? "Enabled" : "Disabled"}                     │
│  💾 Storage Mode:    {storageMode}                                           │
│                                                                              │
│  ── Config Files ────────────────────────────────────────────────────────    │
│                                                                              │
│  📁 Local:   ./.plan-config.json          {localConfig ? "✓" : "✕"}          │
│  🌐 Global:  ~/.config/claude/...         {globalConfig ? "✓" : "✕"}         │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.commands}                                                   │
│     • /planSettingsShow notifications View notification settings             │
│     • /planSettingsLanguage           Change language                        │
│     • /planSettingsAutoSync           Manage auto-sync                       │
│     • /planSettingsReset              Reset to defaults                      │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Example Output (English - Connected):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚙️  Plan Plugin Settings                                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── Active Configuration ────────────────────────────────────────────────    │
│                                                                              │
│  🌍 Language:      English                                                   │
│     Source:        global                                                    │
│                                                                              │
│  ── Cloud Status ────────────────────────────────────────────────────────    │
│                                                                              │
│  ╭────────────────╮                                                          │
│  │ ✓ Connected    │  user@example.com                                        │
│  ╰────────────────╯                                                          │
│                                                                              │
│  📁 Linked Project:  proj-abc123                                             │
│  🔄 Auto-sync:       Enabled                                                 │
│  💾 Storage Mode:    hybrid                                                  │
│                                                                              │
│  ── Config Files ────────────────────────────────────────────────────────    │
│                                                                              │
│  📁 Local:   ./.plan-config.json          ✓                                  │
│  🌐 Global:  ~/.config/claude/...         ✓                                  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Commands:                                                                │
│     • /planSettingsShow notifications View notification settings             │
│     • /planSettingsLanguage           Change language                        │
│     • /planSettingsAutoSync           Manage auto-sync                       │
│     • /planSettingsReset              Reset to defaults                      │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Example Output (English - Not Connected):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚙️  Plan Plugin Settings                                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── Active Configuration ────────────────────────────────────────────────    │
│                                                                              │
│  🌍 Language:      English                                                   │
│     Source:        default                                                   │
│                                                                              │
│  ── Cloud Status ────────────────────────────────────────────────────────    │
│                                                                              │
│  ╭──────────────────╮                                                        │
│  │ ✕ Not Connected  │                                                        │
│  ╰──────────────────╯                                                        │
│                                                                              │
│  Run /pfLogin to connect to PlanFlow Cloud.                                  │
│                                                                              │
│  ── Config Files ────────────────────────────────────────────────────────    │
│                                                                              │
│  📁 Local:   ./.plan-config.json          ✕                                  │
│  🌐 Global:  ~/.config/claude/...         ✕                                  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Commands:                                                                │
│     • /planSettingsLanguage           Change language                        │
│     • /pfLogin                        Connect to cloud                       │
│     • /planSettingsReset              Reset to defaults                      │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Example Output (Georgian):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚙️  Plan Plugin-ის პარამეტრები                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── აქტიური კონფიგურაცია ────────────────────────────────────────────────    │
│                                                                              │
│  🌍 ენა:           ქართული (Georgian)                                        │
│     წყარო:         global                                                    │
│                                                                              │
│  ── Cloud სტატუსი ───────────────────────────────────────────────────────    │
│                                                                              │
│  ╭─────────────────────╮                                                     │
│  │ ✓ დაკავშირებულია    │  user@example.com                                   │
│  ╰─────────────────────╯                                                     │
│                                                                              │
│  📁 დაკავშირებული პროექტი:  proj-abc123                                      │
│  🔄 ავტო-სინქრონიზაცია:      ჩართულია                                        │
│  💾 შენახვის რეჟიმი:         ჰიბრიდული                                       │
│                                                                              │
│  ── კონფიგურაციის ფაილები ───────────────────────────────────────────────    │
│                                                                              │
│  📁 ლოკალური:  ./.plan-config.json          ✓                                │
│  🌐 გლობალური: ~/.config/claude/...         ✓                                │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 ბრძანებები:                                                              │
│     • /planSettingsShow notifications შეტყობინებების პარამეტრები             │
│     • /planSettingsLanguage           ენის შეცვლა                            │
│     • /planSettingsAutoSync           ავტო-სინქრონიზაციის მართვა             │
│     • /planSettingsReset              საწყის მნიშვნელობებზე დაბრუნება        │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

## Error Handling

**If config corrupted:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚠️  WARNING                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Config file was corrupted, using defaults.                                  │
│                                                                              │
│  💡 Next Steps:                                                              │
│     • /planSettingsReset             Reset and fix config                    │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

---

## Step 2: Notification Settings (Sub-Command)

When user runs `/planSettingsShow notifications`, display and manage notification preferences.

### Check Authentication

If not authenticated, show error:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.sync.notAuthenticated}                                          │
│                                                                              │
│  Notification settings require a cloud connection.                           │
│                                                                              │
│  💡 Run /pfLogin to authenticate first.                                      │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

If no project linked, show error:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.sync.notLinked}                                                 │
│                                                                              │
│  💡 Run /pfCloudLink to link a project first.                                │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### Fetch Notification Settings from API

**API Endpoint:** `GET /users/me/notification-settings`

**Bash Implementation:**

```bash
API_URL="https://api.planflow.tools"
TOKEN="$API_TOKEN"
PROJECT_ID="$PROJECT_ID"

# Fetch current notification settings
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 10 \
  -X GET \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "${API_URL}/users/me/notification-settings?projectId=${PROJECT_ID}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "$BODY"
else
  echo "Error: HTTP $HTTP_CODE"
fi
```

**Expected Response:**

```json
{
  "success": true,
  "data": {
    "settings": {
      "channels": {
        "email": { "enabled": true, "mode": "digest" },
        "inapp": { "enabled": true },
        "slack": { "enabled": false, "webhookConfigured": false },
        "discord": { "enabled": false, "webhookConfigured": false }
      },
      "events": {
        "assigned": true,
        "mention": true,
        "watching": true,
        "team": false
      }
    }
  }
}
```

### Display Notification Settings Dashboard

**Output Format:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🔔 {t.commands.notificationSettings.title}                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 Project: {projectName}                                                   │
│                                                                              │
│  ── {t.commands.notificationSettings.channels} ────────────────────────────  │
│                                                                              │
│  📧 {t.commands.notificationSettings.emailLabel}:                            │
│     {email.enabled ? "✅ Enabled" : "❌ Disabled"}                           │
│     Mode: {email.mode === "digest" ? t.commands.notificationSettings.modeDigest : t.commands.notificationSettings.modeImmediate}
│                                                                              │
│  🔔 {t.commands.notificationSettings.inappLabel}:                            │
│     {inapp.enabled ? "✅ Enabled" : "❌ Disabled"}                           │
│                                                                              │
│  💬 {t.commands.notificationSettings.slackLabel}:                            │
│     {slack.webhookConfigured ? (slack.enabled ? "✅ Enabled" : "❌ Disabled") : t.commands.notificationSettings.notConfigured}
│                                                                              │
│  🎮 {t.commands.notificationSettings.discordLabel}:                          │
│     {discord.webhookConfigured ? (discord.enabled ? "✅ Enabled" : "❌ Disabled") : t.commands.notificationSettings.notConfigured}
│                                                                              │
│  ── {t.commands.notificationSettings.events} ──────────────────────────────  │
│                                                                              │
│  {events.assigned ? "[✓]" : "[ ]"} {t.commands.notificationSettings.eventAssigned}
│  {events.mention ? "[✓]" : "[ ]"} {t.commands.notificationSettings.eventMention}
│  {events.watching ? "[✓]" : "[ ]"} {t.commands.notificationSettings.eventWatching}
│  {events.team ? "[✓]" : "[ ]"} {t.commands.notificationSettings.eventTeam}
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.commands}                                                   │
│     • /pfNotificationSettings email on|off|digest                            │
│     • /pfNotificationSettings inapp on|off                                   │
│     • /pfNotificationSettings event <type> on|off                            │
│                                                                              │
│  {t.commands.notificationSettings.eventTypes}: assigned, mention, watching, team
│                                                                              │
│  🔙 /planSettingsShow                       Back to general settings         │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Example Output (English):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🔔 Notification Settings                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 Project: Plan Flow Plugin                                                │
│                                                                              │
│  ── Notification Channels ─────────────────────────────────────────────────  │
│                                                                              │
│  📧 Email:     ✅ Enabled (Daily digest)                                     │
│  🔔 In-app:    ✅ Enabled                                                    │
│  💬 Slack:     ✅ Enabled                                                    │
│  🎮 Discord:   ❌ Disabled                                                   │
│                                                                              │
│  ── Event Types ───────────────────────────────────────────────────────────  │
│                                                                              │
│  [✓] Task assigned to me                                                     │
│  [✓] Mentioned in comment                                                    │
│  [✓] Task I'm watching updated                                               │
│  [ ] All team activity                                                       │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Commands:                                                                │
│     • /pfNotificationSettings email on|off|digest                            │
│     • /pfNotificationSettings inapp on|off                                   │
│     • /pfNotificationSettings event <type> on|off                            │
│                                                                              │
│  Event types: assigned, mention, watching, team                              │
│                                                                              │
│  🔙 /planSettingsShow                       Back to general settings         │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Example Output (Georgian):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🔔 შეტყობინებების პარამეტრები                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 პროექტი: Plan Flow Plugin                                                │
│                                                                              │
│  ── შეტყობინებების არხები ─────────────────────────────────────────────────  │
│                                                                              │
│  📧 ელ-ფოსტა:    ✅ ჩართულია (ყოველდღიური შეჯამება)                          │
│  🔔 აპლიკაციაში: ✅ ჩართულია                                                 │
│  💬 Slack:       ✅ ჩართულია                                                 │
│  🎮 Discord:     ❌ გამორთულია                                               │
│                                                                              │
│  ── მოვლენების ტიპები ─────────────────────────────────────────────────────  │
│                                                                              │
│  [✓] ამოცანის მინიჭება                                                       │
│  [✓] კომენტარში მოხსენიება                                                   │
│  [✓] თვალყურისდევნებული ამოცანის განახლება                                   │
│  [ ] გუნდის ყველა აქტივობა                                                   │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 ბრძანებები:                                                              │
│     • /pfNotificationSettings email on|off|digest                            │
│     • /pfNotificationSettings inapp on|off                                   │
│     • /pfNotificationSettings event <type> on|off                            │
│                                                                              │
│  მოვლენების ტიპები: assigned, mention, watching, team                       │
│                                                                              │
│  🔙 /planSettingsShow                       ზოგადი პარამეტრებზე დაბრუნება    │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

### Error Handling for Notification Settings

**Network error:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.notificationSettings.networkError}                              │
│                                                                              │
│  Could not fetch notification settings.                                      │
│                                                                              │
│  {t.commands.notificationSettings.tryAgain}                                  │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```
