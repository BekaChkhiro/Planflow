---
name: pfTeamRemove
description: Remove a team member from the current PlanFlow project
---

# PlanFlow Team Remove

Remove a team member from the linked cloud project with confirmation card.

## Usage

```bash
/pfTeamRemove <email>                # Remove member by email
```

## Step 0: Load Configuration

```javascript
// ... standard config loading ...
```

## Step 1: Show Usage Card (if no email)

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  👤 Remove Team Member                                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── Usage ───────────────────────────────────────────────────────────────    │
│                                                                              │
│  /pfTeamRemove <email>                                                       │
│                                                                              │
│  ── Example ─────────────────────────────────────────────────────────────    │
│                                                                              │
│  /pfTeamRemove bob@company.com                                               │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 2: Display Success Card

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Member removed from team.                                                   │
│                                                                              │
│  ── Removed Member ──────────────────────────────────────────────────────    │
│                                                                              │
│  👤 Name:    Bob Wilson                                                      │
│  📧 Email:   bob@company.com                                                 │
│  🔑 Role:    Editor                                                          │
│  📁 Project: Planflow Plugin                                                 │
│                                                                              │
│  ╭──────────────────────╮                                                    │
│  │ ✓ Access Revoked     │                                                    │
│  ╰──────────────────────╯                                                    │
│                                                                              │
│  They no longer have access to this project.                                 │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 To re-add:                                                               │
│     • /pfTeamInvite bob@company.com                                          │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

## Error Handling

**Cannot Remove Self Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  You cannot remove yourself from the team.                                   │
│                                                                              │
│  To leave a project, ask the project owner to remove you.                    │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**Cannot Remove Owner Card (403):**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Cannot remove the project owner.                                            │
│                                                                              │
│  Project ownership must be transferred before the owner can be removed.      │
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
