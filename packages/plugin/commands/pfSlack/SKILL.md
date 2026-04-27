---
name: pfSlack
description: Configure Slack webhook integration for PlanFlow notifications
---

# PlanFlow Slack Integration

Configure Slack webhook integration to receive project notifications directly in your Slack workspace.

## Usage

```bash
/pfSlack                                    # Show current Slack integration status
/pfSlack setup <webhook-url>                # Set up Slack webhook
/pfSlack test                               # Send a test notification to Slack
/pfSlack disable                            # Disable Slack notifications
```

**Webhook URL Format:**
```
https://hooks.slack.com/services/<team-id>/<channel-id>/<secret>
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
const t = JSON.parse(readFile(`../locales/${language}.json`))
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
│  Slack integration requires a cloud connection.                              │
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

Fetch current Slack integration status from API.

**API Endpoint:** `GET /projects/:projectId/integrations/slack`

**Bash Implementation:**

```bash
API_URL="https://api.planflow.tools"
TOKEN="$API_TOKEN"
PROJECT_ID="$PROJECT_ID"

# Fetch current Slack integration status
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 10 \
  -X GET \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "${API_URL}/projects/${PROJECT_ID}/integrations/slack")

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
      "webhookUrl": "https://hooks.slack.com/services/T.../B.../XXX...",
      "channel": "#planflow-notifications",
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

**Status Card (Slack configured):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  💬 {t.commands.slack.title}                                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 Project: {projectName}                                                   │
│                                                                              │
│  ── {t.commands.slack.status} ───────────────────────────────────────────    │
│                                                                              │
│  ╭───────────────────────────────────────────────────────────────────────╮   │
│  │ ✅ {t.commands.slack.connected}                                       │   │
│  ╰───────────────────────────────────────────────────────────────────────╯   │
│                                                                              │
│  📍 Webhook:    ···/services/T.../B.../XXX... (configured)                   │
│  📢 Channel:    #planflow-notifications                                      │
│  🕐 Last Test:  2 hours ago                                                  │
│  📨 Last Sent:  30 minutes ago                                               │
│                                                                              │
│  ── {t.commands.slack.events} ───────────────────────────────────────────    │
│                                                                              │
│  [✓] Task completed                                                          │
│  [✓] Task assigned                                                           │
│  [✓] @mentions                                                               │
│  [✓] New comments                                                            │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.commands}                                                   │
│     • /pfSlack test        Send a test notification                          │
│     • /pfSlack disable     Disable Slack notifications                       │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Status Card (Slack not configured):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  💬 {t.commands.slack.title}                                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 Project: {projectName}                                                   │
│                                                                              │
│  ── {t.commands.slack.status} ───────────────────────────────────────────    │
│                                                                              │
│  ╭───────────────────────────────────────────────────────────────────────╮   │
│  │ ❌ {t.commands.slack.notConfigured}                                   │   │
│  ╰───────────────────────────────────────────────────────────────────────╯   │
│                                                                              │
│  {t.commands.slack.notConfiguredHint}                                        │
│                                                                              │
│  ── {t.commands.slack.howToSetup} ───────────────────────────────────────    │
│                                                                              │
│  1. Go to your Slack workspace settings                                      │
│  2. Navigate to: Apps → Incoming Webhooks                                    │
│  3. Create a new webhook for your channel                                    │
│  4. Copy the webhook URL                                                     │
│  5. Run: /pfSlack setup <webhook-url>                                        │
│                                                                              │
│  📖 Guide: https://api.slack.com/messaging/webhooks                          │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.commands}                                                   │
│     • /pfSlack setup <url>  Configure Slack webhook                          │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

#### If action is "setup"

Set up Slack webhook integration.

**Validation:**
1. Webhook URL is required
2. Must be a valid Slack webhook URL (starts with `https://hooks.slack.com/`)

