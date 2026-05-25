/**
 * PlanFlow MCP Server — planflow_plan_gaps
 *
 * Stage 5 of staged plan authoring: the adversarial "what's missing"
 * pass. Scans the plan for commonly-forgotten categories of work (data
 * migration, rollback, concurrency, empty/error states, pagination,
 * accessibility) and returns a checklist of the ones with no footprint
 * — each framed as a question for the author to decide on.
 *
 * Advisory by design: it does NOT pass/fail. A missing category is a
 * prompt ("intentional, or a gap?"), so the author stays in control and
 * the tool never falsely asserts a requirement.
 */

import { z } from 'zod'
import { getApiClient } from '../api-client.js'
import { isAuthenticated } from '../config.js'
import { AuthError, ApiError } from '../errors.js'
import { logger } from '../logger.js'
import { analyzeGaps } from '../plan/gaps.js'
import { parsePlan } from '../plan/parser.js'
import {
  type ToolDefinition,
  createSuccessResult,
  createErrorResult,
} from './types.js'

const PlanGapsInputSchema = z
  .object({
    content: z
      .string()
      .min(1)
      .optional()
      .describe('Markdown content of PROJECT_PLAN.md to analyze inline.'),
    projectId: z
      .string()
      .uuid()
      .optional()
      .describe('Cloud project UUID — fetches the plan from the cloud and analyzes it.'),
  })
  .refine((i) => !!i.content || !!i.projectId, {
    message: 'Provide either `content` or `projectId`.',
  })

type PlanGapsInput = z.infer<typeof PlanGapsInputSchema>

export const planGapsTool: ToolDefinition<PlanGapsInput> = {
  name: 'planflow_plan_gaps',

  description: `Adversarial "what's missing" review of a plan — the final authoring pass.

The validator catches inconsistency; traceability catches unbuilt features. This
catches the work people forget to PLAN AT ALL: data migrations, rollback/disaster
recovery, concurrency & idempotency, empty/loading/error states, pagination &
large-data handling, and accessibility.

ADVISORY, not pass/fail: it reports which of these categories have no footprint in
the plan and turns each into a question for you to answer ("intentional, or a real
gap?"). Decide per item; for the real gaps, add tasks with planflow_task_create /
planflow_phase_create.

Run this AFTER the plan validates cleanly, as the last gate before shipping it.

Usage:
  planflow_plan_gaps(content: "# My Plan...")   — inline
  planflow_plan_gaps(projectId: "uuid")          — fetch from cloud

Returns:
  • Categories already addressed (have a footprint in the plan)
  • Categories to consider (no footprint) — each with a probing question and a
    suggested task to add if it's a real gap`,

  inputSchema: PlanGapsInputSchema,

  async execute(input: PlanGapsInput): Promise<ReturnType<typeof createSuccessResult>> {
    logger.info('Analyzing plan gaps', { mode: input.content ? 'inline' : 'cloud' })

    let content: string
    let projectName: string | undefined
    try {
      if (input.content) {
        content = input.content
      } else {
        if (!isAuthenticated()) {
          return createErrorResult(
            '❌ Not logged in.\n\n' +
              'projectId mode requires authentication. Either log in with\n' +
              'planflow_login(token: "..."), or pass `content` to analyze offline.'
          )
        }
        const client = getApiClient()
        const response = await client.getProjectPlan(input.projectId!)
        if (!response.plan) {
          return createErrorResult(
            `⚠️  Project "${response.projectName}" has no plan content yet.`
          )
        }
        content = response.plan
        projectName = response.projectName
      }
    } catch (error) {
      if (error instanceof AuthError) {
        return createErrorResult('❌ Authentication error. Run planflow_login again.')
      }
      if (error instanceof ApiError) {
        if (error.statusCode === 404) {
          return createErrorResult('❌ Project not found. Check the projectId.')
        }
        return createErrorResult(`❌ API error: ${error.message}`)
      }
      const message = error instanceof Error ? error.message : String(error)
      return createErrorResult(`❌ Failed to fetch plan: ${message}`)
    }

    const report = analyzeGaps(parsePlan(content))

    const lines: string[] = []
    lines.push('🕳️  Adversarial gap review — "what might be missing?"')
    if (projectName) lines.push(`   Project: ${projectName}`)
    lines.push('   (advisory — decide per item; this is not a pass/fail gate)')
    lines.push('')

    if (report.addressed.length > 0) {
      lines.push(`✅ Already addressed (${report.addressed.length}):`)
      for (const c of report.addressed) lines.push(`   • ${c.label}`)
      lines.push('')
    }

    if (report.missing.length === 0) {
      lines.push('🎯 No common gaps detected — every category has a footprint in the plan.')
      lines.push('   (Still worth a human eye: domain-specific edge cases a lexical scan cannot see.)')
      return createSuccessResult(lines.join('\n'))
    }

    lines.push(`🔎 To consider (${report.missing.length}) — no footprint found:`)
    lines.push('')
    for (const c of report.missing) {
      lines.push(`• ${c.label}`)
      lines.push(`    Q: ${c.prompt}`)
      lines.push(`    ↳ if it's a gap: ${c.suggestedTask}`)
      lines.push('')
    }

    lines.push('💡 For each real gap, add a task:')
    lines.push('   planflow_task_create(content, phase, name, description, touchpoints, contract, …)')
    lines.push('   then re-run planflow_plan_validate(content).')

    return createSuccessResult(lines.join('\n'))
  },
}
