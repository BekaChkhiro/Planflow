---
name: pfLogin
description: PlanFlow Login
---

# PlanFlow Login

Authenticate with PlanFlow project management service with login card UI and spinner.

**IMPORTANT:** This is ONLY for PlanFlow (planflow.tools) - NOT for Claude or Claude Code authentication.

## Usage

```bash
/pfLogin                    # Interactive - prompts for token
/pfLogin pf_abc123...       # Direct token input
```

## Step 0: Load Configuration

```javascript
function getConfig() {
  const localConfigPath = "./.plan-config.json"
  if (fileExists(localConfigPath)) {
    try {
      return JSON.parse(readFile(localConfigPath))
    } catch (error) {}
  }
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
const apiUrl = cloudConfig.apiUrl || "https://api.planflow.tools"

const t = JSON.parse(readFile(`../locales/${language}.json`))
```

## Step 1: Check Current Auth Status

If already authenticated, display warning card:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚠️  WARNING                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Already logged in as {email}                                                │
│                                                                              │
│  To switch accounts, run /pfLogout first.                                    │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.options}                                                    │
│     • /pfLogout              Sign out and switch accounts                    │
│     • /pfWhoami              View current user info                          │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 2: Get Token

If token provided as argument, use it. Otherwise, display prompt card:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🔐 PlanFlow Login                                                           │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.login.enterToken}                                               │
│                                                                              │
│  ── Get Your Token ──────────────────────────────────────────────────────    │
│                                                                              │
│  1. Visit: https://planflow.tools/settings/api-tokens                        │
│  2. Click "Generate New Token"                                               │
│  3. Copy the token (starts with pf_)                                         │
│  4. Paste below or run: /pfLogin pf_your_token                               │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 3: Validate Token (with Spinner)

**Loading Card (during validation):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🔐 PlanFlow Login                                                           │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ⠹ {t.ui.labels.validating}                                                  │
│                                                                              │
│  Connecting to api.planflow.tools...                                         │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**API Call:**
```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"token": "{TOKEN}"}' \
  "https://api.planflow.tools/api-tokens/verify"
```

**IMPORTANT:** The token must be passed in the **request body** as JSON, NOT in the Authorization header!

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "John Doe"
    },
    "tokenName": "My CLI Token"
  }
}
```

## Step 4: Save Credentials

Save to global config (`~/.config/claude/plan-plugin-config.json`):

**IMPORTANT:**
- Create the directory if it doesn't exist: `mkdir -p ~/.config/claude`
- Use the Write tool to save the config file

```json
{
  "language": "en",
  "cloud": {
    "apiUrl": "https://api.planflow.tools",
    "apiToken": "pf_xxx...",
    "savedAt": "2026-02-02T12:00:00Z",
    "verified": true,
    "userId": "uuid-from-response",
    "userEmail": "email-from-response",
    "userName": "name-from-response"
  }
}
```

## Step 5: Show Success Card

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.login.success}                                                  │
│                                                                              │
│  ── Account Info ────────────────────────────────────────────────────────    │
│                                                                              │
│  👤 Name:   {response.data.user.name}                                        │
│  📧 Email:  {response.data.user.email}                                       │
│  🔑 Token:  {response.data.tokenName}                                        │
│                                                                              │
│  ╭────────────────╮                                                          │
│  │ ✓ Connected    │                                                          │
│  ╰────────────────╯                                                          │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.commands.login.nowYouCan}                                             │
│     • /pfCloudList           View your projects                              │
│     • /pfCloudLink           Link to a project                               │
│     • /pfSyncPush            Push local to cloud                             │
│     • /pfSyncPull            Pull from cloud                                 │
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
│  Successfully logged in!                                                     │
│                                                                              │
│  ── Account Info ────────────────────────────────────────────────────────    │
│                                                                              │
│  👤 Name:   John Doe                                                         │
│  📧 Email:  john@example.com                                                 │
│  🔑 Token:  My CLI Token                                                     │
│                                                                              │
│  ╭────────────────╮                                                          │
│  │ ✓ Connected    │                                                          │
│  ╰────────────────╯                                                          │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Now you can:                                                             │
│     • /pfCloudList           View your projects                              │
│     • /pfCloudLink           Link to a project                               │
│     • /pfSyncPush            Push local to cloud                             │
│     • /pfSyncPull            Pull from cloud                                 │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

## Error Handling

**Invalid Token Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.login.invalidToken}                                             │
│                                                                              │
│  The token you provided is invalid or expired.                               │
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     1. Visit: https://planflow.tools/settings/api-tokens                     │
│     2. Generate a new token                                                  │
│     3. Run: /pfLogin <new_token>                                             │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

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
