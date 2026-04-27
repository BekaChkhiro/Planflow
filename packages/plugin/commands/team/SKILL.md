---
name: team
description: View and manage team members for the current PlanFlow project
---

# Team Management

A unified command for viewing team members, inviting new members, and managing roles in the linked cloud project.

## Usage

```bash
/team                           # List all team members
/team add <email>               # Invite with default role (editor)
/team add <email> <role>        # Invite with specific role
/team role <email> <role>       # Change member's role
```

## Available Roles

| Role | Permissions |
|------|-------------|
| `admin` | Full access, can manage team members |
| `editor` | Can edit tasks and plan (default) |
| `viewer` | Read-only access |

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

const t = JSON.parse(readFile(`../locales/${language}.json`))
```

## Step 0.5: Show Notification Badge (v1.6.0+)

**Purpose:** Display unread notification count to keep users informed of team activity.

**When to Execute:** Only if authenticated AND linked to a project.

```bash
# Only proceed if authenticated and linked
if [ -n "$TOKEN" ] && [ -n "$PROJECT_ID" ]; then
  RESPONSE=$(curl -s --connect-timeout 3 --max-time 5 \
    -X GET \
    -H "Accept: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    "${API_URL}/projects/${PROJECT_ID}/notifications?limit=1&unread=true" 2>/dev/null)

  if [ $? -eq 0 ]; then
    UNREAD_COUNT=$(echo "$RESPONSE" | grep -o '"unreadCount":[0-9]*' | grep -o '[0-9]*')
    if [ -n "$UNREAD_COUNT" ] && [ "$UNREAD_COUNT" -gt 0 ]; then
      echo "🔔 $UNREAD_COUNT unread notification(s) — /pfNotifications to view"
      echo ""
    fi
  fi
fi
```

See: `skills/notification-badge/SKILL.md` for full implementation details.

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

## Step 3: Parse Arguments

Parse the command arguments to determine the subcommand:

```javascript
const args = commandArgs.trim()
const parts = args.split(/\s+/)

// Determine action
let action = "list"  // default
let email = null
let role = null

if (parts.length === 0 || parts[0] === "" || parts[0] === "list") {
  action = "list"
} else if (parts[0] === "add") {
  action = "add"
  email = parts[1]
  role = parts[2] || "editor"
} else if (parts[0] === "role") {
  action = "role"
  email = parts[1]
  role = parts[2]
} else {
  // Unknown subcommand - show usage
  action = "usage"
}
```

## Step 4: Route to Action

Based on the parsed action, execute the appropriate flow.

### Action: usage (Unknown Command)

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  👥 Team Management                                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── Usage ─────────────────────────────────────────────────────────────────  │
│                                                                              │
│  /team                         List all team members                         │
│  /team add <email>             Invite with default role (editor)             │
│  /team add <email> <role>      Invite with specific role                     │
│  /team role <email> <role>     Change member's role                          │
│                                                                              │
│  ── Available Roles ───────────────────────────────────────────────────────  │
│                                                                              │
│  admin   - Full access, can manage team members                              │
│  editor  - Can edit tasks and plan (default)                                 │
│  viewer  - Read-only access                                                  │
│                                                                              │
│  ── Examples ──────────────────────────────────────────────────────────────  │
│                                                                              │
│  /team                                                                       │
│  /team add alice@company.com                                                 │
│  /team add bob@company.com admin                                             │
│  /team role bob@company.com viewer                                           │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

---

### Action: list (Default)

Fetch and display team members.

**API Call:**
```bash
curl -s \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Accept: application/json" \
  "https://api.planflow.tools/projects/{PROJECT_ID}/team"
```

**Success Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  👥 {t.commands.team.title}                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 {t.commands.team.project}: {projectName}                                 │
│                                                                              │
│  ── Active Members ({count}) ────────────────────────────────────────────    │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  🟢 John Doe ({t.commands.team.roles.owner})                           │  │
│  │     john@company.com                                                   │  │
│  │     {t.commands.team.workingOn}: T2.1 - API endpoints                  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  🟢 Jane Smith ({t.commands.team.roles.admin})                         │  │
│  │     jane@company.com                                                   │  │
│  │     {t.commands.team.workingOn}: T3.5 - Dashboard                      │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  🔴 Bob Wilson ({t.commands.team.roles.editor})                        │  │
│  │     bob@company.com                                                    │  │
│  │     {t.commands.team.lastSeen}: 2 hours ago                            │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ── {t.commands.team.pendingInvites} ({inviteCount}) ────────────────────    │
│                                                                              │
│  ⏳ alice@company.com (Editor) - sent 2 days ago                             │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.commands.team.commands}                                               │
│     • /team add <email>            {t.commands.team.inviteHint}              │
│     • /team role <email> <role>    {t.commands.team.roleHint}                │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Only Owner (Empty Team) Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  👥 {t.commands.team.title}                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📁 {t.commands.team.project}: {projectName}                                 │
│                                                                              │
│  ── Active Members (1) ──────────────────────────────────────────────────    │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  🟢 You ({t.commands.team.roles.owner})                                │  │
│  │     your@email.com                                                     │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ℹ️  {t.commands.team.onlyYou}                                               │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.commands.team.invitePrompt}                                           │
│     • /team add <email>                                                      │
│     • /team add <email> admin    (with role)                                 │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

---

### Action: add (Invite Team Member)

Invite a new team member to the project.

**Validation:**

1. Check email format:
```javascript
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
if (!emailRegex.test(email)) {
  // Show invalid email error
}
```

2. Check role is valid:
```javascript
const validRoles = ["admin", "editor", "viewer"]
if (!validRoles.includes(role.toLowerCase())) {
  // Show invalid role error
}
```

**API Call:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"email": "{EMAIL}", "role": "{ROLE}"}' \
  "https://api.planflow.tools/projects/{PROJECT_ID}/team/invite"
```

**Success Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.team.invite.success}                                            │
│                                                                              │
│  ── Invitation Details ────────────────────────────────────────────────────  │
│                                                                              │
│  📧 {t.commands.team.invite.to}      {email}                                 │
│  🔑 {t.commands.team.invite.role}    {Role}                                  │
│  📁 {t.commands.team.invite.project} {projectName}                           │
│                                                                              │
│  ╭────────────────────╮                                                      │
│  │ ✓ Invitation Sent  │                                                      │
│  ╰────────────────────╯                                                      │
│                                                                              │
│  {t.commands.team.invite.emailSent}                                          │
│  {t.commands.team.invite.expiresHint}                                        │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.commands}                                                   │
│     • /team            View pending invitations                              │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Invalid Email Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.team.invite.invalidEmail}                                       │
│                                                                              │
│  {t.commands.team.invite.emailExample}                                       │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Invalid Role Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.team.invite.invalidRole}: {providedRole}                        │
│                                                                              │
│  {t.commands.team.invite.validRoles}: admin, editor, viewer                  │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Already Member Card (409):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚠️  WARNING                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.team.invite.alreadyMember}                                      │
│                                                                              │
│  {email} {t.commands.team.invite.alreadyMemberHint}                          │
│                                                                              │
│  💡 To change their role:                                                    │
│     • /team role {email} <role>                                              │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Permission Denied Card (403):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.team.invite.noPermission}                                       │
│                                                                              │
│  {t.commands.team.invite.noPermissionHint}                                   │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Missing Email Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  📨 Team Invite                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── {t.commands.team.invite.usage} ────────────────────────────────────────  │
│                                                                              │
│  /team add <email>             {t.commands.team.invite.usageDefault}         │
│  /team add <email> <role>      {t.commands.team.invite.usageWithRole}        │
│                                                                              │
│  ── {t.commands.team.invite.availableRoles} ───────────────────────────────  │
│                                                                              │
│  admin   - {t.commands.team.invite.roleAdminDesc}                            │
│  editor  - {t.commands.team.invite.roleEditorDesc}                           │
│  viewer  - {t.commands.team.invite.roleViewerDesc}                           │
│                                                                              │
│  ── {t.commands.team.invite.example} ──────────────────────────────────────  │
│                                                                              │
│  /team add alice@company.com                                                 │
│  /team add bob@company.com admin                                             │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

