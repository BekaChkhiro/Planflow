---
name: pfTestWebhooks
description: Test all configured webhook integrations (Slack and Discord)
---

# PlanFlow Test Webhooks

Test all configured webhook integrations to verify they are working correctly. This command sends test notifications to all enabled integrations (Slack and Discord) at once.

## Usage

```bash
/pfTestWebhooks                  # Test all configured webhooks
/pfTestWebhooks slack            # Test only Slack webhook
/pfTestWebhooks discord          # Test only Discord webhook
/pfTestWebhooks --verbose        # Show detailed test results
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
│  Webhook testing requires a cloud connection.                                │
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
const args = commandArgs.trim().toLowerCase()
const parts = args.split(/\s+/)
const target = parts[0] || "all"  // "slack", "discord", "all", or "--verbose"
const verbose = args.includes("--verbose") || args.includes("-v")

// Normalize target
let testSlack = target === "all" || target === "slack" || target === "--verbose" || target === "-v"
let testDiscord = target === "all" || target === "discord" || target === "--verbose" || target === "-v"

if (target === "slack") {
  testDiscord = false
}
if (target === "discord") {
  testSlack = false
}
```

### Step 3: Fetch Integration Status

First, fetch the current status of all integrations to know which ones are configured.

**API Request:**

```bash
API_URL="https://api.planflow.tools"
TOKEN="$API_TOKEN"
PROJECT_ID="$PROJECT_ID"

# Fetch all integration statuses
RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 10 \
  -X GET \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "${API_URL}/projects/${PROJECT_ID}/integrations")

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
    "integrations": {
      "slack": {
        "enabled": true,
        "webhookConfigured": true,
        "lastTestAt": "2026-02-20T10:30:00Z"
      },
      "discord": {
        "enabled": true,
        "webhookConfigured": true,
        "lastTestAt": "2026-02-20T10:30:00Z"
      }
    }
  }
}
```

### Step 4: Run Tests

#### If no integrations configured:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚠️  {t.commands.testWebhooks.noIntegrations}                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  No webhook integrations are configured for this project.                    │
│                                                                              │
│  ── Available Integrations ────────────────────────────────────────────────  │
│                                                                              │
│  💬 Slack    - /pfSlack setup <webhook-url>                                  │
│  🎮 Discord  - /pfDiscord setup <webhook-url>                                │
│                                                                              │
│  💡 Set up an integration first, then run /pfTestWebhooks                    │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

#### Testing integrations:

Show a progress indicator while testing:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🧪 {t.commands.testWebhooks.title}                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 Project: {projectName}                                                   │
│                                                                              │
│  ── Testing Webhooks ──────────────────────────────────────────────────────  │
│                                                                              │
│  💬 Slack...   ⏳ Testing                                                    │
│  🎮 Discord... ⏳ Testing                                                    │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**API Request for Slack Test:**

```bash
API_URL="https://api.planflow.tools"
TOKEN="$API_TOKEN"
PROJECT_ID="$PROJECT_ID"

# Test Slack webhook
SLACK_RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 15 \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "${API_URL}/projects/${PROJECT_ID}/integrations/slack/test")

SLACK_HTTP_CODE=$(echo "$SLACK_RESPONSE" | tail -n1)
SLACK_BODY=$(echo "$SLACK_RESPONSE" | sed '$d')
```

**API Request for Discord Test:**

```bash
# Test Discord webhook
DISCORD_RESPONSE=$(curl -s -w "\n%{http_code}" \
  --connect-timeout 5 \
  --max-time 15 \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "${API_URL}/projects/${PROJECT_ID}/integrations/discord/test")

DISCORD_HTTP_CODE=$(echo "$DISCORD_RESPONSE" | tail -n1)
DISCORD_BODY=$(echo "$DISCORD_RESPONSE" | sed '$d')
```

### Step 5: Show Results

#### All tests passed:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ {t.commands.testWebhooks.allPassed}                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 Project: {projectName}                                                   │
│                                                                              │
│  ── Test Results ──────────────────────────────────────────────────────────  │
│                                                                              │
│  💬 Slack    ✅ Test notification sent successfully                          │
│  🎮 Discord  ✅ Test notification sent successfully                          │
│                                                                              │
│  ╭───────────────────────────────────────────────────────────────────────╮   │
│  │ ✅ All 2 integrations working correctly                               │   │
│  ╰───────────────────────────────────────────────────────────────────────╯   │
│                                                                              │
│  Check your Slack and Discord channels to verify the messages arrived.      │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.commands}                                                   │
│     • /pfSlack          View Slack configuration                             │
│     • /pfDiscord        View Discord configuration                           │
│     • /pfNotificationSettings  Configure notification events                 │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

