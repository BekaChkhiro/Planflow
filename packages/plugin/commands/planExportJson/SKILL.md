---
name: planExportJson
description: Export PROJECT_PLAN.md as a structured JSON file
---

# Plan Export to JSON

Export PROJECT_PLAN.md as a structured JSON file.

## Usage

```bash
/planExportJson
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

Extract all project information:
- Project name, description, type
- Progress statistics
- Tech stack
- All phases and tasks

## Step 3: Create JSON Structure

```json
{
  "project": {
    "name": "Project Name",
    "description": "Project description",
    "type": "Full-Stack / Backend / Frontend",
    "status": "In Progress",
    "progress": {
      "total": 14,
      "completed": 3,
      "in_progress": 1,
      "blocked": 0,
      "percentage": 21
    },
    "created": "2026-01-26",
    "updated": "2026-01-26"
  },
  "techStack": {
    "frontend": ["React", "TypeScript", "Tailwind CSS"],
    "backend": ["Node.js", "Express", "PostgreSQL"],
    "devops": ["Docker", "GitHub Actions"],
    "testing": ["Jest", "Playwright"]
  },
  "phases": [
    {
      "id": 1,
      "name": "Foundation",
      "tasks": [
        {
          "id": "T1.1",
          "name": "Project Setup",
          "status": "DONE",
          "complexity": "Low",
          "estimated_hours": 2,
          "dependencies": [],
          "description": "Initialize project structure...",
          "phase": 1
        }
      ],
      "progress": {
        "total": 4,
        "completed": 2,
        "percentage": 50
      }
    }
  ],
  "exportedAt": "2026-01-26T12:00:00Z",
  "exportedBy": "plan-plugin v1.2.0"
}
```

## Step 4: Write File

Write to `project-plan.json`

**Success Card:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  ✅ SUCCESS                                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Exported to: project-plan.json                                              │
│                                                                              │
│  ── Export Details ────────────────────────────────────────────────────────  │
│                                                                              │
│  📁 Project:  Task Manager                                                   │
│  📋 Tasks:    18 total                                                       │
│  🎯 Phases:   4                                                              │
│  📄 Format:   JSON                                                           │
│                                                                              │
│  ── Use This File For ─────────────────────────────────────────────────────  │
│                                                                              │
│  • Custom integrations                                                       │
│  • Data analysis                                                             │
│  • Importing into other tools                                                │
│  • Version control tracking                                                  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 View file: cat project-plan.json                                         │
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
│  The file may be:                                                            │
│     • In use by another program                                              │
│     • In a read-only directory                                               │
│     • Blocked by permissions                                                 │
│                                                                              │
│  Please check and try again.                                                 │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```
