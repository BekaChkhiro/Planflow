---
name: pfNotificationSettings
description: Manage notification preferences for the current PlanFlow project
---

# PlanFlow Notification Settings

Manage your notification preferences for task assignments, mentions, comments, and team activity.

## Usage

```bash
/pfNotificationSettings                     # Show current notification settings
/pfNotificationSettings email on            # Enable email notifications
/pfNotificationSettings email off           # Disable email notifications
/pfNotificationSettings email digest        # Set email to daily digest mode
/pfNotificationSettings inapp on            # Enable in-app notifications
/pfNotificationSettings inapp off           # Disable in-app notifications
/pfNotificationSettings event <event> on    # Enable specific event type
/pfNotificationSettings event <event> off   # Disable specific event type
```

**Event Types:**
- `assigned` - When you're assigned to a task
- `mention` - When someone @mentions you in a comment
- `watching` - When tasks you're watching are updated
- `team` - All team activity (comments, status changes)

## Process

### Step 0: Load Configuration & Translations

**CRITICAL: Execute this step FIRST, before any output!**

```javascript
// Merge global and local configs
function getMergedConfig() {
  let globalConfig = {}
  let localConfig = {}

  const globalPath = expandPath("~/.config/claude/plan-plugin-config.json")
  if (fileExists(globalPath)) {
    try { globalConfig = JSON.parse(readFile(globalPath)) } catch (e) {}
  }

  if (fileExists("./.plan-config.json")) {
    try { localConfig = JSON.parse(readFile("./.plan-config.json")) } catch (e) {}
  }

  return {
    ...globalConfig,
    ...localConfig,
    cloud: {
      ...(globalConfig.cloud || {}),
      ...(localConfig.cloud || {})
    }
  }
}

const config = getMergedConfig()
const language = config.language || "en"
const cloudConfig = config.cloud || {}
const isAuthenticated = !!cloudConfig.apiToken
const projectId = cloudConfig.projectId
const apiUrl = cloudConfig.apiUrl || "https://api.planflow.tools"
const currentUserEmail = cloudConfig.userEmail

// Load translations
const t = JSON.parse(readFile(`locales/${language}.json`))
```

### Step 1: Check Authentication

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

### Step 2: Parse Arguments

```javascript
const args = commandArgs.trim().toLowerCase().split(/\s+/)
const action = args[0] || null  // "email", "inapp", "event", or null (show)
const subAction = args[1] || null  // "on", "off", "digest", or event name
const eventToggle = args[2] || null  // "on" or "off" for event types
```

### Step 3: Fetch Current Settings from API

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
        "email": {
          "enabled": true,
          "mode": "digest"
        },
        "inapp": {
          "enabled": true
        },
        "slack": {
          "enabled": false,
          "webhookConfigured": false
        },
        "discord": {
          "enabled": false,
          "webhookConfigured": false
        }
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

### Step 4: Handle Actions

#### If no action (show current settings)

Display settings dashboard card:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🔔 {t.commands.notificationSettings.title}                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 Project: {projectName}                                                   │
│                                                                              │
│  ── {t.commands.notificationSettings.channels} ────────────────────────────  │
│                                                                              │
│  📧 Email:       {email.enabled ? "✅ Enabled" : "❌ Disabled"}              │
│     Mode:        {email.mode === "digest" ? "Daily digest" : "Immediate"}    │
│                                                                              │
│  🔔 In-app:      {inapp.enabled ? "✅ Enabled" : "❌ Disabled"}              │
│                                                                              │
│  💬 Slack:       {slack.enabled ? "✅ Enabled" : "❌ Disabled"}              │
│                  {!slack.webhookConfigured ? "(Not configured)" : ""}        │
│                                                                              │
│  🎮 Discord:     {discord.enabled ? "✅ Enabled" : "❌ Disabled"}            │
│                  {!discord.webhookConfigured ? "(Not configured)" : ""}      │
│                                                                              │
│  ── {t.commands.notificationSettings.events} ──────────────────────────────  │
│                                                                              │
│  {events.assigned ? "[✓]" : "[ ]"} Task assigned to me                       │
│  {events.mention ? "[✓]" : "[ ]"} Mentioned in comment                       │
│  {events.watching ? "[✓]" : "[ ]"} Task I'm watching updated                 │
│  {events.team ? "[✓]" : "[ ]"} All team activity                             │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.commands}                                                   │
│     • /pfNotificationSettings email on|off|digest                            │
│     • /pfNotificationSettings inapp on|off                                   │
│     • /pfNotificationSettings event <type> on|off                            │
│                                                                              │
│  Event types: assigned, mention, watching, team                              │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

