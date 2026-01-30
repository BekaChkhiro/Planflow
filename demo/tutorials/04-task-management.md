# Tutorial 4: Task Management

> Update task status, get smart recommendations, and track progress

**Duration:** 3-4 minutes
**Audience:** All users
**Prerequisites:** PlanFlow project with tasks

---

## Learning Objectives

By the end of this tutorial, viewers will be able to:
- List tasks in a project
- Update task status (TODO, IN_PROGRESS, DONE, BLOCKED)
- Get AI-powered next task recommendations
- Understand task dependencies

---

## Script

### Opening (0:00 - 0:10)

**Visual:** Terminal showing task update with progress bar

**Voiceover:**
> "Task management is where PlanFlow really shines. In this tutorial, you'll learn how to manage tasks without leaving your terminal."

---

### Part 1: Listing Tasks (0:10 - 0:45)

**Visual:** Terminal with Claude

```
You > Show tasks for E-commerce API

Claude > Calling planflow_task_list...

📋 Tasks for E-commerce API
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
│ ID   │ Task                │ Status      │ Complexity │
├──────┼─────────────────────┼─────────────┼────────────┤
│ T1.1 │ Initialize repo     │ DONE ✅     │ Low        │
│ T1.2 │ Setup database      │ DONE ✅     │ Medium     │
│ T2.1 │ Product endpoints   │ DONE ✅     │ Medium     │
│ T2.2 │ Category endpoints  │ DONE ✅     │ Low        │
│ T2.3 │ Order endpoints     │ IN_PROGRESS │ High       │
│ T2.4 │ Cart logic          │ TODO        │ Medium     │
│ T2.5 │ Checkout flow       │ TODO        │ High       │
│ T3.1 │ User authentication │ TODO        │ High       │
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Voiceover:**
> "Start by listing all tasks in your project. You'll see the ID, name, status, and complexity of each task."

**Visual:** Filtered view

```
You > Show TODO tasks for E-commerce API

Claude > Filtering tasks...

📋 TODO Tasks (4)
│ T2.4 │ Cart logic          │ TODO │ Medium │
│ T2.5 │ Checkout flow       │ TODO │ High   │
│ T3.1 │ User authentication │ TODO │ High   │
│ T3.2 │ Session management  │ TODO │ Medium │
```

**Voiceover:**
> "Filter by status to see only TODO, IN_PROGRESS, or BLOCKED tasks."

---

### Part 2: Updating Task Status (0:45 - 1:40)

#### Starting a Task

**Visual:** Terminal

```
You > Start working on T2.4

Claude > Calling planflow_task_update...

✅ Task T2.4 updated: TODO → IN_PROGRESS 🔄

You're now working on:
  T2.4: Cart logic
  Complexity: Medium

Good luck! Tell me when you're done.
```

**Voiceover:**
> "To start a task, just tell Claude. The status changes to IN_PROGRESS."

#### Completing a Task

**Visual:** Terminal

```
You > I finished T2.4, mark it as done

Claude > Calling planflow_task_update...

✅ Task T2.4 completed! 🎉

📊 Progress: 45% → 52% (+7%)
🟩🟩🟩🟩🟩░░░░░ 52%

🔓 Unlocked tasks:
   T2.5: Checkout flow
```

**Voiceover:**
> "When you finish, mark it done. PlanFlow updates the progress and shows which tasks are now unlocked."

#### Blocking a Task

**Visual:** Terminal

```
You > Block T2.5 - waiting on payment provider API

Claude > Calling planflow_task_update...

🚫 Task T2.5 marked as BLOCKED

Reason: waiting on payment provider API

💡 Tip: Document the blocker so your team knows
   what needs to be resolved.
```

**Voiceover:**
> "If something is blocking you, mark the task as blocked. Add a reason so others know what's holding it up."

---

### Part 3: Getting Next Task (1:40 - 2:30)

**Visual:** Terminal with Claude

```
You > What should I work on next?

Claude > Calling planflow_task_next...

🎯 Recommended Next Task
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

T3.1: User authentication

📊 Complexity: High
⏱️  Estimated: 6 hours
📁 Phase: 3 - Security

✅ Dependencies satisfied:
   T1.2: Database setup ✓
   T2.1: Core API ✓

🎯 Why this task?
   • Unlocks 4 other tasks (T3.2, T3.3, T3.4, T4.1)
   • Critical path item
   • Good time for High complexity after Medium tasks

💡 Alternatives:
   1. T4.2: Unit tests setup (Medium)
   2. T3.5: Rate limiting (Low)

Ready to start?
/plan:update T3.1 start
```

**Voiceover:**
> "Not sure what to work on next? Ask Claude for a recommendation. PlanFlow analyzes dependencies, complexity, and your workflow to suggest the optimal next task."

**Visual:** Highlight key elements

```
🎯 Why this task?
   • Unlocks 4 other tasks    ← Critical path
   • Critical path item       ← Blocks others
   • Good complexity balance  ← Workflow optimization
```

**Voiceover:**
> "The recommendation explains why this task makes sense - it might unlock other work, be on the critical path, or balance your complexity load."

---

### Part 4: Understanding Dependencies (2:30 - 3:10)

**Visual:** Dependency graph visualization

```
T1.1 ──→ T1.2 ──→ T2.1 ──→ T2.4 ──→ T2.5
                    │
                    └──→ T3.1 ──→ T3.2 ──→ T3.3
                                    │
                                    └──→ T4.1
```

**Voiceover:**
> "Tasks can depend on other tasks. PlanFlow understands this dependency graph and won't recommend tasks whose dependencies aren't complete."

**Visual:** Terminal showing blocked recommendation

```
You > Can I work on T4.1?

Claude > ⚠️ Task T4.1 has unmet dependencies:

   T3.2: Session management (TODO)
   T3.3: Password reset (TODO)

Complete these first, or use /plan:update T4.1 start
to override.
```

**Voiceover:**
> "If you try to start a task with incomplete dependencies, PlanFlow warns you. You can override if needed, but usually it's better to follow the dependency order."

---

### Part 5: Batch Updates (3:10 - 3:35)

**Visual:** Terminal

```
You > Mark T3.1, T3.2, and T3.3 as done

Claude > Updating 3 tasks...

✅ T3.1: User authentication → DONE
✅ T3.2: Session management → DONE
✅ T3.3: Password reset → DONE

📊 Progress: 52% → 74% (+22%)
🟩🟩🟩🟩🟩🟩🟩░░░ 74%

🔓 Unlocked: T4.1, T4.2, T4.3
```

**Voiceover:**
> "Done with multiple tasks? Update them all at once. Great for when you've been heads-down coding."

---

### Closing (3:35 - 3:55)

**Visual:** Progress comparison

```
Before: 🟩🟩🟩🟩░░░░░░ 45%
After:  🟩🟩🟩🟩🟩🟩🟩░░░ 74%
```

**Voiceover:**
> "With PlanFlow's task management, you can track progress without ever leaving your terminal."

**Visual:** End card

```
Task Management:
  ✅ List and filter tasks
  ✅ Update status (start/done/block)
  ✅ AI-powered recommendations
  ✅ Dependency awareness
  ✅ Batch updates

Next: Tutorial 5 - Syncing Plans
```

**Voiceover:**
> "In the next tutorial, we'll show you how to sync your PROJECT_PLAN.md between your local files and the cloud."

---

## Timestamps for YouTube

```
0:00 - Introduction
0:10 - Listing Tasks
0:45 - Updating Task Status
1:40 - Getting Next Task
2:30 - Understanding Dependencies
3:10 - Batch Updates
3:35 - Summary & Next Steps
```
