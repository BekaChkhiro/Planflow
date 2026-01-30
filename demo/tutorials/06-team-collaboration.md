# Tutorial 6: Team Collaboration

> Share projects, assign tasks, and work together with your team

**Duration:** 3-4 minutes
**Audience:** Team plan users
**Prerequisites:** PlanFlow Team plan

---

## Learning Objectives

By the end of this tutorial, viewers will be able to:
- Invite team members to a project
- Assign tasks to team members
- View team activity and progress
- Use team notifications

---

## Script

### Opening (0:00 - 0:10)

**Visual:** Team dashboard with multiple members

**Voiceover:**
> "PlanFlow makes team collaboration seamless. In this tutorial, you'll learn how to work together with your team on shared projects."

---

### Part 1: Inviting Team Members (0:10 - 0:55)

**Visual:** Web Dashboard - Project settings

```
[Navigate to Project → Settings → Team]
[Click "Invite Member"]
[Enter email: sarah@company.com]
[Select role: Developer]
[Click "Send Invite"]
```

**Voiceover:**
> "Start by inviting your team to the project. Go to project settings, then Team. Enter their email and select a role."

**Visual:** Role explanation

```
Roles:
─────────────────────────────────────────────
Admin    - Full control, can delete project
Developer- Update tasks, sync plans
Viewer   - Read-only access
─────────────────────────────────────────────
```

**Voiceover:**
> "Admins have full control, Developers can update tasks and sync, and Viewers have read-only access."

**Visual:** Invitation received

```
[Email notification: "You've been invited to E-commerce API"]
[Sarah clicks "Accept Invitation"]
[Sarah sees project in her dashboard]
```

**Voiceover:**
> "Your teammate receives an email invitation. Once they accept, the project appears in their dashboard."

---

### Part 2: Assigning Tasks (0:55 - 1:45)

#### From Claude Code

**Visual:** Terminal

```
You > Assign T3.1 to Sarah

Claude > Calling planflow_task_update...

✅ Task T3.1 assigned to Sarah

📋 T3.1: User authentication
   Assignee: Sarah (sarah@company.com)
   Status: TODO

Sarah will be notified.
```

**Voiceover:**
> "Assign tasks to team members directly from Claude. They'll get a notification."

#### From Web Dashboard

**Visual:** Dashboard - Task card

```
[Click on task T3.2]
[Open assignee dropdown]
[Select "John"]
[Click Save]
```

**Voiceover:**
> "Or assign from the dashboard by clicking the task and selecting an assignee."

**Visual:** Multiple assignees

```
You > Assign T4.1 to both Sarah and John

Claude > ✅ Task T4.1 assigned to:
   • Sarah (sarah@company.com)
   • John (john@company.com)
```

**Voiceover:**
> "Complex tasks can have multiple assignees. Everyone involved gets notified."

---

### Part 3: Team Activity Feed (1:45 - 2:25)

**Visual:** Dashboard - Activity feed

```
Project Activity
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 2 min ago
   Sarah marked T3.1 as IN_PROGRESS

✅ 15 min ago
   John completed T2.4

💬 1 hour ago
   Sarah commented on T3.2:
   "Need to verify OAuth scopes"

📤 3 hours ago
   You synced PROJECT_PLAN.md

👤 Yesterday
   Sarah joined the project
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Voiceover:**
> "The activity feed shows everything happening in your project. Task updates, comments, syncs, and team changes - all in one place."

**Visual:** Terminal activity

```
You > Show recent activity for E-commerce API

Claude > 📊 Recent Activity:

   • Sarah started T3.1 (2 min ago)
   • John completed T2.4 (15 min ago)
   • Sarah commented on T3.2 (1 hour ago)

Show more? Or filter by team member?
```

**Voiceover:**
> "You can also check activity from Claude. Stay informed without switching to the web."

---

### Part 4: Team Progress View (2:25 - 3:00)

**Visual:** Dashboard - Team tab

```
Team Progress
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You (alex@company.com)
   Assigned: 5 tasks
   Completed: 12 tasks
   Current: T2.3 (IN_PROGRESS)
   ████████████████░░░░ 80%

Sarah (sarah@company.com)
   Assigned: 4 tasks
   Completed: 8 tasks
   Current: T3.1 (IN_PROGRESS)
   ████████████░░░░░░░░ 60%

John (john@company.com)
   Assigned: 3 tasks
   Completed: 6 tasks
   Current: None
   ████████░░░░░░░░░░░░ 40%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Voiceover:**
> "The Team tab shows everyone's progress. See who's working on what, how many tasks they've completed, and their overall contribution."

**Visual:** Terminal team view

```
You > Show team progress

Claude > 👥 Team Progress for E-commerce API

   You:   ████████ 80% (12 completed)
   Sarah: ██████░░ 60% (8 completed)
   John:  ████░░░░ 40% (6 completed)

   🏆 Team total: 26/36 tasks (72%)
```

**Voiceover:**
> "Check team progress from Claude too. Great for standups and quick status checks."

---

### Part 5: Notifications (3:00 - 3:35)

**Visual:** Notification center

```
You > Show my PlanFlow notifications

Claude > Calling planflow_notifications...

🔔 Notifications (3 unread)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 New assignment
   Sarah assigned you to T4.2
   2 hours ago

💬 New comment
   John commented on T2.3:
   "API tests passing, ready for review"
   5 hours ago

✅ Task completed
   T3.1 was completed by Sarah
   This unblocked T3.2, T3.3 (assigned to you)
   Yesterday
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Voiceover:**
> "PlanFlow notifies you about assignments, comments, and when blocked tasks become unblocked. Stay informed without constant dashboard checks."

---

### Closing (3:35 - 3:55)

**Visual:** Team working together

```
┌─────────────────────────────────────────────┐
│                                             │
│    You (Terminal)  ←→  Cloud  ←→  Sarah     │
│                        ↕                    │
│                       John                  │
│                    (Dashboard)              │
│                                             │
└─────────────────────────────────────────────┘
```

**Voiceover:**
> "With PlanFlow, your team stays in sync whether they prefer the terminal or the web dashboard."

**Visual:** End card

```
Team Collaboration:
  ✅ Invite team members
  ✅ Assign tasks
  ✅ Activity feed
  ✅ Team progress view
  ✅ Notifications

Next: Tutorial 7 - Web Dashboard Tour
```

**Voiceover:**
> "In the final tutorial, we'll take a tour of the web dashboard and explore all its features."

---

## Timestamps for YouTube

```
0:00 - Introduction
0:10 - Inviting Team Members
0:55 - Assigning Tasks
1:45 - Team Activity Feed
2:25 - Team Progress View
3:00 - Notifications
3:35 - Summary & Next Steps
```