---

### Action: role (Change Member Role)

Change an existing team member's role.

**Validation:**

1. Check email is provided
2. Check role is provided
3. Check role is valid

**API Call:**
```bash
curl -s -X PATCH \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"role": "{ROLE}"}' \
  "https://api.planflow.tools/projects/{PROJECT_ID}/team/{EMAIL}/role"
```

**Success Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.team.role.success}                                              │
│                                                                              │
│  ── Role Change Details ───────────────────────────────────────────────────  │
│                                                                              │
│  👤 {t.commands.team.role.member}:  {memberName}                             │
│  📧 {t.commands.team.role.email}:   {email}                                  │
│  📁 {t.commands.team.role.project}: {projectName}                            │
│                                                                              │
│  ╭─────────────────────────────────╮                                         │
│  │ {oldRole}  →  {newRole}         │                                         │
│  ╰─────────────────────────────────╯                                         │
│                                                                              │
│  {t.commands.team.role.effectiveImmediately}                                 │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.commands}                                                   │
│     • /team                      View all team members                       │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**Cannot Change Own Role Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.team.role.cannotChangeOwnRole}                                  │
│                                                                              │
│  {t.commands.team.role.cannotChangeOwnRoleHint}                              │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Cannot Change Owner's Role Card (403):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.team.role.cannotChangeOwnerRole}                                │
│                                                                              │
│  {t.commands.team.role.cannotChangeOwnerRoleHint}                            │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Member Not Found Card (404):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.team.role.notFound}                                             │
│                                                                              │
│  {email} {t.commands.team.role.notFoundHint}                                 │
│                                                                              │
│  💡 {t.commands.team.role.viewTeam}                                          │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Invalid Role Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.team.role.invalidRole}: {providedRole}                          │
│                                                                              │
│  {t.commands.team.role.validRoles}: admin, editor, viewer                    │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Same Role Card (No Change):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ℹ️  INFO                                                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.team.role.sameRole}                                             │
│                                                                              │
│  {email} {t.commands.team.role.alreadyHasRole} {role}                        │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Missing Arguments Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🔑 {t.commands.team.role.title}                                             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── {t.commands.team.role.usage} ──────────────────────────────────────────  │
│                                                                              │
│  /team role <email> <role>                                                   │
│                                                                              │
│  ── {t.commands.team.role.availableRoles} ─────────────────────────────────  │
│                                                                              │
│  admin   - {t.commands.team.invite.roleAdminDesc}                            │
│  editor  - {t.commands.team.invite.roleEditorDesc}                           │
│  viewer  - {t.commands.team.invite.roleViewerDesc}                           │
│                                                                              │
│  ── {t.commands.team.role.example} ────────────────────────────────────────  │
│                                                                              │
│  /team role bob@company.com viewer                                           │
│  /team role alice@company.com admin                                          │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

