---
name: pfDiscord
description: Configure Discord webhook integration for PlanFlow notifications
---

# PlanFlow Discord Integration

Configure Discord webhook integration to receive project notifications directly in your Discord server.

## Usage

```bash
/pfDiscord                                    # Show current Discord integration status
/pfDiscord setup <webhook-url>                # Set up Discord webhook
/pfDiscord test                               # Send a test notification to Discord
/pfDiscord disable                            # Disable Discord notifications
```

**Webhook URL Format:**
```
https://discord.com/api/webhooks/000000000000000000/XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

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
│  Discord integration requires a cloud connection.                            │
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
const args = commandArgs.trim()
const parts = args.split(/\s+/)
const action = parts[0] || null  // "setup", "test", "disable", or null (show status)
const webhookUrl = parts[1] || null  // Webhook URL for setup action
```

### Step 3: Handle Actions

#### If no action (show current status)

Fetch current Discord integration status from API.

**API Endpoint:** `GET /projects/:projectId/integrations/discord`

**Bash Implementation:**

```bash
API_URL="https://api.planflow.tools"
TOKEN="$API_TOKEN"
PROJECT_ID="$PROJECT_ID"

# Fetch current Discord integration status
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 10 \
  -X GET \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "${API_URL}/projects/${PROJECT_ID}/integrations/discord")

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
    "integration": {
      "enabled": true,
      "webhookConfigured": true,
      "webhookUrl": "https://discord.com/api/webhooks/123.../XXX...",
      "serverName": "My Development Server",
      "channelName": "#planflow-updates",
      "lastTestAt": "2026-02-20T10:30:00Z",
      "lastNotificationAt": "2026-02-21T08:00:00Z",
      "events": {
        "taskCompleted": true,
        "taskAssigned": true,
        "mentions": true,
        "comments": true
      }
    }
  }
}
```

**Status Card (Discord configured):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🎮 {t.commands.discord.title}                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 Project: {projectName}                                                   │
│                                                                              │
│  ── {t.commands.discord.status} ───────────────────────────────────────────  │
│                                                                              │
│  ╭───────────────────────────────────────────────────────────────────────╮   │
│  │ ✅ {t.commands.discord.connected}                                     │   │
│  ╰───────────────────────────────────────────────────────────────────────╯   │
│                                                                              │
│  📍 Webhook:    ···/webhooks/123.../XXX... (configured)                      │
│  🖥️  Server:     My Development Server                                       │
│  📢 Channel:    #planflow-updates                                            │
│  🕐 Last Test:  2 hours ago                                                  │
│  📨 Last Sent:  30 minutes ago                                               │
│                                                                              │
│  ── {t.commands.discord.events} ───────────────────────────────────────────  │
│                                                                              │
│  [✓] Task completed                                                          │
│  [✓] Task assigned                                                           │
│  [✓] @mentions                                                               │
│  [✓] New comments                                                            │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.commands}                                                   │
│     • /pfDiscord test        Send a test notification                        │
│     • /pfDiscord disable     Disable Discord notifications                   │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Status Card (Discord not configured):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🎮 {t.commands.discord.title}                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 Project: {projectName}                                                   │
│                                                                              │
│  ── {t.commands.discord.status} ───────────────────────────────────────────  │
│                                                                              │
│  ╭───────────────────────────────────────────────────────────────────────╮   │
│  │ ❌ {t.commands.discord.notConfigured}                                 │   │
│  ╰───────────────────────────────────────────────────────────────────────╯   │
│                                                                              │
│  {t.commands.discord.notConfiguredHint}                                      │
│                                                                              │
│  ── {t.commands.discord.howToSetup} ───────────────────────────────────────  │
│                                                                              │
│  1. Go to your Discord server settings                                       │
│  2. Navigate to: Integrations → Webhooks                                     │
│  3. Click "New Webhook"                                                      │
│  4. Choose the channel for notifications                                     │
│  5. Copy the webhook URL                                                     │
│  6. Run: /pfDiscord setup <webhook-url>                                      │
│                                                                              │
│  📖 Guide: https://support.discord.com/hc/en-us/articles/228383668           │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.commands}                                                   │
│     • /pfDiscord setup <url>  Configure Discord webhook                      │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

#### If action is "setup"

Set up Discord webhook integration.

