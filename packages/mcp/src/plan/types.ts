/**
 * PlanFlow MCP — Plan Authoring Types
 *
 * Structured representation of a PROJECT_PLAN.md plan tree.
 * Used by the parser, validator, scaffolder, and refiner.
 *
 * The plan is a tree:
 *   Plan → Phases → Tasks
 * Tasks carry dependency edges to other task IDs (e.g. "T1.2").
 */

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'
export type TaskComplexity = 'Low' | 'Medium' | 'High'

/**
 * A single implementation task in the plan.
 *
 * `acceptanceCriteria` and `testTaskId` are MCP-only extensions —
 * they live in markdown bullet form so the cloud (which only stores
 * the structured fields) doesn't lose them on round-trip.
 */
export interface TaskNode {
  taskId: string                  // "T1.2"
  phase: number                   // 1, 2, 3, 4...
  name: string
  description: string             // raw bullet block as markdown
  status: TaskStatus
  complexity: TaskComplexity
  estimatedHours?: number
  dependencies: string[]          // ["T1.1"]
  acceptanceCriteria?: string[]   // optional bullet list
  testTaskId?: string             // pointer to companion test task
  /** Original line offset in the source markdown — used by refiner for in-place patching. */
  sourceLine?: number
}

export interface PhaseNode {
  number: number
  name: string                    // "Foundation"
  estimate?: string               // raw "Est: 16h" or similar
  /**
   * What this phase delivers — its milestone, in one sentence. The
   * anchor for verifying the phase's tasks actually add up to something
   * coherent. (Markdown: `**Goal**: ...` after the phase header.)
   */
  goal?: string
  /**
   * Testable conditions that mean the phase is "done" — the gate before
   * the next phase begins. (Markdown: `**Exit Criteria**:` bullet list.)
   */
  exitCriteria?: string[]
  tasks: TaskNode[]
}

/**
 * Header metadata parsed from the top of PROJECT_PLAN.md.
 */
export interface PlanMeta {
  projectName?: string
  description?: string
  targetUsers?: string
  projectType?: string
  status?: string
  createdDate?: string
  lastUpdated?: string
  /**
   * The "Brief" — scope boundaries set before any task exists. Errors
   * here poison the whole plan, so they're captured structurally:
   *   • nonGoals        — what is explicitly OUT of scope
   *   • successCriteria — what "done" means for the whole project
   * (Markdown: `## Non-Goals` and `## Success Criteria` bullet sections.)
   */
  nonGoals?: string[]
  successCriteria?: string[]
  /**
   * The declared core features — the intent the plan must deliver.
   * Traceability checks every feature against the task list so a
   * promised feature can't silently lack an implementing task.
   * (Markdown: `## Features` / `## Core Features` / `## MVP Features`.)
   */
  features?: string[]
}

export interface PlanTree {
  meta: PlanMeta
  phases: PhaseNode[]
  /** Markdown sections we don't need to touch — kept verbatim so re-serialize is lossless. */
  preamble: string                // everything before first phase
  postamble: string               // everything after last phase
  /** Source markdown verbatim (for refiner diffing). */
  source: string
}

// ─────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────

export type IssueSeverity = 'error' | 'warning' | 'info'

export type IssueCode =
  // structural (errors)
  | 'duplicate_task_id'
  | 'dependency_cycle'
  | 'orphan_dependency'
  | 'phase_order_violation'
  | 'malformed_task'
  | 'invalid_status'
  | 'invalid_complexity'
  | 'invalid_phase_number'
  | 'empty_plan'
  // quality (warnings)
  | 'phase_imbalance'
  | 'complexity_skew'
  | 'missing_description'
  | 'short_description'
  | 'missing_hours'
  | 'vague_name'
  | 'unrealistic_hours'
  // testing (warnings)
  | 'missing_test_task'
  | 'missing_testing_section'
  | 'feature_without_acceptance_criteria'
  // instruction precision (warnings) — is the task spec unambiguous
  // enough for an agent to execute without guessing?
  | 'missing_touchpoints'
  | 'missing_contract'
  | 'missing_constraints'
  | 'thin_instructions'
  // outline / structure (warnings) — is the plan skeleton sound before
  // tasks are even filled in?
  | 'missing_phase_goal'
  | 'missing_exit_criteria'
  | 'missing_non_goals'
  | 'empty_outline'
  | 'phase_numbering'
  | 'phase_no_tasks'
  // traceability (warnings) — does the plan actually cover the intent?
  | 'feature_not_covered'
  // production (warnings)
  | 'missing_deployment_task'
  | 'missing_monitoring_task'
  | 'missing_error_handling_task'
  | 'missing_security_task'
  | 'missing_env_management'

export interface PlanIssue {
  code: IssueCode
  severity: IssueSeverity
  message: string
  /** Task or phase the issue is about, if applicable. */
  taskId?: string
  phase?: number
  /** Concrete suggestion the refiner or Claude can act on. */
  fix?: string
}

/**
 * Per-task instruction-precision breakdown. Measures whether a task's
 * spec is unambiguous enough that an agent can execute it without
 * guessing — the difference between "long description" and "precise
 * instructions". Computed only for feature tasks (Medium/High, not a
 * setup/test task), since trivial tasks don't need the full contract.
 */
export interface TaskPrecision {
  taskId: string
  /** 0-100 — fraction of the precision checklist the task satisfies. */
  score: number
  /** Checklist items the task is missing (e.g. "contract", "touchpoints"). */
  missing: string[]
}

export interface PrecisionSummary {
  /** Average precision score across all feature tasks (0-100). */
  avgScore: number
  /** Number of feature tasks scored. */
  scoredTasks: number
  /** Per-task breakdown, sorted lowest-score first. */
  tasks: TaskPrecision[]
}

/**
 * Feature → task traceability. Answers "does the plan actually cover
 * what it set out to build?" — the only completeness measure, as opposed
 * to the consistency checks everything else performs.
 */
export interface CoverageSummary {
  /** Number of declared features. */
  features: number
  /** How many have at least one implementing task. */
  covered: number
  /** Declared features with no implementing task found. */
  uncovered: string[]
}

export interface ValidationReport {
  ok: boolean                     // true iff no `error`-severity issues
  totals: {
    phases: number
    tasks: number
    errors: number
    warnings: number
    infos: number
  }
  issues: PlanIssue[]
  /**
   * Instruction-precision summary. Present when the plan has at least
   * one feature task to score. Surfaces "how ready is this plan for an
   * agent to execute flawlessly" as a single number plus per-task gaps.
   */
  precision?: PrecisionSummary
  /**
   * Feature → task coverage. Present when the plan declares features
   * (a `## Features` section). Surfaces promised-but-unbuilt features.
   */
  coverage?: CoverageSummary
}

// ─────────────────────────────────────────────────────────────────
// Scaffold inputs
// ─────────────────────────────────────────────────────────────────

export type ProjectType =
  | 'fullstack'
  | 'backend-api'
  | 'frontend-spa'
  | 'mobile'
  | 'cli'
  | 'library'
  | 'generic'

export interface ScaffoldInput {
  projectName: string
  projectType: ProjectType
  description: string
  targetUsers?: string
  features: string[]              // 3-7 core features
  stack: {
    frontend?: string
    backend?: string
    database?: string
    hosting?: string
    language?: string
  }
  flags: {
    auth?: boolean
    realtime?: boolean
    fileUploads?: boolean
    payments?: boolean
    notifications?: boolean
  }
}
