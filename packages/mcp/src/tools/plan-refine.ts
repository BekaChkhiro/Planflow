/**
 * PlanFlow MCP Server — planflow_plan_refine
 *
 * Takes a PROJECT_PLAN.md (inline or from cloud), runs validation,
 * applies mechanical auto-fixes, re-validates, and returns the
 * patched markdown plus a report of what was fixed vs. what remains.
 *
 * Intended workflow:
 *   1. planflow_plan_validate(content)            — see what's broken
 *   2. planflow_plan_refine(content)              — auto-fix what's safe
 *   3. (Claude addresses semantic warnings by editing the plan)
 *   4. planflow_plan_validate(content)            — confirm green
 *   5. planflow_sync(direction: "push", content)
 */

import { z } from 'zod'
import { getApiClient } from '../api-client.js'
import { isAuthenticated } from '../config.js'
import { AuthError, ApiError } from '../errors.js'
import { logger } from '../logger.js'
import { parsePlan } from '../plan/parser.js'
import { refinePlan } from '../plan/refiner.js'
import { serializePlan } from '../plan/serializer.js'
import { validatePlan } from '../plan/validator.js'
import {
  type ToolDefinition,
  createSuccessResult,
  createErrorResult,
} from './types.js'

const PlanRefineInputSchema = z
  .object({
    content: z.string().min(1).optional(),
    projectId: z.string().uuid().optional(),
  })
  .refine((i) => !!i.content || !!i.projectId, {
    message: 'Provide either `content` or `projectId`.',
  })

type PlanRefineInput = z.infer<typeof PlanRefineInputSchema>

export const planRefineTool: ToolDefinition<PlanRefineInput> = {
  name: 'planflow_plan_refine',

  description: `Auto-fix mechanical issues in a PROJECT_PLAN.md.

This tool handles the boring fixes so you can focus on semantic ones:
  • Drops orphan dependencies (T2.3 → T9.9 that doesn't exist)
  • Renumbers duplicate task IDs
  • Fills missing estimated hours with band midpoints
  • Drops phase-order-violating dependencies
  • Breaks dependency cycles by removing the back-edge

What it does NOT do (these require human authorship):
  • Rewrite vague task names
  • Expand short descriptions
  • Add missing acceptance criteria
  • Add missing test / deploy / monitoring / security tasks

Usage:
  planflow_plan_refine(content: <PROJECT_PLAN.md>)
  planflow_plan_refine(projectId: "uuid")

Returns:
  • Patched markdown
  • List of fixes applied
  • Remaining issues that need manual attention

After refining, re-run planflow_plan_validate to confirm green.`,

  inputSchema: PlanRefineInputSchema,

  async execute(input: PlanRefineInput): Promise<ReturnType<typeof createSuccessResult>> {
    logger.info('Refining plan', {
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
            '❌ Not logged in. Run planflow_login or pass `content` directly.'
          )
        }
        const client = getApiClient()
        const response = await client.getProjectPlan(input.projectId!)
        if (!response.plan) {
          return createErrorResult(
            `⚠️  Project "${response.projectName}" has no plan content to refine.`
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
        return createErrorResult(`❌ API error: ${error.message}`)
      }
      const message = error instanceof Error ? error.message : String(error)
      return createErrorResult(`❌ Failed to fetch plan: ${message}`)
    }

    const tree = parsePlan(content)
    const beforeReport = validatePlan(tree)
    const { fixes } = refinePlan(tree, beforeReport)
    const updated = serializePlan(tree)
    const afterReport = validatePlan(parsePlan(updated))

    const lines: string[] = []
    if (fixes.length === 0) {
      lines.push('ℹ️  No auto-fixable issues found.')
    } else {
      lines.push(`✅ Applied ${fixes.length} auto-fix${fixes.length === 1 ? '' : 'es'}.`)
    }
    if (projectName) lines.push(`   Project: ${projectName}`)
    lines.push('')

    lines.push('📊 Before → After')
    lines.push(`   Errors:   ${beforeReport.totals.errors} → ${afterReport.totals.errors}`)
    lines.push(`   Warnings: ${beforeReport.totals.warnings} → ${afterReport.totals.warnings}`)
    lines.push('')

    if (fixes.length > 0) {
      lines.push('🔧 Fixes applied:')
      for (const f of fixes) lines.push(`   • ${f}`)
      lines.push('')
    }

    const stillBroken = afterReport.issues
    if (stillBroken.length > 0) {
      const errs = stillBroken.filter((i) => i.severity === 'error')
      const warns = stillBroken.filter((i) => i.severity === 'warning')
      if (errs.length > 0) {
        lines.push('❌ Remaining errors (need manual fixes):')
        for (const i of errs.slice(0, 10)) {
          lines.push(`   • ${i.taskId ? `[${i.taskId}] ` : ''}${i.message}`)
          if (i.fix) lines.push(`     ↳ ${i.fix}`)
        }
        if (errs.length > 10) lines.push(`   …and ${errs.length - 10} more.`)
        lines.push('')
      }
      if (warns.length > 0) {
        lines.push('⚠️  Remaining warnings (recommended fixes):')
        for (const i of warns.slice(0, 10)) {
          lines.push(`   • ${i.taskId ? `[${i.taskId}] ` : ''}${i.message}`)
        }
        if (warns.length > 10) lines.push(`   …and ${warns.length - 10} more.`)
        lines.push('')
      }
    } else {
      lines.push('🎯 Plan is now clean — no remaining errors or warnings.')
      lines.push('')
    }

    lines.push('💡 Next: planflow_plan_validate(content) to confirm, then planflow_sync to push.')
    lines.push('')
    lines.push('───────── Refined PROJECT_PLAN.md ─────────')
    lines.push(updated)
    lines.push('───────────────────────────────────────────')

    return createSuccessResult(lines.join('\n'))
  },
}