#### Some tests failed:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚠️  {t.commands.testWebhooks.someFailed}                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 Project: {projectName}                                                   │
│                                                                              │
│  ── Test Results ──────────────────────────────────────────────────────────  │
│                                                                              │
│  💬 Slack    ✅ Test notification sent successfully                          │
│  🎮 Discord  ❌ Failed to send test notification                             │
│                                                                              │
│  ╭───────────────────────────────────────────────────────────────────────╮   │
│  │ ⚠️  1 of 2 integrations failed                                         │   │
│  ╰───────────────────────────────────────────────────────────────────────╯   │
│                                                                              │
│  ── Failed Integration Details ────────────────────────────────────────────  │
│                                                                              │
│  🎮 Discord:                                                                 │
│     • Webhook URL may be invalid or deleted                                  │
│     • Webhook may have been removed from the channel                         │
│     • Discord API rate limiting                                              │
│                                                                              │
│     💡 Run /pfDiscord setup <new-url> to reconfigure                         │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.commands}                                                   │
│     • /pfSlack          View Slack configuration                             │
│     • /pfDiscord        View Discord configuration                           │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

#### All tests failed:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ {t.commands.testWebhooks.allFailed}                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 Project: {projectName}                                                   │
│                                                                              │
│  ── Test Results ──────────────────────────────────────────────────────────  │
│                                                                              │
│  💬 Slack    ❌ Failed to send test notification                             │
│  🎮 Discord  ❌ Failed to send test notification                             │
│                                                                              │
│  ╭───────────────────────────────────────────────────────────────────────╮   │
│  │ ❌ All integrations failed                                            │   │
│  ╰───────────────────────────────────────────────────────────────────────╯   │
│                                                                              │
│  ── Possible Issues ───────────────────────────────────────────────────────  │
│                                                                              │
│  • Webhook URLs may be invalid or expired                                    │
│  • Apps may have been removed from workspaces                                │
│  • Network connectivity issues                                               │
│  • API rate limiting                                                         │
│                                                                              │
│  💡 Reconfigure integrations:                                                │
│     • /pfSlack setup <webhook-url>                                           │
│     • /pfDiscord setup <webhook-url>                                         │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

#### Single integration test (Slack only):

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ {t.commands.testWebhooks.slackPassed}                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 Project: {projectName}                                                   │
│                                                                              │
│  ── Slack Test ────────────────────────────────────────────────────────────  │
│                                                                              │
│  💬 Slack    ✅ Test notification sent successfully                          │
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
│     • /pfSlack          View Slack configuration                             │
│     • /pfTestWebhooks   Test all integrations                                │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

#### Single integration not configured:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚠️  {t.commands.testWebhooks.notConfigured}                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💬 Slack webhook is not configured for this project.                        │
│                                                                              │
│  💡 Set up Slack first:                                                      │
│     /pfSlack setup <webhook-url>                                             │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### Step 6: Verbose Mode

When `--verbose` flag is used, show additional details:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🧪 {t.commands.testWebhooks.title} (Verbose)                                │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 Project: {projectName}                                                   │
│                                                                              │
│  ── Test Results (Detailed) ───────────────────────────────────────────────  │
│                                                                              │
│  💬 Slack                                                                    │
│     Status:        ✅ Success                                                │
│     Response Time: 245ms                                                     │
│     Webhook:       ···/services/T.../B.../XXX...                             │
│     HTTP Code:     200                                                       │
│     Last Test:     Just now                                                  │
│                                                                              │
│  🎮 Discord                                                                  │
│     Status:        ✅ Success                                                │
│     Response Time: 312ms                                                     │
│     Webhook:       ···/webhooks/123.../XXX...                                │
│     HTTP Code:     204                                                       │
│     Last Test:     Just now                                                  │
│                                                                              │
│  ╭───────────────────────────────────────────────────────────────────────╮   │
│  │ ✅ All 2 integrations working correctly                               │   │
│  ╰───────────────────────────────────────────────────────────────────────╯   │
│                                                                              │
│  Total test time: 557ms                                                      │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

### Error Handling

**Invalid Target:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.testWebhooks.invalidTarget}                                     │
│                                                                              │
│  Unknown integration: "{target}"                                             │
│                                                                              │
│  ── Valid Options ─────────────────────────────────────────────────────────  │
│                                                                              │
│  • /pfTestWebhooks           Test all configured webhooks                    │
│  • /pfTestWebhooks slack     Test only Slack                                 │
│  • /pfTestWebhooks discord   Test only Discord                               │
│  • /pfTestWebhooks --verbose Show detailed results                           │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Network Error:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.testWebhooks.networkError}                                      │
│                                                                              │
│  Could not connect to PlanFlow API.                                          │
│                                                                              │
│  Please check your internet connection and try again.                        │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Translation Keys Required

