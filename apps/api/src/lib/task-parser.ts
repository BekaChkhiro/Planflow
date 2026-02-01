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

export interface ParsedTask {
  taskId: string
  name: string
  description: string | null
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'
  complexity: 'Low' | 'Medium' | 'High'
  estimatedHours: number | null
  dependencies: string[]
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
        const task: Partial<ParsedTask> = {
          status: 'TODO',
          complexity: 'Medium',
          estimatedHours: null,
          dependencies: [],
          description: null,
        }

        cells.forEach((cell, index) => {
          const columnType = columnMap.get(index)
          const value = cell.trim()

          switch (columnType) {
            case 'id':
              // Extract task ID
              const idMatch = value.match(/T\d+[A-Za-z]?\.\d+/)
              if (idMatch) {
                task.taskId = idMatch[0]
              }
              break
            case 'name':
              task.name = value
              break
            case 'status':
              task.status = parseStatus(value)
              break
            case 'complexity':
              task.complexity = parseComplexity(value)
              break
            case 'dependencies':
              task.dependencies = parseDependencies(value)
              break
            case 'description':
              task.description = value || null
              break
            case 'hours':
              const hours = parseInt(value, 10)
              if (!isNaN(hours)) {
                task.estimatedHours = hours
              }
              break
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
        currentTask.description = descriptionLines.join('\n').trim() || null
        tasks.push(currentTask as ParsedTask)
      }

      // Start new task
      currentTask = {
        taskId: taskHeaderMatch[1],
        name: taskHeaderMatch[2].replace(/\*+/g, '').trim(),
        status: 'TODO',
        complexity: 'Medium',
        estimatedHours: null,
        dependencies: [],
      }
      inTaskBlock = true
      descriptionLines = []
      continue
    }

    // If we're in a task block, parse task properties
    if (inTaskBlock && currentTask) {
      // Status line: - [ ] **სტატუსი**: TODO or - [x] **Status**: DONE
      const statusMatch = line.match(
        /^-\s*\[([ xX])\]\s*\*{0,2}(?:სტატუსი|Status|სტატუსი)\*{0,2}[:\s]+(.+?)(?:\s*[✅🔄🚫].*)?$/i
      )
      if (statusMatch) {
        const checkbox = statusMatch[1].toLowerCase()
        const statusText = statusMatch[2].trim().toUpperCase()

        // Determine status from text or checkbox
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
          currentTask.description = descriptionLines.join('\n').trim() || null
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
    currentTask.description = descriptionLines.join('\n').trim() || null
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

  // Combine and deduplicate by taskId (header format takes precedence)
  const taskMap = new Map<string, ParsedTask>()

  // Add table tasks first
  for (const task of tableTasks) {
    taskMap.set(task.taskId, task)
  }

  // Add header tasks (will override table tasks with same ID)
  for (const task of headerTasks) {
    taskMap.set(task.taskId, task)
  }

  return Array.from(taskMap.values())
}

/**
 * Extract task order from task ID (T1.1 -> 11, T2.3 -> 23)
 */
export function getTaskOrder(taskId: string): number {
  const match = taskId.match(/T(\d+)\.(\d+)/)
  if (match) {
    return parseInt(match[1], 10) * 10 + parseInt(match[2], 10)
  }
  return 0
}

/**
 * Extract phase number from task ID (T1.1 -> 1, T2.3 -> 2)
 */
export function getTaskPhase(taskId: string): number {
  const match = taskId.match(/T(\d+)\./)
  if (match) {
    return parseInt(match[1], 10)
  }
  return 0
}
