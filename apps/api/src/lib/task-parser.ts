/**
 * Task Parser - Extracts tasks from PROJECT_PLAN.md content
 *
 * Parses markdown content and extracts tasks with their:
 * - Task ID (T1.1, T2.3, etc.)
 * - Name
 * - Status (TODO, IN_PROGRESS, DONE, BLOCKED)
 * - Complexity (Low, Medium, High)
 * - Dependencies
 * - Description
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
 * Parse PROJECT_PLAN.md content and extract tasks
 */
export function parsePlanTasks(planContent: string): ParsedTask[] {
  const tasks: ParsedTask[] = []

  if (!planContent) {
    return tasks
  }

  // Split content into lines for processing
  const lines = planContent.split('\n')

  let currentTask: Partial<ParsedTask> | null = null
  let inTaskBlock = false
  let descriptionLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Detect task header: #### **T1.1**: Task Name or ### T1.1: Task Name
    const taskHeaderMatch = line.match(
      /^#{2,4}\s*\*{0,2}(T\d+\.\d+)\*{0,2}[:\s]+(.+?)(?:\*{0,2})?\s*$/
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
          // Extract task IDs like T1.1, T2.3
          const depIds = depsText.match(/T\d+\.\d+/g)
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
      if (line.match(/^#{1,4}\s+/) && !line.match(/^#{2,4}\s*\*{0,2}T\d+\.\d+/)) {
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
