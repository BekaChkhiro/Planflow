/**
 * PlanFlow MCP Server - Task Next Tool
 *
 * Recommends the next task to work on based on dependencies, phase, and complexity.
 */

import { z } from 'zod'
import { getApiClient } from '../api-client.js'
import { isAuthenticated } from '../config.js'
import { AuthError, ApiError } from '../errors.js'
import { logger } from '../logger.js'
import {
  type ToolDefinition,
  type ToolResult,
  createStructuredResult,
  createErrorResult,
  formatKeyValue,
} from './types.js'

/**
 * Input schema for planflow_task_next tool
 */
const TaskNextInputSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID'),
})

type TaskNextInput = z.infer<typeof TaskNextInputSchema>

/**
 * Structured output — the machine-readable recommendation. `state`
 * disambiguates the empty / all-done / blocked cases from a real
 * recommendation so an orchestrator can branch without parsing prose.
 */
const StatsSchema = z.object({
  total: z.number(),
  todo: z.number(),
  inProgress: z.number(),
  done: z.number(),
  blocked: z.number(),
  progressPercent: z.number(),
})

const TaskNextOutputSchema = z.object({
  projectId: z.string(),
  projectName: z.string(),
  state: z.enum(['recommendation', 'all_complete', 'no_available', 'empty']),
  stats: StatsSchema,
  recommended: z
    .object({
      taskId: z.string(),
      name: z.string(),
      complexity: z.string(),
      estimatedHours: z.number().nullable(),
      dependencies: z.array(z.string()),
      phase: z.number(),
      score: z.number(),
      reasons: z.array(z.string()),
      unlocksCount: z.number(),
    })
    .nullable(),
  alternatives: z.array(
    z.object({
      taskId: z.string(),
      name: z.string(),
      complexity: z.string(),
      estimatedHours: z.number().nullable(),
      unlocksCount: z.number(),
    })
  ),
})

const ZERO_STATS = { total: 0, todo: 0, inProgress: 0, done: 0, blocked: 0, progressPercent: 0 }

/**
 * Task with computed scoring fields
 */
interface ScoredTask {
  id: string
  taskId: string
  name: string
  status: string
  complexity: string
  estimatedHours?: number
  dependencies: string[]
  description?: string
  phase: number
  score: number
  reasons: string[]
  unlocksCount: number
}

/**
 * Get complexity indicator
 */
function getComplexityIndicator(complexity: string): string {
  switch (complexity) {
    case 'Low':
      return '🟢'
    case 'Medium':
      return '🟡'
    case 'High':
      return '🔴'
    default:
      return '⚪'
  }
}

/**
 * Parse phase number from task ID (T1.1 -> 1, T2.3 -> 2)
 */
function parsePhase(taskId: string): number {
  const match = taskId.match(/T(\d+)\./)
  return match ? parseInt(match[1]!, 10) : 0
}

/**
 * Parse task order from task ID (T1.1 -> 1, T1.2 -> 2)
 */
function parseTaskOrder(taskId: string): number {
  const match = taskId.match(/T\d+\.(\d+)/)
  return match ? parseInt(match[1]!, 10) : 0
}

/**
 * Check if all dependencies are satisfied (completed)
 */
function areDependenciesSatisfied(
  taskDependencies: string[],
  completedTaskIds: Set<string>
): boolean {
  return taskDependencies.every((dep) => completedTaskIds.has(dep))
}

/**
 * Count how many tasks depend on a given task
 */
function countDependentTasks(
  taskId: string,
  allTasks: Array<{ taskId: string; dependencies: string[] }>
): number {
  return allTasks.filter((t) => t.dependencies.includes(taskId)).length
}

/**
 * Find the current phase (lowest phase with incomplete tasks)
 */
function findCurrentPhase(
  tasks: Array<{ taskId: string; status: string }>
): number {
  const phaseMap = new Map<number, { total: number; done: number }>()

  for (const task of tasks) {
    const phase = parsePhase(task.taskId)
    if (!phaseMap.has(phase)) {
      phaseMap.set(phase, { total: 0, done: 0 })
    }
    const stats = phaseMap.get(phase)!
    stats.total++
    if (task.status === 'DONE') {
      stats.done++
    }
  }

  // Find lowest phase that isn't complete
  const phases = Array.from(phaseMap.keys()).sort((a, b) => a - b)
  for (const phase of phases) {
    const stats = phaseMap.get(phase)!
    if (stats.done < stats.total) {
      return phase
    }
  }

  // All phases complete, return highest
  return phases[phases.length - 1] ?? 1
}