---

## Error Handling

**Network Error Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.team.networkError}                                              │
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
│  {t.commands.team.noPermission}                                              │
│                                                                              │
│  Only project members can view the team list.                                │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Authentication Failed (401):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  {t.commands.team.authFailed}                                                │
│                                                                              │
│  💡 Please run /pfLogin to re-authenticate.                                  │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

---

## Response Parsing

### Team List Response

```json
{
  "success": true,
  "data": {
    "project": {
      "id": "uuid",
      "name": "Project Name"
    },
    "members": [
      {
        "id": "uuid",
        "email": "john@company.com",
        "name": "John Doe",
        "role": "owner",
        "status": "active",
        "currentTask": {
          "taskId": "T2.1",
          "name": "API endpoints"
        },
        "lastSeen": "2024-01-15T10:30:00Z"
      }
    ],
    "pendingInvites": [
      {
        "email": "alice@company.com",
        "role": "editor",
        "sentAt": "2024-01-13T10:00:00Z"
      }
    ]
  }
}
```

### Invite Response

```json
{
  "success": true,
  "data": {
    "invitation": {
      "email": "alice@company.com",
      "role": "editor",
      "expiresAt": "2024-01-22T10:00:00Z"
    }
  }
}
```

### Role Change Response

```json
{
  "success": true,
  "data": {
    "member": {
      "email": "bob@company.com",
      "name": "Bob Wilson",
      "previousRole": "editor",
      "newRole": "viewer"
    }
  }
}
```

---

## Implementation Notes

1. **Role Capitalization**: Display roles with first letter capitalized (Editor, Admin, Viewer)
2. **Online Status**: Use 🟢 for active (seen within 5 minutes), 🔴 for offline
3. **Time Formatting**: Use relative time (e.g., "2 hours ago", "3 days ago")
4. **Current User Highlight**: Show "You" instead of name for the current user
5. **Email Validation**: Use standard email regex before API call
6. **Role Validation**: Check against valid roles before API call

---

## Georgian Translation Example

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
│     • /team add <email>            მოიწვიე გუნდის წევრი                      │
│     • /team role <email> <role>    შეცვალე წევრის როლი                       │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```