**Validation:**
1. Webhook URL is required
2. Must be a valid Discord webhook URL (starts with `https://discord.com/api/webhooks/` or `https://discordapp.com/api/webhooks/`)

**Invalid URL Error:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.discord.invalidUrl}                                             │
│                                                                              │
│  The webhook URL must be a valid Discord webhook URL.                        │
│                                                                              │
│  ── Expected Format ─────────────────────────────────────────────────────    │
│                                                                              │
│  https://discord.com/api/webhooks/000000000000000000/XXXXXX...               │
│                                                                              │
│  💡 Get your webhook URL from:                                               │
│     Discord Server → Settings → Integrations → Webhooks → New Webhook        │
│                                                                              │
│  📖 https://support.discord.com/hc/en-us/articles/228383668                  │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Missing URL Error:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.discord.missingUrl}                                             │
│                                                                              │
│  Please provide the Discord webhook URL.                                     │
│                                                                              │
│  💡 Usage: /pfDiscord setup <webhook-url>                                    │
│                                                                              │
│  📖 Example:                                                                 │
│     /pfDiscord setup https://discord.com/api/webhooks/123.../XXX             │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**API Request:**

```bash
API_URL="https://api.planflow.tools"
TOKEN="$API_TOKEN"
PROJECT_ID="$PROJECT_ID"
WEBHOOK_URL="$WEBHOOK_URL"

# Validate webhook URL format (supports both discord.com and discordapp.com)
if [[ ! "$WEBHOOK_URL" =~ ^https://(discord\.com|discordapp\.com)/api/webhooks/ ]]; then
  echo "Invalid webhook URL format"
  exit 1
fi

# Save Discord webhook configuration
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 10 \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"webhookUrl\": \"${WEBHOOK_URL}\"}" \
  "${API_URL}/projects/${PROJECT_ID}/integrations/discord")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "Success"
else
  echo "Error: HTTP $HTTP_CODE"
fi
```

**Success Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.discord.setupSuccess}                                           │
│                                                                              │
│  ── Discord Integration ────────────────────────────────────────────────     │
│                                                                              │
│  ╭───────────────────────────────────────────────────────────────────────╮   │
│  │ ✅ Connected                                                          │   │
│  ╰───────────────────────────────────────────────────────────────────────╯   │
│                                                                              │
│  📍 Webhook: ···/webhooks/123.../XXX... (configured)                         │
│  📁 Project: {projectName}                                                   │
│                                                                              │
│  {t.commands.discord.willReceive}                                            │
│     • Task status changes                                                    │
│     • Task assignments                                                       │
│     • @mentions in comments                                                  │
│     • New comments on your tasks                                             │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /pfDiscord test     Send a test notification                           │
│     • /pfDiscord          View current status                                │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

#### If action is "test"

Send a test notification to verify the webhook is working.

**API Request:**

```bash
API_URL="https://api.planflow.tools"
TOKEN="$API_TOKEN"
PROJECT_ID="$PROJECT_ID"

# Send test notification
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 15 \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "${API_URL}/projects/${PROJECT_ID}/integrations/discord/test")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "Test notification sent"
else
  echo "Error: HTTP $HTTP_CODE"
fi
```

**Success Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.discord.testSuccess}                                            │
│                                                                              │
│  ── Test Notification ──────────────────────────────────────────────────     │
│                                                                              │
│  📨 A test notification was sent to your Discord channel.                    │
│                                                                              │
│  ╭───────────────────────────────────────────────────────────────────────╮   │
│  │ 🔔 PlanFlow Test                                                      │   │
│  │ This is a test notification from PlanFlow.                            │   │
│  │ If you see this, Discord integration is working correctly!            │   │
│  │ Project: {projectName}                                                │   │
│  ╰───────────────────────────────────────────────────────────────────────╯   │
│                                                                              │
│  Check your Discord channel to verify the message arrived.                   │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.commands}                                                   │
│     • /pfDiscord          View current status                                │
│     • /pfDiscord disable  Disable Discord notifications                      │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Test Failed Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.discord.testFailed}                                             │
│                                                                              │
│  Could not send test notification to Discord.                                │
│                                                                              │
│  ── Possible Issues ─────────────────────────────────────────────────────    │
│                                                                              │
│  • Webhook URL may be invalid or deleted                                     │
│  • Webhook may have been removed from the channel                            │
│  • Discord API rate limiting                                                 │
│  • Network connectivity issues                                               │
│                                                                              │
│  💡 {t.ui.labels.commands}                                                   │
│     • /pfDiscord setup <new-url>  Reconfigure with new webhook               │
│     • /pfDiscord                  View current configuration                 │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Not Configured Error:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.discord.notConfiguredError}                                     │
│                                                                              │
│  Discord webhook is not configured for this project.                         │
│                                                                              │
│  💡 Set up Discord first:                                                    │
│     /pfDiscord setup <webhook-url>                                           │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

