# Tutorial 2: MCP Installation Deep Dive

> Complete guide to installing and configuring the PlanFlow MCP server

**Duration:** 3-4 minutes
**Audience:** Developers
**Prerequisites:** Node.js 20+, Claude Code or Claude Desktop

---

## Learning Objectives

By the end of this tutorial, viewers will be able to:
- Install the MCP server (global vs local)
- Configure Claude Desktop and Claude Code
- Set environment variables for custom setups
- Troubleshoot common installation issues

---

## Script

### Opening (0:00 - 0:10)

**Visual:** Terminal with PlanFlow MCP running

**Voiceover:**
> "In this tutorial, we'll cover everything you need to know about installing and configuring the PlanFlow MCP server. Let's dive in."

---

### Part 1: Installation Options (0:10 - 0:50)

#### Option A: Global Installation (Recommended)

**Visual:** Terminal

```
$ npm install -g @planflow/mcp

added 45 packages in 8s

$ which planflow-mcp
/usr/local/bin/planflow-mcp

$ planflow-mcp --version
1.0.0
```

**Voiceover:**
> "The easiest way to install is globally with npm. This puts planflow-mcp in your PATH so Claude can find it automatically."

#### Option B: Local Installation

**Visual:** Terminal

```
$ mkdir -p ~/.local/planflow && cd ~/.local/planflow
$ npm init -y
$ npm install @planflow/mcp

$ ls node_modules/.bin/
planflow-mcp
```

**Voiceover:**
> "Alternatively, install locally if you can't or don't want to install globally. Create a dedicated directory and install there."

---

### Part 2: Configure Claude Desktop (0:50 - 1:40)

**Visual:** File explorer / Terminal

```
$ code ~/.config/claude/claude_desktop_config.json
```

**Voiceover:**
> "Now let's configure Claude Desktop. Open the config file in your editor."

**Visual:** JSON configuration (basic)

```json
{
  "mcpServers": {
    "planflow": {
      "command": "planflow-mcp"
    }
  }
}
```

**Voiceover:**
> "For a global installation, the config is simple. Just specify the command name."

**Visual:** JSON configuration (local installation)

```json
{
  "mcpServers": {
    "planflow": {
      "command": "node",
      "args": [
        "/Users/you/.local/planflow/node_modules/@planflow/mcp/dist/index.js"
      ]
    }
  }
}
```

**Voiceover:**
> "For a local installation, use node as the command and provide the full path to the MCP entry point."

---

### Part 3: Configure Claude Code (CLI) (1:40 - 2:10)

**Visual:** Terminal

```
$ code ~/.config/claude/settings.json
```

**Voiceover:**
> "Claude Code uses a different config file. Open settings.json instead."

**Visual:** JSON configuration

```json
{
  "mcpServers": {
    "planflow": {
      "command": "planflow-mcp"
    }
  },
  "permissions": {
    "allow": ["planflow_*"]
  }
}
```

**Voiceover:**
> "The format is the same. You can also add permissions to auto-allow PlanFlow tools."

**Visual:** Project-specific config

```
$ code .claude/settings.json
```

**Voiceover:**
> "You can also add project-specific config in a .claude folder in your repository."

---

### Part 4: Environment Variables (2:10 - 2:50)

**Visual:** JSON with environment variables

```json
{
  "mcpServers": {
    "planflow": {
      "command": "planflow-mcp",
      "env": {
        "PLANFLOW_API_URL": "https://api.planflow.dev",
        "PLANFLOW_DEBUG": "true"
      }
    }
  }
}
```

**Voiceover:**
> "You can pass environment variables to the MCP server. This is useful for custom API URLs or enabling debug mode."

**Visual:** Self-hosted example

```json
{
  "mcpServers": {
    "planflow": {
      "command": "planflow-mcp",
      "env": {
        "PLANFLOW_API_URL": "https://planflow.your-company.com/api"
      }
    }
  }
}
```

**Voiceover:**
> "If you're using a self-hosted PlanFlow instance, set the PLANFLOW_API_URL to point to your server."

**Visual:** Proxy configuration

```json
{
  "env": {
    "HTTPS_PROXY": "http://proxy.corp.com:8080",
    "HTTP_PROXY": "http://proxy.corp.com:8080"
  }
}
```

**Voiceover:**
> "Behind a corporate proxy? Add the proxy environment variables here."

---

### Part 5: Troubleshooting (2:50 - 3:30)

**Visual:** Terminal with error

```
$ claude

Error: MCP server 'planflow' not found
```

**Voiceover:**
> "If Claude can't find the MCP server, let's troubleshoot."

**Visual:** Verification steps

```
# Step 1: Verify installation
$ planflow-mcp --version
1.0.0

# Step 2: Check the path
$ which planflow-mcp
/usr/local/bin/planflow-mcp

# Step 3: Verify config JSON is valid
$ cat ~/.config/claude/claude_desktop_config.json | jq .
{
  "mcpServers": {
    "planflow": {
      "command": "planflow-mcp"
    }
  }
}

# Step 4: Restart Claude completely
# (Quit and reopen, not just close window)
```

**Voiceover:**
> "First, verify the MCP is installed and in your PATH. Then check your JSON config is valid - no trailing commas or syntax errors. Finally, make sure you completely restart Claude, not just close the window."

**Visual:** Common fixes

```
# Add npm bin to PATH (if not found)
export PATH="$PATH:$(npm root -g)/../bin"

# Check permissions
chmod +x $(which planflow-mcp)
```

**Voiceover:**
> "If the command isn't found, you may need to add npm's global bin directory to your PATH."

---

### Closing (3:30 - 3:50)

**Visual:** Working Claude with PlanFlow

```
$ claude

You > Show my PlanFlow account

Claude > Calling planflow_whoami...

✅ Logged in as: developer@example.com
```

**Voiceover:**
> "Once configured, you can verify everything works by asking Claude to show your PlanFlow account."

**Visual:** End card

```
Installation Methods:
  ✅ Global (npm install -g)
  ✅ Local (project-specific)

Configuration:
  ✅ Claude Desktop
  ✅ Claude Code CLI
  ✅ Environment variables
  ✅ Proxy support

Next: Tutorial 3 - Working with Projects
```

**Voiceover:**
> "You're now set up and ready to use PlanFlow. In the next tutorial, we'll cover creating and managing projects."

---

## Platform-Specific Notes

### macOS

```bash
# Config location
~/.config/claude/claude_desktop_config.json

# Common npm global location
/usr/local/lib/node_modules
```

### Windows

```powershell
# Config location
%APPDATA%\claude\claude_desktop_config.json

# Common npm global location
%APPDATA%\npm\node_modules
```

### Linux

```bash
# Config location
~/.config/claude/claude_desktop_config.json

# Common npm global location
/usr/lib/node_modules
```

---

## Timestamps for YouTube

```
0:00 - Introduction
0:10 - Installation Options
0:50 - Configure Claude Desktop
1:40 - Configure Claude Code
2:10 - Environment Variables
2:50 - Troubleshooting
3:30 - Verification & Next Steps
```
