/**
 * PlanFlow MCP — Plan validator
 *
 * Runs structural, quality, testing, and production-readiness checks
 * on a PlanTree. Returns a structured ValidationReport that the
 * `planflow_plan_validate` tool formats for humans and the refiner
 * acts on automatically.
 *
 * Checks are organized into pure functions so each rule is unit-
 * testable and easy to extend. Adding a new rule means: write a
 * function that returns PlanIssue[], call it from validatePlan.
 */

import type {
  CoverageSummary,
  PlanIssue,
  PlanTree,
  PrecisionSummary,
  TaskNode,
  TaskPrecision,
  ValidationReport,
} from './types.js'
import { summarizeAutonomy } from './autonomy.js'

const VAGUE_NAME_PATTERNS = [
  /\b(stuff|misc|other|various|miscellaneous|tbd|todo|fixme)\b/i,
  /^setup\s*$/i,
  /^fix\s*$/i,
  /^work\s*$/i,
  /^thing(s)?\s*$/i,
]

const TESTING_KEYWORDS = /\b(test|tests|testing|unit|integration|e2e|qa)\b/i
const DEPLOYMENT_KEYWORDS = /\b(deploy|deployment|production|release|ship)\b/i
const MONITORING_KEYWORDS =
  /\b(monitor|monitoring|observability|logging|logs|metrics|alert|sentry|datadog)\b/i
const ERROR_HANDLING_KEYWORDS =
  /\b(error|exception|handling|retry|fallback|circuit|breaker)\b/i
// Note: deliberately does NOT include "auth" — every project with a
// login system would match it, suppressing this warning even when
// there is no dedicated security-hardening task. Use the explicit
// security vocabulary so a separate hardening pass is required.
const SECURITY_KEYWORDS =
  /\b(security|secure|hardening|audit|owasp|csrf|xss|injection|sanitiz|rate.?limit)\b/i
const ENV_KEYWORDS = /\b(env|environment|secrets?|config(uration)?|vault|\.env)\b/i

// ── Instruction-precision detectors ──────────────────────────────────
// These scan a task's description markdown to judge whether the spec is
// concrete enough for an agent to execute without guessing.

/** A file path token like `src/auth/login.ts` or `apps/api/index.js`. */
const FILE_PATH_RE =
  /\b[\w@.-]+\/[\w@./-]+\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|php|sql|json|ya?ml|md|css|scss|html|vue|svelte)\b/i
/** "Touchpoints", "Files to change", "Affected files" headers. */
const TOUCHPOINTS_RE = /\b(touchpoints?|files? to (touch|change|edit|create|modify)|affected files?)\b/i
/** Contract/interface vocabulary — signatures, routes, payloads, types. */
const CONTRACT_RE =
  /\b(contract|interface|signature|endpoint|route|request|response|payload|status code|returns?|param(eter)?s?|props?|api shape|data model|schema)\b/i