#### If action is "email"

Update email notification settings.

**Valid subActions:**
- `on` - Enable email notifications (immediate mode)
- `off` - Disable email notifications
- `digest` - Enable email notifications with daily digest

**API Request:**

```bash
API_URL="https://api.planflow.tools"
TOKEN="$API_TOKEN"
PROJECT_ID="$PROJECT_ID"
ENABLED="true"  # or "false"
MODE="immediate"  # or "digest"

RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 10 \
  -X PATCH \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"channel\": \"email\", \"enabled\": ${ENABLED}, \"mode\": \"${MODE}\"}" \
  "${API_URL}/users/me/notification-settings?projectId=${PROJECT_ID}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
```

**Success Card (email on):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.notificationSettings.emailEnabled}                              │
│                                                                              │
│  ── Email Notifications ───────────────────────────────────────────────────  │
│                                                                              │
│  ╭─────────────────╮                                                         │
│  │ ✓ Enabled       │                                                         │
│  ╰─────────────────╯                                                         │
│                                                                              │
│  Mode: Immediate                                                             │
│                                                                              │
│  You'll receive email notifications for enabled events.                      │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 For daily digest instead: /pfNotificationSettings email digest           │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Success Card (email digest):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.notificationSettings.emailDigestEnabled}                        │
│                                                                              │
│  ── Email Notifications ───────────────────────────────────────────────────  │
│                                                                              │
│  ╭─────────────────╮                                                         │
│  │ ✓ Enabled       │                                                         │
│  ╰─────────────────╯                                                         │
│                                                                              │
│  Mode: Daily Digest                                                          │
│                                                                              │
│  You'll receive a daily summary email with all notifications.                │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 For immediate notifications: /pfNotificationSettings email on            │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Success Card (email off):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.notificationSettings.emailDisabled}                             │
│                                                                              │
│  ── Email Notifications ───────────────────────────────────────────────────  │
│                                                                              │
│  ╭──────────────────╮                                                        │
│  │ ✕ Disabled       │                                                        │
│  ╰──────────────────╯                                                        │
│                                                                              │
│  You won't receive email notifications for this project.                     │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 To enable: /pfNotificationSettings email on                              │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

#### If action is "inapp"

Update in-app notification settings.

**Valid subActions:**
- `on` - Enable in-app notifications
- `off` - Disable in-app notifications

**API Request:**

```bash
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 10 \
  -X PATCH \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"channel\": \"inapp\", \"enabled\": ${ENABLED}}" \
  "${API_URL}/users/me/notification-settings?projectId=${PROJECT_ID}")
```

**Success Card (inapp on):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.notificationSettings.inappEnabled}                              │
│                                                                              │
│  ── In-App Notifications ──────────────────────────────────────────────────  │
│                                                                              │
│  ╭─────────────────╮                                                         │
│  │ ✓ Enabled       │                                                         │
│  ╰─────────────────╯                                                         │
│                                                                              │
│  Notifications will appear in /pfNotifications.                              │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 View notifications: /pfNotifications                                     │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Success Card (inapp off):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.notificationSettings.inappDisabled}                             │
│                                                                              │
│  ── In-App Notifications ──────────────────────────────────────────────────  │
│                                                                              │
│  ╭──────────────────╮                                                        │
│  │ ✕ Disabled       │                                                        │
│  ╰──────────────────╯                                                        │
│                                                                              │
│  In-app notifications are disabled.                                          │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 To enable: /pfNotificationSettings inapp on                              │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

#### If action is "event"

Update specific event type settings.

**Valid event types:**
- `assigned` - Task assigned to me
- `mention` - Mentioned in comment
- `watching` - Task I'm watching updated
- `team` - All team activity

**API Request:**

```bash
EVENT_TYPE="assigned"  # assigned, mention, watching, team
ENABLED="true"  # or "false"

RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 10 \
  -X PATCH \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"event\": \"${EVENT_TYPE}\", \"enabled\": ${ENABLED}}" \
  "${API_URL}/users/me/notification-settings?projectId=${PROJECT_ID}")
```

