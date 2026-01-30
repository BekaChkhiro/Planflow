# PlanFlow Demo Video Script & Storyboard

> Duration: 2-3 minutes (full demo) | 20-30 seconds (GIF hero)

---

## Part 1: Hero GIF (20-30 seconds)

**Purpose:** Quick, eye-catching loop for landing page hero section

### Scene 1: Terminal Magic (0-10s)
```
[Terminal window - dark theme, clean font]

$ claude

Claude > What's my next task?

[Claude responds using MCP]
Calling planflow_task_next...

🎯 Recommended Next Task
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
T2.3: Implement user authentication
Complexity: Medium | Phase: 2

✅ Dependencies satisfied
🔓 Unlocks: T2.4, T2.5, T3.1

Ready to start? Say "start T2.3"
```

### Scene 2: Instant Sync (10-20s)
```
Claude > I finished the auth feature, mark it done

Calling planflow_task_update...

✅ Task T2.3 completed!

📊 Progress: 45% → 52% (+7%)
🟩🟩🟩🟩🟩⬜⬜⬜⬜⬜

🔓 Unlocked: T2.4, T2.5, T3.1

[Split screen shows web dashboard updating in real-time]
```

### Scene 3: Tagline (20-30s)
```
[Fade to PlanFlow logo]

PlanFlow
AI-Native Project Management

"Never leave your terminal"

[CTA button: Get Started Free]
```

---

## Part 2: Full Demo Video (2-3 minutes)

### Opening (0:00 - 0:15)

**Visual:** PlanFlow logo animation
**Voiceover/Caption:**
> "Meet PlanFlow - project management built for the AI coding era."

**Visual:** Developer at terminal with Claude Code
**Caption:**
> "Manage your entire project without leaving the terminal."

---

### Act 1: The Problem (0:15 - 0:30)

**Visual:** Split screen showing:
- Left: Developer coding in terminal
- Right: Jira/Linear/Notion tabs, context switching

**Caption:**
> "Tired of switching between your IDE and project management tools?"

**Visual:** Frustrated developer clicking between apps

**Caption:**
> "Context switching kills your flow state."

---

### Act 2: The Solution - MCP Integration (0:30 - 1:15)

#### Scene 2.1: Login (0:30 - 0:40)
```
[Terminal]
$ claude

You > Connect to my PlanFlow account

Claude > I'll authenticate you with PlanFlow.

Calling planflow_login...

✅ Authenticated as alex@example.com
Welcome back, Alex!
```

**Caption:**
> "One-time setup. Authenticate directly from Claude."

#### Scene 2.2: View Projects (0:40 - 0:50)
```
You > Show my projects

Calling planflow_projects...

📁 Your Projects
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
│ Name          │ Progress │ Updated    │
├───────────────┼──────────┼────────────┤
│ PlanFlow MVP  │ 52%      │ 2 hrs ago  │
│ Client Portal │ 78%      │ Yesterday  │
│ API Redesign  │ 15%      │ 3 days ago │
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Caption:**
> "See all your projects at a glance."

#### Scene 2.3: Get Next Task (0:50 - 1:05)
```
You > What should I work on next for PlanFlow MVP?

Calling planflow_task_next...

🎯 Recommended Next Task
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

T3.2: Implement OAuth providers

📊 Complexity: Medium
⏱️  Phase: 3 - Authentication
✅ Dependencies: All satisfied

Why this task?
• Unlocks 4 other tasks
• Critical path item
• Good complexity after previous High task

💡 Alternatives:
  1. T3.3: Session management (Low)
  2. T3.4: Password reset flow (Medium)
```

**Caption:**
> "AI-powered task recommendations based on dependencies and your workflow."

#### Scene 2.4: Update Task Status (1:05 - 1:15)
```
You > Start working on T3.2

Calling planflow_task_update...

✅ Task T3.2 status: TODO → IN_PROGRESS 🔄

You're now working on:
  T3.2: Implement OAuth providers
  Complexity: Medium