/** A numbered step list, or an explicit Steps/Implementation header. */
const STEPS_RE = /(^|\n)\s*\d+[.)]\s+\S/
const STEPS_HEADER_RE = /\b(steps?|implementation plan|approach)\b/i
/** Constraints / non-goals / invariants. */
const CONSTRAINTS_RE =
  /\b(constraints?|non-?goals?|out of scope|do not|don'?t|must not|invariant|avoid)\b/i
/** Runnable verification — a command or an explicit Verify header. */
const VERIFY_RE = /\b(verify|verification)\b|`[^`]*\b(test|pnpm|npm|yarn|pytest|go test|cargo|jest|vitest)\b[^`]*`/i

/**
 * Main validation entry point.
 */
export function validatePlan(plan: PlanTree): ValidationReport {
  const issues: PlanIssue[] = []

  issues.push(...checkStructural(plan))
  issues.push(...checkOutline(plan))
  issues.push(...checkQuality(plan))
  issues.push(...checkTesting(plan))
  issues.push(...checkProduction(plan))

  const precisionResult = checkInstructionPrecision(plan)
  issues.push(...precisionResult.issues)

  const traceResult = checkTraceability(plan)
  issues.push(...traceResult.issues)

  const allTasksForAutonomy = flattenTasks(plan)
  const autonomy =
    allTasksForAutonomy.length > 0 ? summarizeAutonomy(allTasksForAutonomy) : undefined

  const errors = issues.filter((i) => i.severity === 'error').length
  const warnings = issues.filter((i) => i.severity === 'warning').length
  const infos = issues.filter((i) => i.severity === 'info').length
  const taskCount = plan.phases.reduce((acc, p) => acc + p.tasks.length, 0)

  return {
    ok: errors === 0,
    totals: {
      phases: plan.phases.length,
      tasks: taskCount,
      errors,
      warnings,
      infos,
    },
    issues,
    ...(precisionResult.summary ? { precision: precisionResult.summary } : {}),
    ...(traceResult.summary ? { coverage: traceResult.summary } : {}),
    ...(autonomy ? { autonomy } : {}),
  }
}

/**
 * Validate ONLY the plan skeleton — phases, their goals, exit criteria,
 * numbering, and scope boundaries — ignoring task-level detail. This is
 * the gate for the FIRST checkpoint in staged authoring: lock the
 * structure before decomposing any phase into tasks. Unlike validatePlan
 * it does NOT require tasks to exist yet.
 */
export function validateOutline(plan: PlanTree): ValidationReport {
  const issues: PlanIssue[] = []
  issues.push(...checkPhaseSkeleton(plan))
  issues.push(...checkOutline(plan))
  const taskCount = plan.phases.reduce((acc, p) => acc + p.tasks.length, 0)
  return finalizeReport(issues, plan.phases.length, taskCount)
}

/**
 * Validate ONE phase in depth — the gate before moving on to the next
 * phase. Runs every task-level check (quality, testing, precision) but
 * scopes the result to the target phase, and adds phase-coverage checks.
 * Dependency existence is still evaluated against the WHOLE plan, so
 * cross-phase edges are caught.
 */
export function validatePhase(plan: PlanTree, phaseNumber: number): ValidationReport {
  const phase = plan.phases.find((p) => p.number === phaseNumber)
  if (!phase) {
    return finalizeReport(
      [
        {
          code: 'invalid_phase_number',
          severity: 'error',
          message: `Phase ${phaseNumber} does not exist in the plan.`,
          phase: phaseNumber,
          fix: `Existing phases: ${plan.phases.map((p) => p.number).join(', ') || '(none)'}.`,
        },
      ],
      plan.phases.length,
      0
    )
  }

  const phaseTaskIds = new Set(phase.tasks.map((t) => t.taskId))
  const full = validatePlan(plan)

  // Keep issues that belong to this phase: phase-tagged, or task-tagged
  // for a task that lives in this phase. (Plan-global warnings like
  // missing_deployment_task or missing_non_goals are intentionally
  // dropped — they're not this phase's gate.)
  const issues = full.issues.filter(
    (i) =>
      i.phase === phaseNumber ||
      (i.taskId !== undefined && phaseTaskIds.has(i.taskId))
  )

  // A phase with no tasks can't be verified — hard gate.
  if (phase.tasks.length === 0) {
    issues.push({
      code: 'phase_no_tasks',
      severity: 'error',
      message: `Phase ${phaseNumber} (${phase.name}) has no tasks to verify.`,
      phase: phaseNumber,
      fix: 'Decompose the phase goal into tasks before validating it.',
    })
  }

  // Scope the precision summary to this phase's tasks.
  let scopedPrecision: PrecisionSummary | undefined
  const phaseScores = (full.precision?.tasks ?? []).filter((t) =>
    phaseTaskIds.has(t.taskId)
  )
  if (phaseScores.length > 0) {
    scopedPrecision = {
      avgScore: Math.round(
        phaseScores.reduce((a, t) => a + t.score, 0) / phaseScores.length
      ),
      scoredTasks: phaseScores.length,
      tasks: [...phaseScores].sort((a, b) => a.score - b.score),
    }
  }

  return finalizeReport(issues, 1, phase.tasks.length, scopedPrecision)
}

/** Assemble a ValidationReport from a set of issues + counts. */
function finalizeReport(
  issues: PlanIssue[],
  phases: number,
  tasks: number,
  precision?: PrecisionSummary
): ValidationReport {
  const errors = issues.filter((i) => i.severity === 'error').length
  const warnings = issues.filter((i) => i.severity === 'warning').length
  const infos = issues.filter((i) => i.severity === 'info').length
  return {
    ok: errors === 0,
    totals: { phases, tasks, errors, warnings, infos },
    issues,
    ...(precision ? { precision } : {}),
  }
}

/**
 * Phase-skeleton structural checks — used by validateOutline. Verifies
 * the plan has phases, numbered sequentially from 1 with no duplicates,
 * and each has a usable name.
 */
function checkPhaseSkeleton(plan: PlanTree): PlanIssue[] {
  const issues: PlanIssue[] = []

  if (plan.phases.length === 0) {
    issues.push({
      code: 'empty_outline',
      severity: 'error',
      message: 'Plan has no phases.',
      fix: 'Add at least one "### Phase 1: <Name>" with a **Goal**.',
    })
    return issues
  }

  const nums = plan.phases.map((p) => p.number)
  const seen = new Set<number>()
  for (const n of nums) {
    if (seen.has(n)) {
      issues.push({
        code: 'phase_numbering',
        severity: 'warning',
        message: `Duplicate phase number ${n}.`,
        phase: n,
        fix: 'Renumber phases so each number is unique.',
      })
    }
    seen.add(n)
  }

  const sorted = [...nums].sort((a, b) => a - b)
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] !== i + 1) {
      issues.push({
        code: 'phase_numbering',
        severity: 'warning',
        message: `Phases are not numbered sequentially from 1 (got ${sorted.join(', ')}).`,
        fix: 'Renumber so phases run 1, 2, 3, … in order.',
      })
      break
    }
  }

  for (const p of plan.phases) {
    if (!p.name || p.name.trim().length < 3) {
      issues.push({
        code: 'phase_numbering',
        severity: 'warning',
        message: `Phase ${p.number} has a missing or too-short name.`,
        phase: p.number,
        fix: 'Give the phase a descriptive name (e.g. "Foundation", "Core Features").',
      })
    }
  }

  return issues
}

