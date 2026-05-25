/**
 * PlanFlow MCP — PlanTree → markdown serializer
 *
 * Inverse of parser.ts. Produces a PROJECT_PLAN.md the parser can
 * round-trip without loss, and that planNew-style skills can present
 * to users.
 */

import type { PhaseNode, PlanTree, TaskNode } from './types.js'

export function serializePlan(tree: PlanTree): string {
  const parts: string[] = []
  if (tree.preamble.trim()) {
    parts.push(tree.preamble.replace(/\s*$/, ''))
    parts.push('')
  }

  for (let i = 0; i < tree.phases.length; i++) {
    const phase = tree.phases[i]!
    parts.push(serializePhase(phase))
    if (i < tree.phases.length - 1) {
      parts.push('')
      parts.push('---')
      parts.push('')
    }
  }

  if (tree.postamble.trim()) {
    parts.push('')
    parts.push(tree.postamble.replace(/^\s*/, ''))
  }

  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

export function serializePhase(phase: PhaseNode): string {
  const lines: string[] = []
  const estimate = phase.estimate ? ` (Est: ${phase.estimate})` : ''
  lines.push(`### Phase ${phase.number}: ${phase.name}${estimate}`)
  lines.push('')
  if (phase.goal && phase.goal.trim()) {
    lines.push(`**Goal**: ${phase.goal.trim()}`)
    lines.push('')
  }
  if (phase.exitCriteria && phase.exitCriteria.length > 0) {
    lines.push('**Exit Criteria**:')
    for (const c of phase.exitCriteria) {
      lines.push(`- ${c}`)
    }
    lines.push('')
  }
  for (let i = 0; i < phase.tasks.length; i++) {
    lines.push(serializeTask(phase.tasks[i]!))
    if (i < phase.tasks.length - 1) {
      lines.push('')
    }
  }
  return lines.join('\n')
}

export function serializeTask(task: TaskNode): string {
  const lines: string[] = []
  lines.push(`#### ${task.taskId}: ${task.name}`)
  const statusBox = task.status === 'DONE' ? '[x]' : '[ ]'
  lines.push(`- ${statusBox} **Status**: ${task.status}`)
  lines.push(`- **Complexity**: ${task.complexity}`)
  if (task.estimatedHours !== undefined) {
    lines.push(`- **Estimated**: ${task.estimatedHours} hours`)
  }
  const deps =
    task.dependencies.length > 0 ? task.dependencies.join(', ') : 'None'
  lines.push(`- **Dependencies**: ${deps}`)
  lines.push('- **Description**:')
  const desc = task.description.trim()
  if (desc) {
    // Per-line normalization: lines that are already bullets are kept
    // verbatim (preserving their indentation), prose lines are wrapped
    // as a bullet. This prevents the "- - text" double-bullet bug when
    // a description mixes bullets and freeform notes.
    for (const l of desc.split('\n')) {
      if (!l.trim()) {
        lines.push('')
        continue
      }
      if (/^\s*-\s+/.test(l)) {
        // Already a bullet — make sure it's at least 2-space indented
        const stripped = l.replace(/^\s*/, '')
        lines.push(`  ${stripped}`)
      } else {
        lines.push(`  - ${l.trim()}`)
      }
    }
  } else {
    lines.push('  - (no description)')
  }
  if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
    lines.push('- **Acceptance Criteria**:')
    for (const c of task.acceptanceCriteria) {
      lines.push(`  - ${c}`)
    }
  }
  if (task.testTaskId) {
    lines.push(`- **Test Task**: ${task.testTaskId}`)
  }
  return lines.join('\n')
}
