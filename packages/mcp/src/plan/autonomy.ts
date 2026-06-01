/**
 * PlanFlow MCP — Task autonomy classification
 *
 * Answers, per task: "can an autoExecute agent run this end-to-end, or
 * does it need a human?" The verdict has three levels:
 *
 *   • agent    — self-contained + precise + verifiable. Safe to autoExecute.
 *   • assisted — an agent can do the coding, but the spec is too thin or
 *                there's no verification, so a human should pair/review.
 *   • human    — contains work an agent CANNOT do alone: external account
 *                / credential setup, third-party console config, product /
 *                UX / content judgement, or human approval / legal sign-off.
 *
 * This is advisory. It complements instruction-precision (which measures
 * *how* clearly a task is specified) by measuring *whether the kind of
 * work* is delegable at all. A perfectly-specified "register a Stripe
 * account and paste the API key" is still human-only.
 *
 * Pure + self-contained (no validator import) so it can't create a cycle.
 */

import type { AutonomySummary, AutonomyVerdict, TaskNode } from './types.js'

export type { AutonomyLevel, AutonomySummary, AutonomyVerdict } from './types.js'

interface BlockerDef {
  label: string
  pattern: RegExp
}

// Categories of work an agent cannot complete on its own. Deliberately
// narrow patterns — we'd rather miss a blocker than mislabel ordinary
// engineering work (e.g. bare "design the schema" is NOT a UX blocker).
const HUMAN_BLOCKERS: BlockerDef[] = [
  {
    label: 'external credentials / account setup',
    pattern:
      /\b(api key|access token|client secret|credentials?|sign[\s-]?up for|create an account|register (a|an) .*(account|app)|billing|payment method|obtain (a |an )?(key|token)|paste .*(key|token))\b/i,
  },
  {
    label: 'third-party console / infra setup',
    pattern:
      /\b(dns\b|domain name|ssl certificate|tls cert|aws console|gcp console|cloud console|configure .* dashboard|webhook secret|production secrets?|set up .* (account|project) (on|in) (stripe|twilio|sendgrid|aws|gcp|azure|vercel|railway))\b/i,
  },
  {
    label: 'product / UX / content judgement',
    pattern:
      /\b(ux design|ui design|visual design|wireframe|mock[\s-]?up|brand(ing)?|\blogo\b|color scheme|copywriting|marketing copy|write .* content|decide (whether|between|on)|choose between|evaluate options|research and (decide|recommend))\b/i,
  },
  {
    label: 'human approval / legal / manual sign-off',
    pattern:
      /\b(stakeholder|sign[\s-]?off|manual (qa|testing)|user testing|usability test|legal review|privacy policy|terms of service|\bgdpr\b|compliance review|approval from|get approval)\b/i,
  },
]

/** Runnable-verification footprint: a command, a test, or a linked test task. */
const VERIFY_RE =
  /\b(verify|verification|test|tests|coverage)\b|`[^`]*\b(pnpm|npm|yarn|pytest|go test|cargo|jest|vitest)\b[^`]*`/i
/** Precision footprint: names files or specifies an interface contract. */
const PRECISION_RE =
  /\b(touchpoints?|contract|endpoint|route|signature|request|response|status code)\b|[\w@.-]+\/[\w@./-]+\.(ts|tsx|js|jsx|py|go|rs|java|rb|php|sql|json|ya?ml|css|vue|svelte)\b/i

/**
 * Classify one task's delegability. `blockers` win outright: any
 * human-only footprint makes the whole task human, because the agent
 * would stall on that step even if the rest is codeable.
 */
export function classifyTaskAutonomy(task: TaskNode): AutonomyVerdict {
  const corpus = [task.name, task.description, ...(task.acceptanceCriteria ?? [])]
    .filter(Boolean)
    .join('\n')

  const blockers: string[] = []
  for (const b of HUMAN_BLOCKERS) {
    if (b.pattern.test(corpus)) blockers.push(b.label)
  }

  if (blockers.length > 0) {
    return {
      taskId: task.taskId,
      level: 'human',
      reasons: ['Contains work an agent cannot do alone — needs a human.'],
      blockers,
    }
  }

  const hasAcceptance = (task.acceptanceCriteria?.length ?? 0) >= 1
  const hasVerify = VERIFY_RE.test(corpus) || task.testTaskId !== undefined
  const hasPrecision = PRECISION_RE.test(corpus)

  const reasons: string[] = []
  // Agent-ready: testable done-definition + a way to verify + a concrete
  // surface to act on. All three keep an unattended agent on the rails.
  if (hasAcceptance && hasVerify && hasPrecision) {
    reasons.push('Acceptance criteria + verification + a concrete surface — safe to autoExecute.')
    return { taskId: task.taskId, level: 'agent', reasons, blockers }
  }

  if (!hasAcceptance) reasons.push('No acceptance criteria — agent has no done-definition.')
  if (!hasVerify) reasons.push('No verification (command / test) — agent cannot self-check.')
  if (!hasPrecision) reasons.push('No touchpoints / contract — agent must guess where & what.')
  reasons.push('Codeable by an agent, but pair or review it — spec is too thin to run unattended.')
  return { taskId: task.taskId, level: 'assisted', reasons, blockers }
}

/** Classify a set of tasks and tally the levels. */
export function summarizeAutonomy(tasks: TaskNode[]): AutonomySummary {
  const verdicts = tasks.map(classifyTaskAutonomy)
  return {
    agent: verdicts.filter((v) => v.level === 'agent').length,
    assisted: verdicts.filter((v) => v.level === 'assisted').length,
    human: verdicts.filter((v) => v.level === 'human').length,
    verdicts,
  }
}