// ─────────────────────────────────────────────────────────────────
// Structural — hard errors that prevent shipping the plan
// ─────────────────────────────────────────────────────────────────

function checkStructural(plan: PlanTree): PlanIssue[] {
  const issues: PlanIssue[] = []
  const allTasks = flattenTasks(plan)
  const idMap = new Map<string, TaskNode[]>()

  for (const t of allTasks) {
    const list = idMap.get(t.taskId) ?? []
    list.push(t)
    idMap.set(t.taskId, list)
  }

  // Duplicate task IDs
  for (const [taskId, dups] of idMap) {
    if (dups.length > 1) {
      issues.push({
        code: 'duplicate_task_id',
        severity: 'error',
        message: `Task ID "${taskId}" is used by ${dups.length} tasks.`,
        taskId,
        fix: 'Renumber so each task has a unique ID.',
      })
    }
  }

  // Orphan dependencies + phase-order violations
  const known = new Set(idMap.keys())
  for (const t of allTasks) {
    for (const dep of t.dependencies) {
      if (!known.has(dep)) {
        issues.push({
          code: 'orphan_dependency',
          severity: 'error',
          message: `Task ${t.taskId} depends on ${dep}, which does not exist.`,
          taskId: t.taskId,
          fix: `Remove dependency "${dep}" or create the missing task.`,
        })
        continue
      }
      const depTask = idMap.get(dep)?.[0]
      if (depTask && depTask.phase > t.phase) {
        issues.push({
          code: 'phase_order_violation',
          severity: 'error',
          message: `Task ${t.taskId} (Phase ${t.phase}) depends on ${dep} (Phase ${depTask.phase}) — a later phase.`,
          taskId: t.taskId,
          fix: `Move ${t.taskId} to Phase ${depTask.phase} or later, or move ${dep} earlier.`,
        })
      }
    }

    // Phase number sanity
    if (!Number.isFinite(t.phase) || t.phase < 1) {
      issues.push({
        code: 'invalid_phase_number',
        severity: 'error',
        message: `Task ${t.taskId} has invalid phase number ${t.phase}.`,
        taskId: t.taskId,
      })
    }

    // Malformed task IDs
    if (!/^T\d+(?:\.\d+)?$/i.test(t.taskId)) {
      issues.push({
        code: 'malformed_task',
        severity: 'error',
        message: `Task ID "${t.taskId}" is not in expected "T<phase>.<n>" format.`,
        taskId: t.taskId,
      })
    }
  }

  // Cycle detection (Tarjan SCC over the dependency graph)
  const cycles = detectCycles(idMap)
  for (const cycle of cycles) {
    issues.push({
      code: 'dependency_cycle',
      severity: 'error',
      message: `Dependency cycle: ${cycle.join(' → ')} → ${cycle[0]}`,
      taskId: cycle[0],
      fix: 'Break one edge in this cycle — remove or invert a dependency.',
    })
  }

  return issues
}

