/**
 * PlanFlow MCP Server — planflow_plan_outline
 *
 * Stage 1 of checkpoint-based plan authoring: generate ONLY the plan
 * skeleton — the Brief plus phases (each with a goal + exit criteria),
 * no tasks. Runs the outline gate (validateOutline) on its own output
 * and tells the agent the next checkpoint: decompose ONE phase at a
 * time with planflow_phase_create, validating each with
 * planflow_plan_validate(scope:"phase").
 *
 * This is what makes plan creation staged instead of one-shot: lock the
 * structure, verify it, THEN fill phases — so errors are caught at the
 * level they occur instead of compounding.
 */

import { z } from 'zod'
import { logger } from '../logger.js'
import { buildOutlineMarkdown, type OutlineInput } from '../plan/outline.js'
import { parsePlan } from '../plan/parser.js'
import { validateOutline } from '../plan/validator.js'
import {
  type ToolDefinition,
  createSuccessResult,
  createErrorResult,
} from './types.js'

const OutlinePhaseSchema = z.object({
  number: z.number().int().positive().describe('Phase number (1, 2, 3 …), sequential.'),
  name: z.string().min(3).max(80).describe('Short phase name, e.g. "Foundation".'),
  goal: z
    .string()
    .min(15)
    .max(400)
    .describe('One sentence: the milestone this phase delivers.'),
  exitCriteria: z
    .array(z.string().min(5).max(300))
    .min(1, 'Each phase needs at least one exit criterion — the gate before the next phase.')
    .max(8)
    .describe('Testable conditions that mean the phase is "done".'),
  estimate: z.string().max(60).optional().describe('Free-form estimate like "1 week" or "16h".'),
})

const PlanOutlineInputSchema = z.object({
  projectName: z.string().min(1).max(120),
  description: z
    .string()
    .min(20, 'Description must be at least 20 characters — vague briefs produce vague plans.')
    .max(1000),
  targetUsers: z.string().min(1).max(300).optional(),
  projectType: z.string().min(1).max(60).optional(),
  nonGoals: z
    .array(z.string().min(3).max(300))
    .min(1, 'List at least one non-goal — explicit scope boundaries keep the plan from sprawling.')
    .max(15)
    .describe('What is explicitly OUT of scope for this project / milestone.'),
  successCriteria: z
    .array(z.string().min(5).max(300))
    .max(10)
    .optional()
    .describe('What "done" means for the whole project.'),
  features: z
    .array(z.string().min(3).max(120))
    .max(15)
    .optional()
    .describe('Core features the plan must deliver. Listed in a ## Core Features section and traced against tasks — every feature should map to at least one task.'),
  phases: z
    .array(OutlinePhaseSchema)
    .min(2, 'A plan needs at least two phases.')
    .max(12, 'Cap at 12 phases — group finer work into tasks within a phase.')
    .describe('The phase skeleton — names, goals, exit criteria, ordering. NO tasks yet.'),
})

type PlanOutlineInput = z.infer<typeof PlanOutlineInputSchema>

