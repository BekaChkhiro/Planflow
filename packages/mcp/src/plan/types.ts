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
