---
name: pfTeamInvite
description: Invite a team member to the current PlanFlow project
---

# PlanFlow Team Invite

Send an invitation to add a new team member to the linked cloud project with invite card.

## Usage

```bash
/pfTeamInvite <email>                # Invite with default role (editor)
/pfTeamInvite <email> <role>         # Invite with specific role
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
  // ... standard config loading ...
}

const config = getConfig()
const language = config.language || "en"
const cloudConfig = config.cloud || {}
const isAuthenticated = !!cloudConfig.apiToken
const projectId = cloudConfig.projectId
const apiUrl = cloudConfig.apiUrl || "https://api.planflow.tools"

const t = JSON.parse(readFile(`locales/${language}.json`))
```

## Step 1: Show Usage Card (if no arguments)

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  📨 Team Invite                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── Usage ───────────────────────────────────────────────────────────────    │
│                                                                              │
│  /pfTeamInvite <email>           Invite with default role (editor)           │
│  /pfTeamInvite <email> <role>    Invite with specific role                   │
│                                                                              │
│  ── Available Roles ─────────────────────────────────────────────────────    │
│                                                                              │
│  admin   - Full access, can manage team members                              │
│  editor  - Can edit tasks and plan (default)                                 │
│  viewer  - Read-only access                                                  │
│                                                                              │
│  ── Examples ────────────────────────────────────────────────────────────    │
│                                                                              │
│  /pfTeamInvite alice@company.com                                             │
│  /pfTeamInvite bob@company.com admin                                         │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 2: Validate & Send Invitation

**Loading Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  📨 Team Invite                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ⠹ Sending invitation...                                                     │
│                                                                              │
│  To: {email}                                                                 │
│  Role: {role}                                                                │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 3: Display Success Card

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Invitation sent!                                                            │
│                                                                              │
│  ── Invitation Details ──────────────────────────────────────────────────    │
│                                                                              │
│  📧 To:      alice@company.com                                               │
│  🔑 Role:    Editor                                                          │
│  📁 Project: Planflow Plugin                                                 │
│                                                                              │
│  ╭────────────────────╮                                                      │
│  │ ✓ Invitation Sent  │                                                      │
│  ╰────────────────────╯                                                      │
│                                                                              │
│  They'll receive an email with instructions to join.                         │
│  The invitation expires in 7 days.                                           │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.commands}                                                   │
│     • /pfTeamList            View pending invitations                        │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

## Error Handling

**Invalid Email Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Invalid email format.                                                       │
│                                                                              │
│  Example: alice@company.com                                                  │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Already Member Card (409):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚠️  WARNING                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  User is already a team member.                                              │
│                                                                              │
│  alice@company.com is already part of this project.                          │
│                                                                              │
│  💡 To change their role:                                                    │
│     • /pfTeamRole alice@company.com admin                                    │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Permission Denied Card (403):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  You don't have permission to invite team members.                           │
│                                                                              │
│  Only project owners and admins can send invitations.                        │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```
