# PlanFlow Plugin for Claude Code

Slash commands for AI-native project management directly in Claude Code.

## Installation

```bash
npm install -g planflow-plugin
```

The installation automatically sets up all slash commands in `~/.claude/commands/`.

## Manual Setup

If automatic setup didn't work, run:

```bash
planflow-plugin install
```

## Available Commands

### Planning Commands
- `/planNew` - Create a new project plan
- `/planUpdate` - Update task status
- `/planNext` - Get next task recommendation
- `/planSpec` - Analyze specification documents

### Cloud Sync Commands
- `/pfLogin` - Login to PlanFlow cloud
- `/pfLogout` - Logout from PlanFlow
- `/pfWhoami` - Check your account info
- `/pfSyncPush` - Push plan to cloud
- `/pfSyncPull` - Pull plan from cloud
- `/pfSyncStatus` - Check sync status
- `/pfCloudLink` - Link local directory to cloud project
- `/pfCloudUnlink` - Disconnect from cloud project
- `/pfCloudList` - List cloud projects
- `/pfCloudNew` - Create new cloud project

### Team Commands
- `/team` - View and manage team members
- `/pfTeamList` - List team members
- `/pfTeamInvite` - Invite a team member
- `/pfTeamRemove` - Remove a team member
- `/pfTeamRole` - Change member role
- `/pfMyTasks` - View tasks assigned to you
- `/pfAssign` - Assign a task
- `/pfUnassign` - Remove assignment
- `/pfWorkload` - View team workload

### Collaboration Commands
- `/pfComment` - Add comment to a task
- `/pfComments` - View task comments
- `/pfReact` - Add emoji reaction
- `/pfActivity` - View recent activity
- `/pfNotifications` - View notifications
- `/pfNotificationsClear` - Clear notifications
- `/pfNotificationSettings` - Manage notification preferences

### Export Commands
- `/planExportJson` - Export as JSON
- `/planExportCsv` - Export as CSV
- `/planExportSummary` - Export as summary
- `/planExportGithub` - Export to GitHub Issues

### Settings Commands
- `/planSettingsShow` - Show current settings
- `/planSettingsReset` - Reset to defaults
- `/planSettingsLanguage` - Change language
- `/planSettingsAutoSync` - Configure auto-sync

## CLI Commands

```bash
planflow-plugin install    # Install/reinstall commands
planflow-plugin uninstall  # Remove all commands
planflow-plugin list       # List installed commands
planflow-plugin help       # Show help
```

## Requirements

- Node.js 18+
- Claude Code CLI

## Documentation

Visit [planflow.tools/docs](https://planflow.tools/docs) for full documentation.

## License

MIT
