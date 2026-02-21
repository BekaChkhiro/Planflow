# PlanFlow - Product Hunt Submission

> Prepared: 2026-02-21
> Status: Ready for Review

---

## Submission Details

### Product Name
**PlanFlow**

### Tagline (60 characters max)
`AI-native project management for Claude Code developers`

### Short Description (260 characters)
```
Manage projects without leaving your terminal. PlanFlow brings task management directly into Claude Code with bidirectional sync, AI-powered task recommendations, and real-time team collaboration. Terminal-first. Zero context switching.
```

### Full Description (Markdown supported)

```markdown
## What is PlanFlow?

PlanFlow is **AI-native project management** built specifically for developers who use Claude Code. Instead of switching between your terminal and external tools, PlanFlow lets you plan, track, and sync tasks—all from the command line.

### Why We Built This

Every time a developer leaves their terminal to update a task, they break their flow state. We built PlanFlow to eliminate that context switch entirely.

### Key Features

**Terminal-First Workflow**
Run commands like `/planUpdate T1.2 done` or `/planNext` to manage your project without ever leaving Claude Code. Your PROJECT_PLAN.md file becomes the single source of truth.

**AI-Powered Intelligence**
Claude analyzes your task dependencies and complexity to recommend what you should work on next. No more decision fatigue.

**Bidirectional Sync**
Work on your local PROJECT_PLAN.md file, then sync to cloud with a single command. Team members see updates instantly—whether they're in terminal or web.

**Real-Time Collaboration**
- Assign tasks to team members
- Comment with @mentions
- See who's online and what they're working on
- Threaded discussions on tasks

**Web Dashboard When You Need It**
Beautiful Kanban boards, progress visualizations, and team analytics—accessible when you want a visual overview.

### Integrations

- **GitHub**: Link tasks to issues and PRs, auto-close on merge
- **Slack & Discord**: Webhook notifications for task updates
- **Any Git repo**: PROJECT_PLAN.md lives alongside your code

### Pricing

- **Free**: 3 projects, local plans, basic features
- **Pro ($12/mo)**: Unlimited projects, cloud sync, GitHub integration
- **Team ($29/user/mo)**: Role-based access, code review workflows, sprints

14-day free trial. No credit card required.

### Built With

Next.js 14, Hono, PostgreSQL (Neon), MCP SDK, LemonSqueezy, Drizzle ORM

---

*Made by developers, for developers who live in the terminal.*
```

---

## Topics/Categories

1. **Developer Tools** (Primary)
2. **Productivity**
3. **Task Management**
4. **Artificial Intelligence**
5. **SaaS**

---

## Maker's First Comment

```markdown
Hey Product Hunt! 👋

I'm Beka, and I built PlanFlow because I was tired of breaking my flow state every time I needed to update a task.

**The Problem:**
As developers, we spend hours in the terminal. But when it comes to project management, we're forced to context-switch to web apps, Notion, Linear, or Jira. Each switch costs us focus and mental energy.

**The Solution:**
PlanFlow integrates directly with Claude Code via MCP. You can:
- Run `/planNext` to get AI-recommended next task based on dependencies
- Update status with `/planUpdate T1.2 done`
- Sync your local PROJECT_PLAN.md to cloud instantly
- Collaborate with your team in real-time

**What makes this different:**
1. **Your plan lives in your repo** - PROJECT_PLAN.md is a real markdown file
2. **Bidirectional sync** - Edit locally or on web, everything stays in sync
3. **AI-powered recommendations** - Claude analyzes complexity and dependencies
4. **No context switching** - Stay in terminal, stay in flow

**What I'd love feedback on:**
- Which features would make this indispensable for your workflow?
- What integrations are missing?
- Any pain points with existing project management tools we should address?

Try it free at planflow.tools - no credit card required.

Happy to answer any questions! 🚀

— Beka
```

---

## Gallery Images (Recommended Order)

### Image 1: Hero Shot
**Filename:** `ph-hero-terminal.png`
**Description:** Terminal showing Claude Code with PlanFlow commands
**Key elements to capture:**
- Claude recommending next task
- `/planUpdate T1.2 done` command
- Progress bar updating in real-time

### Image 2: Web Dashboard
**Filename:** `ph-dashboard.png`
**Description:** Web dashboard showing Kanban board and progress
**Key elements:**
- Task cards with assignees
- Phase progress visualization
- Clean, modern UI

### Image 3: Sync in Action
**Filename:** `ph-sync.png`
**Description:** Split screen showing local file and cloud sync
**Key elements:**
- PROJECT_PLAN.md in editor
- `planflow sync` command
- Cloud status indicator

### Image 4: Team Collaboration
**Filename:** `ph-team.png`
**Description:** Team page showing presence and workload
**Key elements:**
- Online presence indicators
- Task assignments
- Workload distribution chart

### Image 5: GitHub Integration
**Filename:** `ph-github.png`
**Description:** Task linked to GitHub PR
**Key elements:**
- Task detail with PR link
- Auto-generated branch name
- Status sync indicator

