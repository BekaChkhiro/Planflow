# Getting Started with PlanFlow

> AI-Native Project Management for Claude Code

This guide will walk you through setting up PlanFlow and managing your first project directly from Claude Code.

---

## Table of Contents

1. [What is PlanFlow?](#what-is-planflow)
2. [Prerequisites](#prerequisites)
3. [Quick Start (5 minutes)](#quick-start-5-minutes)
4. [Step-by-Step Setup](#step-by-step-setup)
   - [Create Your Account](#1-create-your-account)
   - [Create Your First Project](#2-create-your-first-project)
   - [Generate an API Token](#3-generate-an-api-token)
   - [Install the MCP Server](#4-install-the-mcp-server)
   - [Configure Claude](#5-configure-claude)
   - [Connect and Verify](#6-connect-and-verify)
5. [Using PlanFlow](#using-planflow)
   - [Core Workflow](#core-workflow)
   - [Available MCP Tools](#available-mcp-tools)
   - [Syncing Your Plan](#syncing-your-plan)
6. [Example Session](#example-session)
7. [Tips & Best Practices](#tips--best-practices)
8. [Troubleshooting](#troubleshooting)
9. [Next Steps](#next-steps)

---

## What is PlanFlow?

PlanFlow is an AI-native project management tool designed specifically for developers who use Claude Code. It lets you:

- **Manage projects without leaving the terminal** - No context switching to web apps
- **Sync PROJECT_PLAN.md to the cloud** - Access your plans from anywhere
- **Track task progress** - Update statuses directly from Claude Code
- **Get smart recommendations** - AI-powered next task suggestions
- **Collaborate with your team** - Share projects and track progress together

### How It Works

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   Claude Code   │ ←──→ │   MCP Server    │ ←──→ │  PlanFlow API   │
│   (Your IDE)    │      │ (planflow-mcp) │      │ (planflow.tools)  │
└─────────────────┘      └─────────────────┘      └─────────────────┘
        ↑                                                  ↑
        │                                                  │
        └──────── You work here ───────────────────────────┘
                                                   Web Dashboard
```

---

## Prerequisites

Before you begin, make sure you have:

- **Node.js 20+** - [Download here](https://nodejs.org/)
- **Claude Code** or **Claude Desktop** - [Get Claude Code](https://claude.ai/code)
- **A terminal** - Any terminal application
- **5 minutes** - That's all it takes!

Verify Node.js is installed:

```bash
node --version  # Should show v20.x.x or higher
```

---

## Quick Start (5 minutes)

For experienced developers who want to get running fast:

```bash
# 1. Install the MCP server globally
npm install -g planflow-mcp

# 2. Add MCP server to Claude Code
claude mcp add --transport stdio --scope user planflow-mcp -- planflow-mcp

# 3. (Optional) Install slash commands for enhanced workflow
npm install -g planflow-plugin

# 4. Sign up at planflow.tools and generate an API token
#    Go to: https://planflow.tools/dashboard/settings/tokens

# 5. Restart Claude and login
# In Claude, say: "Login to PlanFlow with token pf_your_token_here"

# 6. Start managing projects!
# "Show my PlanFlow projects"
# "Create a new project called MyApp"
# "/planNew" (using slash command)
```

---

## Step-by-Step Setup

### 1. Create Your Account

1. Visit [planflow.tools](https://planflow.tools)
2. Click **Sign Up** in the top right
3. Enter your details:
   - **Email** - Your email address
   - **Password** - At least 8 characters
   - **Name** - Your display name
4. Click **Create Account**

You'll be automatically logged in and taken to your dashboard.

**Free tier includes:**
- 3 projects
- Local plan storage
- Basic MCP tools

### 2. Create Your First Project

Once logged in:

1. Click **Projects** in the sidebar (or go to `/dashboard/projects`)
2. Click the **+ New Project** button
3. Fill in:
   - **Name** - e.g., "My Awesome App"
   - **Description** - Brief description of your project
4. Click **Create**

Your project is now ready! You can also create projects directly from Claude Code later.

### 3. Generate an API Token

The API token allows the MCP server to authenticate with your PlanFlow account.

1. Go to **Settings** → **API Tokens** (or visit `/dashboard/settings/tokens`)
2. Click **Generate New Token**
3. Give it a name (e.g., "Claude Code - MacBook")
4. Click **Create Token**

**Important:** Copy the token immediately! It starts with `pf_` and is only shown once.

```
pf_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

Store it somewhere safe - you'll need it in a moment.

### 4. Install the MCP Server

Open your terminal and install the PlanFlow MCP server globally:

```bash
npm install -g planflow-mcp
```

Verify the installation:

```bash
planflow-mcp --version
```

**Optional: Install Slash Commands**

For an enhanced workflow with 50+ slash commands like `/planNew`, `/planUpdate`, and `/pfSyncPush`:

```bash
npm install -g planflow-plugin
```

The plugin automatically installs commands to `~/.claude/commands/`. If needed, run `planflow-plugin install` manually.

**Alternative: Local Installation**

If you prefer not to install globally:

```bash
# Install locally in a directory
mkdir -p ~/.local/planflow && cd ~/.local/planflow
npm init -y
npm install planflow-mcp

# Use npx in your Claude config instead
```

### 5. Configure Claude

Add the PlanFlow MCP server to your Claude configuration.

**For Claude Desktop:**

Edit `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "planflow": {
      "command": "planflow-mcp"
    }
  }
}
```

**For Claude Code (CLI):**

Edit `~/.config/claude/settings.json` or your project's `.claude/settings.json`:

```json
{
  "mcpServers": {
    "planflow": {
      "command": "planflow-mcp"
    }
  }
}
```

**With Custom API URL (self-hosted):**

```json
{
  "mcpServers": {
    "planflow": {
      "command": "planflow-mcp",
      "env": {
        "PLANFLOW_API_URL": "https://your-api.example.com"
      }
    }
  }
}
```

**Restart Claude** after making changes to the configuration.

### 6. Connect and Verify

Now let's connect Claude to your PlanFlow account.

**In Claude, type or say:**

```
Login to PlanFlow with my API token: pf_your_token_here
```

Claude will use the `planflow_login` tool to authenticate. You should see:

```
✅ Successfully logged in to PlanFlow!

Welcome, Your Name!
Email: your@email.com
```

**Verify the connection:**

```
Show my PlanFlow account info
```

This uses the `planflow_whoami` tool to confirm you're authenticated.

---

## Using PlanFlow

### Core Workflow

The typical PlanFlow workflow looks like this:

```
1. Create/select a project
        ↓
2. Write PROJECT_PLAN.md locally
        ↓
3. Sync plan to cloud (planflow_sync)
        ↓
4. Work on tasks
        ↓
5. Update task status (planflow_task_update)
        ↓
6. Get next task recommendation (planflow_task_next)
        ↓
7. Repeat steps 4-6
```

### Available MCP Tools

PlanFlow provides 10 MCP tools for managing your projects:

| Tool | Description | Example Usage |
|------|-------------|---------------|
| `planflow_login` | Authenticate with API token | "Login to PlanFlow with token pf_xxx" |
| `planflow_logout` | Clear stored credentials | "Logout from PlanFlow" |
| `planflow_whoami` | Show current user info | "Who am I logged in as?" |
| `planflow_projects` | List all your projects | "Show my PlanFlow projects" |
| `planflow_create` | Create a new project | "Create a PlanFlow project called MyApp" |
| `planflow_sync` | Sync PROJECT_PLAN.md to cloud | "Sync my plan to PlanFlow" |
| `planflow_task_list` | List tasks for a project | "Show tasks for project X" |
| `planflow_task_update` | Update task status | "Mark task T1.1 as done" |
| `planflow_task_next` | Get recommended next task | "What should I work on next?" |
| `planflow_notifications` | View notifications | "Show my PlanFlow notifications" |

### Syncing Your Plan

PlanFlow works with `PROJECT_PLAN.md` files in your repository. To sync:

1. **Make sure you have a PROJECT_PLAN.md** in your project root
2. **Tell Claude to sync:**

```
Sync my PROJECT_PLAN.md to PlanFlow project [project-id]
```

The sync tool will:
- Parse your local PROJECT_PLAN.md
- Upload it to the PlanFlow cloud
- Extract and sync task statuses
- Keep everything in sync

**Pull changes from cloud:**

```
Pull the latest plan from PlanFlow for project [project-id]
```

---

## Example Session

Here's a complete example session using PlanFlow with Claude Code:

```
You: Login to PlanFlow with token pf_abc123def456

Claude: ✅ Successfully logged in to PlanFlow!
        Welcome, Jane Developer!

You: Show my projects

Claude: 📁 Your PlanFlow Projects:

        1. my-saas-app (ID: proj_123)
           Created: 2026-01-15
           Tasks: 12/45 complete (27%)

        2. portfolio-site (ID: proj_456)
           Created: 2026-01-20
           Tasks: 8/8 complete (100%)

You: What should I work on next for my-saas-app?

Claude: 🎯 Recommended Next Task:

        T2.3: Implement user authentication

        Complexity: High
        Estimated: 6 hours
        Dependencies: T2.1 ✅, T2.2 ✅

        This task unlocks 4 other tasks and is on the critical path.

You: I finished implementing user auth. Mark T2.3 as done.

Claude: ✅ Task T2.3 marked as complete!

        Progress: 27% → 31% (+4%)

        🔓 Unlocked tasks:
           - T2.4: Session management
           - T2.5: Password reset flow
           - T3.1: User dashboard

You: Sync my plan to the cloud

Claude: ✅ PROJECT_PLAN.md synced to PlanFlow!

        Project: my-saas-app
        Tasks synced: 45
        Last updated: Just now
```

---

## Tips & Best Practices

### 1. Keep Your Plan Updated

Sync your PROJECT_PLAN.md regularly to keep the cloud version current:

```
Sync my plan to PlanFlow
```

### 2. Use Descriptive Task IDs

Follow the `T[phase].[task]` pattern for easy tracking:

```markdown
## Phase 1: Foundation
- T1.1: Setup project structure
- T1.2: Configure database

## Phase 2: Core Features
- T2.1: User authentication
- T2.2: API endpoints
```

### 3. Let Claude Help You Plan

Ask Claude to help structure your PROJECT_PLAN.md:

```
Help me create a PROJECT_PLAN.md for a React e-commerce app
with user auth, product catalog, and checkout
```

### 4. Check Progress Regularly

Get an overview of your project status:

```
Show me the progress summary for my-saas-app
```

### 5. Use the Web Dashboard for Visualization

While Claude Code is great for quick updates, the web dashboard at [planflow.tools](https://planflow.tools) offers:

- Kanban board view
- Progress charts
- Team collaboration features
- Detailed analytics

---

## Troubleshooting

### "Command not found: planflow-mcp"

The MCP server isn't in your PATH. Try:

```bash
# Check where npm installs global packages
npm root -g

# Add to your PATH if needed
export PATH="$PATH:$(npm root -g)/../bin"

# Or reinstall
npm install -g planflow-mcp
```

### "Authentication failed"

Your API token may be invalid or expired:

1. Go to [planflow.tools/dashboard/settings/tokens](https://planflow.tools/dashboard/settings/tokens)
2. Revoke the old token
3. Generate a new token
4. Login again with the new token

### "MCP server not found"

Claude can't find the PlanFlow MCP server:

1. Verify the config file path:
   - macOS/Linux: `~/.config/claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\claude\claude_desktop_config.json`

2. Check the JSON is valid (no trailing commas, proper quotes)

3. Restart Claude completely (quit and reopen)

### "Project not found"

Make sure you're using the correct project ID:

```
Show my PlanFlow projects
```

Use the ID shown (e.g., `proj_abc123`), not the project name.

### Connection Issues

If you're behind a corporate firewall or VPN:

```json
{
  "mcpServers": {
    "planflow": {
      "command": "planflow-mcp",
      "env": {
        "HTTPS_PROXY": "http://your-proxy:8080"
      }
    }
  }
}
```

---

## Next Steps

Now that you're set up with PlanFlow, here's what to explore next:

### Learn More

- 📖 [MCP Installation Guide](./MCP_INSTALLATION.md) - Complete installation & configuration guide
- 📖 [API Reference](./API_REFERENCE.md) - Complete API documentation

### Pricing

PlanFlow is currently **free** during early access! You get full access to all features including unlimited projects, cloud sync, team collaboration, and MCP integration.

Visit [planflow.tools/pricing](https://planflow.tools/pricing) for more details.

### Join the Community

- 💬 [Discord Community](https://discord.gg/planflow) - Get help, share tips
- 🐦 [Twitter @PlanFlowDev](https://twitter.com/planflowdev) - Updates and tips
- 📧 [Newsletter](https://planflow.tools/newsletter) - Monthly product updates

### Contribute

PlanFlow is built for developers, by developers. We'd love your feedback:

- 🐛 [Report Issues](https://github.com/planflow/planflow/issues)
- 💡 [Request Features](https://github.com/planflow/planflow/discussions)
- ⭐ [Star us on GitHub](https://github.com/planflow/planflow)

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│                    PlanFlow Quick Reference                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  AUTHENTICATION                                             │
│  ─────────────                                              │
│  Login:    "Login to PlanFlow with token pf_xxx"            │
│  Logout:   "Logout from PlanFlow"                           │
│  Whoami:   "Who am I in PlanFlow?"                          │
│                                                             │
│  PROJECTS                                                   │
│  ────────                                                   │
│  List:     "Show my PlanFlow projects"                      │
│  Create:   "Create a PlanFlow project called X"             │
│  Sync:     "Sync PROJECT_PLAN.md to PlanFlow"               │
│                                                             │
│  TASKS                                                      │
│  ─────                                                      │
│  List:     "Show tasks for project X"                       │
│  Update:   "Mark task T1.1 as done/in-progress/blocked"     │
│  Next:     "What should I work on next?"                    │
│                                                             │
│  CONFIG FILE LOCATIONS                                      │
│  ─────────────────────                                      │
│  Claude:   ~/.config/claude/claude_desktop_config.json      │
│  PlanFlow: ~/.config/planflow/config.json                   │
│                                                             │
│  HELPFUL COMMANDS                                           │
│  ────────────────                                           │
│  "Show my PlanFlow progress"                                │
│  "What tasks are blocked?"                                  │
│  "Show notifications"                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

**Happy planning!** 🚀

If you have questions, reach out at [bekachkhirodze1@gmail.com](mailto:bekachkhirodze1@gmail.com) or join our [Discord](https://discord.gg/planflow).