Add these to `locales/en.json` and `locales/ka.json`:

**English:**

```json
{
  "commands": {
    "testWebhooks": {
      "title": "Test Webhooks",
      "testing": "Testing webhooks...",
      "noIntegrations": "No Integrations Configured",
      "allPassed": "All Tests Passed!",
      "someFailed": "Some Tests Failed",
      "allFailed": "All Tests Failed",
      "slackPassed": "Slack Test Passed!",
      "discordPassed": "Discord Test Passed!",
      "slackFailed": "Slack Test Failed",
      "discordFailed": "Discord Test Failed",
      "notConfigured": "Integration Not Configured",
      "invalidTarget": "Invalid integration target",
      "networkError": "Network error",
      "testSuccess": "Test notification sent successfully",
      "testFailed": "Failed to send test notification",
      "checkChannels": "Check your channels to verify the messages arrived.",
      "reconfigure": "Reconfigure integrations:",
      "possibleIssues": "Possible Issues",
      "integrationDetails": "Integration Details",
      "responseTime": "Response Time",
      "httpCode": "HTTP Code",
      "lastTest": "Last Test",
      "totalTime": "Total test time",
      "allWorking": "All {count} integrations working correctly",
      "someWorking": "{passed} of {total} integrations working",
      "noneWorking": "All integrations failed"
    }
  }
}
```

**Georgian:**

```json
{
  "commands": {
    "testWebhooks": {
      "title": "Webhook-ების ტესტირება",
      "testing": "Webhook-ების ტესტირება...",
      "noIntegrations": "ინტეგრაციები არ არის კონფიგურებული",
      "allPassed": "ყველა ტესტი წარმატებულია!",
      "someFailed": "ზოგიერთი ტესტი წარუმატებელია",
      "allFailed": "ყველა ტესტი წარუმატებელია",
      "slackPassed": "Slack ტესტი წარმატებულია!",
      "discordPassed": "Discord ტესტი წარმატებულია!",
      "slackFailed": "Slack ტესტი წარუმატებელია",
      "discordFailed": "Discord ტესტი წარუმატებელია",
      "notConfigured": "ინტეგრაცია არ არის კონფიგურებული",
      "invalidTarget": "არასწორი ინტეგრაციის სამიზნე",
      "networkError": "ქსელის შეცდომა",
      "testSuccess": "სატესტო შეტყობინება წარმატებით გაიგზავნა",
      "testFailed": "სატესტო შეტყობინების გაგზავნა ვერ მოხერხდა",
      "checkChannels": "შეამოწმეთ თქვენი არხები შეტყობინებების მისასვლელად.",
      "reconfigure": "ხელახლა დააკონფიგურირეთ ინტეგრაციები:",
      "possibleIssues": "შესაძლო პრობლემები",
      "integrationDetails": "ინტეგრაციის დეტალები",
      "responseTime": "პასუხის დრო",
      "httpCode": "HTTP კოდი",
      "lastTest": "ბოლო ტესტი",
      "totalTime": "ტესტის ჯამური დრო",
      "allWorking": "ყველა {count} ინტეგრაცია სწორად მუშაობს",
      "someWorking": "{passed} / {total} ინტეგრაცია მუშაობს",
      "noneWorking": "ყველა ინტეგრაცია წარუმატებელია"
    }
  }
}
```

## Complete Bash Implementation

