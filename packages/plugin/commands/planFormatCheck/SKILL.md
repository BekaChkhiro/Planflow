---
name: planFormatCheck
description: Validate and fix PROJECT_PLAN.md task format
---

# Plan Format Check

Validate PROJECT_PLAN.md format and automatically fix any issues to ensure cloud sync compatibility.

## Usage

```bash
/planFormatCheck              # Check format and show issues
/planFormatCheck --fix        # Automatically fix format issues
```

## Step 0: Load Configuration

```javascript
function getConfig() {
  const localConfigPath = "./.plan-config.json"
  let localConfig = {}
  if (fileExists(localConfigPath)) {
    try { localConfig = JSON.parse(readFile(localConfigPath)) } catch {}
  }

  const globalConfigPath = expandPath("~/.config/claude/plan-plugin-config.json")
  let globalConfig = {}
  if (fileExists(globalConfigPath)) {
    try { globalConfig = JSON.parse(readFile(globalConfigPath)) } catch {}
  }

  return { ...globalConfig, ...localConfig }
}

const config = getConfig()
const language = config.language || "en"
const t = JSON.parse(readFile(`locales/${language}.json`))
```

## Step 1: Parse Arguments

```javascript
const args = commandArgs.trim().split(/\s+/)
const autoFix = args.includes("--fix")
```

## Step 2: Read and Analyze Plan

```javascript
// Check if PROJECT_PLAN.md exists
if (!fileExists("PROJECT_PLAN.md")) {
  showNoPlanCard()
  return
}

const planContent = readFile("PROJECT_PLAN.md")
```

### Format Detection Patterns

```javascript
// VALID formats (will be parsed by API)
const validHeaderPattern = /^#{2,4}\s*\*{0,2}(T\d+[A-Za-z]?\.\d+)\*{0,2}[:\s]+(.+)/gm
const validTablePattern = /\|\s*(T\d+[A-Za-z]?\.\d+)\s*\|/g

// INVALID formats (won't be parsed)
const bulletPattern = /^[-*]\s*(T\d+[A-Za-z]?\.\d+)[:\s]+(.+)/gm
const numberedPattern = /^\d+\.\s*(T\d+[A-Za-z]?\.\d+)[:\s]+(.+)/gm
const plainPattern = /^(T\d+[A-Za-z]?\.\d+)[:\s]+([^|\n]+)$/gm

// Count tasks in each format
const validHeaderTasks = [...planContent.matchAll(validHeaderPattern)]
const validTableTasks = [...planContent.matchAll(validTablePattern)]
const bulletTasks = [...planContent.matchAll(bulletPattern)]
const numberedTasks = [...planContent.matchAll(numberedPattern)]
const plainTasks = [...planContent.matchAll(plainPattern)]

const totalValid = validHeaderTasks.length + validTableTasks.length
const totalInvalid = bulletTasks.length + numberedTasks.length + plainTasks.length
```

## Step 3: Show Analysis Results

### All formats valid - success card:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ FORMAT CHECK PASSED                                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Your PROJECT_PLAN.md format is correct!                                     │
│                                                                              │
│  ── Task Summary ───────────────────────────────────────────────────────     │
│                                                                              │
│  📊 Total tasks found:    {totalValid}                                       │
│  📝 Header format:        {validHeaderTasks.length}                          │
│  📋 Table format:         {validTableTasks.length}                           │
│                                                                              │
│  ── Format Details ─────────────────────────────────────────────────────     │
│                                                                              │
│  ✅ All tasks use valid format                                               │
│  ✅ Ready for cloud sync                                                     │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Next Steps:                                                              │
│     • /pfSyncPush          Push to cloud                                     │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### Issues found - warning card:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚠️  FORMAT ISSUES FOUND                                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Found {totalInvalid} tasks in incorrect format.                             │
│                                                                              │
│  ── Current Status ─────────────────────────────────────────────────────     │
│                                                                              │
│  ✅ Valid tasks:           {totalValid}                                      │
│  ❌ Invalid tasks:         {totalInvalid}                                    │
│                                                                              │
│  ── Issues Detected ────────────────────────────────────────────────────     │
│                                                                              │
│  {bulletTasks.length > 0 ? "• Bullet format (- T1.1: ...): " + bulletTasks.length + " tasks" : ""}
│  {numberedTasks.length > 0 ? "• Numbered format (1. T1.1: ...): " + numberedTasks.length + " tasks" : ""}
│  {plainTasks.length > 0 ? "• Plain format (T1.1: ...): " + plainTasks.length + " tasks" : ""}
│                                                                              │
│  ── Invalid Tasks ──────────────────────────────────────────────────────     │
│                                                                              │
│  {Show first 5 invalid tasks as examples}                                    │
│                                                                              │
│  ── Required Format ────────────────────────────────────────────────────     │
│                                                                              │
│  Header format:                                                              │
│  #### T1.1: Task Name                                                        │
│  - [ ] **Status**: TODO                                                      │
│  - **Complexity**: Low                                                       │
│  - **Dependencies**: None                                                    │
│                                                                              │
│  OR table format:                                                            │
│  | ID   | Task      | Complexity | Status | Deps |                          │
│  |------|-----------|------------|--------|------|                          │
│  | T1.1 | Task Name | Low        | TODO   | -    |                          │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Next Steps:                                                              │
│     • /planFormatCheck --fix    Auto-fix all issues                          │
│     • Fix manually using the format shown above                              │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Step 4: Auto-Fix (if --fix flag)