function detectCycles(idMap: Map<string, TaskNode[]>): string[][] {
  // Build adjacency
  const graph = new Map<string, string[]>()
  for (const [taskId, dups] of idMap) {
    // If duplicates, just take the first — the duplicate is already
    // flagged as an error.
    const t = dups[0]
    if (!t) continue
    graph.set(
      taskId,
      t.dependencies.filter((d) => idMap.has(d))
    )
  }

  const cycles: string[][] = []
  const stack: string[] = []
  const onStack = new Set<string>()
  const visited = new Set<string>()
  const inCycle = new Set<string>()

  function dfs(node: string): void {
    visited.add(node)
    stack.push(node)
    onStack.add(node)

    for (const next of graph.get(node) ?? []) {
      if (!visited.has(next)) {
        dfs(next)
      } else if (onStack.has(next)) {
        const idx = stack.indexOf(next)
        if (idx >= 0) {
          const cycle = stack.slice(idx)
          // Deduplicate cycles by canonical form (smallest taskId first)
          const minIdx = cycle.reduce(
            (best, _, i) => (cycle[i]! < cycle[best]! ? i : best),
            0
          )
          const canonical = [
            ...cycle.slice(minIdx),
            ...cycle.slice(0, minIdx),
          ]
          const key = canonical.join('→')
          if (!cycles.some((c) => c.join('→') === key)) {
            cycles.push(canonical)
            for (const n of canonical) inCycle.add(n)
          }
        }
      }
    }

    stack.pop()
    onStack.delete(node)
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) dfs(node)
  }

  return cycles
}

// ─────────────────────────────────────────────────────────────────
// Outline — is the plan skeleton sound? (phase goals, exit criteria,
// scope boundaries). These are the structural checks that matter most
// in staged authoring, before tasks are filled in.
// ─────────────────────────────────────────────────────────────────

function checkOutline(plan: PlanTree): PlanIssue[] {
  const issues: PlanIssue[] = []

  for (const phase of plan.phases) {
    if (!phase.goal || phase.goal.trim().length === 0) {
      issues.push({
        code: 'missing_phase_goal',
        severity: 'warning',
        message: `Phase ${phase.number} (${phase.name}) has no goal — what milestone does it deliver?`,
        phase: phase.number,
        fix: 'Add `**Goal**: <one sentence>` after the phase header so its tasks can be checked against it.',
      })
    }
    // Exit criteria matter once a phase has real work in it.
    if (phase.tasks.length > 0 && (!phase.exitCriteria || phase.exitCriteria.length === 0)) {
      issues.push({
        code: 'missing_exit_criteria',
        severity: 'info',
        message: `Phase ${phase.number} (${phase.name}) has no exit criteria — when is it "done"?`,
        phase: phase.number,
        fix: 'Add an `**Exit Criteria**:` bullet list — the testable gate before the next phase begins.',
      })
    }
  }

  // Brief: scope boundaries. A plan with no stated non-goals tends to
  // sprawl — flag it once at the plan level.
  if (!plan.meta.nonGoals || plan.meta.nonGoals.length === 0) {
    issues.push({
      code: 'missing_non_goals',
      severity: 'info',
      message: 'Plan states no non-goals — scope boundaries are undefined.',
      fix: 'Add a `## Non-Goals` section listing what is explicitly OUT of scope, so tasks do not sprawl.',
    })
  }

  return issues
}

// ─────────────────────────────────────────────────────────────────
// Quality — warnings for vague / unbalanced plans
// ─────────────────────────────────────────────────────────────────