**Invalid URL Error:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.slack.invalidUrl}                                               │
│                                                                              │
│  The webhook URL must be a valid Slack incoming webhook URL.                 │
│                                                                              │
│  ── Expected Format ─────────────────────────────────────────────────────    │
│                                                                              │
│  https://hooks.slack.com/services/YOUR_TEAM_ID/YOUR_BOT_ID/YOUR_SECRET               │
│                                                                              │
│  💡 Get your webhook URL from:                                               │
│     Slack → Apps → Incoming Webhooks → Create New                            │
│                                                                              │
│  📖 https://api.slack.com/messaging/webhooks                                 │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Missing URL Error:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.slack.missingUrl}                                               │
│                                                                              │
│  Please provide the Slack webhook URL.                                       │
│                                                                              │
│  💡 Usage: /pfSlack setup <webhook-url>                                      │
│                                                                              │
│  📖 Example:                                                                 │
│     /pfSlack setup https://hooks.slack.com/services/T.../B.../XXX            │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**API Request:**

```bash
API_URL="https://api.planflow.tools"
TOKEN="$API_TOKEN"
PROJECT_ID="$PROJECT_ID"
WEBHOOK_URL="$WEBHOOK_URL"

# Validate webhook URL format
if [[ ! "$WEBHOOK_URL" =~ ^https://hooks\.slack\.com/services/ ]]; then
  echo "Invalid webhook URL format"
  exit 1
fi

# Save Slack webhook configuration
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 10 \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"webhookUrl\": \"${WEBHOOK_URL}\"}" \
  "${API_URL}/projects/${PROJECT_ID}/integrations/slack")

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
│  {t.commands.slack.setupSuccess}                                             │
│                                                                              │
│  ── Slack Integration ───────────────────────────────────────────────────    │
│                                                                              │
│  ╭───────────────────────────────────────────────────────────────────────╮   │
│  │ ✅ Connected                                                          │   │
│  ╰───────────────────────────────────────────────────────────────────────╯   │
│                                                                              │
│  📍 Webhook: ···/services/T.../B.../XXX... (configured)                      │
│  📁 Project: {projectName}                                                   │
│                                                                              │
│  {t.commands.slack.willReceive}                                              │
│     • Task status changes                                                    │
│     • Task assignments                                                       │
│     • @mentions in comments                                                  │
│     • New comments on your tasks                                             │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /pfSlack test     Send a test notification                             │
│     • /pfSlack          View current status                                  │
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
  "${API_URL}/projects/${PROJECT_ID}/integrations/slack/test")

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
│  {t.commands.slack.testSuccess}                                              │
│                                                                              │
│  ── Test Notification ───────────────────────────────────────────────────    │
│                                                                              │
│  📨 A test notification was sent to your Slack channel.                      │
│                                                                              │
│  ╭───────────────────────────────────────────────────────────────────────╮   │
│  │ 🔔 PlanFlow Test                                                      │   │
│  │ This is a test notification from PlanFlow.                            │   │
│  │ If you see this, Slack integration is working correctly!              │   │
│  │ Project: {projectName}                                                │   │
│  ╰───────────────────────────────────────────────────────────────────────╯   │
│                                                                              │
│  Check your Slack channel to verify the message arrived.                     │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.commands}                                                   │
│     • /pfSlack          View current status                                  │
│     • /pfSlack disable  Disable Slack notifications                         │
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
│  {t.commands.slack.testFailed}                                               │
│                                                                              │
│  Could not send test notification to Slack.                                  │
│                                                                              │
│  ── Possible Issues ─────────────────────────────────────────────────────    │
│                                                                              │
│  • Webhook URL may be invalid or expired                                     │
│  • Slack app may have been removed from workspace                            │
│  • Network connectivity issues                                               │
│                                                                              │
│  💡 {t.ui.labels.commands}                                                   │
│     • /pfSlack setup <new-url>  Reconfigure with new webhook                 │
│     • /pfSlack                  View current configuration                   │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Not Configured Error:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.slack.notConfiguredError}                                       │
│                                                                              │
│  Slack webhook is not configured for this project.                           │
│                                                                              │
│  💡 Set up Slack first:                                                      │
│     /pfSlack setup <webhook-url>                                             │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

#### If action is "disable"

Disable Slack notifications for this project.

**API Request:**

```bash
API_URL="https://api.planflow.tools"
TOKEN="$API_TOKEN"
PROJECT_ID="$PROJECT_ID"