If `--fix` flag is provided and there are invalid tasks:

### Convert all invalid formats to header format:

```javascript
let fixedContent = planContent
let fixedCount = 0

// Convert bullet format: "- T1.1: Task" → header format
fixedContent = fixedContent.replace(
  /^([-*])\s*(T\d+[A-Za-z]?\.\d+)[:\s]+(.+)$/gm,
  (match, bullet, taskId, taskName) => {
    fixedCount++
    return `#### ${taskId}: ${taskName.trim()}
- [ ] **Status**: TODO
- **Complexity**: Medium
- **Dependencies**: None`
  }
)

// Convert numbered format: "1. T1.1: Task" → header format
fixedContent = fixedContent.replace(
  /^(\d+)\.\s*(T\d+[A-Za-z]?\.\d+)[:\s]+(.+)$/gm,
  (match, num, taskId, taskName) => {
    fixedCount++
    return `#### ${taskId}: ${taskName.trim()}
- [ ] **Status**: TODO
- **Complexity**: Medium
- **Dependencies**: None`
  }
)

// Convert plain format: "T1.1: Task" → header format (only at line start, not in tables)
fixedContent = fixedContent.replace(
  /^(T\d+[A-Za-z]?\.\d+)[:\s]+([^|\n]+)$/gm,
  (match, taskId, taskName) => {
    // Skip if this looks like it might be part of a table (has | nearby)
    if (taskName.includes('|')) return match
    fixedCount++
    return `#### ${taskId}: ${taskName.trim()}
- [ ] **Status**: TODO
- **Complexity**: Medium
- **Dependencies**: None`
  }
)

// Write fixed content
writeFile("PROJECT_PLAN.md", fixedContent)
```

### Show fix success card:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ FORMAT FIXED                                                             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Successfully converted {fixedCount} tasks to correct format!                │
│                                                                              │
│  ── Changes Made ───────────────────────────────────────────────────────     │
│                                                                              │
│  • Converted bullet format tasks to header format                            │
│  • Converted numbered list tasks to header format                            │
│  • Converted plain format tasks to header format                             │
│  • Added Status, Complexity, and Dependencies fields                         │
│                                                                              │
│  ── Before → After ─────────────────────────────────────────────────────     │
│                                                                              │
│  BEFORE:                                                                     │
│  - T1.1: Setup project                                                       │
│                                                                              │
│  AFTER:                                                                      │
│  #### T1.1: Setup project                                                    │
│  - [ ] **Status**: TODO                                                      │
│  - **Complexity**: Medium                                                    │
│  - **Dependencies**: None                                                    │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Next Steps:                                                              │
│     • Review the changes in PROJECT_PLAN.md                                  │
│     • Update Status/Complexity/Dependencies as needed                        │
│     • /pfSyncPush          Push to cloud                                     │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Error Handling

### No PROJECT_PLAN.md found:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  No PROJECT_PLAN.md found in current directory.                              │
│                                                                              │
│  💡 Next Steps:                                                              │
│     • /planNew             Create a new project plan                         │
│     • cd to your project directory and try again                             │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### No tasks found at all:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ⚠️  NO TASKS FOUND                                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  No tasks were found in PROJECT_PLAN.md.                                     │
│                                                                              │
│  Your plan may be missing the Tasks section entirely.                        │
│                                                                              │
│  ── Add Tasks Using This Format ────────────────────────────────────────     │
│                                                                              │
│  ## Tasks & Implementation Plan                                              │
│                                                                              │
│  ### Phase 1: Foundation                                                     │
│                                                                              │
│  #### T1.1: Setup Project                                                    │
│  - [ ] **Status**: TODO                                                      │
│  - **Complexity**: Low                                                       │
│  - **Dependencies**: None                                                    │
│  - **Description**:                                                          │
│    - Initialize the project structure                                        │
│    - Configure development tools                                             │
│                                                                              │
│  #### T1.2: Configure Database                                               │
│  - [ ] **Status**: TODO                                                      │
│  - **Complexity**: Medium                                                    │
│  - **Dependencies**: T1.1                                                    │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Next Steps:                                                              │
│     • /planNew             Create a new plan with tasks                      │
│     • Add tasks manually in the format shown above                           │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Valid Format Reference

### Header Format (Preferred)

```markdown
#### T1.1: Task Name
- [ ] **Status**: TODO
- **Complexity**: Low
- **Estimated**: 2 hours
- **Dependencies**: None
- **Description**:
  - Detail 1
  - Detail 2

#### T1.2: Another Task
- [x] **Status**: DONE
- **Complexity**: Medium
- **Dependencies**: T1.1
```

Status values: `TODO`, `IN_PROGRESS`, `DONE`, `BLOCKED`
Complexity values: `Low`, `Medium`, `High`

### Table Format (Alternative)

```markdown
| ID    | Task           | Complexity | Status | Dependencies |
|-------|----------------|------------|--------|--------------|
| T1.1  | Setup Project  | Low        | TODO   | -            |
| T1.2  | Add Database   | Medium     | TODO   | T1.1         |
| T1.3  | Create API     | High       | TODO   | T1.1, T1.2   |
```

### Task ID Format

Valid task IDs:
- `T1.1`, `T1.2`, `T2.1` - Standard format
- `T5A.1`, `T5A.2`, `T5B.1` - Sub-phase format
- `T10.1`, `T10.15` - Multi-digit phases

Invalid task IDs:
- `Task1`, `T-1.1`, `T1-1` - Wrong format
