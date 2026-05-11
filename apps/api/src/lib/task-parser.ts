/**
 * Task Parser - Extracts tasks from PROJECT_PLAN.md content
 *
 * Parses markdown content and extracts tasks with their:
 * - Task ID (T1.1, T2.3, T8A.1, etc.)
 * - Name
 * - Status (TODO, IN_PROGRESS, DONE, BLOCKED)
 * - Complexity (Low, Medium, High)
 * - Dependencies
 * - Description
 *
 * Supports two formats:
 * 1. Header format: #### **T1.1**: Task Name
 * 2. Table format: | T1.1 | Task Name | Low | TODO | - |
 */

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'
export type TaskComplexity = 'Low' | 'Medium' | 'High'

/**
 * A task as extracted from PROJECT_PLAN.md.
 *
 * IMPORTANT — sync semantics: `undefined` on an optional field means
 * "the parser did not find this in the markdown". The sync layer uses
 * this to merge with the existing DB row instead of resetting it. Do
 * NOT default these in the parser — that destroys information.
 *
 *   • status === undefined  → leave existing DB value untouched
 *   • status === 'TODO'     → user explicitly wrote TODO in markdown
 *
 * Only `taskId` and `name` are required; everything else is optional.
 */
export interface ParsedTask {
  taskId: string
  name: string
  description?: string | null
  status?: TaskStatus
  complexity?: TaskComplexity
  estimatedHours?: number | null
  dependencies?: string[]
}

/**
 * Column name mappings for table parsing (supports English and Georgian)
 */
const COLUMN_MAPPINGS: Record<string, string> = {
  // ID column
  id: 'id',
  'task id': 'id',
  taskid: 'id',
  // Name/Task column
  task: 'name',
  name: 'name',
  'task name': 'name',
  დავალება: 'name',
  სახელი: 'name',
  // Status column
  status: 'status',
  სტატუსი: 'status',
  // Complexity column
  complexity: 'complexity',
  სირთულე: 'complexity',
  // Dependencies column
  dependencies: 'dependencies',
  deps: 'dependencies',
  დამოკიდებულებები: 'dependencies',
  // Description column
  description: 'description',
  აღწერა: 'description',
  // Estimated hours
  hours: 'hours',
  'estimated hours': 'hours',
  time: 'hours',
  დრო: 'hours',
}

/**
 * Parse status string to valid status enum
 */
function parseStatus(statusStr: string): ParsedTask['status'] {
  const s = statusStr.toUpperCase().trim()
  if (s.includes('DONE') || s.includes('COMPLETE') || s.includes('✅')) {
    return 'DONE'
  }
  if (s.includes('IN_PROGRESS') || s.includes('IN PROGRESS') || s.includes('PROGRESS') || s.includes('🔄')) {
    return 'IN_PROGRESS'
  }
  if (s.includes('BLOCKED') || s.includes('BLOCK') || s.includes('🚫')) {
    return 'BLOCKED'
  }
  return 'TODO'
}

/**
 * Parse complexity string to valid complexity enum
 */
function parseComplexity(complexityStr: string): ParsedTask['complexity'] {
  const c = complexityStr.toLowerCase().trim()
  if (c.includes('low') || c.includes('დაბალი') || c.includes('🟢')) {
    return 'Low'
  }
  if (c.includes('high') || c.includes('მაღალი') || c.includes('🔴')) {
    return 'High'
  }
  return 'Medium'
}

/**
 * Parse dependencies string to array of task IDs
 */
function parseDependencies(depsStr: string): string[] {
  if (!depsStr || depsStr === '-' || depsStr.toLowerCase() === 'none' || depsStr === 'არცერთი') {
    return []
  }
  // Extract task IDs like T1.1, T2.3, T8A.1, T5A.1
  const depIds = depsStr.match(/T\d+[A-Za-z]?\.\d+/g)
  return depIds || []
}