Good luck! Tell me when you're done.
```

**Caption:**
> "Update task status with natural language."

---

### Act 3: The Dashboard (1:15 - 1:45)

**Visual:** Smooth transition to web browser

**Caption:**
> "Need a visual overview? The web dashboard has you covered."

#### Scene 3.1: Projects Overview (1:15 - 1:25)
**Visual:** `/dashboard/projects` page
- Project cards with progress indicators
- Create new project button
- Clean, modern UI

**Caption:**
> "All your projects in one place."

#### Scene 3.2: Project Detail - Overview Tab (1:25 - 1:35)
**Visual:** `/dashboard/projects/[id]` - Overview tab
- Progress ring showing 52%
- Statistics cards (Total: 24, Done: 12, In Progress: 2)
- Phase progress timeline
- Complexity breakdown chart

**Caption:**
> "Real-time progress tracking with beautiful visualizations."

#### Scene 3.3: Tasks Kanban (1:35 - 1:45)
**Visual:** Tasks tab - Kanban view
- Columns: TODO, IN_PROGRESS, BLOCKED, DONE
- Task cards with complexity badges
- Drag indication (optional)

**Caption:**
> "Kanban board synced with your terminal workflow."

---

### Act 4: Sync Magic (1:45 - 2:15)

#### Scene 4.1: Push Local Plan (1:45 - 2:00)
```
[Terminal - showing PROJECT_PLAN.md in editor briefly]

You > I updated my local PROJECT_PLAN.md, sync it to cloud

Calling planflow_sync (push)...

✅ Plan synced to cloud!

📄 PROJECT_PLAN.md
   Lines: 245
   Size: 8.2 KB

Synced at: 2026-01-30 14:32:05
```

**Visual:** Web dashboard refreshes, shows updated plan

**Caption:**
> "Bidirectional sync. Local changes appear instantly in the cloud."

#### Scene 4.2: Pull Cloud Updates (2:00 - 2:15)
```
You > Pull the latest plan from cloud

Calling planflow_sync (pull)...

✅ Plan downloaded!

📄 PROJECT_PLAN.md updated
   Lines: 248 (+3)

Changes from team:
• T4.1 marked as DONE by Sarah
• New task T4.5 added
```

**Caption:**
> "Team changes sync back to your local file. True collaboration."

---

### Act 5: Closing (2:15 - 2:30)

**Visual:** Split screen
- Left: Terminal with Claude conversation
- Right: Web dashboard with matching data

**Caption:**
> "Two interfaces. One source of truth. Zero context switching."

**Visual:** Pricing tiers animation
```
Free     Pro        Team
$0       $12/mo     $29/user/mo
```

**Caption:**
> "Start free. Scale as you grow."

**Visual:** Final frame
```
PlanFlow
━━━━━━━━━━━━━━━━━━━━━━━━━━

AI-Native Project Management
for Claude Code

[Get Started Free]  [View Demo]

github.com/planflow/planflow
```

---

## Recording Notes

### Terminal Setup
- **Theme:** Dark (Dracula, One Dark, or similar)
- **Font:** JetBrains Mono or Fira Code, 14-16px
- **Prompt:** Clean, minimal (just `$` or `❯`)
- **Window:** ~120 cols x 30 rows

### Timing Guidelines
- Pause 0.5s after each command before response
- Let responses "type out" at readable speed
- Hold final states for 2-3 seconds

### Audio (if voiceover)
- Calm, professional tone
- ~150 words per minute
- Background music: Lo-fi or ambient (low volume)

### Transitions
- Use smooth crossfades between scenes
- Terminal to browser: Slide or zoom transition
- Keep transitions under 0.5 seconds

---

## Key Messages to Convey

1. **No context switching** - Stay in terminal, stay in flow
2. **AI-powered recommendations** - Smart task prioritization
3. **Real-time sync** - Local files ↔ Cloud ↔ Team
4. **Beautiful dashboard** - When you need visual overview
5. **Natural language** - Talk to Claude, not UI forms

---

## Call-to-Action Hierarchy

1. Primary: "Get Started Free"
2. Secondary: "View Documentation"
3. Tertiary: "Star on GitHub"
