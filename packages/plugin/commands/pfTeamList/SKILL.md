---
name: pfTeamList
description: List team members for the current PlanFlow project
---

# PlanFlow Team List

Display team members, their roles, and current activity for the linked cloud project with team member cards.

## Usage

```bash
/pfTeamList                 # List all team members
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

  return {
    ...globalConfig,
    ...localConfig,
    cloud: {
      ...(globalConfig.cloud || {}),
      ...(localConfig.cloud || {})
    }
  }
}

const config = getConfig()
const language = config.language || "en"
const cloudConfig = config.cloud || {}
const isAuthenticated = !!cloudConfig.apiToken
const projectId = cloudConfig.projectId
const apiUrl = cloudConfig.apiUrl || "https://api.planflow.tools"

const t = JSON.parse(readFile(`locales/${language}.json`))
```

## Step 1: Validate Authentication

If not authenticated, display error card:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.sync.notAuthenticated}                                          │
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /pfLogin               Sign in to PlanFlow                             │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 2: Validate Project Link

If no project is linked, display error card:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.sync.notLinked}                                                 │
│                                                                              │
│  💡 {t.ui.labels.nextSteps}                                                  │
│     • /pfCloudLink           Link to a cloud project                         │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 3: Fetch Team Members

**Loading Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  👥 Team Members                                                             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ⠹ {t.ui.labels.fetching}                                                    │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**API Call:**
```bash
curl -s \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Accept: application/json" \
  "https://api.planflow.tools/projects/{PROJECT_ID}/team"
```

## Step 4: Display Team Members Card

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  👥 {t.commands.team.title}                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 Project: {projectName}                                                   │
│                                                                              │
│  ── Active Members ({count}) ────────────────────────────────────────────    │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  🟢 John Doe (Owner)                                                   │  │
│  │     john@company.com                                                   │  │
│  │     Working on: T2.1 - API endpoints                                   │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  🟢 Jane Smith (Admin)                                                 │  │
│  │     jane@company.com                                                   │  │
│  │     Working on: T3.5 - Dashboard                                       │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  🔴 Bob Wilson (Editor)                                                │  │
│  │     bob@company.com                                                    │  │
│  │     Last seen: 2 hours ago                                             │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ── Pending Invites ({inviteCount}) ─────────────────────────────────────    │
│                                                                              │
│  ⏳ alice@company.com (Editor) - sent 2 days ago                             │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.commands}                                                   │
│     • /pfTeamInvite <email>        Invite a team member                      │
│     • /pfTeamRole <email> <role>   Change member role                        │
│     • /pfTeamRemove <email>        Remove from team                          │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Example Output (Georgian):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  👥 გუნდის წევრები                                                           │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 პროექტი: Planflow Plugin                                                 │
│                                                                              │
│  ── აქტიური წევრები (3) ─────────────────────────────────────────────────    │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  🟢 John Doe (მფლობელი)                                                │  │
│  │     john@company.com                                                   │  │
│  │     მუშაობს: T2.1 - API endpoints                                      │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  🟢 Jane Smith (ადმინი)                                                │  │
│  │     jane@company.com                                                   │  │
│  │     მუშაობს: T3.5 - Dashboard                                          │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  🔴 Bob Wilson (რედაქტორი)                                             │  │
│  │     bob@company.com                                                    │  │
│  │     ბოლოს ნანახი: 2 საათის წინ                                          │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ── მოლოდინში მყოფი მოწვევები (1) ───────────────────────────────────────    │
│                                                                              │
│  ⏳ alice@company.com (რედაქტორი) - გაგზავნილი 2 დღის წინ                     │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 ბრძანებები:                                                              │
│     • /pfTeamInvite <email>        მოიწვიე გუნდის წევრი                      │
│     • /pfTeamRole <email> <role>   შეცვალე წევრის როლი                       │
│     • /pfTeamRemove <email>        წაშალე გუნდიდან                           │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

## Step 5: Handle Empty Team

If only the owner exists:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  👥 Team Members                                                             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 Project: Planflow Plugin                                                 │
│                                                                              │
│  ── Active Members (1) ──────────────────────────────────────────────────    │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  🟢 You (Owner)                                                        │  │
│  │     your@email.com                                                     │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ℹ️  You're the only team member.                                            │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 To invite collaborators:                                                 │
│     • /pfTeamInvite <email>                                                  │
│     • /pfTeamInvite <email> admin    (with role)                             │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Error Handling

**Network Error Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Network error. Could not fetch team information.                            │
│                                                                              │
│  Please check your connection and try again.                                 │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**API Error (403 Forbidden):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  You don't have permission to view team members.                             │
│                                                                              │
│  Only project members can view the team list.                                │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```