function checkQuality(plan: PlanTree): PlanIssue[] {
  const issues: PlanIssue[] = []
  const allTasks = flattenTasks(plan)
  if (allTasks.length === 0) {
    issues.push({
      code: 'empty_plan',
      severity: 'error',
      message: 'Plan contains no tasks.',
      fix: 'Add at least one task under a Phase header.',
    })
    return issues
  }

  // Phase imbalance
  for (const phase of plan.phases) {
    if (phase.tasks.length > 10) {
      issues.push({
        code: 'phase_imbalance',
        severity: 'warning',
        message: `Phase ${phase.number} (${phase.name}) has ${phase.tasks.length} tasks — consider splitting into multiple phases.`,
        phase: phase.number,
        fix: 'Group related tasks and split the phase, or move some to a new phase.',
      })
    } else if (phase.tasks.length === 0) {
      issues.push({
        code: 'phase_imbalance',
        severity: 'warning',
        message: `Phase ${phase.number} (${phase.name}) has no tasks.`,
        phase: phase.number,
        fix: 'Add tasks or remove this phase.',
      })
    } else if (phase.tasks.length < 2 && plan.phases.length > 1) {
      issues.push({
        code: 'phase_imbalance',
        severity: 'info',
        message: `Phase ${phase.number} (${phase.name}) has only ${phase.tasks.length} task — phases usually have 3-8.`,
        phase: phase.number,
      })
    }
  }

  // Complexity skew — too many Highs is unrealistic
  const high = allTasks.filter((t) => t.complexity === 'High').length
  if (allTasks.length >= 5 && high / allTasks.length > 0.7) {
    issues.push({
      code: 'complexity_skew',
      severity: 'warning',
      message: `${high} of ${allTasks.length} tasks are marked High complexity (${Math.round((high / allTasks.length) * 100)}%) — likely overestimated.`,
      fix: 'Re-evaluate: a healthy plan typically has a mix of Low/Medium/High.',
    })
  }

  // Per-task quality
  for (const t of allTasks) {
    // Vague names
    if (VAGUE_NAME_PATTERNS.some((p) => p.test(t.name))) {
      issues.push({
        code: 'vague_name',
        severity: 'warning',
        message: `Task ${t.taskId} has a vague name: "${t.name}".`,
        taskId: t.taskId,
        fix: 'Use a verb + noun phrase like "Implement JWT login endpoint".',
      })
    }

    // Description quality
    const descLen = t.description.replace(/\s+/g, ' ').trim().length
    if (descLen === 0) {
      issues.push({
        code: 'missing_description',
        severity: 'warning',
        message: `Task ${t.taskId} has no description.`,
        taskId: t.taskId,
        fix: 'Add a bullet list under **Description** with the concrete sub-steps.',
      })
    } else if (descLen < 50) {
      issues.push({
        code: 'short_description',
        severity: 'info',
        message: `Task ${t.taskId} has a very short description (${descLen} chars).`,
        taskId: t.taskId,
        fix: 'Expand with 3-5 bullets covering the concrete work.',
      })
    }

    // Estimated hours
    if (t.estimatedHours === undefined) {
      issues.push({
        code: 'missing_hours',
        severity: 'info',
        message: `Task ${t.taskId} has no estimated hours.`,
        taskId: t.taskId,
        fix: 'Add **Estimated**: N hours (Low ≈ 1-3, Medium ≈ 4-8, High ≈ 8+).',
      })
    } else {
      const expected = expectedHourBand(t.complexity)
      if (t.estimatedHours > expected.max * 2.5) {
        issues.push({
          code: 'unrealistic_hours',
          severity: 'warning',
          message: `Task ${t.taskId} estimates ${t.estimatedHours}h but complexity is ${t.complexity} (expected ${expected.min}-${expected.max}h).`,
          taskId: t.taskId,
          fix: 'Either split into smaller tasks or raise complexity to match.',
        })
      }
    }
  }

  return issues
}

function expectedHourBand(complexity: TaskNode['complexity']): {
  min: number
  max: number
} {
  switch (complexity) {
    case 'Low':
      return { min: 1, max: 3 }
    case 'Medium':
      return { min: 4, max: 8 }
    case 'High':
      return { min: 8, max: 20 }
  }
}

// ─────────────────────────────────────────────────────────────────
// Testing — every feature should have a test task
// ─────────────────────────────────────────────────────────────────

