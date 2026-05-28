/**
 * PlanFlow MCP Server — planflow_task_create
 *
 * Adds a new task to an existing PROJECT_PLAN.md (passed as `content`),
 * returning the updated markdown. This is the right tool when you've
 * already scaffolded a plan and want to add one more task — it
 * enforces the quality bar that makes plans production-ready:
 *
 *   • Description ≥50 chars (no vague "TODO" tasks)
 *   • Acceptance criteria required for Medium/High complexity
 *   • Estimated hours required
 *   • Auto-assigns the next free task ID within the target phase
 *   • Auto-detects vague names and rejects them
 *
 * Cloud sync is a follow-up step: after task-create returns updated
 * markdown, call planflow_sync(direction: "push", content: ...) to
 * persist.
 */

import { z } from 'zod'
import { logger } from '../logger.js'
import { parsePlan } from '../plan/parser.js'
import { serializePlan } from '../plan/serializer.js'
import { validatePlan } from '../plan/validator.js'
import { composeDescription } from '../plan/task-spec.js'
import type { TaskComplexity, TaskNode, TaskStatus } from '../plan/types.js'
import {
  type ToolDefinition,
  createSuccessResult,
  createErrorResult,
} from './types.js'

// Hard-reject only unambiguously vague tokens. Words like "other" and
// "various" can appear in legitimate names ("Configure other providers",
// "Handle various upload edge cases") so they are not hard-rejected
// here. The validator still flags them as a soft warning.
const VAGUE_NAME = /\b(stuff|misc|miscellaneous|tbd|todo|fixme)\b/i

const TaskCreateInputSchema = z.object({
  content: z
    .string()
    .min(1)
    .describe('Current PROJECT_PLAN.md content. The tool returns updated content with the new task inserted.'),
  phase: z
    .number()
    .int()
    .positive()
    .describe('Phase number to insert into (e.g. 2). The phase must already exist in the plan.'),
  name: z
    .string()
    .min(5, 'Task name must be at least 5 characters.')
    .max(120, 'Task name must be at most 120 characters.')
    .refine((n) => !VAGUE_NAME.test(n), {
      message: 'Task name is too vague — use a "Verb + Noun" phrase like "Implement JWT login endpoint".',
    })
    .describe('Verb + noun phrase. No "Misc", "TODO", "Stuff".'),
  description: z
    .string()
    .min(50, 'Description must be at least 50 characters — list the concrete sub-steps as bullets.')
    .max(3000)
    .describe('Bullet list (one per line) covering the goal and concrete work. Structured spec fields below compose into this.'),
  touchpoints: z
    .array(z.string().min(1).max(200))
    .optional()
    .describe('Files to create/edit, e.g. ["create src/auth/login.ts", "edit src/routes/index.ts"]. Tells the agent WHERE the change goes — strongly recommended.'),
  contract: z
    .string()
    .min(1)
    .max(800)
    .optional()
    .describe('The interface contract: exact function signature, API route + request/response shape, status codes, or data-model fields. Tells the agent WHAT to build — strongly recommended for Medium/High.'),
  steps: z
    .array(z.string().min(1).max(300))
    .optional()
    .describe('Ordered implementation steps. Each becomes a numbered bullet.'),
  constraints: z
    .array(z.string().min(1).max(300))
    .optional()
    .describe('What NOT to touch, invariants to preserve, explicit out-of-scope items. Prevents scope creep — recommended for High complexity.'),
  verify: z
    .string()
    .min(1)
    .max(400)
    .optional()
    .describe('Runnable command(s) that prove the task is done, e.g. "pnpm test src/auth && pnpm typecheck".'),
  complexity: z
    .enum(['Low', 'Medium', 'High'])
    .describe('Low ≈ 1-3h, Medium ≈ 4-8h, High ≈ 8-20h.'),
  estimatedHours: z
    .number()
    .positive()
    .max(100)
    .describe('Effort estimate in hours. Required.'),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED']).optional().default('TODO'),
  dependencies: z
    .array(z.string().regex(/^T\d+(?:\.\d+)?$/i, 'Each dep must look like "T1.2".'))
    .optional()
    .default([]),
  acceptanceCriteria: z
    .array(z.string().min(5).max(300))
    .optional()
    .describe('Required for Medium/High complexity. 2-5 testable bullets.'),
  testTaskId: z
    .string()
    .regex(/^T\d+(?:\.\d+)?$/i)
    .optional()
    .describe('Pointer to the companion test task that covers this one.'),
  insertAfterTaskId: z
    .string()
    .regex(/^T\d+(?:\.\d+)?$/i)
    .optional()
    .describe('Insert immediately after this task in the phase. Defaults to end.'),
})

type TaskCreateInput = z.infer<typeof TaskCreateInputSchema>

