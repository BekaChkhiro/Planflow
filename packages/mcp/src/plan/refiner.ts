/**
 * PlanFlow MCP — Plan refiner (auto-fix)
 *
 * Given a PlanTree + a ValidationReport, attempts to mechanically
 * fix the issues it can fix safely. Returns the patched tree and a
 * list of what was changed / what was left.
 *
 * Auto-fixable today:
 *   • orphan_dependency        → drop the dangling dep
 *   • duplicate_task_id        → renumber the second occurrence
 *   • missing_hours            → fill with a band-midpoint
 *   • phase_order_violation    → drop the offending dep (loses info,
 *                                but is structurally legal)
 *   • dependency_cycle         → break the longest edge in the cycle
 *
 * NOT auto-fixable (left for Claude/user):
 *   • short_description / missing_description (needs human authorship)
 *   • vague_name (semantic)
 *   • missing_test_task / missing_acceptance_criteria (must be authored)
 *   • production-readiness gaps (must be authored)
 */

import type { PlanIssue, PlanTree, TaskNode, ValidationReport } from './types.js'
import { flattenTasks } from './validator.js'

export interface RefineResult {
  tree: PlanTree
  fixes: string[]
}

/**
 * Callers wanting to know what issues remain after refining should
 * re-run validatePlan(tree) on the returned tree — the refiner does
 * not track per-issue resolution accurately. The plan-refine tool
 * already does this; this comment exists so future callers don't
 * reach for a `remaining` field that used to exist but lied.
 */

export function refinePlan(
  tree: PlanTree,
  report: ValidationReport
): RefineResult {
  const fixes: string[] = []
  const tasksById = indexTasks(tree)

  for (const issue of report.issues) {
    switch (issue.code) {
      case 'orphan_dependency':
        fixOrphanDep(tasksById, issue, fixes)
        break
      case 'duplicate_task_id':
        fixDuplicateId(tree, tasksById, issue, fixes)
        break
      case 'missing_hours':
        fixMissingHours(tasksById, issue, fixes)
        break
      case 'phase_order_violation':
        fixPhaseOrder(tasksById, issue, fixes)
        break
      case 'dependency_cycle':
        fixCycle(tasksById, issue, fixes)
        break
    }
  }

  return { tree, fixes }
}

function indexTasks(tree: PlanTree): Map<string, TaskNode[]> {
  const map = new Map<string, TaskNode[]>()
  for (const t of flattenTasks(tree)) {
    const list = map.get(t.taskId) ?? []
    list.push(t)
    map.set(t.taskId, list)
  }
  return map
}

function fixOrphanDep(
  tasksById: Map<string, TaskNode[]>,
  issue: PlanIssue,
  fixes: string[]
): void {
  if (!issue.taskId) return
  const task = tasksById.get(issue.taskId)?.[0]
  if (!task) return
  // Issue message format: 'Task {tid} depends on {dep}, which does not exist.'
  const m = issue.message.match(/depends on (T\d+(?:\.\d+)?)/i)
  if (!m) return
  const dep = m[1]
  if (!dep) return
  const before = task.dependencies.length
  task.dependencies = task.dependencies.filter(
    (d) => d.toUpperCase() !== dep.toUpperCase()
  )
  if (task.dependencies.length < before) {
    fixes.push(`Dropped orphan dep ${dep} from ${task.taskId}.`)
  }
}

function fixDuplicateId(
  tree: PlanTree,
  tasksById: Map<string, TaskNode[]>,
  issue: PlanIssue,
  fixes: string[]
): void {
  if (!issue.taskId) return
  const dups = tasksById.get(issue.taskId)
  if (!dups || dups.length < 2) return

  // Keep the first; rename subsequent ones to the next free ID
  for (let i = 1; i < dups.length; i++) {
    const task = dups[i]!
    const newId = nextFreeIdInPhase(tree, task.phase, tasksById)
    const oldId = task.taskId
    task.taskId = newId
    // Re-index so subsequent passes know about the new ID
    tasksById.set(newId, [task])
    fixes.push(`Renumbered duplicate ${oldId} → ${newId}.`)
  }
  // Reduce the original key's list to just the kept task
  tasksById.set(issue.taskId, [dups[0]!])
}

function nextFreeIdInPhase(
  tree: PlanTree,
  phase: number,
  tasksById: Map<string, TaskNode[]>
): string {
  const used = new Set<number>()
  for (const id of tasksById.keys()) {
    const m = id.match(/^T(\d+)\.(\d+)$/i)
    if (m && Number.parseInt(m[1] ?? '0', 10) === phase) {
      used.add(Number.parseInt(m[2] ?? '0', 10))
    }
  }
  let n = 1
  while (used.has(n)) n++
  // Defensive: ensure we also avoid current source IDs in the tree
  // (in case tasksById was stale from a previous pass).
  const inTree = new Set(
    tree.phases
      .filter((p) => p.number === phase)
      .flatMap((p) => p.tasks.map((t) => t.taskId))
  )
  while (inTree.has(`T${phase}.${n}`)) n++
  return `T${phase}.${n}`
}

function fixMissingHours(
  tasksById: Map<string, TaskNode[]>,
  issue: PlanIssue,
  fixes: string[]
): void {
  if (!issue.taskId) return
  const task = tasksById.get(issue.taskId)?.[0]
  if (!task || task.estimatedHours !== undefined) return
  // Use the midpoint of the expected band for the task's complexity.
  const mid = {
    Low: 2,
    Medium: 6,
    High: 12,
  }[task.complexity]
  task.estimatedHours = mid
  fixes.push(`Set ${task.taskId} estimate to ${mid}h (midpoint for ${task.complexity}).`)
}

function fixPhaseOrder(
  tasksById: Map<string, TaskNode[]>,
  issue: PlanIssue,
  fixes: string[]
): void {
  if (!issue.taskId) return
  const task = tasksById.get(issue.taskId)?.[0]
  if (!task) return
  // The message is: 'Task X (Phase A) depends on Y (Phase B) — a later phase.'
  const m = issue.message.match(/depends on (T\d+(?:\.\d+)?) \(Phase \d+\)/i)
  if (!m) return
  const dep = m[1]
  if (!dep) return
  const before = task.dependencies.length
  task.dependencies = task.dependencies.filter(
    (d) => d.toUpperCase() !== dep.toUpperCase()
  )
  if (task.dependencies.length < before) {
    fixes.push(`Dropped phase-order-violating dep ${dep} from ${task.taskId}.`)
  }
}

function fixCycle(
  tasksById: Map<string, TaskNode[]>,
  issue: PlanIssue,
  fixes: string[]
): void {
  // Message: 'Dependency cycle: A → B → C → A'
  const m = issue.message.match(/Dependency cycle:\s+(.+)/)
  if (!m) return
  const ids = (m[1] ?? '')
    .split(/\s*→\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (ids.length < 2) return

  // The message prints the cycle as: A → B → C → A. The closing
  // back-edge is from the penultimate node to the first (= last).
  // Drop that edge to break the cycle.
  const closing = ids[ids.length - 1]!     // same as ids[0]
  const source = ids[ids.length - 2]!
  const task = tasksById.get(source)?.[0]
  if (!task) return
  const before = task.dependencies.length
  task.dependencies = task.dependencies.filter(
    (d) => d.toUpperCase() !== closing.toUpperCase()
  )
  if (task.dependencies.length < before) {
    fixes.push(`Broke cycle by dropping ${source} → ${closing}.`)
  }
}

