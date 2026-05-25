/**
 * PlanFlow MCP — Plan outline builder
 *
 * Stage 1 of checkpoint-based authoring: build ONLY the plan skeleton —
 * the Brief (description, non-goals, success criteria) plus phases that
 * each carry a goal and exit criteria, but NO tasks yet.
 *
 * Locking the structure before decomposing any phase is what keeps
 * errors from compounding: the outline is small enough to verify by eye
 * and with `validateOutline`, and only once it's sound do we fill phases
 * one at a time (via planflow_phase_create + scope:"phase" validation).
 */

import type { PhaseNode, PlanTree } from './types.js'
import { serializePlan } from './serializer.js'

export interface OutlinePhaseInput {
  number: number
  name: string
  /** What the phase delivers — its milestone, one sentence. */
  goal: string
  /** Testable conditions that gate the next phase. */
  exitCriteria: string[]
  /** Free-form estimate like "1 week" or "16h". */
  estimate?: string
}

export interface OutlineInput {
  projectName: string
  description: string
  targetUsers?: string
  projectType?: string
  /** What is explicitly OUT of scope — keeps the plan from sprawling. */
  nonGoals: string[]
  /** What "done" means for the whole project. */
  successCriteria?: string[]
  /** Core features the plan must deliver — traced against tasks later. */
  features?: string[]
  phases: OutlinePhaseInput[]
}

/** Build a task-less PlanTree (skeleton) from an outline brief. */
export function buildOutline(input: OutlineInput): PlanTree {
  const today = new Date().toISOString().slice(0, 10)

  const phases: PhaseNode[] = input.phases
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((p) => ({
      number: p.number,
      name: p.name,
      estimate: p.estimate,
      goal: p.goal,
      exitCriteria: p.exitCriteria,
      tasks: [],
    }))

  return {
    meta: {
      projectName: input.projectName,
      description: input.description,
      targetUsers: input.targetUsers,
      projectType: input.projectType,
      status: 'Planning',
      createdDate: today,
      lastUpdated: today,
      nonGoals: input.nonGoals,
      successCriteria: input.successCriteria,
      features: input.features,
    },
    preamble: buildOutlinePreamble(input, today),
    postamble: '',
    phases,
    source: '',
  }
}

/** Serialize an outline brief straight to PROJECT_PLAN.md markdown. */
export function buildOutlineMarkdown(input: OutlineInput): string {
  return serializePlan(buildOutline(input))
}

function buildOutlinePreamble(input: OutlineInput, today: string): string {
  const lines: string[] = []
  lines.push(`# ${input.projectName} - Project Plan`)
  lines.push('')
  lines.push(`*Generated: ${today}*`)
  lines.push(`*Last Updated: ${today}*`)
  lines.push('')
  lines.push('## Overview')
  lines.push('')
  lines.push(`**Project Name**: ${input.projectName}`)
  lines.push('')
  lines.push(`**Description**: ${input.description}`)
  lines.push('')
  if (input.targetUsers) {
    lines.push(`**Target Users**: ${input.targetUsers}`)
    lines.push('')
  }
  if (input.projectType) {
    lines.push(`**Project Type**: ${input.projectType}`)
    lines.push('')
  }
  lines.push('**Status**: Planning (0% complete)')
  lines.push('')
  lines.push('---')
  lines.push('')
  if (input.features && input.features.length > 0) {
    lines.push('## Core Features')
    lines.push('')
    lines.push('The intent this plan must deliver (every feature should map to a task):')
    lines.push('')
    for (const f of input.features) lines.push(`- ${f}`)
    lines.push('')
    lines.push('---')
    lines.push('')
  }
  lines.push('## Non-Goals')
  lines.push('')
  lines.push('What this project deliberately does NOT do (keeps scope honest):')
  lines.push('')
  for (const ng of input.nonGoals) lines.push(`- ${ng}`)
  lines.push('')
  lines.push('---')
  lines.push('')
  if (input.successCriteria && input.successCriteria.length > 0) {
    lines.push('## Success Criteria')
    lines.push('')
    lines.push('What "done" means for the whole project:')
    lines.push('')
    for (const sc of input.successCriteria) lines.push(`- ${sc}`)
    lines.push('')
    lines.push('---')
    lines.push('')
  }
  lines.push('## Tasks & Implementation Plan')
  lines.push('')
  return lines.join('\n')
}
