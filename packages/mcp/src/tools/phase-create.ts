/**
 * PlanFlow MCP Server — planflow_phase_create
 *
 * Inserts a new phase with N tasks in a single call. Each task is
 * validated the same way planflow_task_create validates individual
 * tasks. The bulk form is useful when the user is breaking a new
 * milestone into its constituent work — typing one task at a time
 * burns Claude's attention.
 */

import { z } from 'zod'
import { logger } from '../logger.js'
import { parsePlan } from '../plan/parser.js'
import { serializePlan } from '../plan/serializer.js'
import { validatePlan } from '../plan/validator.js'
import { composeDescription } from '../plan/task-spec.js'
import type { PhaseNode, TaskNode } from '../plan/types.js'
import {
  type ToolDefinition,
  createSuccessResult,
  createErrorResult,
} from './types.js'

// Mirror task-create.ts — only hard-reject unambiguously vague names.
const VAGUE_NAME = /\b(stuff|misc|miscellaneous|tbd|todo|fixme)\b/i

const TaskSpec = z.object({
  name: z
    .string()
    .min(5)
    .max(120)
    .refine((n) => !VAGUE_NAME.test(n), {
      message: 'Vague task name — use Verb + Noun.',
    }),
  description: z.string().min(50).max(3000),
  // Precise-spec fields — compose into the description as labeled sections
  // so each task is agent-executable without guessing. Strongly recommended
  // for Medium/High tasks; they drive the Instruction-Precision score.
  touchpoints: z.array(z.string().min(1).max(200)).optional(),
  contract: z.string().min(1).max(800).optional(),
  steps: z.array(z.string().min(1).max(300)).optional(),
  constraints: z.array(z.string().min(1).max(300)).optional(),
  verify: z.string().min(1).max(400).optional(),
  complexity: z.enum(['Low', 'Medium', 'High']),
  estimatedHours: z.number().positive().max(100),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED']).optional().default('TODO'),
  dependencies: z
    .array(z.string().regex(/^T\d+(?:\.\d+)?$/i))
    .optional()
    .default([]),
  acceptanceCriteria: z.array(z.string().min(5).max(300)).optional(),
  testTaskId: z.string().regex(/^T\d+(?:\.\d+)?$/i).optional(),
})

const PhaseCreateInputSchema = z.object({
  content: z.string().min(1),
  number: z
    .number()
    .int()
    .positive()
    .describe('Phase number to assign. Must not collide with an existing phase.'),
  name: z.string().min(3).max(80),
  estimate: z
    .string()
    .max(60)
    .optional()
    .describe('Free-form estimate like "16h" or "1 week" — appears in the phase header.'),
  insertAfterPhase: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Insert immediately after this phase number. Defaults to end of plan.'),
  tasks: z
    .array(TaskSpec)
    .min(1, 'A phase must contain at least one task.')
    .max(15, 'Cap a single phase at 15 tasks — split it if you have more.'),
})

type PhaseCreateInput = z.infer<typeof PhaseCreateInputSchema>

