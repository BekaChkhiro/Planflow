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
import { validatePlan } from '../plan/validator.js'
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
  })
  .refine((i) => !!i.content || !!i.projectId, {
    message: 'Provide either `content` or `projectId`.',
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

Checks performed:

Structural (errors — must fix):
  • Duplicate task IDs
  • Dependency cycles (T1.4 → T1.7 → T1.4)
  • Orphan dependencies (T2.3 → T9.9 which doesn't exist)
  • Phase ordering violations (Phase 1 task depends on a Phase 3 task)
  • Malformed task IDs / invalid phase numbers

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
    const report = validatePlan(plan)

    const gateOk = input.failOnWarnings
      ? report.totals.errors === 0 && report.totals.warnings === 0
      : report.ok

    const output = formatReport(report, {
      gateOk,
      strict: input.failOnWarnings ?? false,
      projectName,
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
}

function formatReport(report: ValidationReport, opts: FormatOptions): string {
  const lines: string[] = []
  const header = opts.gateOk
    ? '✅ Plan validation passed'
    : report.totals.errors > 0
      ? '❌ Plan validation FAILED — errors must be fixed'
      : '⚠️  Plan validation passed with warnings'

  lines.push(header)
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
