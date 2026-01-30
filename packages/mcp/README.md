# @planflow/mcp

MCP (Model Context Protocol) server for PlanFlow - AI-native project management from your terminal.

## Overview

This package provides a MCP server that integrates PlanFlow with Claude Code, allowing you to manage projects and tasks directly from your AI-powered development workflow.

## Quick Start

```bash
# 1. Install globally
npm install -g @planflow/mcp

# 2. Add to Claude Desktop config (~/.config/claude/claude_desktop_config.json)
{
  "mcpServers": {
    "planflow": {
      "command": "planflow-mcp"
    }
  }
}

# 3. Restart Claude Desktop

# 4. In Claude, login with your API token
"Login to PlanFlow with token pf_xxxxx"
```

Requires Node.js >= 20.0.0. See [INSTALLATION.md](./INSTALLATION.md) for detailed setup instructions.

## Installation

```bash
npm install -g @planflow/mcp
```

Or with pnpm:

```bash
pnpm add -g @planflow/mcp
```

> **Need help?** See the [complete installation guide](./INSTALLATION.md) for detailed instructions, troubleshooting, and configuration options.

## Configuration

Add the MCP server to your Claude Code configuration file (`~/.config/claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "planflow": {
      "command": "planflow-mcp"
    }
  }
}
```

Or if installed locally in a project:

```json
{
  "mcpServers": {
    "planflow": {
      "command": "npx",
      "args": ["@planflow/mcp"]
    }
  }
}
```

## Authentication

Before using PlanFlow tools, authenticate with your API token:

1. Get your API token from [planflow.dev/settings/api](https://planflow.dev/settings/api)
2. Use the `planflow_login` tool in Claude Code with your token

## Available Tools

| Tool | Description |
|------|-------------|
| `planflow_login` | Authenticate with your PlanFlow API token |
| `planflow_logout` | Clear stored credentials |
| `planflow_whoami` | Show current authenticated user |
| `planflow_projects` | List all your projects |
| `planflow_create` | Create a new project |
| `planflow_sync` | Sync local PROJECT_PLAN.md to cloud |
| `planflow_task_list` | List tasks for a project |
| `planflow_task_update` | Update task status |
| `planflow_task_next` | Get next recommended task |
| `planflow_notifications` | View your notifications |

## Usage Examples

### Login

```
Use planflow_login with my API token: pf_xxxxx
```

### List Projects

```
Show me my PlanFlow projects
```

### Sync Project Plan

```
Sync my PROJECT_PLAN.md to PlanFlow
```

### Update Task Status

```
Mark task T1.5 as done in PlanFlow
```

### Get Next Task

```
What should I work on next?
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PLANFLOW_API_URL` | API server URL | `https://api.planflow.dev` |
| `PLANFLOW_DEBUG` | Enable debug logging | `false` |

## Configuration Storage

Credentials are stored in `~/.config/planflow/config.json`:

```json
{
  "apiUrl": "https://api.planflow.dev",
  "token": "pf_...",
  "userId": "...",
  "email": "..."
}
```

## Requirements

- Node.js >= 20.0.0
- Claude Code with MCP support

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage
```

## License

MIT - see [LICENSE](./LICENSE) for details.

## Links

- [Installation Guide](./INSTALLATION.md) - Detailed setup instructions
- [Full MCP Documentation](../../docs/MCP_INSTALLATION.md) - Comprehensive docs site guide
- [Getting Started](../../docs/GETTING_STARTED.md) - Complete onboarding guide
- [PlanFlow Website](https://planflow.dev)
- [Documentation](https://docs.planflow.dev)
- [GitHub Repository](https://github.com/planflow/planflow)
- [Report Issues](https://github.com/planflow/planflow/issues)