export const phaseCreateTool: ToolDefinition<PhaseCreateInput> = {
  name: 'planflow_phase_create',

  description: `Add a new phase with N tasks to a PROJECT_PLAN.md in a single call.

Same quality bar as planflow_task_create, applied to every task in the bulk insert:
  • Vague names rejected
  • Descriptions ≥50 chars required
  • Medium/High tasks must include acceptance criteria
  • Estimated hours required
  • Phase number must not collide with an existing phase

For precise, agent-executable tasks, also give each task the spec fields —
touchpoints (files), contract (signatures/route/shape/types), steps (ordered),
constraints (what NOT to touch), verify (a runnable command). They compose into
the description and drive a per-task Instruction-Precision score reported back.

Usage:
  planflow_phase_create(
    content: <current plan>,
    number: 5,
    name: "Launch & Beta",
    estimate: "1 week",
    insertAfterPhase: 4,
    tasks: [
      {
        name: "Recruit 20 beta users",
        description: "  - Source from waiting list\\n  - Send onboarding email\\n  - Track activation",
        complexity: "Low",
        estimatedHours: 3
      },
      {
        name: "Set up product analytics",
        description: "Instrument the app so activation and conversion are measurable.",
        touchpoints: ["create src/analytics/client.ts", "edit src/app/layout.tsx"],
        contract: "track(event: string, props?: Record<string, unknown>): void; events: signup, activate, convert",
        steps: ["Wire PostHog/Mixpanel client", "Define key events", "Build conversion dashboard"],
        constraints: ["never send PII (email, name) as event props"],
        verify: "pnpm test src/analytics",
        complexity: "Medium",
        estimatedHours: 6,
        acceptanceCriteria: [
          "Activation funnel visible in dashboard",
          "PII is not sent to analytics provider"
        ]
      }
    ]
  )

Auto-behavior:
  • Task IDs assigned sequentially: T<number>.1, T<number>.2, ...
  • Dependencies are validated against existing + sibling tasks
  • The resulting plan is validated before return — refuses on errors

Returns:
  • Updated PROJECT_PLAN.md content
  • Validation summary

Follow-up: planflow_sync(direction: "push", content: <returned>) to persist.`,

  inputSchema: PhaseCreateInputSchema,

  async execute(input: PhaseCreateInput): Promise<ReturnType<typeof createSuccessResult>> {
    logger.info('Creating phase', {
      number: input.number,
      name: input.name,
      taskCount: input.tasks.length,
    })

    try {
      const tree = parsePlan(input.content)

      if (tree.phases.some((p) => p.number === input.number)) {
        return createErrorResult(
          `❌ Phase ${input.number} already exists.\n\n` +
            `Existing phases: ${tree.phases.map((p) => `${p.number}: ${p.name}`).join(', ')}`
        )
      }

      // Build sibling task ID set for dep validation
      const existingIds = new Set(
        tree.phases.flatMap((p) => p.tasks.map((t) => t.taskId.toUpperCase()))
      )
      const newTaskIds: string[] = input.tasks.map(
        (_, i) => `T${input.number}.${i + 1}`
      )
      const allKnown = new Set([
        ...existingIds,
        ...newTaskIds.map((id) => id.toUpperCase()),
      ])

      // Per-task validation
      const builtTasks: TaskNode[] = []
      for (let i = 0; i < input.tasks.length; i++) {
        const t = input.tasks[i]!
        const taskId = newTaskIds[i]!

        if (
          t.complexity !== 'Low' &&
          (!t.acceptanceCriteria || t.acceptanceCriteria.length === 0)
        ) {
          return createErrorResult(
            `❌ Task ${taskId} ("${t.name}") is ${t.complexity} complexity but has no acceptance criteria.\n\n` +
              'Add 2-5 testable bullets under `acceptanceCriteria` for every Medium/High task.'
          )
        }

        const band = expectedHours(t.complexity)
        if (t.estimatedHours > band.max * 2.5) {
          return createErrorResult(
            `❌ Task ${taskId}: ${t.estimatedHours}h is too high for ${t.complexity} (expected ${band.min}-${band.max}h).`
          )
        }

        const missingDeps = t.dependencies.filter(
          (d) => !allKnown.has(d.toUpperCase())
        )
        if (missingDeps.length > 0) {
          return createErrorResult(
            `❌ Task ${taskId} depends on unknown task(s): ${missingDeps.join(', ')}`
          )
        }

        builtTasks.push({
          taskId,
          phase: input.number,
          name: t.name,
          description: composeDescription(t.description, {
            touchpoints: t.touchpoints,
            contract: t.contract,
            steps: t.steps,
            constraints: t.constraints,
            verify: t.verify,
          }),
          status: t.status,
          complexity: t.complexity,
          estimatedHours: t.estimatedHours,
          dependencies: t.dependencies.map((d) => d.toUpperCase()),
          acceptanceCriteria: t.acceptanceCriteria,
          testTaskId: t.testTaskId,
        })
      }

      const newPhase: PhaseNode = {
        number: input.number,
        name: input.name,
        estimate: input.estimate,
        tasks: builtTasks,
      }

      if (input.insertAfterPhase !== undefined) {
        const idx = tree.phases.findIndex(
          (p) => p.number === input.insertAfterPhase
        )
        if (idx < 0) {
          return createErrorResult(
            `❌ insertAfterPhase ${input.insertAfterPhase} not found.\n\n` +
              `Existing phases: ${tree.phases.map((p) => p.number).join(', ') || '(none)'}\n` +
              'Pass a valid phase number or omit `insertAfterPhase` to append.'
          )
        }
        tree.phases.splice(idx + 1, 0, newPhase)
      } else {
        tree.phases.push(newPhase)
      }

      const updated = serializePlan(tree)
      const report = validatePlan(parsePlan(updated))

      const lines: string[] = []
      lines.push(
        `✅ Phase ${input.number} (${input.name}) added with ${builtTasks.length} task(s).`
      )
      lines.push('')
      lines.push('📊 Plan now:')
      lines.push(`   Phases:   ${report.totals.phases}`)
      lines.push(`   Tasks:    ${report.totals.tasks}`)
      lines.push(`   Errors:   ${report.totals.errors}${report.totals.errors === 0 ? ' ✓' : ' ❌'}`)
      lines.push(`   Warnings: ${report.totals.warnings}`)
      lines.push('')
      if (report.totals.errors > 0) {
        lines.push('⚠️  The insert introduced errors:')
        for (const issue of report.issues.filter((i) => i.severity === 'error')) {
          lines.push(`   • ${issue.message}`)
        }
        lines.push('')
      }

      // Instruction-precision feedback for the tasks just created.
      const newIds = new Set(newTaskIds.map((id) => id.toUpperCase()))
      const newScores = (report.precision?.tasks ?? []).filter((t) =>
        newIds.has(t.taskId.toUpperCase())
      )
      if (newScores.length > 0) {
        const avg = Math.round(
          newScores.reduce((acc, s) => acc + s.score, 0) / newScores.length
        )
        const bar = avg >= 80 ? '🟢' : avg >= 50 ? '🟡' : '🔴'
        lines.push(`🎯 Instruction precision (new feature tasks): ${bar} ${avg}%`)
        for (const s of newScores.filter((t) => t.score < 80)) {
          lines.push(`   • ${s.taskId}: ${s.score}% — add: ${s.missing.join(', ')}`)
        }
        lines.push('')
      }

      lines.push('💡 Next: planflow_sync(direction: "push", content: <updated>) to persist.')
      lines.push('')
      lines.push('───────── Updated PROJECT_PLAN.md ─────────')
      lines.push(updated)
      lines.push('───────────────────────────────────────────')

      return createSuccessResult(lines.join('\n'))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('Failed to create phase', { error: message })
      return createErrorResult(`❌ Failed to create phase: ${message}`)
    }
  },
}

function expectedHours(c: 'Low' | 'Medium' | 'High'): { min: number; max: number } {
  switch (c) {
    case 'Low':
      return { min: 1, max: 3 }
    case 'Medium':
      return { min: 4, max: 8 }
    case 'High':
      return { min: 8, max: 20 }
  }
}
