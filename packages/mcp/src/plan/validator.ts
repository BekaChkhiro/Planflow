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
  PlanIssue,
  PlanTree,
  TaskNode,
  ValidationReport,
} from './types.js'

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

/**
 * Main validation entry point.
 */
export function validatePlan(plan: PlanTree): ValidationReport {
  const issues: PlanIssue[] = []

  issues.push(...checkStructural(plan))
  issues.push(...checkQuality(plan))
  issues.push(...checkTesting(plan))
  issues.push(...checkProduction(plan))

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
  }
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