#### If action is "disable"

Disable Discord notifications for this project.

**API Request:**

```bash
API_URL="https://api.planflow.tools"
TOKEN="$API_TOKEN"
PROJECT_ID="$PROJECT_ID"

# Disable Discord integration
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 10 \
  -X DELETE \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "${API_URL}/projects/${PROJECT_ID}/integrations/discord")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "Discord integration disabled"
else
  echo "Error: HTTP $HTTP_CODE"
fi
```

**Success Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.discord.disableSuccess}                                         │
│                                                                              │
│  ── Discord Integration ────────────────────────────────────────────────     │
│                                                                              │
│  ╭───────────────────────────────────────────────────────────────────────╮   │
│  │ ❌ Disabled                                                           │   │
│  ╰───────────────────────────────────────────────────────────────────────╯   │
│                                                                              │
│  Discord notifications have been disabled for this project.                  │
│  The webhook URL has been removed.                                           │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.commands}                                                   │
│     • /pfDiscord setup <url>  Re-enable with a new webhook                   │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

### Step 4: Error Handling

**Invalid Action Error:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.discord.invalidAction}                                          │
│                                                                              │
│  Unknown action: "{action}"                                                  │
│                                                                              │
│  ── Valid Actions ──────────────────────────────────────────────────────     │
│                                                                              │
│  • setup <url>   Configure Discord webhook                                   │
│  • test          Send a test notification                                    │
│  • disable       Disable Discord notifications                               │
│                                                                              │
│  💡 Run /pfDiscord without arguments to view current status.                 │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Network Error:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.discord.networkError}                                           │
│                                                                              │
│  Could not connect to PlanFlow API.                                          │
│                                                                              │
│  {t.commands.discord.tryAgain}                                               │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Permission Error:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.discord.noPermission}                                           │
│                                                                              │
│  You don't have permission to manage Discord integration.                    │
│                                                                              │
│  {t.commands.discord.noPermissionHint}                                       │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Discord Message Format

When PlanFlow sends notifications to Discord, they use embedded messages with rich formatting:

**Task Completed:**
```
┌────────────────────────────────────────────┐
│ 🎉 Task Completed                          │
├────────────────────────────────────────────┤
│ T2.1: Implement login API                  │
│ was marked as done by John Doe             │
│                                            │
│ Project: My Project                        │
│                                            │
│ ──────────────────────────────────────     │
│ 🟢 PlanFlow                                │
└────────────────────────────────────────────┘
```

**Task Assigned:**
```
┌────────────────────────────────────────────┐
│ 📋 Task Assigned                           │
├────────────────────────────────────────────┤
│ T2.3: Add validation                       │
│ was assigned to you by Jane Smith          │
│                                            │
│ Project: My Project                        │
│                                            │
│ ──────────────────────────────────────     │
│ 🟢 PlanFlow                                │
└────────────────────────────────────────────┘
```

**Mention:**
```
┌────────────────────────────────────────────┐
│ 💬 You were mentioned                      │
├────────────────────────────────────────────┤
│ John Doe mentioned you in:                 │
│ T2.1: Implement login API                  │
│                                            │
│ > @jane please review this when you        │
│ > have time                                │
│                                            │
│ Project: My Project                        │
│                                            │
│ ──────────────────────────────────────     │
│ 🟢 PlanFlow                                │
└────────────────────────────────────────────┘
```

**Comment:**
```
┌────────────────────────────────────────────┐
│ 💭 New Comment                             │
├────────────────────────────────────────────┤
│ Jane Smith commented on:                   │
│ T2.1: Implement login API                  │
│                                            │
│ > Looks good! Just one small fix needed.   │
│                                            │
│ Project: My Project                        │
│                                            │
│ ──────────────────────────────────────     │
│ 🟢 PlanFlow                                │
└────────────────────────────────────────────┘
```