/**
 * Parse tasks from markdown table format
 *
 * Supports tables like:
 * | ID    | Task                    | Complexity | Status | Dependencies |
 * |-------|-------------------------|------------|--------|--------------|
 * | T8A.1 | Create /team command    | Low        | TODO   | -            |
 */
function parseTasksFromTables(planContent: string): ParsedTask[] {
  const tasks: ParsedTask[] = []
  const lines = planContent.split('\n')

  let inTable = false
  let columnMap: Map<number, string> = new Map()
  let headerParsed = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // Check if this is a table row (starts and ends with |)
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line
        .slice(1, -1) // Remove leading/trailing |
        .split('|')
        .map((cell) => cell.trim())

      // Check if this is the separator row (|---|---|)
      if (cells.every((cell) => /^[-:]+$/.test(cell))) {
        headerParsed = true
        continue
      }

      // If we haven't parsed header yet, this is the header row
      if (!headerParsed) {
        inTable = true
        columnMap = new Map()

        cells.forEach((cell, index) => {
          const normalized = cell.toLowerCase().replace(/\*+/g, '').trim()
          const mappedColumn = COLUMN_MAPPINGS[normalized]
          if (mappedColumn) {
            columnMap.set(index, mappedColumn)
          }
        })
        continue
      }

      // This is a data row - check if it contains a task ID
      // Task ID pattern: T followed by numbers/letters, dot, numbers (T1.1, T8A.1, etc.)
      const hasTaskId = cells.some((cell) => /^T\d+[A-Za-z]?\.\d+$/.test(cell.trim()))

      if (hasTaskId && columnMap.size > 0) {
        // Start empty — only set fields that the table row actually
        // contains. `undefined` is preserved through to the sync layer
        // so we don't wipe out DB state that isn't represented in the
        // markdown column.
        const task: Partial<ParsedTask> = {}

        cells.forEach((cell, index) => {
          const columnType = columnMap.get(index)
          const value = cell.trim()

          switch (columnType) {
            case 'id': {
              // Extract task ID
              const idMatch = value.match(/T\d+[A-Za-z]?\.\d+/)
              if (idMatch) {
                task.taskId = idMatch[0]
              }
              break
            }
            case 'name':
              task.name = value
              break
            case 'status':
              if (value && value !== '-') task.status = parseStatus(value)
              break
            case 'complexity':
              if (value && value !== '-') task.complexity = parseComplexity(value)
              break
            case 'dependencies':
              task.dependencies = parseDependencies(value)
              break
            case 'description':
              if (value) task.description = value
              break
            case 'hours': {
              const hours = parseInt(value, 10)
              if (!isNaN(hours)) {
                task.estimatedHours = hours
              }
              break
            }
          }
        })

        // Only add if we have taskId and name
        if (task.taskId && task.name) {
          tasks.push(task as ParsedTask)
        }
      }
    } else {
      // Not a table row - reset table state
      if (inTable && headerParsed) {
        inTable = false
        headerParsed = false
        columnMap = new Map()
      }
    }
  }

  return tasks
}

/**
 * Parse tasks from header format (legacy format)
 *
 * Supports format like:
 * #### **T1.1**: Task Name
 * - [x] **Status**: DONE
 * - **Complexity**: Low
 */