---

## Demo Video Script (2 minutes)

### Opening (10 sec)
*Terminal with Claude Code visible*
"What if you never had to leave your terminal to manage your project?"

### Problem (15 sec)
*Quick cuts of switching between apps*
"Developers spend hours context-switching between code and project management tools. Each switch breaks your flow."

### Solution (20 sec)
*Back to terminal*
"PlanFlow brings project management into Claude Code. Just ask Claude for your next task..."
*Type:* "What should I work on next?"
*Claude responds with /planNext recommendation*

### Demo - Task Update (20 sec)
*Continue in terminal*
"When you finish, update right here..."
*Type:* `/planUpdate T2.1 done`
*Show confirmation and progress update*

### Demo - Sync (15 sec)
"Everything syncs to cloud instantly..."
*Split screen: terminal and web dashboard updating in real-time*

### Demo - Team (15 sec)
"Your team sees updates immediately—whether they're in terminal or web."
*Show team presence and notifications*

### Closing (15 sec)
*Full web dashboard*
"Two interfaces. One source of truth. Zero context switching."
*Logo and CTA*
"Try PlanFlow free at planflow.tools"

### End Card (10 sec)
*PlanFlow logo*
"AI-native project management for Claude Code"
*Website URL*

---

## Launch Strategy

### Recommended Launch Day
**Tuesday or Wednesday** (highest engagement on PH)
**Time:** 12:01 AM PST (to maximize 24-hour window)

### Pre-Launch Checklist

- [ ] Finalize all gallery images (5 images)
- [ ] Record demo video (2 min)
- [ ] Create animated GIF for thumbnail (5-10 sec loop)
- [ ] Schedule tweets for launch day
- [ ] Prepare email to beta users asking for support
- [ ] Brief any hunter (if using one)
- [ ] Test all website links
- [ ] Ensure sign-up flow is working
- [ ] Set up analytics tracking for PH referrals

### Launch Day Actions

**Hour 0-1:**
- Post maker comment immediately
- Share on Twitter/X
- Send email to beta users
- Post in relevant Discord/Slack communities

**Hour 2-6:**
- Respond to every comment
- Share behind-the-scenes on Twitter
- Post updates on progress

**Hour 6-24:**
- Continue engaging with comments
- Share any testimonials that come in
- Thank supporters publicly

### Communities to Share

- [ ] Claude Code Discord (if exists)
- [ ] Anthropic community channels
- [ ] Indie Hackers
- [ ] Dev.to
- [ ] Hacker News (later in the day if doing well)
- [ ] r/SideProject
- [ ] r/startups
- [ ] Twitter/X developer community

---

## Social Media Templates

### Twitter/X Launch Announcement

```
🚀 Just launched on Product Hunt!

PlanFlow: AI-native project management for Claude Code

✅ Manage tasks without leaving terminal
✅ AI-powered next task recommendations
✅ Bidirectional sync (local ↔ cloud)
✅ Real-time team collaboration

Try free: planflow.tools

Support us: [PH Link]

🙏 Would mean the world!
```

### Follow-up Tweet (2 hours later)

```
Building in public update 🛠️

The response to @PlanFlow has been incredible!

Quick peek at what makes it different:

1. Your PROJECT_PLAN.md lives IN your repo
2. Claude recommends your next task
3. Zero context switching

Thank you for the support! 🧡

[PH Link]
```

---

## Analytics Tracking

### UTM Parameters
```
?ref=producthunt
?utm_source=producthunt&utm_medium=launch&utm_campaign=feb2026
```

### Key Metrics to Track
- PH page views
- PH upvotes over time
- Sign-ups with PH referrer
- Conversion rate (PH visitor → sign-up)
- Trial → Paid conversion (7-day cohort)

---

## Backup Materials

### Alternative Taglines
1. "Terminal-first project management with AI superpowers"
2. "Stay in flow. Manage projects from Claude Code."
3. "Project management that lives in your terminal"
4. "The developer's command-line project manager"

### Alternative Short Descriptions
```
Stop context-switching. PlanFlow lets you manage projects directly in Claude Code. AI recommends your next task, bidirectional sync keeps everything updated, and your team collaborates in real-time.
```

```
Your PROJECT_PLAN.md becomes a living document. PlanFlow syncs it to cloud, powers it with AI recommendations, and enables team collaboration—all without leaving the terminal.
```

---

## Post-Launch

### Day 2-7 Actions
- Write a launch retrospective blog post
- Reach out to tech bloggers/podcasters
- Create a "Featured on Product Hunt" badge for website
- Analyze which messages resonated most
- Follow up with engaged commenters

### Success Metrics
- **Good:** Top 10 of the day
- **Great:** Top 5 of the day, 500+ upvotes
- **Excellent:** #1 Product of the Day, 1000+ upvotes

---

*This document prepared for PlanFlow Product Hunt launch. Last updated: 2026-02-21*