function checkTesting(plan: PlanTree): PlanIssue[] {
  const issues: PlanIssue[] = []
  const allTasks = flattenTasks(plan)

  const hasTestingPhase = plan.phases.some(
    (p) =>
      /test|qa|quality/i.test(p.name) ||
      p.tasks.some((t) => TESTING_KEYWORDS.test(t.name))
  )
  const hasAnyTestTask = allTasks.some((t) => TESTING_KEYWORDS.test(t.name))

  if (!hasTestingPhase && !hasAnyTestTask) {
    issues.push({
      code: 'missing_testing_section',
      severity: 'warning',
      message: 'Plan has no testing tasks — add unit, integration, and E2E test tasks.',
      fix: 'Add a "Testing & QA" phase or pair each feature task with a test task.',
    })
  }

  // For each "feature" task in mid-phases (not phase 1 setup, not last
  // testing phase), expect a companion test task pointed at by
  // `testTaskId`, OR another task whose name mentions test+feature.
  const lastPhase = Math.max(...plan.phases.map((p) => p.number), 0)
  const featureTasks = allTasks.filter((t) => {
    if (t.phase === 1) return false
    if (t.phase === lastPhase && lastPhase > 1) return false
    if (TESTING_KEYWORDS.test(t.name)) return false
    // Treat Medium/High complexity tasks as features worth testing
    return t.complexity !== 'Low'
  })

  for (const t of featureTasks) {
    const hasExplicitLink =
      t.testTaskId !== undefined && allTasks.some((x) => x.taskId === t.testTaskId)
    if (hasExplicitLink) continue

    // Look for an implicit companion: a test-y task that depends on
    // this one or mentions the feature name.
    const keyword = extractKeyword(t.name)
    const hasImplicitTest = allTasks.some((other) => {
      if (other.taskId === t.taskId) return false
      if (!TESTING_KEYWORDS.test(other.name)) return false
      if (other.dependencies.includes(t.taskId)) return true
      if (keyword && other.name.toLowerCase().includes(keyword)) return true
      return false
    })

    if (!hasImplicitTest) {
      issues.push({
        code: 'missing_test_task',
        severity: 'warning',
        message: `Task ${t.taskId} ("${t.name}") has no companion test task.`,
        taskId: t.taskId,
        fix: `Add a test task in the testing phase that depends on ${t.taskId}, or set its **Test Task**: <id>.`,
      })
    }
  }

  // Acceptance criteria — required on Medium/High tasks
  for (const t of allTasks) {
    if (t.complexity === 'Low') continue
    if (TESTING_KEYWORDS.test(t.name)) continue
    if (t.phase === 1) continue
    const count = t.acceptanceCriteria?.length ?? 0
    if (count === 0) {
      issues.push({
        code: 'feature_without_acceptance_criteria',
        severity: 'info',
        message: `Task ${t.taskId} ("${t.name}") has no acceptance criteria.`,
        taskId: t.taskId,
        fix: 'Add **Acceptance Criteria**: with 2-5 testable bullet points.',
      })
    }
  }

  return issues
}

function extractKeyword(name: string): string | null {
  // Pick the longest "noun-ish" word (>=4 chars, alphabetic) as a
  // weak keyword for cross-referencing test tasks.
  const words = name
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4)
  if (words.length === 0) return null
  return words.sort((a, b) => b.length - a.length)[0] ?? null
}

// ─────────────────────────────────────────────────────────────────
// Instruction precision — can an agent execute this without guessing?
// ─────────────────────────────────────────────────────────────────

/**
 * A "feature task" is one substantial enough to deserve a precise spec:
 * Medium/High complexity, not the phase-1 setup work, and not a test
 * task (those are defined by what they test). Low-complexity chores
 * don't need the full contract, so we skip them to avoid noise.
 */
function isFeatureTask(t: TaskNode, lastPhase: number): boolean {
  if (t.complexity === 'Low') return false
  if (t.phase === 1) return false
  if (lastPhase > 1 && t.phase === lastPhase) return false
  if (TESTING_KEYWORDS.test(t.name)) return false
  return true
}

/**
 * Score one task's instruction precision against a 6-point checklist and
 * report which pieces are missing. The score is what powers the plan's
 * "how ready is this for an agent" number; the missing list drives the
 * concrete fixes.
 */