function parseTasksFromHeaders(planContent: string): ParsedTask[] {
  const tasks: ParsedTask[] = []
  const lines = planContent.split('\n')

  let currentTask: Partial<ParsedTask> | null = null
  let inTaskBlock = false
  let descriptionLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Detect task header: #### **T1.1**: Task Name or ### T1.1: Task Name
    const taskHeaderMatch = line.match(
      /^#{2,4}\s*\*{0,2}(T\d+[A-Za-z]?\.\d+)\*{0,2}[:\s]+(.+?)(?:\*{0,2})?\s*$/
    )

    if (taskHeaderMatch) {
      // Save previous task if exists
      if (currentTask && currentTask.taskId) {
        const desc = descriptionLines.join('\n').trim()
        if (desc) currentTask.description = desc
        tasks.push(currentTask as ParsedTask)
      }

      // Start new task — fields are populated only as the parser sees them
      currentTask = {
        taskId: taskHeaderMatch[1],
        name: taskHeaderMatch[2].replace(/\*+/g, '').trim(),
      }
      inTaskBlock = true
      descriptionLines = []
      continue
    }

    // If we're in a task block, parse task properties
    if (inTaskBlock && currentTask) {
      // Status line: - [ ] **სტატუსი**: TODO or - [x] **Status**: DONE
      const statusMatch = line.match(
        /^-\s*\[([ xX])\]\s*\*{0,2}(?:სტატუსი|Status|სტატუსი)\*{0,2}[:\s]+(.+?)(?:\s*[✅🔄🚫].*)?$/iu
      )
      if (statusMatch) {
        const checkbox = statusMatch[1].toLowerCase()
        const statusText = statusMatch[2].trim().toUpperCase()

        // Status was explicitly written in the markdown — set it.
        if (
          statusText.includes('DONE') ||
          statusText.includes('COMPLETE') ||
          checkbox === 'x'
        ) {
          currentTask.status = 'DONE'
        } else if (
          statusText.includes('IN_PROGRESS') ||
          statusText.includes('IN PROGRESS') ||
          statusText.includes('PROGRESS')
        ) {
          currentTask.status = 'IN_PROGRESS'
        } else if (statusText.includes('BLOCKED') || statusText.includes('BLOCK')) {
          currentTask.status = 'BLOCKED'
        } else {
          currentTask.status = 'TODO'
        }
        continue
      }

      // Complexity line: - **სირთულე**: 🟢 Low or - **Complexity**: Medium
      const complexityMatch = line.match(
        /^-\s*\*{0,2}(?:სირთულე|Complexity)\*{0,2}[:\s]+(?:🟢|🟡|🔴)?\s*(Low|Medium|High|დაბალი|საშუალო|მაღალი)/i
      )
      if (complexityMatch) {
        const complexityText = complexityMatch[1].toLowerCase()
        if (complexityText === 'low' || complexityText === 'დაბალი') {
          currentTask.complexity = 'Low'
        } else if (complexityText === 'high' || complexityText === 'მაღალი') {
          currentTask.complexity = 'High'
        } else {
          currentTask.complexity = 'Medium'
        }
        continue
      }

      // Dependencies line: - **დამოკიდებულებები**: T1.1, T1.2 or - **Dependencies**: T1.1
      const depsMatch = line.match(
        /^-\s*\*{0,2}(?:დამოკიდებულებები|Dependencies)\*{0,2}[:\s]+(.+)/i
      )
      if (depsMatch) {
        const depsText = depsMatch[1].trim()
        if (depsText.toLowerCase() !== 'none' && depsText !== '-' && depsText !== 'არცერთი') {
          // Extract task IDs like T1.1, T2.3, T8A.1
          const depIds = depsText.match(/T\d+[A-Za-z]?\.\d+/g)
          if (depIds) {
            currentTask.dependencies = depIds
          }
        }
        continue
      }

      // Estimated hours: - **სავარაუდო დრო**: 2h or - **Estimated**: 4 hours
      const hoursMatch = line.match(
        /^-\s*\*{0,2}(?:სავარაუდო დრო|Estimated|Time|Hours)\*{0,2}[:\s]+(\d+)/i
      )
      if (hoursMatch) {
        currentTask.estimatedHours = parseInt(hoursMatch[1], 10)
        continue
      }

      // Description line: - **აღწერა**: Some description
      const descMatch = line.match(/^-\s*\*{0,2}(?:აღწერა|Description)\*{0,2}[:\s]+(.+)/i)
      if (descMatch) {
        descriptionLines.push(descMatch[1].trim())
        continue
      }

      // Check if we've left the task block (new section or task)
      if (line.match(/^#{1,4}\s+/) && !line.match(/^#{2,4}\s*\*{0,2}T\d+[A-Za-z]?\.\d+/)) {
        // Save current task before moving on
        if (currentTask.taskId) {
          const desc = descriptionLines.join('\n').trim()
          if (desc) currentTask.description = desc
          tasks.push(currentTask as ParsedTask)
        }
        currentTask = null
        inTaskBlock = false
        descriptionLines = []
      }
    }
  }

  // Don't forget the last task
  if (currentTask && currentTask.taskId) {
    const desc = descriptionLines.join('\n').trim()
    if (desc) currentTask.description = desc
    tasks.push(currentTask as ParsedTask)
  }

  return tasks
}

