/**
 * PlanFlow MCP Server — planflow_plan_scaffold
 *
 * Generates a production-ready PROJECT_PLAN.md from a structured
 * input (project name, type, stack, features, flags). The output is
 * guaranteed to:
 *
 *   • Include testing strategy & production-readiness sections
 *   • Pair every Medium/High feature task with a test task pointer
 *   • Pass planflow_plan_validate with zero errors out of the box
 *
 * Workflow:
 *   1. Gather info from the user (planNew skill does this)
 *   2. planflow_plan_scaffold(...)              ← this tool
 *   3. planflow_plan_validate(content: ...)
 *   4. Write PROJECT_PLAN.md
 *   5. planflow_sync(direction: "push")
 */

import { z } from 'zod'
import { logger } from '../logger.js'
import { scaffoldPlan } from '../plan/scaffold.js'
import { parsePlan } from '../plan/parser.js'
import { validatePlan } from '../plan/validator.js'
import type { ScaffoldInput } from '../plan/types.js'
import {
  type ToolDefinition,
  createSuccessResult,
  createErrorResult,
} from './types.js'

const PROJECT_TYPES = [
  'fullstack',
  'backend-api',
  'frontend-spa',
  'mobile',
  'cli',
  'library',
  'generic',
] as const

const PlanScaffoldInputSchema = z.object({
  projectName: z.string().min(1).max(120),
  projectType: z.enum(PROJECT_TYPES),
  description: z
    .string()
    .min(20, 'Description must be at least 20 characters — vague descriptions produce vague plans.')
    .max(1000),
  targetUsers: z.string().min(1).max(300).optional(),
  features: z
    .array(z.string().min(3).max(120))
    .min(1, 'At least one core feature is required.')
    .max(10, 'Cap features at 10 — split into milestones if you have more.')
    .describe('3-7 core MVP features, each as a short noun phrase.'),
  stack: z
    .object({
      frontend: z.string().optional(),
      backend: z.string().optional(),
      database: z.string().optional(),
      hosting: z.string().optional(),
      language: z.string().optional(),
    })
    .default({}),
  flags: z
    .object({
      auth: z.boolean().optional(),
      realtime: z.boolean().optional(),
      fileUploads: z.boolean().optional(),
      payments: z.boolean().optional(),
      notifications: z.boolean().optional(),
    })
    .default({}),
})

type PlanScaffoldInput = z.infer<typeof PlanScaffoldInputSchema>

export const planScaffoldTool: ToolDefinition<PlanScaffoldInput> = {
  name: 'planflow_plan_scaffold',

  description: `Generate a production-ready PROJECT_PLAN.md skeleton from structured inputs.

Use this INSTEAD of hand-writing a plan from scratch. The output is guaranteed to:
  • Include a Testing Strategy section (unit / integration / E2E / coverage gate)
  • Include a Production Readiness checklist (deploy / monitor / errors / security / env)
  • Pair feature tasks with test tasks (via **Test Task**: T<id>)
  • Include security hardening, error handling, monitoring, and deployment tasks
  • Pass planflow_plan_validate with zero errors

Usage:
  planflow_plan_scaffold(
    projectName: "Acme App",
    projectType: "fullstack",
    description: "B2B inventory tool for SMB retailers, with multi-store sync.",
    targetUsers: "Independent retail managers (5-50 employees)",
    features: ["Inventory CRUD", "Multi-store sync", "Sales reports"],
    stack: { frontend: "React", backend: "Node + Hono", database: "PostgreSQL", hosting: "Railway" },
    flags: { auth: true, realtime: true }
  )

Required:
  • projectName        Project display name
  • projectType        fullstack | backend-api | frontend-spa | mobile | cli | library | generic
  • description        ≥20 chars — what the project is, plainly
  • features           1-10 short feature names (core MVP only)

Optional:
  • targetUsers        Audience
  • stack              { frontend, backend, database, hosting, language }
  • flags              { auth, realtime, fileUploads, payments, notifications }

Returns:
  • Full PROJECT_PLAN.md content as a markdown string
  • Self-validation report (the tool validates its own output before returning)

After this:
  1. Show the user the generated plan (or write directly to PROJECT_PLAN.md)
  2. Run planflow_plan_validate(content: ...) — should pass cleanly
  3. planflow_sync(direction: "push", content: ...) to upload to the cloud`,

  inputSchema: PlanScaffoldInputSchema,

  async execute(input: PlanScaffoldInput): Promise<ReturnType<typeof createSuccessResult>> {
    logger.info('Scaffolding plan', {
      projectName: input.projectName,
      projectType: input.projectType,
      features: input.features.length,
    })

    try {
      const scaffoldInput: ScaffoldInput = {
        projectName: input.projectName,
        projectType: input.projectType,
        description: input.description,
        targetUsers: input.targetUsers,
        features: input.features,
        stack: input.stack,
        flags: input.flags,
      }

      const markdown = scaffoldPlan(scaffoldInput)

      // Self-validate — refuse to return a plan that doesn't pass our
      // own bar. If the scaffolder produces errors, that's a bug in
      // the scaffolder; surface it loudly.
      const tree = parsePlan(markdown)
      const report = validatePlan(tree)

      if (report.totals.errors > 0) {
        logger.error('Scaffolded plan failed self-validation', {
          errors: report.totals.errors,
        })
        return createErrorResult(
          '❌ Internal error: scaffolded plan failed self-validation.\n\n' +
            'This is a bug in planflow_plan_scaffold. Errors:\n' +
            report.issues
              .filter((i) => i.severity === 'error')
              .map((i) => `  • ${i.message}`)
              .join('\n')
        )
      }

      const lines: string[] = []
      lines.push('✅ Plan scaffolded successfully.')
      lines.push('')
      lines.push('📊 Generated plan:')
      lines.push(`   Phases:   ${report.totals.phases}`)
      lines.push(`   Tasks:    ${report.totals.tasks}`)
      lines.push(`   Errors:   ${report.totals.errors} ✓`)
      lines.push(`   Warnings: ${report.totals.warnings}`)
      lines.push('')
      lines.push('💡 Next steps:')
      lines.push('   1. Review the plan below — adjust to taste.')
      lines.push('   2. Write to PROJECT_PLAN.md (use the Write tool).')
      lines.push('   3. planflow_plan_validate(content: ...) — should pass.')
      lines.push('   4. planflow_sync(projectId, direction: "push", content: ...).')
      lines.push('')
      lines.push('───────── PROJECT_PLAN.md ─────────')
      lines.push(markdown)
      lines.push('───────────────────────────────────')

      return createSuccessResult(lines.join('\n'))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('Failed to scaffold plan', { error: message })
      return createErrorResult(`❌ Failed to scaffold plan: ${message}`)
    }
  },
}