function scoreTaskPrecision(t: TaskNode): TaskPrecision {
  const desc = t.description ?? ''
  const checklist: Array<{ key: string; present: boolean }> = [
    // Goal: a non-trivial description exists at all.
    { key: 'goal', present: desc.replace(/\s+/g, ' ').trim().length >= 40 },
    // Touchpoints: names at least one concrete file/path to change.
    { key: 'touchpoints', present: FILE_PATH_RE.test(desc) || TOUCHPOINTS_RE.test(desc) },
    // Contract: specifies the interface — signature, route, shape, types.
    { key: 'contract', present: CONTRACT_RE.test(desc) },
    // Steps: an ordered implementation outline.
    { key: 'steps', present: STEPS_RE.test(desc) || STEPS_HEADER_RE.test(desc) },
    // Acceptance criteria: testable done-conditions.
    { key: 'acceptance', present: (t.acceptanceCriteria?.length ?? 0) >= 1 },
    // Verify: a runnable check, or a linked test task.
    {
      key: 'verify',
      present: VERIFY_RE.test(desc) || t.testTaskId !== undefined,
    },
  ]
  const present = checklist.filter((c) => c.present).length
  const score = Math.round((present / checklist.length) * 100)
  const missing = checklist.filter((c) => !c.present).map((c) => c.key)
  return { taskId: t.taskId, score, missing }
}

function checkInstructionPrecision(plan: PlanTree): {
  issues: PlanIssue[]
  summary?: PrecisionSummary
} {
  const issues: PlanIssue[] = []
  const allTasks = flattenTasks(plan)
  const lastPhase = Math.max(...plan.phases.map((p) => p.number), 0)
  const featureTasks = allTasks.filter((t) => isFeatureTask(t, lastPhase))

  if (featureTasks.length === 0) {
    return { issues }
  }

  const scores: TaskPrecision[] = []

  for (const t of featureTasks) {
    const p = scoreTaskPrecision(t)
    scores.push(p)
    const missing = new Set(p.missing)

    // Touchpoints and contract are the two highest-leverage precision
    // signals — without them the agent guesses WHERE and WHAT. Flag as
    // warnings so they surface above nice-to-haves.
    if (missing.has('touchpoints')) {
      issues.push({
        code: 'missing_touchpoints',
        severity: 'warning',
        message: `Task ${t.taskId} ("${t.name}") names no files to touch — the agent will have to guess where the change goes.`,
        taskId: t.taskId,
        fix: 'Add a **Touchpoints** section listing the files to create/edit (e.g. "create src/auth/login.ts").',
      })
    }
    if (missing.has('contract')) {
      issues.push({
        code: 'missing_contract',
        severity: 'warning',
        message: `Task ${t.taskId} ("${t.name}") has no interface contract — signatures, routes, request/response shapes, or types are unspecified.`,
        taskId: t.taskId,
        fix: 'Add a **Contract** section: exact function signatures, API route + request/response shape, status codes, or data-model fields.',
      })
    }
    // Constraints matter most on High tasks, where scope creep and
    // invariant violations are most likely.
    if (t.complexity === 'High' && !CONSTRAINTS_RE.test(t.description ?? '')) {
      issues.push({
        code: 'missing_constraints',
        severity: 'info',
        message: `Task ${t.taskId} ("${t.name}") is High complexity but states no constraints / non-goals.`,
        taskId: t.taskId,
        fix: 'Add a **Constraints** section: what NOT to touch, invariants to preserve, and explicit out-of-scope items.',
      })
    }
    // A very low score means the spec is too thin to execute precisely,
    // regardless of which specific pieces are missing.
    if (p.score < 50) {
      issues.push({
        code: 'thin_instructions',
        severity: 'warning',
        message: `Task ${t.taskId} ("${t.name}") scores ${p.score}% on instruction precision — too thin for an agent to execute without guessing (missing: ${p.missing.join(', ')}).`,
        taskId: t.taskId,
        fix: 'Flesh out the spec with Touchpoints, Contract, ordered Steps, Acceptance Criteria, and a Verify command.',
      })
    }
  }

  const avgScore = Math.round(
    scores.reduce((acc, s) => acc + s.score, 0) / scores.length
  )
  const summary: PrecisionSummary = {
    avgScore,
    scoredTasks: scores.length,
    tasks: scores.sort((a, b) => a.score - b.score),
  }

  return { issues, summary }
}

