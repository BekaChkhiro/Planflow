# PlanFlow Documentation

> AI-Native Project Management for Claude Code

Welcome to the PlanFlow documentation. This index provides quick access to all documentation resources for using, integrating, and contributing to PlanFlow.

---

## Quick Install

```bash
# MCP Server (required for cloud features)
npm install -g planflow-mcp
claude mcp add --transport stdio --scope user planflow-mcp -- planflow-mcp

# Slash Commands (50+ commands like /planNew, /planUpdate)
npm install -g planflow-plugin
```

---

## Quick Links

| Getting Started | For Developers | API & Integrations |
|-----------------|----------------|-------------------|
| [Getting Started Guide](./GETTING_STARTED.md) | [Architecture](./ARCHITECTURE.md) | [API Reference](./API_REFERENCE.md) |
| [User Guide](./USER_GUIDE.md) | [Development Setup](./DEVELOPMENT.md) | [Integrations API](./API_INTEGRATIONS.md) |
| [MCP Installation](./MCP_INSTALLATION.md) | [Contributing](./CONTRIBUTING.md) | [Real-time API](./API_REALTIME.md) |

---

## Documentation Overview

### Getting Started

New to PlanFlow? Start here to get up and running quickly.

| Document | Description |
|----------|-------------|
| [Getting Started Guide](./GETTING_STARTED.md) | Complete setup guide - create account, install MCP, connect Claude Code |
| [MCP Installation](./MCP_INSTALLATION.md) | Detailed MCP server installation and configuration instructions |

### User Guides

Learn how to use PlanFlow effectively for project management.

| Document | Description |
|----------|-------------|
| [User Guide](./USER_GUIDE.md) | Complete guide to the web dashboard - projects, teams, tasks, notifications |
| [Plugin Commands](./PLUGIN_COMMANDS.md) | Reference for all CLI commands (`/planNew`, `/planUpdate`, `/pfSync`, etc.) |
| [MCP Tools Reference](./MCP_TOOLS.md) | Reference for MCP server tools (`planflow_login`, `planflow_sync`, etc.) |
| [Examples](./EXAMPLES.md) | Code snippets and usage examples for common workflows |

### API Reference

Complete API documentation for building integrations.

| Document | Description |
|----------|-------------|
| [API Reference](./API_REFERENCE.md) | Core API - Auth, Projects, Tasks, Organizations, Teams |
| [Integrations API](./API_INTEGRATIONS.md) | GitHub, Slack, and Discord integration endpoints |
| [Real-time API](./API_REALTIME.md) | WebSocket events, presence, and live updates |
| [Notifications API](./API_NOTIFICATIONS.md) | Notification endpoints and webhook payloads |

### Developer Documentation

For contributors and developers building on PlanFlow.

| Document | Description |
|----------|-------------|
| [Architecture](./ARCHITECTURE.md) | System architecture, tech stack, data flow diagrams |
| [Development Setup](./DEVELOPMENT.md) | Local development environment setup and workflows |
| [Contributing](./CONTRIBUTING.md) | Contribution guidelines, code style, PR process |

---

## Documentation by Role

### For End Users

1. **[Getting Started Guide](./GETTING_STARTED.md)** - Set up your account and connect Claude Code
2. **[User Guide](./USER_GUIDE.md)** - Learn to use the web dashboard
3. **[Plugin Commands](./PLUGIN_COMMANDS.md)** - Master the CLI commands

### For Developers

1. **[Development Setup](./DEVELOPMENT.md)** - Set up local development environment
2. **[Architecture](./ARCHITECTURE.md)** - Understand the system design
3. **[API Reference](./API_REFERENCE.md)** - Build integrations
4. **[Contributing](./CONTRIBUTING.md)** - Contribute to PlanFlow

### For Integrators

1. **[API Reference](./API_REFERENCE.md)** - Core API endpoints
2. **[Integrations API](./API_INTEGRATIONS.md)** - Third-party integrations
3. **[Real-time API](./API_REALTIME.md)** - WebSocket and live features
4. **[Examples](./EXAMPLES.md)** - Code snippets and examples

---

## Key Concepts

### How PlanFlow Works

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   Claude Code   │ ←──→ │   MCP Server    │ ←──→ │  PlanFlow API   │
│   (Your IDE)    │      │ (planflow-mcp) │      │ (planflow.tools)│
└─────────────────┘      └─────────────────┘      └─────────────────┘
        │                                                  │
        │  PROJECT_PLAN.md                                 │
        │  (Local file)                                    │
        └──────────────────────────────────────────────────┘
                                Cloud Sync
```

### Core Workflows

| Workflow | Commands | Documentation |
|----------|----------|---------------|
| **Create a plan** | `/planNew`, `/planSpec` | [Plugin Commands](./PLUGIN_COMMANDS.md#plan-management) |
| **Update tasks** | `/planUpdate T1.1 done` | [Plugin Commands](./PLUGIN_COMMANDS.md#planupdate) |
| **Sync to cloud** | `/pfSyncPush`, `/pfSyncPull` | [Plugin Commands](./PLUGIN_COMMANDS.md#cloud-sync) |
| **Team collaboration** | `/team`, `/pfAssign` | [User Guide](./USER_GUIDE.md#team-management) |
| **Get recommendations** | `/planNext` | [Plugin Commands](./PLUGIN_COMMANDS.md#plannext) |

---

## API Quick Reference

### Base URL

```
Production: https://api.planflow.tools
Development: http://localhost:3001
```

### Authentication

```bash
# Using JWT (Web Dashboard)
Authorization: Bearer <jwt_token>

# Using API Token (MCP Server)
Authorization: Bearer <api_token>
```

### Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/login` | POST | User login |
| `/projects` | GET/POST | List/create projects |
| `/projects/:id/tasks` | GET/PATCH | Get/update tasks |
| `/projects/:id/plan` | GET/PUT | Get/update plan content |
| `/organizations/:id/members` | GET | List team members |

See [API Reference](./API_REFERENCE.md) for complete documentation.

---

## Need Help?

- **Issues & Bugs**: [GitHub Issues](https://github.com/planflow/planflow/issues)
- **Feature Requests**: [GitHub Discussions](https://github.com/planflow/planflow/discussions)
- **Email Support**: bekachkhirodze1@gmail.com

---

## npm Packages

| Package | Version | Description |
|---------|---------|-------------|
| [planflow-mcp](https://www.npmjs.com/package/planflow-mcp) | 0.1.2 | MCP server for Claude Code integration |
| [planflow-plugin](https://www.npmjs.com/package/planflow-plugin) | 0.1.1 | 50+ slash commands for Claude Code |

## Version Info

| Component | Version |
|-----------|---------|
| API | 0.0.1 |
| MCP Server | 0.1.2 |
| Plugin | 0.1.1 |
| Web Dashboard | 0.0.1 |

---

*Last Updated: 2026-02-26*
