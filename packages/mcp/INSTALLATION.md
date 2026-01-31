# PlanFlow MCP Server - Installation Guide

Complete guide for installing and configuring the PlanFlow MCP server for Claude Code.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation Methods](#installation-methods)
  - [Global Installation (Recommended)](#global-installation-recommended)
  - [Local Project Installation](#local-project-installation)
  - [Run Without Installing (npx)](#run-without-installing-npx)
- [Claude Code Configuration](#claude-code-configuration)
  - [Claude Desktop App](#claude-desktop-app)
  - [Claude Code CLI](#claude-code-cli)
- [Authentication](#authentication)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)
- [Updating](#updating)
- [Uninstalling](#uninstalling)

---

## Prerequisites

Before installing the PlanFlow MCP server, ensure you have:

### Required

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| Node.js | >= 20.0.0 | `node --version` |
| npm or pnpm | Latest | `npm --version` or `pnpm --version` |
| Claude Code | With MCP support | `claude --version` |

### Optional

- **PlanFlow Account**: Required for cloud sync features. Sign up at [planflow.tools](https://planflow.tools)
- **API Token**: Required for authentication. Generate at [planflow.tools/settings/api](https://planflow.tools/settings/api)

### Verify Node.js Version

```bash
node --version
# Should output v20.0.0 or higher
```

If your Node.js version is too old, update it:

```bash
# Using nvm (recommended)
nvm install 20
nvm use 20

# Or download from nodejs.org
# https://nodejs.org/en/download/
```

---

## Installation Methods

### Global Installation (Recommended)

Install the MCP server globally to use it across all projects.

**Using npm:**

```bash
npm install -g @planflow/mcp
```

**Using pnpm:**

```bash
pnpm add -g @planflow/mcp
```

**Using yarn:**

```bash
yarn global add @planflow/mcp
```

**Verify installation:**

```bash
planflow-mcp --version
# Should output: @planflow/mcp v0.1.0
```

### Local Project Installation

Install as a dev dependency in your project for version-locked usage.

```bash
# npm
npm install --save-dev @planflow/mcp

# pnpm
pnpm add -D @planflow/mcp

# yarn
yarn add -D @planflow/mcp
```

### Run Without Installing (npx)

Use npx to run without installation (downloads on first use).

```bash
npx @planflow/mcp
```

This is useful for:
- Trying out PlanFlow before installing
- CI/CD environments
- One-time usage

---

## Claude Code Configuration

### Claude Desktop App

Add the MCP server to your Claude Desktop configuration file.

**Step 1: Locate the config file**

| OS | Path |
|----|------|
| macOS | `~/.config/claude/claude_desktop_config.json` |
| Linux | `~/.config/claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\claude\claude_desktop_config.json` |

**Step 2: Add the MCP server**

If the file doesn't exist, create it. Add the PlanFlow server to the `mcpServers` section:

**For global installation:**

```json
{
  "mcpServers": {
    "planflow": {
      "command": "planflow-mcp"
    }
  }
}
```

**For local installation:**

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

**For local installation with absolute path:**

```json
{
  "mcpServers": {
    "planflow": {
      "command": "node",
      "args": ["/path/to/your/project/node_modules/@planflow/mcp/dist/index.js"]
    }
  }
}
```

**Step 3: Restart Claude Desktop**

Close and reopen Claude Desktop for the changes to take effect.

### Claude Code CLI

For Claude Code CLI, add the MCP server to your project's `.mcp.json` or global config.

**Project-level configuration (`.mcp.json`):**

```json
{
  "servers": {
    "planflow": {
      "command": "planflow-mcp"
    }
  }
}
```

**With environment variables:**

```json
{
  "servers": {
    "planflow": {
      "command": "planflow-mcp",
      "env": {
        "PLANFLOW_API_URL": "https://api.planflow.tools",
        "PLANFLOW_DEBUG": "false"
      }
    }
  }
}
```

---

## Authentication

After installation and configuration, authenticate with your PlanFlow account.

### Step 1: Get Your API Token

1. Go to [planflow.tools/settings/api](https://planflow.tools/settings/api)
2. Click "Generate New Token"
3. Copy the token (starts with `pf_`)

### Step 2: Login via Claude

In Claude, use the login tool:

```
Please use planflow_login with token: pf_your_token_here
```

Or simply ask:

```
Login to PlanFlow with my API token pf_xxxxxxxxxxxxx
```

### Step 3: Verify Authentication

Check your login status:

```
Who am I logged in as on PlanFlow?
```

This should display your email and user ID.

### Token Security

- Your API token is stored locally at `~/.config/planflow/config.json`
- The token is never sent to Claude's servers, only to PlanFlow's API
- Tokens can be revoked at any time from your PlanFlow settings
- Generate separate tokens for different machines

---

## Verification

After installation and authentication, verify everything works correctly.

### 1. Check MCP Server Status

In Claude, ask:

```
List my PlanFlow projects
```

If authenticated, you'll see your projects list (or an empty list if you have none).

### 2. Test Tool Availability

Ask Claude:

```
What PlanFlow tools are available?
```

You should see all 10 tools listed:
- `planflow_login`
- `planflow_logout`
- `planflow_whoami`
- `planflow_projects`
- `planflow_create`
- `planflow_sync`
- `planflow_task_list`
- `planflow_task_update`
- `planflow_task_next`
- `planflow_notifications`

### 3. Create a Test Project

```
Create a new PlanFlow project called "Test Project"
```

---

## Troubleshooting

### MCP Server Not Found

**Symptom:** Claude doesn't recognize PlanFlow tools

**Solutions:**

1. **Verify installation:**
   ```bash
   which planflow-mcp  # macOS/Linux
   where planflow-mcp  # Windows
   ```

2. **Check config file syntax:**
   ```bash
   # Validate JSON syntax
   cat ~/.config/claude/claude_desktop_config.json | python -m json.tool
   ```

3. **Restart Claude Desktop** after config changes

4. **Try absolute path** in config:
   ```json
   {
     "mcpServers": {
       "planflow": {
         "command": "/usr/local/bin/planflow-mcp"
       }
     }
   }
   ```

### Authentication Errors

**Symptom:** "Unauthorized" or "Invalid token" errors

**Solutions:**

1. **Verify token validity** at [planflow.tools/settings/api](https://planflow.tools/settings/api)

2. **Re-login:**
   ```
   Logout from PlanFlow
   ```
   Then login again with a fresh token

3. **Check config file:**
   ```bash
   cat ~/.config/planflow/config.json
   ```
   Ensure the token is present and correctly formatted

4. **Clear corrupted config:**
   ```bash
   rm ~/.config/planflow/config.json
   ```
   Then login again

### Connection Errors

**Symptom:** "Cannot connect to API" or timeout errors

**Solutions:**

1. **Check internet connection**

2. **Verify API URL:**
   ```bash
   curl https://api.planflow.tools/health
   ```

3. **Check for proxy/firewall issues**

4. **Enable debug logging:**
   ```json
   {
     "mcpServers": {
       "planflow": {
         "command": "planflow-mcp",
         "env": {
           "PLANFLOW_DEBUG": "true"
         }
       }
     }
   }
   ```

### Node.js Version Issues

**Symptom:** Syntax errors or "Unexpected token" errors

**Solution:** Upgrade to Node.js 20+

```bash
# Check current version
node --version

# Upgrade with nvm
nvm install 20
nvm use 20
nvm alias default 20
```

### Permission Errors

**Symptom:** "EACCES" or permission denied errors

**Solutions:**

1. **Fix npm permissions:**
   ```bash
   # Create npm global directory in home
   mkdir ~/.npm-global
   npm config set prefix '~/.npm-global'

   # Add to PATH in ~/.bashrc or ~/.zshrc
   export PATH=~/.npm-global/bin:$PATH
   ```

2. **Or use npx** instead of global install

### Debug Mode

Enable detailed logging for troubleshooting:

```bash
# Set environment variable
export PLANFLOW_DEBUG=true

# Or in Claude config
{
  "mcpServers": {
    "planflow": {
      "command": "planflow-mcp",
      "env": {
        "PLANFLOW_DEBUG": "true"
      }
    }
  }
}
```

Debug logs are written to stderr and won't interfere with MCP communication.

---

## Updating

### Global Installation

```bash
# npm
npm update -g @planflow/mcp

# pnpm
pnpm update -g @planflow/mcp

# yarn
yarn global upgrade @planflow/mcp
```

### Local Installation

```bash
# npm
npm update @planflow/mcp

# pnpm
pnpm update @planflow/mcp

# yarn
yarn upgrade @planflow/mcp
```

### Check Current Version

```bash
planflow-mcp --version
# or
npm list -g @planflow/mcp
```

---

## Uninstalling

### Remove the Package

**Global:**

```bash
# npm
npm uninstall -g @planflow/mcp

# pnpm
pnpm remove -g @planflow/mcp

# yarn
yarn global remove @planflow/mcp
```

**Local:**

```bash
npm uninstall @planflow/mcp
```

### Remove Configuration

**Remove credentials:**

```bash
rm -rf ~/.config/planflow
```

**Remove from Claude config:**

Edit `~/.config/claude/claude_desktop_config.json` and remove the `planflow` entry from `mcpServers`.

---

## Environment Variables Reference

| Variable | Description | Default |
|----------|-------------|---------|
| `PLANFLOW_API_URL` | PlanFlow API server URL | `https://api.planflow.tools` |
| `PLANFLOW_DEBUG` | Enable debug logging (`true`/`false`) | `false` |

---

## Getting Help

- **Documentation:** [docs.planflow.tools](https://docs.planflow.tools)
- **GitHub Issues:** [github.com/planflow/planflow/issues](https://github.com/planflow/planflow/issues)
- **Email Support:** support@planflow.tools

---

## Next Steps

After successful installation:

1. **Create your first project:** `Create a PlanFlow project for my app`
2. **Sync your PROJECT_PLAN.md:** `Sync my project plan to PlanFlow`
3. **Get task recommendations:** `What should I work on next?`

Happy planning!