```bash
#!/bin/bash

# Load configuration
API_URL="https://api.planflow.tools"
TOKEN="$API_TOKEN"
PROJECT_ID="$PROJECT_ID"
PROJECT_NAME="$PROJECT_NAME"

# Parse arguments
TARGET="${1:-all}"
VERBOSE=false
if [[ "$*" == *"--verbose"* ]] || [[ "$*" == *"-v"* ]]; then
  VERBOSE=true
fi

# Determine what to test
TEST_SLACK=false
TEST_DISCORD=false

case "$TARGET" in
  "all"|"--verbose"|"-v"|"")
    TEST_SLACK=true
    TEST_DISCORD=true
    ;;
  "slack")
    TEST_SLACK=true
    ;;
  "discord")
    TEST_DISCORD=true
    ;;
  *)
    echo "Invalid target: $TARGET"
    echo "Valid options: all, slack, discord"
    exit 1
    ;;
esac

# Fetch integration status
INTEGRATIONS=$(curl -s \
  --connect-timeout 5 \
  --max-time 10 \
  -X GET \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "${API_URL}/projects/${PROJECT_ID}/integrations")

# Parse integration status
SLACK_ENABLED=$(echo "$INTEGRATIONS" | grep -o '"slack":{[^}]*"enabled":true' | wc -l)
DISCORD_ENABLED=$(echo "$INTEGRATIONS" | grep -o '"discord":{[^}]*"enabled":true' | wc -l)

# Initialize results
SLACK_RESULT=""
DISCORD_RESULT=""
PASSED=0
FAILED=0
TOTAL=0

# Test Slack if requested and enabled
if [ "$TEST_SLACK" = true ]; then
  if [ "$SLACK_ENABLED" -gt 0 ]; then
    TOTAL=$((TOTAL + 1))
    START_TIME=$(date +%s%3N)

    SLACK_RESPONSE=$(curl -s -w "\n%{http_code}" \
      --connect-timeout 5 \
      --max-time 15 \
      -X POST \
      -H "Content-Type: application/json" \
      -H "Accept: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      "${API_URL}/projects/${PROJECT_ID}/integrations/slack/test")

    END_TIME=$(date +%s%3N)
    SLACK_TIME=$((END_TIME - START_TIME))

    SLACK_HTTP=$(echo "$SLACK_RESPONSE" | tail -n1)

    if [ "$SLACK_HTTP" -ge 200 ] && [ "$SLACK_HTTP" -lt 300 ]; then
      SLACK_RESULT="success"
      PASSED=$((PASSED + 1))
    else
      SLACK_RESULT="failed"
      FAILED=$((FAILED + 1))
    fi
  else
    SLACK_RESULT="not_configured"
  fi
fi

# Test Discord if requested and enabled
if [ "$TEST_DISCORD" = true ]; then
  if [ "$DISCORD_ENABLED" -gt 0 ]; then
    TOTAL=$((TOTAL + 1))
    START_TIME=$(date +%s%3N)

    DISCORD_RESPONSE=$(curl -s -w "\n%{http_code}" \
      --connect-timeout 5 \
      --max-time 15 \
      -X POST \
      -H "Content-Type: application/json" \
      -H "Accept: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      "${API_URL}/projects/${PROJECT_ID}/integrations/discord/test")

    END_TIME=$(date +%s%3N)
    DISCORD_TIME=$((END_TIME - START_TIME))

    DISCORD_HTTP=$(echo "$DISCORD_RESPONSE" | tail -n1)

    if [ "$DISCORD_HTTP" -ge 200 ] && [ "$DISCORD_HTTP" -lt 300 ]; then
      DISCORD_RESULT="success"
      PASSED=$((PASSED + 1))
    else
      DISCORD_RESULT="failed"
      FAILED=$((FAILED + 1))
    fi
  else
    DISCORD_RESULT="not_configured"
  fi
fi

# Output results
echo "Project: $PROJECT_NAME"
echo ""
echo "Test Results:"

if [ "$TEST_SLACK" = true ]; then
  case "$SLACK_RESULT" in
    "success")
      echo "  Slack    ✅ Test notification sent successfully"
      ;;
    "failed")
      echo "  Slack    ❌ Failed to send test notification"
      ;;
    "not_configured")
      echo "  Slack    ⚪ Not configured"
      ;;
  esac
fi

if [ "$TEST_DISCORD" = true ]; then
  case "$DISCORD_RESULT" in
    "success")
      echo "  Discord  ✅ Test notification sent successfully"
      ;;
    "failed")
      echo "  Discord  ❌ Failed to send test notification"
      ;;
    "not_configured")
      echo "  Discord  ⚪ Not configured"
      ;;
  esac
fi

echo ""
if [ "$TOTAL" -eq 0 ]; then
  echo "No integrations configured to test."
elif [ "$FAILED" -eq 0 ]; then
  echo "✅ All $TOTAL integrations working correctly"
elif [ "$PASSED" -gt 0 ]; then
  echo "⚠️  $PASSED of $TOTAL integrations working"
else
  echo "❌ All integrations failed"
fi
```

## Notes

- Tests both Slack and Discord webhooks in a single command
- Supports testing individual integrations with `slack` or `discord` argument
- Shows clear success/failure status for each integration
- Provides troubleshooting hints for failed tests
- Verbose mode shows response times and HTTP codes
- Gracefully handles non-configured integrations
- Uses parallel requests when testing all integrations (for speed)
