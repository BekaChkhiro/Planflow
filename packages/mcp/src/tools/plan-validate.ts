/**
 * PlanFlow MCP Server — planflow_plan_validate
 *
 * Runs structural, quality, testing, and production-readiness checks
 * on a PROJECT_PLAN.md. Two input modes:
 *
 *   • content    — validate inline markdown (used during generation,
 *                  before the file is written or pushed)
 *   • projectId  — pull the latest plan from the cloud and validate
 *
 * The output is a structured report grouped by severity, with a
 * concrete fix suggestion per issue so the refiner or Claude can act
 * automatically.
 */

import { z } from 'zod'
import { getApiClient } from '../api-client.js'
import { isAuthenticated } from '../config.js'
import { AuthError, ApiError } from '../errors.js'
import { logger } from '../logger.js'
import { parsePlan } from '../plan/parser.js'
import type { PlanIssue, ValidationReport } from '../plan/types.js'
import { validatePlan, validateOutline, validatePhase } from '../plan/validator.js'
import {
  type ToolDefinition,
  createSuccessResult,
  createErrorResult,
} from './types.js'

const PlanValidateInputSchema = z
  .object({
    content: z
      .string()
      .min(1)
      .optional()
      .describe('Markdown content of PROJECT_PLAN.md to validate inline.'),
    projectId: z
      .string()
      .uuid()
      .optional()
      .describe('Cloud project UUID — fetches the plan from the cloud and validates it.'),
    failOnWarnings: z
      .boolean()
      .optional()
      .default(false)
      .describe('If true, the tool reports `ok: false` when warnings are present (not just errors).'),
    scope: z
      .enum(['full', 'outline', 'phase'])
      .optional()
      .default('full')
      .describe(
        'Which gate to run (staged authoring):\n' +
          '  • full (default): the whole plan — structure + tasks + production readiness.\n' +
          '  • outline: ONLY the phase skeleton (goals, exit criteria, numbering, non-goals). Does not require tasks to exist — the gate before decomposing phases.\n' +
          '  • phase: ONE phase in depth (its tasks, coverage, precision). Requires `phase`. The gate before moving to the next phase.'
      ),
    phase: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Phase number to validate when scope="phase".'),
  })
  .refine((i) => !!i.content || !!i.projectId, {
    message: 'Provide either `content` or `projectId`.',
  })
  .refine((i) => i.scope !== 'phase' || i.phase !== undefined, {
    message: 'scope="phase" requires a `phase` number.',
  })

type PlanValidateInput = z.infer<typeof PlanValidateInputSchema>