export const taskCreateTool: ToolDefinition<TaskCreateInput> = {
  name: 'planflow_task_create',

  description: `Add a new task to a PROJECT_PLAN.md, returning the updated markdown.

This is a STRUCTURED, validated insert. The tool refuses inputs that would produce a low-quality task:
  • Vague names ("Misc", "TODO", "Stuff") are rejected
  • Descriptions <50 chars are rejected
  • Medium/High tasks without acceptance criteria are rejected
  • Estimated hours are required

PRECISE TASKS (do this): a task is agent-executable when it spells out, not just
describes, the work. Beyond name/description/acceptanceCriteria, pass the spec fields:
  • touchpoints — which files to create/edit (WHERE)
  • contract    — signatures / API route + request/response shape / types (WHAT)
  • steps       — the ordered implementation outline
  • constraints — what NOT to touch, invariants, out-of-scope (prevents scope creep)
  • verify      — a runnable command that proves it's done
They compose into the description as labeled sections and drive an Instruction-Precision
score (0-100%) reported back. Aim for 🟢 80%+ on Medium/High tasks.

Usage:
  planflow_task_create(
    content: <current PROJECT_PLAN.md>,
    phase: 2,
    name: "Implement multi-store sync engine",
    description: "Keep two store inventories converged in near-real-time.",
    touchpoints: ["create src/sync/engine.ts", "edit src/sync/index.ts", "use src/db/inventory.ts"],
    contract: "syncStores(localId, remoteId): Promise<SyncResult>; conflict = last-write-wins by updatedAt; emits 'sync:status' events",
    steps: [
      "Diff local inventory vs. server snapshot",
      "Resolve conflicts using last-write-wins with audit trail",
      "Retry transient failures with backoff",
      "Emit sync status to the UI"
    ],
    constraints: ["do not change the existing inventory schema", "no UI changes in this task (separate task)"],
    verify: "pnpm test src/sync && pnpm typecheck",
    complexity: "High",
    estimatedHours: 12,
    dependencies: ["T2.1", "T2.2"],
    acceptanceCriteria: [
      "Two stores converge to identical state within 30s",
      "Conflicting writes apply last-write-wins with audit trail",
      "Sync errors surface in UI with retry button"
    ],
    testTaskId: "T4.1"
  )

Auto-behavior:
  • Picks the next free task ID in the target phase (e.g. T2.5)
  • Inserts at end of phase (or after \`insertAfterTaskId\` if given)
  • Composes spec fields into the description; validates the resulting plan
  • Reports the new task's Instruction-Precision score + what's still missing

Returns:
  • Updated PROJECT_PLAN.md content
  • Validation summary + precision score of the resulting plan

Follow-up: planflow_sync(direction: "push", content: <returned markdown>)`,

  inputSchema: TaskCreateInputSchema,

  async execute(input: TaskCreateInput): Promise<ReturnType<typeof createSuccessResult>> {
    logger.info('Creating task', { phase: input.phase, name: input.name })

    try {
      const tree = parsePlan(input.content)
      const phase = tree.phases.find((p) => p.number === input.phase)
      if (!phase) {
        return createErrorResult(
          `❌ Phase ${input.phase} does not exist in the plan.\n\n` +
            `Available phases: ${tree.phases.map((p) => `Phase ${p.number} (${p.name})`).join(', ') || 'none'}\n` +
            'Use planflow_phase_create to add a new phase, or pick an existing one.'
        )
      }

      // Quality gate: Medium/High needs acceptance criteria
      if (
        input.complexity !== 'Low' &&
        (!input.acceptanceCriteria || input.acceptanceCriteria.length === 0)
      ) {
        return createErrorResult(
          `❌ Tasks with complexity "${input.complexity}" require acceptance criteria.\n\n` +
            'Add 2-5 testable bullets via `acceptanceCriteria: [...]`. Example:\n' +
            '  acceptanceCriteria: [\n' +
            '    "Endpoint returns 201 on valid input",\n' +
            '    "Returns 400 with field-level errors on invalid input",\n' +
            '    "Idempotent — duplicate requests do not double-insert"\n' +
            '  ]'
        )
      }

      // Hours sanity vs complexity
      const band = expectedHours(input.complexity)
      if (input.estimatedHours > band.max * 2.5) {
        return createErrorResult(
          `❌ ${input.estimatedHours}h is too high for complexity "${input.complexity}" (expected ${band.min}-${band.max}h).\n\n` +
            'Either split this into multiple tasks or raise complexity.'
        )
      }

      // Pick next free task ID in this phase
      const usedNumbers = new Set<number>()
      for (const t of phase.tasks) {
        const m = t.taskId.match(/^T\d+\.(\d+)$/i)
        if (m) usedNumbers.add(Number.parseInt(m[1] ?? '0', 10))
      }
      let nextNum = 1
      while (usedNumbers.has(nextNum)) nextNum++
      const newTaskId = `T${input.phase}.${nextNum}`

      // Verify all deps exist
      const allTaskIds = new Set(
        tree.phases.flatMap((p) => p.tasks.map((t) => t.taskId.toUpperCase()))
      )
      const missingDeps = (input.dependencies ?? []).filter(
        (d) => !allTaskIds.has(d.toUpperCase())
      )
      if (missingDeps.length > 0) {
        return createErrorResult(
          `❌ Dependency task(s) not found: ${missingDeps.join(', ')}\n\n` +
            'Each dep must reference an existing task ID. Tasks in this plan:\n' +
            Array.from(allTaskIds).sort().join(', ')
        )
      }

      // Build & insert. Structured spec fields (touchpoints/contract/
      // steps/constraints/verify) compose into the description as labeled
      // markdown sections — this is what makes the task precise enough for
      // an agent to execute without guessing.
      const composedDescription = composeDescription(input.description, {
        touchpoints: input.touchpoints,
        contract: input.contract,
        steps: input.steps,
        constraints: input.constraints,
        verify: input.verify,
      })
      const newTask: TaskNode = {
        taskId: newTaskId,
        phase: input.phase,
        name: input.name,
        description: composedDescription,
        status: input.status as TaskStatus,
        complexity: input.complexity as TaskComplexity,
        estimatedHours: input.estimatedHours,
        dependencies: (input.dependencies ?? []).map((d) => d.toUpperCase()),
        acceptanceCriteria: input.acceptanceCriteria,
        testTaskId: input.testTaskId,
      }

      if (input.insertAfterTaskId) {
        const idx = phase.tasks.findIndex(
          (t) => t.taskId.toUpperCase() === input.insertAfterTaskId!.toUpperCase()
        )
        if (idx < 0) {
          return createErrorResult(
            `❌ insertAfterTaskId "${input.insertAfterTaskId}" not found in Phase ${input.phase}.\n\n` +
              `Available task IDs in this phase: ${phase.tasks.map((t) => t.taskId).join(', ') || '(none)'}\n` +
              'Pass a valid taskId or omit `insertAfterTaskId` to append.'
          )
        }
        phase.tasks.splice(idx + 1, 0, newTask)
      } else {
        phase.tasks.push(newTask)
      }

      const updated = serializePlan(tree)
      const report = validatePlan(parsePlan(updated))

      const lines: string[] = []
      lines.push(`✅ Task ${newTaskId} added to Phase ${input.phase} (${phase.name}).`)
      lines.push('')
      lines.push('📊 Plan now:')
      lines.push(`   Phases:   ${report.totals.phases}`)
      lines.push(`   Tasks:    ${report.totals.tasks}`)
      lines.push(`   Errors:   ${report.totals.errors}${report.totals.errors === 0 ? ' ✓' : ' ❌'}`)
      lines.push(`   Warnings: ${report.totals.warnings}`)
      lines.push('')
      if (report.totals.errors > 0) {
        lines.push('⚠️  The insert introduced validation errors:')
        for (const issue of report.issues.filter((i) => i.severity === 'error')) {
          lines.push(`   • ${issue.message}`)
        }
        lines.push('')
      }

      // Instruction-precision feedback for the task just created — tells
      // the author whether it's agent-ready or still needs specifics.
      const precision = report.precision?.tasks.find((t) => t.taskId === newTaskId)
      if (precision) {
        const bar = precision.score >= 80 ? '🟢' : precision.score >= 50 ? '🟡' : '🔴'
        lines.push(`🎯 Instruction precision: ${bar} ${precision.score}%`)
        if (precision.missing.length > 0) {
          lines.push(`   Add for a sharper spec: ${precision.missing.join(', ')}`)
        }
        lines.push('')
      }

      // Autonomy — can this task be autoExecuted, or does it need a human?
      const verdict = report.autonomy?.verdicts.find((v) => v.taskId === newTaskId)
      if (verdict) {
        const icon = verdict.level === 'agent' ? '🤖' : verdict.level === 'assisted' ? '🤝' : '🧑'
        lines.push(`${icon} Autonomy: ${verdict.level}`)
        if (verdict.level === 'human') {
          lines.push(`   Human-only — ${verdict.blockers.join('; ')}. autoExecute won't complete it.`)
        } else if (verdict.level === 'assisted') {
          lines.push(`   ${verdict.reasons[0] ?? 'Pair or review — too thin to run unattended.'}`)
        } else {
          lines.push(`   Safe to run: planflow_task_start(taskId: "${newTaskId}", autoExecute: true)`)
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
      logger.error('Failed to create task', { error: message })
      return createErrorResult(`❌ Failed to create task: ${message}`)
    }
  },
}

function expectedHours(complexity: 'Low' | 'Medium' | 'High'): {
  min: number
  max: number
} {
  switch (complexity) {
    case 'Low':
      return { min: 1, max: 3 }
    case 'Medium':
      return { min: 4, max: 8 }
    case 'High':
      return { min: 8, max: 20 }
  }
}

