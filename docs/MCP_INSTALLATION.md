# MCP Server Installation Guide

> Complete guide for installing and configuring the PlanFlow MCP server

The PlanFlow MCP (Model Context Protocol) server enables seamless integration between Claude Code and your PlanFlow account, allowing you to manage projects and tasks without leaving your terminal.

---

## Table of Contents

- [Overview](#overview)
- [System Requirements](#system-requirements)
- [Installation](#installation)
  - [Quick Install (Recommended)](#quick-install-recommended)
  - [Platform-Specific Instructions](#platform-specific-instructions)
  - [Alternative Installation Methods](#alternative-installation-methods)
- [Configuration](#configuration)
  - [Claude Desktop](#claude-desktop)
  - [Claude Code CLI](#claude-code-cli)
  - [VS Code Extension](#vs-code-extension)
- [Authentication](#authentication)
- [Verification](#verification)
- [Advanced Configuration](#advanced-configuration)
- [Troubleshooting](#troubleshooting)
- [Updating & Uninstalling](#updating--uninstalling)
- [Security Considerations](#security-considerations)
- [FAQ](#faq)

---

## Overview

### What is the MCP Server?

The MCP server is a bridge between Claude (AI assistant) and PlanFlow (project management). It provides 10 tools that Claude can use to:

- Authenticate with your PlanFlow account
- List and create projects
- Sync PROJECT_PLAN.md files to the cloud
- Update task statuses
- Get smart task recommendations

### Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Your Development Environment              │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    stdio    ┌─────────────┐    HTTPS    ┌────────────┐
│  │   Claude    │ ◄─────────► │  PlanFlow   │ ◄─────────► │  PlanFlow  │
│  │   Desktop   │             │ MCP Server  │             │    API     │
│  │   or CLI    │             │             │             │            │
│  └─────────────┘             └─────────────┘             └────────────┘
│        │                           │                           │
│        │                           │                           │
│        ▼                           ▼                           ▼
│   You interact              Runs locally              Cloud storage
│   with Claude               on your machine           & sync
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Available Tools

| Tool | Description |
|------|-------------|
| `planflow_login` | Authenticate with your API token |
| `planflow_logout` | Clear stored credentials |
| `planflow_whoami` | Display current user info |
| `planflow_projects` | List all your projects |
| `planflow_create` | Create a new project |
| `planflow_sync` | Sync PROJECT_PLAN.md to cloud |
| `planflow_task_list` | List tasks for a project |
| `planflow_task_update` | Update task status |
| `planflow_task_next` | Get recommended next task |
| `planflow_notifications` | View notifications |

---

## System Requirements

### Minimum Requirements

| Component | Requirement |
|-----------|-------------|
| **Node.js** | v20.0.0 or higher |
| **Operating System** | macOS 12+, Windows 10+, or Linux (Ubuntu 20.04+) |
| **Memory** | 256 MB available RAM |
| **Disk Space** | 50 MB for installation |
| **Network** | Internet connection for API access |

### Claude Integration Requirements

| Product | Version Required |
|---------|------------------|
| Claude Desktop | v1.0.0+ with MCP support |
| Claude Code CLI | Latest version |
| VS Code + Claude | Claude extension v2.0.0+ |

### Verify Node.js Version

```bash
node --version
```

Expected output: `v20.x.x` or higher

**Need to install or upgrade Node.js?**

<details>
<summary><strong>macOS</strong></summary>

```bash
# Using Homebrew (recommended)
brew install node@20

# Or using nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20
```

</details>

<details>
<summary><strong>Windows</strong></summary>

1. Download the installer from [nodejs.org](https://nodejs.org/)
2. Run the installer and follow the prompts
3. Restart your terminal

Or using winget:
```powershell
winget install OpenJS.NodeJS.LTS
```

</details>

<details>
<summary><strong>Linux (Ubuntu/Debian)</strong></summary>

```bash
# Using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Or using nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
```

</details>

---

## Installation

### Quick Install (Recommended)

The fastest way to get started:

```bash
# Install globally using npm
npm install -g @planflow/mcp

# Verify installation
planflow-mcp --version
```

That's it! Now proceed to [Configuration](#configuration).

### Platform-Specific Instructions

#### macOS

```bash
# Install with npm
npm install -g @planflow/mcp

# Or with Homebrew (coming soon)
# brew install planflow/tap/planflow-mcp
```

**Apple Silicon (M1/M2/M3) Note:** The package is compatible with both Intel and Apple Silicon Macs. No additional configuration needed.

#### Windows

```powershell
# Install with npm (run as Administrator if needed)
npm install -g @planflow/mcp

# Verify the installation path
where planflow-mcp
```

**Windows PATH Note:** If `planflow-mcp` is not found after installation, you may need to add npm's global bin directory to your PATH:

```powershell
# Find npm global directory
npm config get prefix

# Add to PATH (replace with your actual path)
# System Properties > Environment Variables > Path > Edit > Add:
# C:\Users\YourName\AppData\Roaming\npm
```

#### Linux

```bash
# Install with npm
npm install -g @planflow/mcp

# If you get EACCES permission errors:
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Then reinstall
npm install -g @planflow/mcp
```

### Alternative Installation Methods

#### Using pnpm

```bash
pnpm add -g @planflow/mcp
```

#### Using yarn

```bash
yarn global add @planflow/mcp
```

#### Using npx (No Installation)

Run without installing - useful for trying out or CI/CD:

```bash
npx @planflow/mcp
```

#### Local Project Installation

Install as a dev dependency in your project:

```bash
npm install --save-dev @planflow/mcp
```

Then reference it in your Claude config using npx or the full path.

#### Docker (Coming Soon)

```bash
docker pull planflow/mcp-server
docker run -it planflow/mcp-server
```

---

## Configuration

### Claude Desktop

Claude Desktop is the standalone application for macOS and Windows.

#### Step 1: Locate Your Config File

| Platform | Config File Path |
|----------|------------------|
| macOS | `~/.config/claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\claude\claude_desktop_config.json` |
| Linux | `~/.config/claude/claude_desktop_config.json` |

#### Step 2: Create or Edit the Config File

If the file doesn't exist, create it:

```bash
# macOS/Linux
mkdir -p ~/.config/claude
touch ~/.config/claude/claude_desktop_config.json
```

```powershell
# Windows (PowerShell)
New-Item -ItemType Directory -Force -Path "$env:APPDATA\claude"
New-Item -ItemType File -Force -Path "$env:APPDATA\claude\claude_desktop_config.json"
```

#### Step 3: Add PlanFlow MCP Server

**Global installation:**

```json
{
  "mcpServers": {
    "planflow": {
      "command": "planflow-mcp"
    }
  }
}
```

**If you have other MCP servers:**

```json
{
  "mcpServers": {
    "planflow": {
      "command": "planflow-mcp"
    },
    "other-server": {
      "command": "other-mcp-server"
    }
  }
}
```

**Using npx (local or no global install):**

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

**With absolute path (if command not in PATH):**

```json
{
  "mcpServers": {
    "planflow": {
      "command": "/usr/local/bin/node",
      "args": ["/usr/local/lib/node_modules/@planflow/mcp/dist/index.js"]
    }
  }
}
```

#### Step 4: Restart Claude Desktop

Completely quit Claude Desktop (not just close the window) and reopen it.

- **macOS:** Cmd+Q or right-click dock icon > Quit
- **Windows:** Right-click system tray icon > Exit

### Claude Code CLI

For the Claude Code command-line interface.

#### Option 1: Project-Level Config

Create `.mcp.json` in your project root:

```json
{
  "servers": {
    "planflow": {
      "command": "planflow-mcp"
    }
  }
}
```

This config applies only to this project.

#### Option 2: Global Config

Edit `~/.config/claude/settings.json`:

```json
{
  "mcpServers": {
    "planflow": {
      "command": "planflow-mcp"
    }
  }
}
```

This config applies to all projects.

### VS Code Extension

If using Claude through the VS Code extension:

1. Open VS Code Settings (Cmd/Ctrl + ,)
2. Search for "Claude MCP"
3. Add to the MCP servers configuration:

```json
{
  "claude.mcpServers": {
    "planflow": {
      "command": "planflow-mcp"
    }
  }
}
```

Or edit `settings.json` directly.

---

## Authentication

After installation and configuration, you need to authenticate with your PlanFlow account.

### Step 1: Get Your API Token

1. Log in to [planflow.dev](https://planflow.dev)
2. Navigate to **Settings** > **API Tokens**
   - Direct link: [planflow.dev/dashboard/settings/tokens](https://planflow.dev/dashboard/settings/tokens)
3. Click **Generate New Token**
4. Enter a descriptive name (e.g., "MacBook Pro - Claude Desktop")
5. Click **Create Token**
6. **Copy the token immediately** - it starts with `pf_` and is only shown once!

```
Example token: pf_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0
```

### Step 2: Login via Claude

In Claude, say:

```
Login to PlanFlow with my API token: pf_your_token_here
```

Or be more explicit:

```
Use planflow_login with token pf_your_token_here
```

### Step 3: Verify Login

Check your authentication status:

```
Who am I logged in as on PlanFlow?
```

You should see your name and email address.

### Token Storage & Security

Your credentials are stored locally:

| Platform | Config Location |
|----------|-----------------|
| All | `~/.config/planflow/config.json` |

The config file contains:

```json
{
  "apiUrl": "https://api.planflow.dev",
  "apiToken": "pf_...",
  "userId": "user_...",
  "userEmail": "you@example.com"
}
```

**Important security notes:**
- Tokens are stored only on your local machine
- Tokens are never sent to Claude/Anthropic servers
- Tokens are only sent to PlanFlow's API over HTTPS
- You can revoke tokens anytime from your PlanFlow settings
- Generate separate tokens for each device

---

## Verification

After setup, verify everything works correctly.

### 1. Check MCP Server is Loaded

In Claude, ask:

```
What PlanFlow tools do you have available?
```

Claude should list all 10 PlanFlow tools.

### 2. Test Authentication

```
Show my PlanFlow account info
```

### 3. List Projects

```
List my PlanFlow projects
```

### 4. Full Test Workflow

```
1. Create a test project: "Create a PlanFlow project called Test"
2. Check it was created: "Show my projects"
3. Delete if desired: "Delete the Test project" (via web dashboard)
```

---

## Advanced Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PLANFLOW_API_URL` | API server URL | `https://api.planflow.dev` |
| `PLANFLOW_DEBUG` | Enable debug logging | `false` |
| `HTTPS_PROXY` | Proxy server for API requests | None |
| `HTTP_PROXY` | Proxy server (HTTP) | None |
| `NO_PROXY` | Hosts to bypass proxy | None |

### Using Environment Variables in Config

```json
{
  "mcpServers": {
    "planflow": {
      "command": "planflow-mcp",
      "env": {
        "PLANFLOW_DEBUG": "true",
        "PLANFLOW_API_URL": "https://api.planflow.dev"
      }
    }
  }
}
```

### Corporate Proxy Configuration

If you're behind a corporate firewall:

```json
{
  "mcpServers": {
    "planflow": {
      "command": "planflow-mcp",
      "env": {
        "HTTPS_PROXY": "http://proxy.company.com:8080",
        "NO_PROXY": "localhost,127.0.0.1"
      }
    }
  }
}
```

### Self-Hosted API (Enterprise)

For enterprise customers with self-hosted PlanFlow:

```json
{
  "mcpServers": {
    "planflow": {
      "command": "planflow-mcp",
      "env": {
        "PLANFLOW_API_URL": "https://planflow.internal.company.com/api"
      }
    }
  }
}
```

### Debug Mode

Enable detailed logging for troubleshooting:

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

Debug logs are written to stderr and won't interfere with MCP communication.

---

## Troubleshooting

### Common Issues

#### "Command not found: planflow-mcp"

**Cause:** The MCP server is not in your system PATH.

**Solutions:**

1. Verify installation:
   ```bash
   npm list -g @planflow/mcp
   ```

2. Find the installation path:
   ```bash
   npm root -g
   # Then check: <path>/../bin/planflow-mcp
   ```

3. Use absolute path in config:
   ```json
   {
     "mcpServers": {
       "planflow": {
         "command": "/full/path/to/planflow-mcp"
       }
     }
   }
   ```

4. Use npx instead:
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

#### "PlanFlow tools not appearing in Claude"

**Cause:** Config file not loaded or syntax error.

**Solutions:**

1. Validate JSON syntax:
   ```bash
   # macOS/Linux
   cat ~/.config/claude/claude_desktop_config.json | python3 -m json.tool

   # Windows PowerShell
   Get-Content "$env:APPDATA\claude\claude_desktop_config.json" | ConvertFrom-Json
   ```

2. Common JSON errors:
   - Trailing commas (remove comma after last item)
   - Missing quotes around strings
   - Using single quotes instead of double quotes

3. Restart Claude completely (quit, not just close window)

#### "Authentication failed" or "Invalid token"

**Cause:** Token is invalid, expired, or incorrectly entered.

**Solutions:**

1. Verify token at [planflow.dev/dashboard/settings/tokens](https://planflow.dev/dashboard/settings/tokens)

2. Generate a new token and try again

3. Clear stored credentials and re-login:
   ```bash
   rm ~/.config/planflow/config.json
   ```
   Then login again in Claude.

4. Check for copy/paste issues (no extra spaces or characters)

#### "Cannot connect to API" or Timeout Errors

**Cause:** Network issues or firewall blocking.

**Solutions:**

1. Test API connectivity:
   ```bash
   curl -I https://api.planflow.dev/health
   ```

2. Check firewall/VPN settings

3. Configure proxy if needed (see [Corporate Proxy Configuration](#corporate-proxy-configuration))

4. Enable debug mode to see detailed error:
   ```json
   {
     "mcpServers": {
       "planflow": {
         "command": "planflow-mcp",
         "env": { "PLANFLOW_DEBUG": "true" }
       }
     }
   }
   ```

#### "Unexpected token" or Syntax Errors

**Cause:** Node.js version is too old.

**Solution:** Upgrade to Node.js 20+:
```bash
node --version  # Check current version
nvm install 20  # Install Node.js 20
nvm use 20      # Switch to Node.js 20
```

#### Permission Errors (EACCES)

**Cause:** npm doesn't have permission to install globally.

**Solutions:**

1. Fix npm permissions:
   ```bash
   mkdir ~/.npm-global
   npm config set prefix '~/.npm-global'
   echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
   source ~/.bashrc
   npm install -g @planflow/mcp
   ```

2. Or use npx without global installation

### Debug Checklist

If you're still having issues:

- [ ] Node.js version is 20+
- [ ] `planflow-mcp --version` works in terminal
- [ ] Config file exists and has valid JSON
- [ ] Config file path is correct for your OS
- [ ] Claude has been fully restarted (quit and reopen)
- [ ] API token is valid and not revoked
- [ ] Internet connection is working
- [ ] No firewall/proxy blocking the API

### Getting Help

If none of the above solutions work:

1. **Enable debug logging** and check the output
2. **Search existing issues:** [github.com/planflow/planflow/issues](https://github.com/planflow/planflow/issues)
3. **Create a new issue** with:
   - Your OS and version
   - Node.js version (`node --version`)
   - MCP server version (`planflow-mcp --version`)
   - Debug log output
   - Steps to reproduce
4. **Email support:** [support@planflow.dev](mailto:support@planflow.dev)

---

## Updating & Uninstalling

### Check Current Version

```bash
planflow-mcp --version
# or
npm list -g @planflow/mcp
```

### Update to Latest Version

```bash
# npm
npm update -g @planflow/mcp

# pnpm
pnpm update -g @planflow/mcp

# yarn
yarn global upgrade @planflow/mcp
```

### Uninstall

#### Remove the Package

```bash
# npm
npm uninstall -g @planflow/mcp

# pnpm
pnpm remove -g @planflow/mcp

# yarn
yarn global remove @planflow/mcp
```

#### Remove Configuration

```bash
# Remove PlanFlow credentials
rm -rf ~/.config/planflow

# Edit Claude config to remove planflow entry
# ~/.config/claude/claude_desktop_config.json
```

#### Remove from Claude Config

Edit your Claude config file and remove the `planflow` entry from `mcpServers`.

---

## Security Considerations

### Token Security Best Practices

1. **Generate unique tokens** for each device/environment
2. **Use descriptive names** so you know which token is which
3. **Revoke unused tokens** from your PlanFlow settings
4. **Never share tokens** or commit them to version control
5. **Rotate tokens periodically** for sensitive environments

### Data Privacy

- **Local storage:** Credentials stored in `~/.config/planflow/config.json`
- **Transmission:** All API calls use HTTPS encryption
- **Claude isolation:** Tokens are never sent to Claude/Anthropic servers
- **Minimal data:** Only project/task data is synced, not source code

### Revoking Access

If you suspect a token has been compromised:

1. Go to [planflow.dev/dashboard/settings/tokens](https://planflow.dev/dashboard/settings/tokens)
2. Find the compromised token
3. Click **Revoke**
4. Generate a new token
5. Update your local config

---

## FAQ

### General

**Q: Is the MCP server open source?**
A: The MCP server package is part of the PlanFlow project. Check our [GitHub repository](https://github.com/planflow/planflow) for licensing details.

**Q: Does this work offline?**
A: Authentication requires internet, but read operations use cached data when available.

**Q: Can I use multiple PlanFlow accounts?**
A: Currently, only one account per machine is supported. You can switch accounts by logging out and logging in with a different token.

### Technical

**Q: Why Node.js 20+?**
A: We use modern JavaScript features (ES modules, optional chaining, etc.) that require Node.js 20 for optimal performance and compatibility.

**Q: Does this work with WSL on Windows?**
A: Yes! Install Node.js in WSL and follow the Linux instructions. Configure your WSL-based Claude Code to use the MCP server.

**Q: Can I run multiple instances?**
A: Each Claude instance spawns its own MCP server process. They all share the same credentials file, so logging in/out affects all instances.

### Troubleshooting

**Q: Why does Claude sometimes not see PlanFlow tools?**
A: MCP servers are loaded when Claude starts. If you installed or updated the server, restart Claude completely.

**Q: How do I check if the MCP server is running?**
A: Look for the `planflow-mcp` process in your system's process list. The server runs as a subprocess of Claude.

---

## Next Steps

Now that you have the MCP server installed:

1. **[Getting Started Guide](./GETTING_STARTED.md)** - Learn the core workflow
2. **[API Reference](./API_REFERENCE.md)** - Detailed tool documentation
3. **[Web Dashboard](https://planflow.dev/dashboard)** - Visual project management

---

## Changelog

### v0.1.0 (Initial Release)
- 10 MCP tools for project management
- Support for Claude Desktop and Claude Code CLI
- Secure token-based authentication
- Cross-platform support (macOS, Windows, Linux)

---

*Need help? Contact us at [support@planflow.dev](mailto:support@planflow.dev) or join our [Discord community](https://discord.gg/planflow).*