// ─────────────────────────────────────────────────────────────────
// Traceability — does the plan actually cover the declared intent?
// ─────────────────────────────────────────────────────────────────

const TRACE_STOPWORDS = new Set([
  'with',
  'from',
  'into',
  'that',
  'this',
  'your',
  'their',
  'using',
  'support',
  'management',
  'system',
  'feature',
  'features',
  'data',
  'page',
  'pages',
])

/** Significant lowercase tokens (≥4 chars, not stopwords) for matching. */
function significantTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !TRACE_STOPWORDS.has(w))
}

/**
 * Check that every declared feature has at least one implementing task.
 * Conservative: a feature is "covered" if ANY of its significant tokens
 * appears in some task's name or description — so we only flag features
 * with NO lexical footprint in the task list, keeping false alarms low.
 *
 * Runs only when the plan declares features (a `## Features` section);
 * otherwise there is nothing to trace against.
 */
function checkTraceability(plan: PlanTree): {
  issues: PlanIssue[]
  summary?: CoverageSummary
} {
  const features = plan.meta.features ?? []
  if (features.length === 0) return { issues: [] }

  const allTasks = flattenTasks(plan)
  const taskCorpus = allTasks.map((t) => `${t.name} ${t.description}`.toLowerCase())

  const issues: PlanIssue[] = []
  const uncovered: string[] = []

  for (const feature of features) {
    const tokens = significantTokens(feature)
    // A feature with no significant tokens (e.g. "Misc") can't be traced
    // — skip rather than false-flag.
    if (tokens.length === 0) continue

    const covered = taskCorpus.some((corpus) => tokens.some((tok) => corpus.includes(tok)))
    if (!covered) {
      uncovered.push(feature)
      issues.push({
        code: 'feature_not_covered',
        severity: 'warning',
        message: `Feature "${feature}" has no implementing task — the plan promises it but nothing builds it.`,
        fix: `Add a task that implements "${feature}", or remove it from the features list if it's out of scope.`,
      })
    }
  }

  const traceable = features.filter((f) => significantTokens(f).length > 0).length
  const summary: CoverageSummary = {
    features: traceable,
    covered: traceable - uncovered.length,
    uncovered,
  }

  return { issues, summary }
}

// ─────────────────────────────────────────────────────────────────
// Production readiness — the things that bite at launch
// ─────────────────────────────────────────────────────────────────

function checkProduction(plan: PlanTree): PlanIssue[] {
  const issues: PlanIssue[] = []
  const allTasks = flattenTasks(plan)
  const corpus = allTasks
    .map((t) => `${t.name} ${t.description}`)
    .join('\n')
    .toLowerCase()

  const checks: Array<{
    pattern: RegExp
    code: PlanIssue['code']
    message: string
    fix: string
  }> = [
    {
      pattern: DEPLOYMENT_KEYWORDS,
      code: 'missing_deployment_task',
      message: 'No deployment task found.',
      fix: 'Add a task for provisioning, CI/CD, and rolling out to production.',
    },
    {
      pattern: MONITORING_KEYWORDS,
      code: 'missing_monitoring_task',
      message: 'No monitoring / logging task found.',
      fix: 'Add a task to set up logs, metrics, and error tracking (e.g. Sentry).',
    },
    {
      pattern: ERROR_HANDLING_KEYWORDS,
      code: 'missing_error_handling_task',
      message: 'No explicit error-handling task found.',
      fix: 'Add a task covering global error boundaries, retries, and user-visible error states.',
    },
    {
      pattern: SECURITY_KEYWORDS,
      code: 'missing_security_task',
      message: 'No security / auth hardening task found.',
      fix: 'Add a security task covering input validation, rate limiting, and secrets handling.',
    },
    {
      pattern: ENV_KEYWORDS,
      code: 'missing_env_management',
      message: 'No environment / secrets management task found.',
      fix: 'Add a task to configure .env, secret storage, and per-environment configs.',
    },
  ]

  for (const c of checks) {
    if (!c.pattern.test(corpus)) {
      issues.push({
        code: c.code,
        severity: 'warning',
        message: c.message,
        fix: c.fix,
      })
    }
  }

  return issues
}

// ─────────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────────

export function flattenTasks(plan: PlanTree): TaskNode[] {
  return plan.phases.flatMap((p) => p.tasks)
}