export const planValidateTool: ToolDefinition<PlanValidateInput> = {
  name: 'planflow_plan_validate',

  description: `Validate a PROJECT_PLAN.md against structural, quality, testing, and production-readiness rules.

This is the quality gate for plan authoring. Call it BEFORE writing a generated plan to disk, BEFORE syncing to the cloud, and ANY time you've added/edited tasks. Errors block shipping; warnings flag risks that bite at production.

Usage:
  planflow_plan_validate(content: "# My Plan...")            — inline mode
  planflow_plan_validate(projectId: "uuid")                  — fetch from cloud
  planflow_plan_validate(content: "...", failOnWarnings: true) — strict gate

Staged authoring (build the plan top-down, gating each level):
  planflow_plan_validate(content: "...", scope: "outline")       — gate 1: phase
        skeleton only (goals, exit criteria, numbering, non-goals). Tasks not
        required yet. Run this BEFORE decomposing phases into tasks.
  planflow_plan_validate(content: "...", scope: "phase", phase: 2) — gate 2: one
        phase in depth (its tasks, coverage, precision). Run before moving to
        the next phase, so errors are caught one phase at a time.
  planflow_plan_validate(content: "...")                         — gate 3: the
        whole plan (scope defaults to "full").

Checks performed:

Structural (errors — must fix):
  • Duplicate task IDs
  • Dependency cycles (T1.4 → T1.7 → T1.4)
  • Orphan dependencies (T2.3 → T9.9 which doesn't exist)
  • Phase ordering violations (Phase 1 task depends on a Phase 3 task)
  • Malformed task IDs / invalid phase numbers

Outline / structure (warnings — is the skeleton sound before tasks are filled?):
  • Phase with no goal (what milestone does it deliver?)
  • Phase with no exit criteria (when is it "done"?)
  • Plan with no non-goals (scope boundaries undefined)

Quality (warnings):
  • Phase imbalance (>10 tasks or empty phases)
  • Complexity skew (>70% marked "High")
  • Vague task names ("Setup stuff", "Misc work")
  • Missing/short descriptions
  • Missing estimated hours
  • Hours wildly out of band for stated complexity

Testing (warnings):
  • Feature tasks with no companion test task
  • Missing testing phase / no test tasks at all
  • Medium/High tasks without acceptance criteria

Traceability (warnings — does the plan cover what it set out to build?):
  • Declared feature (## Features) with no implementing task
  • Reports feature coverage: how many declared features have a task

Instruction precision (warnings — can an agent execute without guessing?):
  • No touchpoints — task names no files to create/edit
  • No contract — signatures, routes, request/response shape, or types unspecified
  • No constraints / non-goals on High-complexity tasks
  • Thin instructions — overall precision score below 50%
  Also reports an "Instruction precision" score (0-100%) per feature task
  plus a plan average, so you can see how agent-ready the plan is at a glance.

Production readiness (warnings):
  • No deployment task
  • No monitoring/logging task
  • No explicit error-handling task
  • No security/auth hardening task
  • No environment/secrets management task

Returns:
  • Pass/fail summary with totals
  • Per-issue list grouped by severity, each with a concrete fix

You must be logged in (with projectId mode) — but content mode is fully offline.`,

  inputSchema: PlanValidateInputSchema,

  async execute(input: PlanValidateInput): Promise<ReturnType<typeof createSuccessResult>> {
    logger.info('Validating plan', {
      mode: input.content ? 'inline' : 'cloud',
      projectId: input.projectId,
    })

    let content: string
    let projectName: string | undefined

    try {
      if (input.content) {
        content = input.content
      } else {
        if (!isAuthenticated()) {
          return createErrorResult(
            '❌ Not logged in.\n\n' +
              'projectId mode requires authentication. Either:\n' +
              '  • planflow_login(token: "your-api-token"), or\n' +
              '  • pass `content` directly to validate offline.'
          )
        }
        const client = getApiClient()
        const response = await client.getProjectPlan(input.projectId!)
        if (!response.plan) {
          return createErrorResult(
            `⚠️  Project "${response.projectName}" has no plan content yet.\n\n` +
              'Use planflow_sync(direction: "push", content: "...") to upload one,\n' +
              'or call planflow_plan_scaffold to generate a starting plan.'
          )
        }
        content = response.plan
        projectName = response.projectName
      }
    } catch (error) {
      return handleFetchError(error)
    }

    const plan = parsePlan(content)
    const scope = input.scope ?? 'full'
    const report =
      scope === 'outline'
        ? validateOutline(plan)
        : scope === 'phase'
          ? validatePhase(plan, input.phase!)
          : validatePlan(plan)

    const gateOk = input.failOnWarnings
      ? report.totals.errors === 0 && report.totals.warnings === 0
      : report.ok

    const output = formatReport(report, {
      gateOk,
      strict: input.failOnWarnings ?? false,
      projectName,
      scope,
      phase: input.phase,
    })

    logger.info('Plan validation finished', {
      ok: report.ok,
      errors: report.totals.errors,
      warnings: report.totals.warnings,
    })

    return createSuccessResult(output)
  },
}

function handleFetchError(error: unknown): ReturnType<typeof createErrorResult> {
  if (error instanceof AuthError) {
    return createErrorResult(
      '❌ Authentication error: Your session may have expired.\n\n' +
        'Run planflow_login again with a fresh token.'
    )
  }
  if (error instanceof ApiError) {
    if (error.statusCode === 404) {
      return createErrorResult(
        '❌ Project not found.\n\n' + 'Check the projectId or run planflow_projects.'
      )
    }
    return createErrorResult(`❌ API error: ${error.message}`)
  }
  const message = error instanceof Error ? error.message : String(error)
  return createErrorResult(`❌ Failed to fetch plan: ${message}`)
}

interface FormatOptions {
  gateOk: boolean
  strict: boolean
  projectName?: string
  scope?: 'full' | 'outline' | 'phase'
  phase?: number
}