/**
 * Get recently completed tasks' complexity for balance calculation
 */
function getRecentComplexity(
  tasks: Array<{ taskId: string; status: string; complexity: string }>
): string | null {
  const doneTasks = tasks
    .filter((t) => t.status === 'DONE')
    .sort((a, b) => {
      // Sort by task ID descending to get most recent
      const [aPhase, aOrder] = [parsePhase(a.taskId), parseTaskOrder(a.taskId)]
      const [bPhase, bOrder] = [parsePhase(b.taskId), parseTaskOrder(b.taskId)]
      if (aPhase !== bPhase) return bPhase - aPhase
      return bOrder - aOrder
    })

  return doneTasks[0]?.complexity ?? null
}

/**
 * Score a task based on multiple factors
 */
function scoreTask(
  task: {
    taskId: string
    name: string
    status: string
    complexity: string
    estimatedHours?: number
    dependencies: string[]
    description?: string
    id: string
  },
  currentPhase: number,
  completedTaskIds: Set<string>,
  allTasks: Array<{ taskId: string; dependencies: string[]; status: string; complexity: string }>,
  recentComplexity: string | null
): ScoredTask {
  const phase = parsePhase(task.taskId)
  const reasons: string[] = []
  let score = 0

  // Factor 1: Phase Priority (40% weight)
  let phaseScore = 0
  if (phase === currentPhase) {
    phaseScore = 100
    reasons.push(`In current phase (Phase ${phase})`)
  } else if (phase === currentPhase + 1) {
    phaseScore = 50
    reasons.push(`Next phase (Phase ${phase})`)
  } else if (phase < currentPhase) {
    phaseScore = 100
    reasons.push(`Earlier incomplete phase (Phase ${phase})`)
  }
  score += phaseScore * 0.4

  // Factor 2: Dependency Impact (30% weight)
  const unlocksCount = countDependentTasks(task.taskId, allTasks)
  const maxUnlocks = Math.max(
    1,
    ...allTasks.map((t) => countDependentTasks(t.taskId, allTasks))
  )
  const dependencyScore = (unlocksCount / maxUnlocks) * 100
  if (unlocksCount > 0) {
    reasons.push(`Unlocks ${unlocksCount} other task${unlocksCount > 1 ? 's' : ''}`)
  }
  score += dependencyScore * 0.3

  // Factor 3: Complexity Balance (20% weight)
  let complexityScore = 50 // Default neutral
  if (recentComplexity) {
    if (recentComplexity === 'High' && task.complexity !== 'High') {
      complexityScore = 100
      reasons.push('Good complexity balance after high-complexity task')
    } else if (recentComplexity === 'Low' && task.complexity !== 'Low') {
      complexityScore = 100
      reasons.push('Good complexity progression')
    } else if (task.complexity === 'Medium') {
      complexityScore = 80
    }
  } else if (task.complexity === 'Low') {
    complexityScore = 90
    reasons.push('Quick win opportunity')
  }
  score += complexityScore * 0.2

  // Factor 4: Natural Flow / Sequential Order (10% weight)
  const taskOrder = parseTaskOrder(task.taskId)
  // Prefer lower task numbers within a phase (T1.1 before T1.5)
  const flowScore = Math.max(0, 100 - taskOrder * 10)
  if (taskOrder <= 2) {
    reasons.push('Sequential task order')
  }
  score += flowScore * 0.1

  return {
    id: task.id,
    taskId: task.taskId,
    name: task.name,
    status: task.status,
    complexity: task.complexity,
    estimatedHours: task.estimatedHours,
    dependencies: task.dependencies,
    description: task.description,
    phase,
    score,
    reasons,
    unlocksCount,
  }
}

/**
 * planflow_task_next tool implementation
 *
 * Recommends the next task to work on based on intelligent prioritization.
 */