**Success Card (event enabled):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.notificationSettings.eventEnabled}                              │
│                                                                              │
│  ── Event: {eventDisplayName} ─────────────────────────────────────────────  │
│                                                                              │
│  ╭─────────────────╮                                                         │
│  │ ✓ Enabled       │                                                         │
│  ╰─────────────────╯                                                         │
│                                                                              │
│  You'll be notified when: {eventDescription}                                 │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 View all settings: /pfNotificationSettings                               │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Success Card (event disabled):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.notificationSettings.eventDisabled}                             │
│                                                                              │
│  ── Event: {eventDisplayName} ─────────────────────────────────────────────  │
│                                                                              │
│  ╭──────────────────╮                                                        │
│  │ ✕ Disabled       │                                                        │
│  ╰──────────────────╯                                                        │
│                                                                              │
│  You won't be notified for: {eventDescription}                               │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 To enable: /pfNotificationSettings event {eventType} on                  │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

### Step 5: Error Handling

**Invalid channel error:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.notificationSettings.invalidChannel}                            │
│                                                                              │
│  Invalid channel: "{action}"                                                 │
│                                                                              │
│  Valid channels: email, inapp                                                │
│                                                                              │
│  💡 {t.ui.labels.commands}                                                   │
│     • /pfNotificationSettings email on|off|digest                            │
│     • /pfNotificationSettings inapp on|off                                   │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Invalid event type error:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.notificationSettings.invalidEventType}                          │
│                                                                              │
│  Invalid event type: "{subAction}"                                           │
│                                                                              │
│  Valid event types:                                                          │
│     • assigned  - Task assigned to me                                        │
│     • mention   - Mentioned in comment                                       │
│     • watching  - Task I'm watching updated                                  │
│     • team      - All team activity                                          │
│                                                                              │
│  💡 Example: /pfNotificationSettings event mention on                        │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Invalid toggle value error:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.notificationSettings.invalidToggle}                             │
│                                                                              │
│  Invalid value: "{subAction}"                                                │
│                                                                              │
│  Valid values: on, off                                                       │
│                                                                              │
│  💡 Example: /pfNotificationSettings email on                                │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Network error:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.notificationSettings.networkError}                              │
│                                                                              │
│  Could not update notification settings.                                     │
│                                                                              │
│  {t.commands.notificationSettings.tryAgain}                                  │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Event Type Display Names

| Event Type | Display Name (EN) | Description |
|------------|-------------------|-------------|
| assigned | Task assigned to me | When you're assigned to a task |
| mention | Mentioned in comment | When someone @mentions you |
| watching | Task I'm watching updated | When a watched task status changes |
| team | All team activity | All team comments and updates |

## Translation Keys Required

```json
{
  "commands": {
    "notificationSettings": {
      "title": "Notification Settings",
      "channels": "Notification Channels",
      "events": "Event Types",
      "emailEnabled": "Email notifications enabled!",
      "emailDisabled": "Email notifications disabled.",
      "emailDigestEnabled": "Email daily digest enabled!",
      "inappEnabled": "In-app notifications enabled!",
      "inappDisabled": "In-app notifications disabled.",
      "eventEnabled": "Event notifications enabled!",
      "eventDisabled": "Event notifications disabled.",
      "invalidChannel": "Invalid notification channel.",
      "invalidEventType": "Invalid event type.",
      "invalidToggle": "Invalid toggle value.",
      "networkError": "Could not update notification settings.",
      "tryAgain": "Please check your connection and try again.",
      "emailLabel": "Email",
      "inappLabel": "In-app",
      "slackLabel": "Slack",
      "discordLabel": "Discord",
      "modeImmediate": "Immediate",
      "modeDigest": "Daily digest",
      "notConfigured": "Not configured",
      "eventAssigned": "Task assigned to me",
      "eventMention": "Mentioned in comment",
      "eventWatching": "Task I'm watching updated",
      "eventTeam": "All team activity",
      "eventTypes": "Event types",
      "validChannels": "Valid channels",
      "validEvents": "Valid event types",
      "validValues": "Valid values"
    }
  }
}
```

## Notes

- Settings are stored per-project on the cloud
- Email digest is sent once daily (morning)
- Slack and Discord require webhook configuration (Phase 14)
- In-app notifications appear in /pfNotifications
- Disabling a channel doesn't delete existing notifications
- Event settings apply to all enabled channels