function formatReport(report: ValidationReport, opts: FormatOptions): string {
  const lines: string[] = []
  const label =
    opts.scope === 'outline'
      ? 'Outline gate'
      : opts.scope === 'phase'
        ? `Phase ${opts.phase} gate`
        : 'Plan validation'
  const header = opts.gateOk
    ? `✅ ${label} passed`
    : report.totals.errors > 0
      ? `❌ ${label} FAILED — errors must be fixed`
      : `⚠️  ${label} passed with warnings`

  lines.push(header)
  if (opts.scope === 'outline') {
    lines.push('   (phase skeleton only — tasks not required yet)')
  } else if (opts.scope === 'phase') {
    lines.push('   (this phase in depth — the gate before the next phase)')
  }
  if (opts.projectName) lines.push(`   Project: ${opts.projectName}`)
  lines.push('')

  // Totals
  lines.push('📊 Summary')
  lines.push(`   Phases:    ${report.totals.phases}`)
  lines.push(`   Tasks:     ${report.totals.tasks}`)
  lines.push(`   Errors:    ${report.totals.errors}`)
  lines.push(`   Warnings:  ${report.totals.warnings}`)
  lines.push(`   Info:      ${report.totals.infos}`)
  lines.push('')

  // Instruction precision — how ready the plan is for an agent to
  // execute flawlessly, as a single number plus the weakest tasks.
  if (report.precision) {
    const { avgScore, scoredTasks, tasks } = report.precision
    const bar =
      avgScore >= 80 ? '🟢' : avgScore >= 60 ? '🟡' : '🔴'
    lines.push(`🎯 Instruction precision: ${bar} ${avgScore}% (avg across ${scoredTasks} feature task${scoredTasks === 1 ? '' : 's'})`)
    const weakest = tasks.filter((t) => t.score < 80).slice(0, 5)
    for (const t of weakest) {
      lines.push(`   • ${t.taskId}: ${t.score}% — missing: ${t.missing.join(', ')}`)
    }
    lines.push('')
  }

  // Feature coverage — does the plan deliver what it set out to?
  if (report.coverage && report.coverage.features > 0) {
    const { features, covered, uncovered } = report.coverage
    const icon = covered === features ? '🟢' : '🔴'
    lines.push(`🧭 Feature coverage: ${icon} ${covered}/${features} features have a task`)
    for (const f of uncovered.slice(0, 8)) {
      lines.push(`   • not covered: "${f}"`)
    }
    lines.push('')
  }

  if (report.issues.length === 0) {
    lines.push('🎯 No issues found. The plan is clean — safe to write/sync.')
    return lines.join('\n')
  }

  const groups: Array<['error' | 'warning' | 'info', string, string]> = [
    ['error', '❌ Errors (must fix)', 'errors'],
    ['warning', '⚠️  Warnings (should fix)', 'warnings'],
    ['info', 'ℹ️  Info (nice to fix)', 'infos'],
  ]

  for (const [severity, title] of groups) {
    const issues = report.issues.filter((i) => i.severity === severity)
    if (issues.length === 0) continue
    lines.push(title)
    for (const issue of issues) {
      lines.push(formatIssue(issue))
    }
    lines.push('')
  }

  if (opts.strict && report.totals.warnings > 0 && report.totals.errors === 0) {
    lines.push('🔒 Strict mode: warnings count as failures.')
  }

  lines.push('💡 Next steps:')
  if (report.totals.errors > 0) {
    lines.push('   • Fix errors first — they block shipping the plan.')
    lines.push('   • Run planflow_plan_refine to auto-fix what can be fixed.')
  } else if (report.totals.warnings > 0) {
    lines.push('   • Address warnings to make the plan production-ready.')
    lines.push('   • planflow_plan_refine can auto-fix some warnings.')
  }
  lines.push('   • Re-run planflow_plan_validate after fixes.')

  return lines.join('\n')
}

function formatIssue(issue: PlanIssue): string {
  const tag = issue.taskId
    ? `[${issue.taskId}] `
    : issue.phase !== undefined
      ? `[Phase ${issue.phase}] `
      : ''
  const body = `   • ${tag}${issue.message}`
  if (!issue.fix) return body
  return `${body}\n     ↳ ${issue.fix}`
}