export const planOutlineTool: ToolDefinition<PlanOutlineInput> = {
  name: 'planflow_plan_outline',

  description: `Stage 1 of staged plan authoring: generate the plan SKELETON — the Brief plus phases (each with a goal + exit criteria), with NO tasks yet.

Use this to START a new plan instead of scaffolding everything at once. Building top-down — lock the structure, verify it, THEN fill phases one at a time — catches structural errors before they compound into dozens of mis-scoped tasks.

What it produces:
  • Overview + Non-Goals (+ Success Criteria) — the Brief / scope boundaries
  • Phases, each with **Goal** and **Exit Criteria**, in order
  • NO tasks — those come next, one phase at a time

It runs the OUTLINE GATE on its own output (validateOutline): phase goals,
exit criteria, sequential numbering, scope boundaries. The result tells you
whether the skeleton is sound before you go further.

Usage:
  planflow_plan_outline(
    projectName: "Acme App",
    description: "B2B inventory tool for SMB retailers with multi-store sync.",
    targetUsers: "Independent retail managers",
    projectType: "fullstack",
    nonGoals: ["No mobile app this milestone", "No third-party marketplace integrations yet"],
    successCriteria: ["Two stores stay in sync in production", "p95 API latency < 300ms"],
    phases: [
      { number: 1, name: "Foundation", goal: "Stand up repo, DB, auth, and CI so feature work can begin.", exitCriteria: ["Fresh clone builds + CI green", "Auth protects a route end-to-end"] },
      { number: 2, name: "Core Features", goal: "Deliver inventory CRUD and multi-store sync end-to-end.", exitCriteria: ["A store's inventory is editable and persists", "Two stores converge within 30s"] },
      { number: 3, name: "Testing & Launch", goal: "Prove it under test, ship to prod, make it observable.", exitCriteria: ["Coverage gate passes", "Deploy + rollback verified", "Alerts fire on simulated outage"] }
    ]
  )

THE STAGED FLOW (checkpoints):
  1. planflow_plan_outline(...)                       ← you are here (gate: outline)
  2. Show the user the skeleton; get sign-off.
  3. For EACH phase, in order:
       planflow_phase_create(content, number, name, tasks: [...])   — decompose it
       planflow_plan_validate(content, scope: "phase", phase: N)    — gate that phase
     Do not move to phase N+1 until phase N's gate passes.
  4. planflow_plan_validate(content)                  — final full gate
  5. Write PROJECT_PLAN.md, then planflow_sync(direction: "push").

Returns:
  • The skeleton PROJECT_PLAN.md content
  • The outline gate report (pass/fail + issues)`,

  inputSchema: PlanOutlineInputSchema,

  async execute(input: PlanOutlineInput): Promise<ReturnType<typeof createSuccessResult>> {
    logger.info('Building plan outline', {
      projectName: input.projectName,
      phases: input.phases.length,
    })

    try {
      // Reject duplicate phase numbers up front — clearer than letting
      // the gate flag it after the fact.
      const nums = input.phases.map((p) => p.number)
      const dupes = nums.filter((n, i) => nums.indexOf(n) !== i)
      if (dupes.length > 0) {
        return createErrorResult(
          `❌ Duplicate phase number(s): ${[...new Set(dupes)].join(', ')}.\n\n` +
            'Each phase needs a unique, sequential number (1, 2, 3 …).'
        )
      }

      const outlineInput: OutlineInput = {
        projectName: input.projectName,
        description: input.description,
        targetUsers: input.targetUsers,
        projectType: input.projectType,
        nonGoals: input.nonGoals,
        successCriteria: input.successCriteria,
        features: input.features,
        phases: input.phases,
      }

      const markdown = buildOutlineMarkdown(outlineInput)
      const report = validateOutline(parsePlan(markdown))

      const lines: string[] = []
      const gateIcon = report.ok ? '✅' : '❌'
      lines.push(`${gateIcon} Outline gate: ${report.ok ? 'passed' : 'FAILED'}`)
      lines.push('')
      lines.push('📊 Skeleton:')
      lines.push(`   Phases:   ${report.totals.phases}`)
      lines.push(`   Errors:   ${report.totals.errors}${report.totals.errors === 0 ? ' ✓' : ' ❌'}`)
      lines.push(`   Warnings: ${report.totals.warnings}`)
      lines.push('')

      if (report.issues.length > 0) {
        lines.push('Issues:')
        for (const issue of report.issues) {
          const tag =
            issue.phase !== undefined ? `[Phase ${issue.phase}] ` : ''
          lines.push(`   • ${tag}${issue.message}`)
          if (issue.fix) lines.push(`     ↳ ${issue.fix}`)
        }
        lines.push('')
      }

      lines.push('💡 Next checkpoint — decompose ONE phase at a time:')
      lines.push('   1. Show the user this skeleton; get sign-off on phases + scope.')
      lines.push('   2. For each phase in order:')
      lines.push('        planflow_phase_create(content, number, name, tasks: [...])')
      lines.push('        planflow_plan_validate(content, scope: "phase", phase: N)')
      lines.push('      Do not start phase N+1 until phase N\'s gate passes.')
      lines.push('   3. planflow_plan_validate(content) — final full gate.')
      lines.push('   4. Write PROJECT_PLAN.md, then planflow_sync(direction: "push").')
      lines.push('')
      lines.push('───────── PROJECT_PLAN.md (skeleton) ─────────')
      lines.push(markdown)
      lines.push('──────────────────────────────────────────────')

      return createSuccessResult(lines.join('\n'))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('Failed to build plan outline', { error: message })
      return createErrorResult(`❌ Failed to build plan outline: ${message}`)
    }
  },
}
