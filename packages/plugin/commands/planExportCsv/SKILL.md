---
name: planExportCsv
description: Export PROJECT_PLAN.md tasks as a CSV file
---

# Plan Export to CSV

Export PROJECT_PLAN.md tasks as a CSV file for spreadsheet applications.

## Usage

```bash
/planExportCsv
```

## Step 0: Load Configuration

```javascript
function getConfig() {
  if (fileExists("./.plan-config.json")) {
    try { return JSON.parse(readFile("./.plan-config.json")) } catch {}
  }
  const globalPath = expandPath("~/.config/claude/plan-plugin-config.json")
  if (fileExists(globalPath)) {
    try { return JSON.parse(readFile(globalPath)) } catch {}
  }
  return { "language": "en" }
}

const config = getConfig()
const language = config.language || "en"
const t = JSON.parse(readFile(`locales/${language}.json`))
```

## Step 1: Read PROJECT_PLAN.md

If not found:
```
{t.commands.update.planNotFound}

{t.commands.update.runPlanNew}
```

## Step 2: Parse Project Data

Extract all task information.

## Step 3: Create CSV Structure

```csv
Task ID,Task Name,Phase,Status,Complexity,Estimated Hours,Dependencies,Description
T1.1,Project Setup,1,DONE,Low,2,None,"Initialize project..."
T1.2,Database Setup,1,DONE,Medium,3,T1.1,"Setup PostgreSQL..."
T1.3,Authentication,1,TODO,High,6,T1.2,"Implement JWT auth..."
```

**Important:** Escape commas and quotes in content properly.

## Step 4: Write File

Write to `project-plan.csv`

**Success Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Exported to: project-plan.csv                                               │
│                                                                              │
│  ── CSV Details ───────────────────────────────────────────────────────────  │
│                                                                              │
│  📊 Rows:      [X] tasks                                                     │
│  📋 Columns:   8                                                             │
│                                                                              │
│  ── Use This For ──────────────────────────────────────────────────────────  │
│                                                                              │
│  • Excel/Sheets import                                                       │
│  • Data analysis                                                             │
│  • Project management tools                                                  │
│  • Reporting                                                                 │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 View file: cat project-plan.csv                                          │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

## Error Handling

**Write Error Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ❌ ERROR                                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Cannot write export file.                                                   │
│                                                                              │
│  Please check directory permissions and try again.                           │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```
