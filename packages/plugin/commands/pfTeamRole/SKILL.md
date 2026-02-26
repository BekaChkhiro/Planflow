---
name: pfTeamRole
description: Change a team member's role in the current PlanFlow project
---

# PlanFlow Team Role

Change the role of an existing team member in the linked cloud project with role update card.

## Usage

```bash
/pfTeamRole <email> <role>           # Change member's role
/pfTeamRole bob@company.com viewer
/pfTeamRole alice@company.com admin
```

## Available Roles

| Role | Permissions |
|------|-------------|
| `admin` | Full access, can manage team members |
| `editor` | Can edit tasks and plan |
| `viewer` | Read-only access |

## Step 0: Load Configuration

```javascript
// ... standard config loading ...
```

## Step 1: Show Usage Card (if no arguments)

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🔑 Change Team Member Role                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── Usage ───────────────────────────────────────────────────────────────    │
│                                                                              │
│  /pfTeamRole <email> <role>                                                  │
│                                                                              │
│  ── Available Roles ─────────────────────────────────────────────────────    │
│                                                                              │
│  admin   - Full access, can manage team members                              │
│  editor  - Can edit tasks and plan                                           │
│  viewer  - Read-only access                                                  │
│                                                                              │
│  ── Examples ────────────────────────────────────────────────────────────    │
│                                                                              │
│  /pfTeamRole bob@company.com viewer                                          │
│  /pfTeamRole alice@company.com admin                                         │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 2: Display Success Card

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Role updated successfully!                                                  │
│                                                                              │
│  ── Role Change Details ────────────────────────────────────────────────     │
│                                                                              │
│  👤 Member:   Bob Wilson                                                     │
│  📧 Email:    bob@company.com                                                │
│  📁 Project:  Planflow Plugin                                                │
│                                                                              │
│  ╭─────────────────────────────────╮                                         │
│  │ Editor  →  Viewer               │                                         │
│  ╰─────────────────────────────────╯                                         │
│                                                                              │
│  The new permissions are effective immediately.                              │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 {t.ui.labels.commands}                                                   │
│     • /pfTeamList                 View all team members                      │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

## Error Handling

**Cannot Change Own Role Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  You cannot change your own role.                                            │
│                                                                              │
│  Ask another admin or the project owner to change your role.                 │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Cannot Change Owner's Role Card (403):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Cannot change the owner's role.                                             │
│                                                                              │
│  The owner role cannot be changed. Ownership must be transferred instead.   │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Member Not Found Card (404):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Member not found.                                                           │
│                                                                              │
│  bob@company.com is not a member of this project.                            │
│                                                                              │
│  💡 Run /pfTeamList to see current team members.                             │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Invalid Role Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Invalid role: superadmin                                                    │
│                                                                              │
│  Valid roles: admin, editor, viewer                                          │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Same Role Card (No Change):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ℹ️  INFO                                                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  No change needed.                                                           │
│                                                                              │
│  bob@company.com already has the role: editor                                │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

