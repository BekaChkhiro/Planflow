# Tutorial 1: Quick Start with PlanFlow

> Get up and running with PlanFlow in under 3 minutes

**Duration:** 2-3 minutes
**Audience:** New users
**Prerequisites:** Claude Code installed, Node.js 20+

---

## Learning Objectives

By the end of this tutorial, viewers will be able to:
- Create a PlanFlow account
- Install the MCP server
- Connect Claude Code to PlanFlow
- Create their first project

---

## Script

### Opening (0:00 - 0:10)

**Visual:** PlanFlow logo animation

**Voiceover:**
> "In this tutorial, you'll learn how to set up PlanFlow and manage your first project directly from Claude Code. Let's get started."

---

### Part 1: Create Your Account (0:10 - 0:40)

**Visual:** Browser showing planflow.tools

```
[Navigate to planflow.tools]
[Click "Sign Up" button]
```

**Voiceover:**
> "First, let's create your free PlanFlow account. Head to planflow.tools and click Sign Up."

**Visual:** Sign up form

```
[Fill in form]
Email: demo@example.com
Password: ********
Name: Demo User

[Click "Create Account"]
```

**Voiceover:**
> "Enter your email, password, and name. The free tier gives you 3 projects to start with."

**Visual:** Dashboard appears

**Voiceover:**
> "Great! You're now logged in to your dashboard."

---

### Part 2: Generate API Token (0:40 - 1:10)

**Visual:** Settings navigation

```
[Click "Settings" in sidebar]
[Click "API Tokens" tab]
```

**Voiceover:**
> "Next, we need an API token so Claude Code can connect to your account. Go to Settings, then API Tokens."

**Visual:** Token generation

```
[Click "Generate New Token"]
[Enter name: "Claude Code - MacBook"]
[Click "Create Token"]
```

**Voiceover:**
> "Click Generate New Token, give it a name, and click Create."

**Visual:** Token displayed with copy button

```
pf_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
[Click copy button]
```

**Voiceover:**
> "Copy this token immediately - you'll only see it once. Keep it safe, we'll use it in a moment."

---

### Part 3: Install MCP Server (1:10 - 1:35)

**Visual:** Terminal window

```
$ npm install -g @planflow/mcp
```

**Voiceover:**
> "Now open your terminal and install the PlanFlow MCP server globally with npm."

**Visual:** Installation output

```
added 45 packages in 8s

$ planflow-mcp --version
1.0.0
```

**Voiceover:**
> "Verify it's installed by checking the version. Perfect."

---

### Part 4: Configure Claude (1:35 - 2:00)

**Visual:** Terminal showing config file

```
$ code ~/.config/claude/claude_desktop_config.json
```

**Voiceover:**
> "Now add PlanFlow to your Claude configuration. Open the config file in your editor."

**Visual:** JSON configuration

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
> "Add PlanFlow as an MCP server. Save the file and restart Claude."

---

### Part 5: Connect and Create Project (2:00 - 2:40)

**Visual:** Claude Code terminal

```
$ claude

You > Login to PlanFlow with token pf_a1b2c3...

Claude > Calling planflow_login...

✅ Successfully logged in to PlanFlow!
Welcome, Demo User!
```

**Voiceover:**
> "Open Claude and login with your API token. You're now connected!"

**Visual:** Create project

```
You > Create a new PlanFlow project called "My First App"

Claude > Calling planflow_create...

✅ Project created!

Name: My First App
ID: proj_abc123
Status: Active
```

**Voiceover:**
> "Let's create your first project. Just tell Claude what you want to call it."

---

### Closing (2:40 - 3:00)

**Visual:** Split screen - Claude + Dashboard

**Voiceover:**
> "Congratulations! You've set up PlanFlow and created your first project. Your project is now visible in both Claude Code and the web dashboard."

**Visual:** End card with next steps

```
✅ Account created
✅ MCP server installed
✅ Claude configured
✅ First project created

Next: Tutorial 2 - Working with Projects
```

**Voiceover:**
> "In the next tutorial, we'll show you how to manage tasks and sync your project plan. See you there!"

---

## B-Roll Shots Needed

- [ ] PlanFlow logo animation (5 seconds)
- [ ] Dashboard overview pan
- [ ] Settings page navigation
- [ ] Token copy animation
- [ ] Terminal npm install
- [ ] Claude Code conversation

---

## Key Points to Emphasize

1. **Free tier** - 3 projects, no credit card
2. **Token security** - Only shown once, keep it safe
3. **Restart Claude** - Required after config change
4. **Natural language** - Just talk to Claude normally

---

## Common Mistakes to Warn About

1. Not copying the token before leaving the page
2. Forgetting to restart Claude after config change
3. Typos in the JSON configuration
4. Missing Node.js 20+ prerequisite

---

## Timestamps for YouTube

```
0:00 - Introduction
0:10 - Create Your Account
0:40 - Generate API Token
1:10 - Install MCP Server
1:35 - Configure Claude
2:00 - Connect and Create Project
2:40 - Next Steps
```
