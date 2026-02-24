# PlanFlow Plugin Commands Reference

> Complete reference for all PlanFlow CLI commands in Claude Code

**Version:** 1.6.0
**Last Updated:** 2026-02-24

---

## Table of Contents

- [Overview](#overview)
- [Quick Reference](#quick-reference)
- [Plan Management](#plan-management)
  - [/planNew](#plannew)
  - [/planUpdate](#planupdate)
  - [/planNext](#plannext)
  - [/planSpec](#planspec)
- [Export Commands](#export-commands)
  - [/planExportJson](#planexportjson)
  - [/planExportCsv](#planexportcsv)
  - [/planExportSummary](#planexportsummary)
  - [/planExportGithub](#planexportgithub)
- [Settings Commands](#settings-commands)
  - [/planSettingsShow](#plansettingsshow)
  - [/planSettingsReset](#plansettingsreset)
  - [/planSettingsLanguage](#plansettingslanguage)
  - [/planSettingsAutoSync](#plansettingsautosync)
- [Cloud Authentication](#cloud-authentication)
  - [/pfLogin](#pflogin)
  - [/pfLogout](#pflogout)
  - [/pfWhoami](#pfwhoami)
- [Cloud Project Management](#cloud-project-management)
  - [/pfCloudNew](#pfcloudnew)
  - [/pfCloudList](#pfcloudlist)
  - [/pfCloudLink](#pfcloudlink)
  - [/pfCloudUnlink](#pfcloudunlink)
- [Cloud Sync](#cloud-sync)
  - [/pfSyncPush](#pfsyncpush)
  - [/pfSyncPull](#pfsyncpull)
  - [/pfSyncStatus](#pfsyncstatus)
- [Team Management](#team-management)
  - [/team](#team)
  - [/pfTeamList](#pfteamlist)
  - [/pfTeamInvite](#pfteaminvite)
  - [/pfTeamRole](#pfteamrole)
  - [/pfTeamRemove](#pfteamremove)
- [Task Operations](#task-operations)
  - [/pfAssign](#pfassign)
  - [/pfUnassign](#pfunassign)
  - [/pfMyTasks](#pfmytasks)
  - [/pfWorkload](#pfworkload)
- [Collaboration](#collaboration)
  - [/pfComment](#pfcomment)
  - [/pfComments](#pfcomments)
  - [/pfReact](#pfreact)
  - [/pfActivity](#pfactivity)
- [Notifications](#notifications)
  - [/pfNotifications](#pfnotifications)
  - [/pfNotificationsClear](#pfnotificationsclear)
  - [/pfNotificationSettings](#pfnotificationsettings)
- [Configuration Files](#configuration-files)

---

## Overview

PlanFlow provides two types of commands:

| Prefix | Purpose | Cloud Required |
|--------|---------|----------------|
| `/plan*` | Local plan management | No |
| `/pf*` | Cloud features & team collaboration | Yes |

### Getting Started

```bash
# 1. Create a new project plan
/planNew

# 2. (Optional) Connect to cloud
/pfLogin
/pfCloudLink

# 3. Start working on tasks
/planNext
/planUpdate T1.1 start
/planUpdate T1.1 done
```

---

## Quick Reference

### Local Commands (No Cloud Required)

| Command | Description |
|---------|-------------|
| `/planNew` | Create a new PROJECT_PLAN.md interactively |
| `/planSpec <file>` | Generate plan from specification document |
| `/planUpdate <task> <action>` | Update task status (start/done/block) |
| `/planNext` | Get AI-powered next task recommendation |
| `/planExportJson` | Export plan as JSON |
| `/planExportCsv` | Export tasks as CSV |
| `/planExportSummary` | Export condensed summary |
| `/planExportGithub` | Export tasks as GitHub Issues |
| `/planSettingsShow` | Display current settings |
| `/planSettingsReset` | Reset settings to defaults |
| `/planSettingsLanguage <lang>` | Change language (en/ka) |
| `/planSettingsAutoSync <on/off>` | Toggle auto-sync |

### Cloud Commands (Requires Authentication)

| Command | Description |
|---------|-------------|
| `/pfLogin [token]` | Authenticate with PlanFlow |
| `/pfLogout` | Sign out |
| `/pfWhoami` | Show current user info |
| `/pfCloudNew` | Create new cloud project |
| `/pfCloudList` | List your cloud projects |
| `/pfCloudLink [id]` | Link local directory to cloud project |
| `/pfCloudUnlink` | Unlink from cloud project |
| `/pfSyncPush` | Push local changes to cloud |
| `/pfSyncPull` | Pull cloud changes to local |
| `/pfSyncStatus` | Show sync status |

### Team Commands (Requires Cloud Project)

| Command | Description |
|---------|-------------|
| `/team` | View team members |
| `/team add <email> [role]` | Invite team member |
| `/team role <email> <role>` | Change member's role |
| `/pfTeamList` | List team members |
| `/pfTeamInvite <email> [role]` | Invite team member |
| `/pfTeamRole <email> <role>` | Change role |
| `/pfTeamRemove <email>` | Remove team member |
| `/pfAssign <task> <email/me>` | Assign task |
| `/pfUnassign <task>` | Unassign task |
| `/pfMyTasks` | View tasks assigned to you |
| `/pfWorkload` | View team workload distribution |

### Collaboration Commands

| Command | Description |
|---------|-------------|
| `/pfComment <task> <message>` | Add comment to task |
| `/pfComments <task>` | View task comments |
| `/pfReact <task> <emoji>` | Add emoji reaction |
| `/pfActivity` | View recent activity |
| `/pfNotifications` | View your notifications |
| `/pfNotificationsClear` | Mark notifications as read |
| `/pfNotificationSettings` | Manage notification preferences |

---

## Plan Management

### /planNew

Create a new PROJECT_PLAN.md through an interactive wizard.

**Usage:**
```bash
/planNew
```

**Process:**
1. Asks about project type (Web App, Mobile, API, CLI, etc.)
2. Gathers tech stack preferences
3. Identifies core features and requirements
4. Determines project timeline and phases
5. Generates comprehensive PROJECT_PLAN.md

**Output:**
- Creates `PROJECT_PLAN.md` in current directory
- Includes project overview, tech stack, phases, and tasks
- Tasks include ID, name, complexity, dependencies, and estimates

**Example:**
```markdown
# Project Name - Project Plan

## Phase 1: Foundation
| ID   | Task              | Complexity | Status | Dependencies |
|------|-------------------|------------|--------|--------------|
| T1.1 | Project Setup     | Low        | TODO   | -            |
| T1.2 | Database Schema   | Medium     | TODO   | T1.1         |
```

---

### /planUpdate

Update the status of a task in PROJECT_PLAN.md.

**Usage:**
```bash
/planUpdate <task-id> <action> [--force]
```

**Actions:**
| Action | Result |
|--------|--------|
| `start` | TODO → IN_PROGRESS 🔄 |
| `done` | ANY → DONE ✅ |
| `block` | ANY → BLOCKED 🚫 |

**Flags:**
- `--force` - Skip assignment check (update even if assigned to someone else)

**Examples:**
```bash
/planUpdate T1.1 start      # Start working on task
/planUpdate T1.1 done       # Mark as completed
/planUpdate T2.3 block      # Mark as blocked
/planUpdate T2.1 done --force  # Update regardless of assignment
```

**Features:**
- Automatically recalculates progress percentages
- Updates progress bars and phase status
- Shows unlocked tasks when completing dependencies
- Auto-syncs to cloud if enabled
- Broadcasts presence to team members

**Output:**
```
✅ Task T1.1 completed! 🎉

📊 Progress: 25% → 31% (+6%)
🟩🟩🟩⬜⬜⬜⬜⬜⬜⬜ 31%

☁️ ✅ Synced to cloud
```

---

### /planNext

Get an AI-powered recommendation for the next task to work on.

**Usage:**
```bash
/planNext
```

**Algorithm considers:**
1. **Phase Priority (40%)** - Complete earlier phases first
2. **Dependency Impact (30%)** - Prioritize tasks that unlock others
3. **Complexity Balance (20%)** - Vary difficulty to prevent burnout
4. **Natural Flow (10%)** - Follow sequential task order

**Output:**
```
╭─────────────────────────────────────────────────────╮
│  🎯 Recommended Next Task                           │
├─────────────────────────────────────────────────────┤
│                                                     │
│  T1.2: Database Setup                               │
│                                                     │
│  📊 Complexity:   Medium                            │
│  🎯 Phase:        1 - Foundation                    │
│  👤 Assigned:     Unassigned                        │
│                                                     │
│  🎯 Why this task?                                  │
│  • Unlocks 3 other tasks                            │
│  • Critical for Phase 2 progress                    │
│                                                     │
│  💡 Ready to start?                                 │
│     /planUpdate T1.2 start                          │
│                                                     │
╰─────────────────────────────────────────────────────╯

── Alternative Tasks ────────────────────────────────
1. T1.3: Authentication Setup - High
2. T2.1: API Endpoints - Medium
```

---

### /planSpec

Generate a project plan from an existing specification document.

**Usage:**
```bash
/planSpec <path-to-spec-file>
```

**Examples:**
```bash
/planSpec ./TECHNICAL_SPEC.md
/planSpec requirements.md
/planSpec ~/Documents/project-spec.md
```

**Process:**
1. Reads and analyzes the specification document
2. Extracts requirements, features, and technical details
3. Identifies implicit tasks and dependencies
4. Asks clarifying questions if information is missing
5. Generates comprehensive PROJECT_PLAN.md

**Supported Formats:**
- Markdown (`.md`)
- Text files (`.txt`)
- JSON specifications

---

## Export Commands

### /planExportJson

Export PROJECT_PLAN.md as a structured JSON file.

**Usage:**
```bash
/planExportJson
```

**Output:** Creates `project-plan.json` with:
```json
{
  "project": {
    "name": "Project Name",
    "type": "Web Application",
    "status": "In Progress"
  },
  "progress": {
    "total": 18,
    "completed": 6,
    "percentage": 33
  },
  "phases": [...],
  "tasks": [...]
}
```

---

### /planExportCsv

Export tasks as a CSV file for spreadsheets.

**Usage:**
```bash
/planExportCsv
```

**Output:** Creates `project-tasks.csv`:
```csv
ID,Name,Phase,Status,Complexity,Dependencies,Assignee
T1.1,Project Setup,1,DONE,Low,,
T1.2,Database Schema,1,IN_PROGRESS,Medium,T1.1,john@example.com
```

---

### /planExportSummary

Export a condensed markdown summary of the project.

**Usage:**
```bash
/planExportSummary
```

**Output:** Creates `PROJECT_SUMMARY.md` with:
- Project overview
- Current progress
- Phase summaries
- Key metrics

---

### /planExportGithub

Export tasks as GitHub Issues using the GitHub CLI.

**Usage:**
```bash
/planExportGithub
```

**Prerequisites:**
- GitHub CLI (`gh`) installed
- Authenticated with GitHub (`gh auth login`)
- In a git repository linked to GitHub

**Process:**
1. Parses all tasks from PROJECT_PLAN.md
2. Creates GitHub Issues for each task
3. Adds labels based on complexity and phase
4. Links dependencies in issue descriptions

**Created Labels:**
- `complexity:low`, `complexity:medium`, `complexity:high`
- `phase:1`, `phase:2`, etc.
- `status:todo`, `status:in-progress`, `status:blocked`

---

## Settings Commands

### /planSettingsShow

Display current plugin configuration.

**Usage:**
```bash
/planSettingsShow
```

**Output:**
```
╭─────────────────────────────────────────────────────╮
│  ⚙️ Plugin Settings                                  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Language:        English (en)                      │
│  Auto-Sync:       Enabled ✅                        │
│  Config Source:   Local (.plan-config.json)         │
│                                                     │
│  ── Cloud Settings ─────────────────────────────    │
│  Authenticated:   Yes ✅                            │
│  User:           john@example.com                   │
│  Linked Project: My Project                         │
│                                                     │
╰─────────────────────────────────────────────────────╯
```

---

### /planSettingsReset

Reset plugin settings to defaults.

**Usage:**
```bash
/planSettingsReset
```

**Resets:**
- Language to English
- Auto-sync to disabled
- Removes local config file

**Note:** Does not affect cloud authentication.

---

### /planSettingsLanguage

Change the plugin language.

**Usage:**
```bash
/planSettingsLanguage <language-code>
```

**Supported Languages:**
| Code | Language |
|------|----------|
| `en` | English |
| `ka` | Georgian (ქართული) |

**Example:**
```bash
/planSettingsLanguage ka
```

---

### /planSettingsAutoSync

Toggle automatic cloud synchronization.

**Usage:**
```bash
/planSettingsAutoSync <on|off>
```

**When enabled:**
- Task updates automatically sync to cloud
- No need to manually run `/pfSyncPush`
- Presence is broadcast to team members

**Example:**
```bash
/planSettingsAutoSync on
```

---

## Cloud Authentication

### /pfLogin

Authenticate with PlanFlow cloud service.

**Usage:**
```bash
/pfLogin                    # Interactive - prompts for token
/pfLogin pf_abc123...       # Direct token input
```

**Getting Your Token:**
1. Visit https://planflow.tools/settings/api-tokens
2. Click "Generate New Token"
3. Copy the token (starts with `pf_`)

**Output on Success:**
```
╭─────────────────────────────────────────────────────╮
│  ✅ Login Successful                                │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Welcome, John Doe!                                 │
│  Email: john@example.com                            │
│                                                     │
│  💡 Next Steps:                                     │
│     • /pfCloudList    View your projects            │
│     • /pfCloudLink    Link to a project             │
│     • /pfCloudNew     Create new project            │
│                                                     │
╰─────────────────────────────────────────────────────╯
```

---

### /pfLogout

Sign out of PlanFlow.

**Usage:**
```bash
/pfLogout
```

**Effects:**
- Removes stored API token
- Clears user information
- Does NOT unlink local project

---

### /pfWhoami

Display current authenticated user information.

**Usage:**
```bash
/pfWhoami
```

**Output:**
```
╭─────────────────────────────────────────────────────╮
│  👤 Current User                                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Name:    John Doe                                  │
│  Email:   john@example.com                          │
│  User ID: abc123-def456-...                         │
│                                                     │
│  ── Linked Project ─────────────────────────────    │
│  Project: My Awesome App                            │
│  Role:    Owner                                     │
│                                                     │
╰─────────────────────────────────────────────────────╯
```

---

## Cloud Project Management

### /pfCloudNew

Create a new cloud project.

**Usage:**
```bash
/pfCloudNew
```

**Process:**
1. Prompts for project name
2. Creates project in PlanFlow cloud
3. Optionally links current directory

---

### /pfCloudList

List all your cloud projects.

**Usage:**
```bash
/pfCloudList
```

**Output:**
```
╭─────────────────────────────────────────────────────╮
│  ☁️ Your Cloud Projects                              │
├─────────────────────────────────────────────────────┤
│                                                     │
│  1. My Awesome App (owner)        ← Linked          │
│     Last synced: 2 hours ago                        │
│                                                     │
│  2. Side Project (editor)                           │
│     Last synced: 5 days ago                         │
│                                                     │
│  3. Team Project (admin)                            │
│     Last synced: 1 day ago                          │
│                                                     │
╰─────────────────────────────────────────────────────╯
```

---

### /pfCloudLink

Link local directory to a cloud project.

**Usage:**
```bash
/pfCloudLink                # Interactive selection
/pfCloudLink <project-id>   # Link to specific project
```

**Process:**
1. Displays available projects
2. Prompts for selection (if no ID provided)
3. Saves project ID to `.plan-config.json`

---

### /pfCloudUnlink

Disconnect from the current cloud project.

**Usage:**
```bash
/pfCloudUnlink
```

**Effects:**
- Removes project link from local config
- Does NOT delete cloud data
- Does NOT affect authentication

---

## Cloud Sync

### /pfSyncPush

Push local PROJECT_PLAN.md to PlanFlow cloud.

**Usage:**
```bash
/pfSyncPush             # Push with confirmation
/pfSyncPush --force     # Overwrite without confirmation
```

**Process:**
1. Reads local PROJECT_PLAN.md
2. Parses tasks and progress
3. Uploads to cloud
4. Updates lastSyncedAt timestamp

**Output:**
```
☁️ Syncing to cloud...
   ↑ Pushing local changes...
   ✓ 18 tasks synced
   ✓ Progress: 33%
☁️ ✅ Push complete!
```

---

### /pfSyncPull

Pull changes from PlanFlow cloud to local.

**Usage:**
```bash
/pfSyncPull             # Pull with confirmation
/pfSyncPull --force     # Overwrite local without confirmation
```

**Process:**
1. Fetches latest from cloud
2. Compares with local version
3. Updates PROJECT_PLAN.md
4. Updates lastSyncedAt timestamp

---

### /pfSyncStatus

Show synchronization status between local and cloud.

**Usage:**
```bash
/pfSyncStatus
```

**Output:**
```
╭─────────────────────────────────────────────────────╮
│  🔄 Sync Status                                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Project: My Awesome App                            │
│                                                     │
│  Local:   18 tasks, 33% complete                    │
│  Cloud:   18 tasks, 33% complete                    │
│                                                     │
│  Status:  ✅ In sync                                │
│  Last synced: 5 minutes ago                         │
│                                                     │
╰─────────────────────────────────────────────────────╯
```

---

## Team Management

### /team

Unified command for viewing and managing team members.

**Usage:**
```bash
/team                           # List all members
/team add <email>               # Invite with default role (editor)
/team add <email> <role>        # Invite with specific role
/team role <email> <role>       # Change member's role
```

**Available Roles:**
| Role | Permissions |
|------|-------------|
| `owner` | Full access, can delete project |
| `admin` | Full access, can manage team |
| `editor` | Can edit tasks and plan |
| `viewer` | Read-only access |

**Example Output:**
```
╭─────────────────────────────────────────────────────╮
│  👥 Team Members                                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  🟢 John Doe (owner)          john@example.com      │
│     Working on: T2.1 - API Integration              │
│                                                     │
│  🟢 Jane Smith (admin)        jane@example.com      │
│     Working on: T3.1 - Dashboard UI                 │
│                                                     │
│  🔴 Bob Wilson (editor)       bob@example.com       │
│     Last seen: 2 hours ago                          │
│                                                     │
│  ⏳ alice@example.com (Pending)  editor             │
│                                                     │
╰─────────────────────────────────────────────────────╯
```

---

### /pfTeamList

List all team members in the linked project.

**Usage:**
```bash
/pfTeamList
```

Same output as `/team` without arguments.

---

### /pfTeamInvite

Invite a new team member to the project.

**Usage:**
```bash
/pfTeamInvite <email> [role]
```

**Examples:**
```bash
/pfTeamInvite alice@example.com           # Invite as editor
/pfTeamInvite bob@example.com admin       # Invite as admin
```

**Process:**
1. Sends invitation email
2. Creates pending invitation
3. User accepts via email link

---

### /pfTeamRole

Change a team member's role.

**Usage:**
```bash
/pfTeamRole <email> <new-role>
```

**Example:**
```bash
/pfTeamRole jane@example.com admin
```

---

### /pfTeamRemove

Remove a team member from the project.

**Usage:**
```bash
/pfTeamRemove <email>
```

**Note:** Requires admin or owner permissions.

---

## Task Operations

### /pfAssign

Assign a task to a team member or yourself.

**Usage:**
```bash
/pfAssign <task-id> <email>    # Assign to specific member
/pfAssign <task-id> me         # Assign to yourself
```

**Examples:**
```bash
/pfAssign T2.1 jane@example.com
/pfAssign T2.1 me
```

**Output:**
```
✅ Task T2.1 assigned to Jane Smith

Task: Implement API Endpoints
Assignee: jane@example.com
Status: TODO
```

---

### /pfUnassign

Remove assignment from a task.

**Usage:**
```bash
/pfUnassign <task-id>
```

---

### /pfMyTasks

View tasks assigned to you.

**Usage:**
```bash
/pfMyTasks
```

**Output:**
```
╭─────────────────────────────────────────────────────╮
│  📋 My Tasks                                        │
├─────────────────────────────────────────────────────┤
│                                                     │
│  🔄 In Progress                                     │
│     T2.1: Implement API Endpoints                   │
│                                                     │
│  📋 Todo                                            │
│     T2.3: Error Handling                            │
│     T3.1: Dashboard UI                              │
│                                                     │
│  ✅ Completed (this week)                           │
│     T1.1: Project Setup                             │
│     T1.2: Database Schema                           │
│                                                     │
╰─────────────────────────────────────────────────────╯
```

---

### /pfWorkload

View team workload distribution.

**Usage:**
```bash
/pfWorkload
```

**Output:**
```
╭─────────────────────────────────────────────────────╮
│  📊 Team Workload                                   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  John Doe                                           │
│  ████████░░ 8 tasks (2 in progress)                 │
│                                                     │
│  Jane Smith                                         │
│  ██████░░░░ 6 tasks (1 in progress)                 │
│                                                     │
│  Bob Wilson                                         │
│  ████░░░░░░ 4 tasks (0 in progress)                 │
│                                                     │
│  Unassigned                                         │
│  ██░░░░░░░░ 2 tasks                                 │
│                                                     │
╰─────────────────────────────────────────────────────╯
```

---

## Collaboration

### /pfComment

Add a comment to a task.

**Usage:**
```bash
/pfComment <task-id> <message>
```

**Features:**
- Supports @mentions (e.g., `@jane`)
- Triggers notifications to mentioned users
- Supports markdown formatting

**Example:**
```bash
/pfComment T2.1 "API design looks good! @jane can you review the auth flow?"
```

---

### /pfComments

View comments on a task.

**Usage:**
```bash
/pfComments <task-id>
```

**Output:**
```
╭─────────────────────────────────────────────────────╮
│  💬 Comments on T2.1                                │
├─────────────────────────────────────────────────────┤
│                                                     │
│  John Doe • 2 hours ago                             │
│  API design looks good! @jane can you review?       │
│                                                     │
│  └─ Jane Smith • 1 hour ago                         │
│     Reviewed! Left some suggestions on the PR.      │
│     👍 2                                            │
│                                                     │
│  Bob Wilson • 30 minutes ago                        │
│  Added error handling. Ready for review.            │
│                                                     │
╰─────────────────────────────────────────────────────╯
```

---

### /pfReact

Add an emoji reaction to a task or comment.

**Usage:**
```bash
/pfReact <task-id> <emoji>
```

**Examples:**
```bash
/pfReact T2.1 👍
/pfReact T2.1 🎉
```

---

### /pfActivity

View recent activity in the project.

**Usage:**
```bash
/pfActivity
```

**Output:**
```
╭─────────────────────────────────────────────────────╮
│  📊 Recent Activity                                 │
├─────────────────────────────────────────────────────┤
│                                                     │
│  • Jane completed T2.1              (5 min ago)     │
│  • John started T3.1                (1 hour ago)    │
│  • Bob commented on T2.3            (2 hours ago)   │
│  • Jane assigned T2.5 to Bob        (3 hours ago)   │
│  • John created project             (yesterday)     │
│                                                     │
╰─────────────────────────────────────────────────────╯
```

---

## Notifications

### /pfNotifications

View your notifications.

**Usage:**
```bash
/pfNotifications
```

**Output:**
```
🔔 3 unread notifications

╭─────────────────────────────────────────────────────╮
│  🔔 Notifications                                   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  🆕 Jane mentioned you in T2.1      (5 min ago)     │
│     "...@john can you review this?"                 │
│                                                     │
│  🆕 You were assigned T3.1          (1 hour ago)    │
│                                                     │
│  🆕 T2.3 status changed to DONE     (2 hours ago)   │
│                                                     │
│  ── Earlier ────────────────────────────────────    │
│                                                     │
│  Bob commented on T1.2              (yesterday)     │
│                                                     │
╰─────────────────────────────────────────────────────╯
```

---

### /pfNotificationsClear

Mark all notifications as read.

**Usage:**
```bash
/pfNotificationsClear
```

---

### /pfNotificationSettings

Manage your notification preferences.

**Usage:**
```bash
/pfNotificationSettings
```

**Configurable Options:**
- Email notifications (on/off)
- Mention notifications
- Assignment notifications
- Task status change notifications
- Comment notifications

---

## Configuration Files

PlanFlow uses two configuration files:

### Global Config
**Location:** `~/.config/claude/plan-plugin-config.json`

Stores user-wide settings:
```json
{
  "language": "en",
  "cloud": {
    "apiToken": "pf_...",
    "apiUrl": "https://api.planflow.tools",
    "userId": "...",
    "userEmail": "john@example.com",
    "userName": "John Doe"
  }
}
```

### Local Config
**Location:** `./.plan-config.json` (in project directory)

Stores project-specific settings:
```json
{
  "cloud": {
    "projectId": "...",
    "projectName": "My Project",
    "linkedAt": "2026-01-15T10:00:00Z",
    "lastSyncedAt": "2026-01-20T15:30:00Z",
    "autoSync": true
  }
}
```

### Config Priority

1. **Local config** - Project-specific overrides
2. **Global config** - User-wide defaults
3. **Built-in defaults** - Fallback values

Settings are merged, with local values taking precedence.

---

## Troubleshooting

### Common Issues

**"Not authenticated"**
```bash
/pfLogin  # Sign in first
```

**"Not linked to a project"**
```bash
/pfCloudList    # List your projects
/pfCloudLink    # Link to a project
```

**"PROJECT_PLAN.md not found"**
```bash
/planNew  # Create a new plan
```

**"Sync conflict"**
```bash
/pfSyncStatus   # Check status
/pfSyncPull     # Pull cloud changes first
/pfSyncPush     # Then push your changes
```

### Getting Help

- Documentation: https://planflow.tools/docs
- GitHub Issues: https://github.com/planflow/planflow/issues
- Community: https://discord.gg/planflow

---

_Generated for PlanFlow v1.6.0 • Last updated: 2026-02-24_