# Disable Slack integration
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 10 \
  -X DELETE \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "${API_URL}/projects/${PROJECT_ID}/integrations/slack")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "Slack integration disabled"
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
│  {t.commands.slack.disableSuccess}                                           │
│                                                                              │
│  ── Slack Integration ───────────────────────────────────────────────────    │
│                                                                              │
│  ╭───────────────────────────────────────────────────────────────────────╮   │
│  │ ❌ Disabled                                                           │   │
│  ╰───────────────────────────────────────────────────────────────────────╯   │
│                                                                              │
│  Slack notifications have been disabled for this project.                    │
│  The webhook URL has been removed.                                           │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.commands}                                                   │
│     • /pfSlack setup <url>  Re-enable with a new webhook                     │
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
│  {t.commands.slack.invalidAction}                                            │
│                                                                              │
│  Unknown action: "{action}"                                                  │
│                                                                              │
│  ── Valid Actions ───────────────────────────────────────────────────────    │
│                                                                              │
│  • setup <url>   Configure Slack webhook                                     │
│  • test          Send a test notification                                    │
│  • disable       Disable Slack notifications                                 │
│                                                                              │
│  💡 Run /pfSlack without arguments to view current status.                   │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Network Error:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.slack.networkError}                                             │
│                                                                              │
│  Could not connect to PlanFlow API.                                          │
│                                                                              │
│  {t.commands.slack.tryAgain}                                                 │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Permission Error:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.slack.noPermission}                                             │
│                                                                              │
│  You don't have permission to manage Slack integration.                      │
│                                                                              │
│  {t.commands.slack.noPermissionHint}                                         │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Slack Message Format

When PlanFlow sends notifications to Slack, they use this format:

**Task Completed:**
```
🎉 *Task Completed*
*T2.1: Implement login API* was marked as done by John Doe

Project: My Project
```

**Task Assigned:**
```
📋 *Task Assigned*
*T2.3: Add validation* was assigned to you by Jane Smith

Project: My Project
```

**Mention:**
```
💬 *You were mentioned*
John Doe mentioned you in *T2.1: Implement login API*:
> @jane please review this when you have time

Project: My Project
```

**Comment:**
```
💭 *New Comment*
Jane Smith commented on *T2.1: Implement login API*:
> Looks good! Just one small fix needed.

Project: My Project
```

## Translation Keys Required

```json
{
  "commands": {
    "slack": {
      "title": "Slack Integration",
      "status": "Status",
      "events": "Notification Events",
      "connected": "Connected",
      "notConfigured": "Not Configured",
      "notConfiguredHint": "Slack notifications are not set up for this project.",
      "howToSetup": "How to Set Up",
      "setupSuccess": "Slack integration configured successfully!",
      "willReceive": "You will receive notifications for:",
      "testSuccess": "Test notification sent!",
      "testFailed": "Failed to send test notification.",
      "disableSuccess": "Slack integration disabled.",
      "invalidUrl": "Invalid Slack webhook URL.",
      "missingUrl": "Webhook URL is required.",
      "invalidAction": "Invalid action.",
      "networkError": "Network error. Could not connect to PlanFlow API.",
      "tryAgain": "Please check your connection and try again.",
      "noPermission": "You don't have permission to manage Slack integration.",
      "noPermissionHint": "Only project owners and admins can configure integrations.",
      "notConfiguredError": "Slack is not configured.",
      "webhookLabel": "Webhook",
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

## Notes

- Webhook URLs are stored securely on the server (never exposed in full)
- Notifications are sent asynchronously and don't block plugin operations
- Test notifications help verify the webhook is working before real notifications
- Disabling removes the webhook URL completely (re-setup required to enable again)
- Only project owners and admins can configure integrations
- All team members benefit from configured notifications (based on their personal settings)