export const taskNextTool: ToolDefinition<TaskNextInput> = {
  name: 'planflow_task_next',

  description: `Get an intelligent recommendation for the next task to work on.

Analyzes project tasks and recommends the best next task based on:
- Dependencies (prioritizes tasks that unlock others)
- Phase progression (completes earlier phases first)
- Complexity balance (prevents burnout, maintains momentum)
- Sequential order (natural task flow)

Usage:
  planflow_task_next(projectId: "uuid")

Returns:
  - Recommended task with details
  - Reasoning for the recommendation
  - Alternative tasks if the main recommendation doesn't fit
  - Project progress overview

You must be logged in first with planflow_login.`,

  inputSchema: TaskNextInputSchema,
  outputSchema: TaskNextOutputSchema,

  async execute(input: TaskNextInput): Promise<ToolResult> {
    logger.info('Finding next task recommendation', { projectId: input.projectId })

    // Check if authenticated locally first
    if (!isAuthenticated()) {
      logger.debug('No active session found')
      return createErrorResult(
        '❌ Not logged in.\n\n' +
          'Please authenticate first using:\n' +
          '  planflow_login(token: "your-api-token")\n\n' +
          'Get your token at: https://planflow.tools/settings/api-tokens'
      )
    }

    try {
      // Get the API client and fetch tasks
      const client = getApiClient()
      const response = await client.listTasks(input.projectId)

      logger.info('Successfully retrieved tasks for analysis', {
        projectId: input.projectId,
        count: response.tasks.length,
      })

      const tasks = response.tasks

      // Handle empty tasks list
      if (tasks.length === 0) {
        return createStructuredResult(
          `📋 No tasks found in project "${response.projectName}".\n\n` +
            '💡 Tasks are created when you sync your PROJECT_PLAN.md:\n' +
            `  planflow_sync(projectId: "${input.projectId}", direction: "push")`,
          {
            projectId: input.projectId,
            projectName: response.projectName,
            state: 'empty',
            stats: ZERO_STATS,
            recommended: null,
            alternatives: [],
          }
        )
      }

      // Calculate completed task IDs
      const completedTaskIds = new Set(
        tasks.filter((t) => t.status === 'DONE').map((t) => t.taskId)
      )

      // Find current phase
      const currentPhase = findCurrentPhase(tasks)

      // Get recent complexity for balance
      const recentComplexity = getRecentComplexity(tasks)

      // Filter available tasks:
      // - Status is TODO
      // - All dependencies are satisfied
      const availableTasks = tasks.filter(
        (task) =>
          task.status === 'TODO' &&
          areDependenciesSatisfied(task.dependencies, completedTaskIds)
      )

      // Check for in-progress tasks
      const inProgressTasks = tasks.filter((t) => t.status === 'IN_PROGRESS')
      const blockedTasks = tasks.filter((t) => t.status === 'BLOCKED')

      // Calculate stats
      const stats = {
        total: tasks.length,
        done: tasks.filter((t) => t.status === 'DONE').length,
        inProgress: inProgressTasks.length,
        blocked: blockedTasks.length,
        todo: tasks.filter((t) => t.status === 'TODO').length,
      }
      const progressPercent = Math.round((stats.done / stats.total) * 100)

      // Machine-readable stats reused across every structured return.
      const structuredStats = { ...stats, progressPercent }

      // Build progress bar
      const progressBarLength = 10
      const filledBlocks = Math.floor(progressPercent / 10)
      const progressBar =
        '🟩'.repeat(filledBlocks) + '⬜'.repeat(progressBarLength - filledBlocks)

      // Handle all tasks complete
      if (stats.done === stats.total) {
        return createStructuredResult(
          `🎉 Congratulations! All tasks completed!\n\n` +
            `✅ Project: ${response.projectName}\n` +
            `📊 Progress: ${progressBar} 100%\n` +
            `🏆 ${stats.total} tasks completed\n\n` +
            `Project Status: ✅ COMPLETE\n\n` +
            `🎯 What's next?\n` +
            `  • Deploy to production (if not already)\n` +
            `  • Write post-mortem / lessons learned\n` +
            `  • Gather user feedback\n` +
            `  • Plan next version/features\n` +
            `  • Celebrate your success! 🎊\n\n` +
            `Great work on completing this project! 🚀`,
          {
            projectId: input.projectId,
            projectName: response.projectName,
            state: 'all_complete',
            stats: structuredStats,
            recommended: null,
            alternatives: [],
          }
        )
      }

      // Handle no available tasks
      if (availableTasks.length === 0) {
        let output =
          `⚠️ No tasks currently available to start.\n\n` +
          `📊 Project Status:\n` +
          `  ${progressBar} ${progressPercent}%\n` +
          `  ✅ Completed: ${stats.done}/${stats.total}\n` +
          `  🔄 In Progress: ${stats.inProgress}\n` +
          `  🚫 Blocked: ${stats.blocked}\n` +
          `  ⏳ Waiting on Dependencies: ${stats.todo - availableTasks.length}\n`

        if (inProgressTasks.length > 0) {
          output += `\n🔄 Tasks In Progress:\n`
          for (const task of inProgressTasks) {
            output += `  • ${task.taskId}: ${task.name}\n`
          }
        }

        if (blockedTasks.length > 0) {
          output += `\n🚫 Blocked Tasks:\n`
          for (const task of blockedTasks) {
            output += `  • ${task.taskId}: ${task.name}\n`
          }
        }

        output +=
          `\n💡 Suggested Actions:\n` +
          `  1. Complete in-progress tasks\n` +
          `  2. Resolve blockers on blocked tasks\n` +
          `  3. Review dependencies if tasks seem stuck\n\n` +
          `💡 Commands:\n` +
          `  • planflow_task_list(projectId: "${input.projectId}", status: "IN_PROGRESS")\n` +
          `  • planflow_task_update(projectId: "${input.projectId}", taskId: "TX.Y", status: "DONE")`

        return createStructuredResult(output, {
          projectId: input.projectId,
          projectName: response.projectName,
          state: 'no_available',
          stats: structuredStats,
          recommended: null,
          alternatives: [],
        })
      }

      // Score all available tasks
      const scoredTasks = availableTasks
        .map((task) =>
          scoreTask(task, currentPhase, completedTaskIds, tasks, recentComplexity)
        )
        .sort((a, b) => b.score - a.score)

      // Get top recommendation and alternatives
      const recommended = scoredTasks[0]!
      const alternatives = scoredTasks.slice(1, 4)

      // Warning if many in-progress tasks
      let inProgressWarning = ''
      if (inProgressTasks.length >= 3) {
        inProgressWarning =
          `⚠️ You have ${inProgressTasks.length} tasks in progress.\n\n` +
          `💡 Tip: Consider finishing in-progress tasks before starting new ones:\n`
        for (const task of inProgressTasks.slice(0, 3)) {
          inProgressWarning += `  • ${task.taskId}: ${task.name}\n`
        }
        inProgressWarning +=
          `\nBenefits of finishing first:\n` +
          `  • Clear sense of progress\n` +
          `  • Unlock dependent tasks\n` +
          `  • Maintain focus and momentum\n\n` +
          `${'─'.repeat(60)}\n\n` +
          `Still want to start something new? Here's the recommendation:\n\n`
      }

      // Build recommendation output
      const complexityIndicator = getComplexityIndicator(recommended.complexity)

      let output =
        inProgressWarning +
        `🎯 Recommended Next Task\n\n` +
        `${recommended.taskId}: ${recommended.name}\n\n` +
        formatKeyValue({
          'Complexity': `${complexityIndicator} ${recommended.complexity}`,
          'Estimated': recommended.estimatedHours
            ? `${recommended.estimatedHours} hours`
            : 'Not estimated',
          'Phase': `${recommended.phase}`,
          'Dependencies': recommended.dependencies.length > 0
            ? `${recommended.dependencies.join(', ')} ✅`
            : 'None',
        }) +
        `\n\n✅ All dependencies completed\n`

      // Add reasoning
      if (recommended.reasons.length > 0) {
        output += `\n🎯 Why this task?\n`
        for (const reason of recommended.reasons) {
          output += `  • ${reason}\n`
        }
      }

      // Add description if available
      if (recommended.description) {
        output += `\n📝 Task Details:\n${recommended.description}\n`
      }

      // Add start command
      output +=
        `\n${'─'.repeat(60)}\n\n` +
        `Ready to start?\n` +
        `  planflow_task_update(projectId: "${input.projectId}", taskId: "${recommended.taskId}", status: "IN_PROGRESS")\n`

      // Add alternatives
      if (alternatives.length > 0) {
        output += `\n${'─'.repeat(60)}\n\n`
        output += `💡 Alternative Tasks (if this doesn't fit):\n\n`
        for (let i = 0; i < alternatives.length; i++) {
          const alt = alternatives[i]!
          const altComplexity = getComplexityIndicator(alt.complexity)
          output += `${i + 1}. ${alt.taskId}: ${alt.name}\n`
          output += `   ${altComplexity} ${alt.complexity}`
          if (alt.estimatedHours) {
            output += ` • ${alt.estimatedHours}h`
          }
          if (alt.unlocksCount > 0) {
            output += ` • Unlocks ${alt.unlocksCount} task${alt.unlocksCount > 1 ? 's' : ''}`
          }
          output += '\n'
        }
      }

      // Add progress context
      output += `\n${'─'.repeat(60)}\n\n`
      output += `📊 Progress: ${progressBar} ${progressPercent}%\n`
      output += `Total: ${stats.total} | ✅ ${stats.done} | 🔄 ${stats.inProgress} | 📋 ${stats.todo} | 🚫 ${stats.blocked}`

      // Add contextual tips based on progress
      if (progressPercent < 25) {
        output +=
          `\n\n🌟 Early Stage Tips:\n` +
          `  • Focus on foundation tasks\n` +
          `  • Don't skip setup steps\n` +
          `  • Document as you go`
      } else if (progressPercent >= 75) {
        output +=
          `\n\n🏁 Final Sprint:\n` +
          `  • Almost there!\n` +
          `  • Don't rush quality\n` +
          `  • Test thoroughly`
      }

      logger.info('Successfully generated task recommendation', {
        recommendedTask: recommended.taskId,
        score: recommended.score,
        alternativeCount: alternatives.length,
      })

      return createStructuredResult(output, {
        projectId: input.projectId,
        projectName: response.projectName,
        state: 'recommendation',
        stats: structuredStats,
        recommended: {
          taskId: recommended.taskId,
          name: recommended.name,
          complexity: recommended.complexity,
          estimatedHours: recommended.estimatedHours ?? null,
          dependencies: recommended.dependencies,
          phase: recommended.phase,
          score: recommended.score,
          reasons: recommended.reasons,
          unlocksCount: recommended.unlocksCount,
        },
        alternatives: alternatives.map((alt) => ({
          taskId: alt.taskId,
          name: alt.name,
          complexity: alt.complexity,
          estimatedHours: alt.estimatedHours ?? null,
          unlocksCount: alt.unlocksCount,
        })),
      })
    } catch (error) {
      logger.error('Failed to find next task', {
        error: String(error),
        projectId: input.projectId,
      })

      if (error instanceof AuthError) {
        return createErrorResult(
          '❌ Authentication error: Your session may have expired.\n\n' +
            'Please log out and log in again:\n' +
            '  1. planflow_logout()\n' +
            '  2. planflow_login(token: "your-new-token")\n\n' +
            'Get a new token at: https://planflow.tools/settings/api-tokens'
        )
      }

      if (error instanceof ApiError) {
        // Handle 404 specifically for project not found
        if (error.statusCode === 404) {
          return createErrorResult(
            `❌ Project not found: ${input.projectId}\n\n` +
              'Please check the project ID and try again.\n' +
              'Use planflow_projects() to list your available projects.'
          )
        }
        return createErrorResult(
          `❌ API error: ${error.message}\n\n` +
            'Please check your internet connection and try again.'
        )
      }

      // Generic error
      const message = error instanceof Error ? error.message : String(error)
      return createErrorResult(
        `❌ Failed to find next task: ${message}\n\n` +
          'Please try again or check your connection.'
      )
    }
  },
}
