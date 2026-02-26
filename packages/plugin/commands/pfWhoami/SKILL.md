---
name: pfWhoami
description: PlanFlow Who Am I
---

# PlanFlow Who Am I

Display current PlanFlow user information and connection status with modern card UI.

## Usage

```bash
/pfWhoami                   # Show current user info
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
const apiUrl = cloudConfig.apiUrl || "https://api.planflow.tools"

const t = JSON.parse(readFile(`locales/${language}.json`))
```

## Step 1: Check Auth Status

If not authenticated, display error card:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ {t.ui.alerts.error}                                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.whoami.notLoggedIn}                                             │
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /pfLogin                                                               │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 2: Get User Info from API

**API Call:**
```bash
curl -s \
  -H "Authorization: Bearer {TOKEN}" \
  "https://api.planflow.tools/auth/me"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "projectCount": 5
  }
}
```

## Step 3: Display User Info Card

**Output Format:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  👤 {t.commands.whoami.title}                                                │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.whoami.name}    John Doe                                        │
│  {t.commands.whoami.email}   user@example.com                                │
│  {t.commands.whoami.userId}  uuid-1234-5678-abcd                             │
│  {t.commands.whoami.apiUrl}  https://api.planflow.tools                      │
│                                                                              │
│  ── {t.commands.whoami.status} ──────────────────────────────────────────    │
│                                                                              │
│  ╭────────────────╮                                                          │
│  │ ✓ {t.commands.whoami.connected} │                                         │
│  ╰────────────────╯                                                          │
│                                                                              │
│  ── {t.commands.whoami.cloudStats} ─────────────────────────────────────     │
│                                                                              │
│  {t.commands.whoami.projects}  5                                             │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.quickActions}                                               │
│     • /pfCloudList           View your projects                              │
│     • /pfSyncStatus          Check sync status                               │
│     • /pfLogout              Sign out                                        │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Example Output (English):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  👤 Current User                                                             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Name:     John Doe                                                          │
│  Email:    user@example.com                                                  │
│  User ID:  uuid-1234-5678-abcd                                               │
│  API URL:  https://api.planflow.tools                                        │
│                                                                              │
│  ── Status ──────────────────────────────────────────────────────────────    │
│                                                                              │
│  ╭────────────────╮                                                          │
│  │ ✓ Connected    │                                                          │
│  ╰────────────────╯                                                          │
│                                                                              │
│  ── Cloud Stats ─────────────────────────────────────────────────────────    │
│                                                                              │
│  Projects:  5                                                                │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Quick Actions:                                                           │
│     • /pfCloudList           View your projects                              │
│     • /pfSyncStatus          Check sync status                               │
│     • /pfLogout              Sign out                                        │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Example Output (Georgian):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  👤 მიმდინარე მომხმარებელი                                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  სახელი:           John Doe                                                  │
│  ელ-ფოსტა:         user@example.com                                          │
│  მომხმარებლის ID:  uuid-1234-5678-abcd                                       │
│  API URL:          https://api.planflow.tools                                │
│                                                                              │
│  ── სტატუსი ─────────────────────────────────────────────────────────────    │
│                                                                              │
│  ╭─────────────────────╮                                                     │
│  │ ✓ დაკავშირებულია    │                                                     │
│  ╰─────────────────────╯                                                     │
│                                                                              │
│  ── Cloud სტატისტიკა ────────────────────────────────────────────────────    │
│                                                                              │
│  პროექტები:  5                                                               │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 სწრაფი მოქმედებები:                                                      │
│     • /pfCloudList           პროექტების ნახვა                                │
│     • /pfSyncStatus          სინქრონიზაციის სტატუსი                          │
│     • /pfLogout              გამოსვლა                                        │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

## Error Handling

**Token Expired Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Session expired. Please login again.                                        │
│                                                                              │
│  💡 Next Steps:                                                              │
│     • /pfLogin               Re-authenticate                                 │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Network Error Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Could not connect to PlanFlow API.                                          │
│                                                                              │
│  Please check your internet connection and try again.                        │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Pseudo-code for Rendering

```javascript
function renderWhoamiCard(userData, t) {
  const width = 80
  const innerWidth = width - 4

  let output = ""

  // Top border
  output += "╭" + "─".repeat(width - 2) + "╮\n"

  // Title
  const title = `👤 ${t.commands.whoami.title}`
  output += "│  " + title.padEnd(innerWidth) + "│\n"

  // Divider
  output += "├" + "─".repeat(width - 2) + "┤\n"

  // Empty line
  output += "│" + " ".repeat(width - 2) + "│\n"

  // User info
  const labelWidth = 12
  output += `│  ${t.commands.whoami.name.padEnd(labelWidth)} ${userData.name.padEnd(innerWidth - labelWidth - 2)}│\n`
  output += `│  ${t.commands.whoami.email.padEnd(labelWidth)} ${userData.email.padEnd(innerWidth - labelWidth - 2)}│\n`
  output += `│  ${t.commands.whoami.userId.padEnd(labelWidth)} ${userData.id.padEnd(innerWidth - labelWidth - 2)}│\n`
  output += `│  ${t.commands.whoami.apiUrl.padEnd(labelWidth)} ${apiUrl.padEnd(innerWidth - labelWidth - 2)}│\n`

  // Empty line
  output += "│" + " ".repeat(width - 2) + "│\n"

  // Status section header
  output += `│  ── ${t.commands.whoami.status} ${"─".repeat(innerWidth - t.commands.whoami.status.length - 6)}│\n`
  output += "│" + " ".repeat(width - 2) + "│\n"

  // Status badge
  const statusText = `✓ ${t.commands.whoami.connected}`
  output += `│  ╭${"─".repeat(statusText.length + 2)}╮${"".padEnd(innerWidth - statusText.length - 6)}│\n`
  output += `│  │ ${statusText} │${"".padEnd(innerWidth - statusText.length - 6)}│\n`
  output += `│  ╰${"─".repeat(statusText.length + 2)}╯${"".padEnd(innerWidth - statusText.length - 6)}│\n`

  // ... continue with cloud stats and actions

  // Shadow
  output += " " + "░".repeat(width - 1) + "\n"

  return output
}
```