## Translation Keys Required

Add these to `locales/en.json` and `locales/ka.json`:

```json
{
  "commands": {
    "discord": {
      "title": "Discord Integration",
      "status": "Status",
      "events": "Notification Events",
      "connected": "Connected",
      "notConfigured": "Not Configured",
      "notConfiguredHint": "Discord notifications are not set up for this project.",
      "howToSetup": "How to Set Up",
      "setupSuccess": "Discord integration configured successfully!",
      "willReceive": "You will receive notifications for:",
      "testSuccess": "Test notification sent!",
      "testFailed": "Failed to send test notification.",
      "disableSuccess": "Discord integration disabled.",
      "invalidUrl": "Invalid Discord webhook URL.",
      "missingUrl": "Webhook URL is required.",
      "invalidAction": "Invalid action.",
      "networkError": "Network error. Could not connect to PlanFlow API.",
      "tryAgain": "Please check your connection and try again.",
      "noPermission": "You don't have permission to manage Discord integration.",
      "noPermissionHint": "Only project owners and admins can configure integrations.",
      "notConfiguredError": "Discord is not configured.",
      "webhookLabel": "Webhook",
      "serverLabel": "Server",
      "channelLabel": "Channel",
      "lastTestLabel": "Last Test",
      "lastSentLabel": "Last Sent",
      "configured": "Configured",
      "eventTaskCompleted": "Task completed",
      "eventTaskAssigned": "Task assigned",
      "eventMentions": "@mentions",
      "eventComments": "New comments"
    }
  }
}
```

**Georgian translations:**

```json
{
  "commands": {
    "discord": {
      "title": "Discord ინტეგრაცია",
      "status": "სტატუსი",
      "events": "შეტყობინებების მოვლენები",
      "connected": "დაკავშირებული",
      "notConfigured": "არ არის კონფიგურებული",
      "notConfiguredHint": "Discord შეტყობინებები არ არის დაყენებული ამ პროექტისთვის.",
      "howToSetup": "როგორ დავაყენოთ",
      "setupSuccess": "Discord ინტეგრაცია წარმატებით კონფიგურებულია!",
      "willReceive": "მიიღებთ შეტყობინებებს:",
      "testSuccess": "სატესტო შეტყობინება გაიგზავნა!",
      "testFailed": "სატესტო შეტყობინების გაგზავნა ვერ მოხერხდა.",
      "disableSuccess": "Discord ინტეგრაცია გამორთულია.",
      "invalidUrl": "არასწორი Discord webhook URL.",
      "missingUrl": "Webhook URL აუცილებელია.",
      "invalidAction": "არასწორი მოქმედება.",
      "networkError": "ქსელის შეცდომა. PlanFlow API-სთან დაკავშირება ვერ მოხერხდა.",
      "tryAgain": "გთხოვთ შეამოწმოთ კავშირი და სცადოთ თავიდან.",
      "noPermission": "თქვენ არ გაქვთ Discord ინტეგრაციის მართვის უფლება.",
      "noPermissionHint": "მხოლოდ პროექტის მფლობელებს და ადმინებს შეუძლიათ ინტეგრაციების კონფიგურაცია.",
      "notConfiguredError": "Discord არ არის კონფიგურებული.",
      "webhookLabel": "Webhook",
      "serverLabel": "სერვერი",
      "channelLabel": "არხი",
      "lastTestLabel": "ბოლო ტესტი",
      "lastSentLabel": "ბოლოს გაგზავნილი",
      "configured": "კონფიგურებული",
      "eventTaskCompleted": "ამოცანა დასრულებული",
      "eventTaskAssigned": "ამოცანა მინიჭებული",
      "eventMentions": "@მოხსენიებები",
      "eventComments": "ახალი კომენტარები"
    }
  }
}
```

## Notes

- Webhook URLs are stored securely on the server (never exposed in full)
- Notifications are sent asynchronously and don't block plugin operations
- Test notifications help verify the webhook is working before real notifications
- Disabling removes the webhook URL completely (re-setup required to enable again)
- Only project owners and admins can configure integrations
- All team members benefit from configured notifications (based on their personal settings)
- Discord webhooks support both `discord.com` and `discordapp.com` domains
- Discord embeds provide rich formatting with colors and structured layout