/**
 * Parse PROJECT_PLAN.md content and extract tasks
 * Combines both table format and header format parsing
 */
export function parsePlanTasks(planContent: string): ParsedTask[] {
  if (!planContent) {
    return []
  }

  // Parse tasks from both formats
  const headerTasks = parseTasksFromHeaders(planContent)
  const tableTasks = parseTasksFromTables(planContent)

  // Merge per-field by taskId. A real plan often has the same task
  // mentioned in both a summary table (which carries status/complexity)
  // and a detailed `#### **T1.1**: …` block (which carries dependencies
  // and estimated hours). Wholesale-overriding one with the other
  // loses information — instead, overlay only fields that were
  // actually present in each parse. Header values win for shared
  // fields because the detailed block is the source of truth.
  const taskMap = new Map<string, ParsedTask>()

  const mergeTask = (incoming: ParsedTask) => {
    const existing = taskMap.get(incoming.taskId)
    if (!existing) {
      taskMap.set(incoming.taskId, { ...incoming })
      return
    }
    const merged: ParsedTask = { ...existing }
    if (incoming.name) merged.name = incoming.name
    if (incoming.description !== undefined) merged.description = incoming.description
    if (incoming.status !== undefined) merged.status = incoming.status
    if (incoming.complexity !== undefined) merged.complexity = incoming.complexity
    if (incoming.estimatedHours !== undefined) merged.estimatedHours = incoming.estimatedHours
    if (incoming.dependencies !== undefined) merged.dependencies = incoming.dependencies
    taskMap.set(incoming.taskId, merged)
  }

  for (const task of tableTasks) mergeTask(task)
  for (const task of headerTasks) mergeTask(task)

  return Array.from(taskMap.values())
}

/**
 * Extract task order from task ID (T1.1 -> 11, T2.3 -> 23)
 */
/**
 * Extract task order from task ID
 * T1.1 -> 11, T2.3 -> 23, T5A.1 -> 51, T8B.2 -> 82
 */
export function getTaskOrder(taskId: string): number {
  // Match T followed by phase number, optional sub-phase letter, dot, task number
  const match = taskId.match(/T(\d+)([A-Za-z])?\.(\d+)/)
  if (match) {
    const phase = parseInt(match[1], 10)
    const subPhase = match[2] ? match[2].toUpperCase().charCodeAt(0) - 64 : 0 // A=1, B=2, etc.
    const taskNum = parseInt(match[3], 10)
    // Create order: phase * 1000 + subPhase * 100 + taskNum
    // T5A.1 -> 5*1000 + 1*100 + 1 = 5101
    // T5B.2 -> 5*1000 + 2*100 + 2 = 5202
    return phase * 1000 + subPhase * 100 + taskNum
  }
  return 0
}

/**
 * Extract phase number from task ID
 * T1.1 -> 1, T2.3 -> 2, T5A.1 -> 5, T8B.2 -> 8
 */
export function getTaskPhase(taskId: string): number {
  // Match T followed by phase number (digits), then optional letter or dot
  const match = taskId.match(/T(\d+)/)
  if (match) {
    return parseInt(match[1], 10)
  }
  return 0
}

/**
 * Extract sub-phase letter from task ID (if exists)
 * T1.1 -> null, T5A.1 -> 'A', T8B.2 -> 'B'
 */
export function getTaskSubPhase(taskId: string): string | null {
  const match = taskId.match(/T\d+([A-Za-z])\./)
  if (match) {
    return match[1].toUpperCase()
  }
  return null
}
