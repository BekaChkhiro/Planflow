/**
 * Tests for the plan validator + parser + scaffolder.
 *
 * These tests pin down the quality gate so plan authoring tools
 * keep producing production-ready output as the rule set grows.
 */

import { describe, it, expect } from 'vitest'
import { parsePlan } from './parser.js'
import { validatePlan } from './validator.js'
import { scaffoldPlan } from './scaffold.js'
import { serializePlan } from './serializer.js'
import { refinePlan } from './refiner.js'
import { composeDescription } from './task-spec.js'
import { validateOutline, validatePhase } from './validator.js'
import { buildOutline, buildOutlineMarkdown } from './outline.js'
import { analyzeGaps } from './gaps.js'

const minimalPlan = `# Test Project - Project Plan

## Overview

**Project Name**: Test Project
**Description**: A test plan
**Project Type**: Generic

---

## Testing Strategy

Unit, integration, and E2E tests run per phase.

## Production Readiness Checklist

- [ ] Deployment configured
- [ ] Monitoring + logging
- [ ] Error tracking (Sentry)
- [ ] Environment / secrets handling
- [ ] Security review

## Tasks & Implementation Plan

### Phase 1: Foundation

#### T1.1: Initialize repo and toolchain
- [ ] **Status**: TODO
- **Complexity**: Low
- **Estimated**: 2 hours
- **Dependencies**: None
- **Description**:
  - Set up git
  - Configure TypeScript
  - Add lint + format

---

### Phase 2: Core Features

#### T2.1: Implement user login
- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 6 hours
- **Dependencies**: T1.1
- **Description**:
  - Build endpoint
  - Hash passwords
  - Issue token
- **Acceptance Criteria**:
  - Returns 200 on valid credentials
  - Returns 401 on invalid credentials

---

### Phase 3: Testing & Deployment

#### T3.1: Test login endpoint with integration tests
- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 4 hours
- **Dependencies**: T2.1
- **Description**:
  - Cover happy path
  - Cover invalid credentials
  - Cover rate limit
- **Acceptance Criteria**:
  - All branches covered
  - Runs in CI

#### T3.2: Deploy to production
- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 4 hours
- **Dependencies**: T3.1
- **Description**:
  - Configure CI/CD
  - Set up monitoring
  - Configure error tracking via Sentry
  - Manage secrets in environment vault
- **Acceptance Criteria**:
  - Merge to main deploys automatically
  - Rollback works in under 5 minutes
`

describe('parsePlan', () => {
  it('parses phases and tasks', () => {
    const tree = parsePlan(minimalPlan)
    expect(tree.phases.length).toBe(3)
    expect(tree.phases[0]!.tasks.length).toBe(1)
    expect(tree.phases[1]!.tasks[0]!.taskId).toBe('T2.1')
    expect(tree.phases[1]!.tasks[0]!.complexity).toBe('Medium')
    expect(tree.phases[1]!.tasks[0]!.dependencies).toEqual(['T1.1'])
    expect(tree.phases[1]!.tasks[0]!.estimatedHours).toBe(6)
    expect(tree.phases[1]!.tasks[0]!.acceptanceCriteria?.length).toBe(2)
  })

  it('extracts project meta', () => {
    const tree = parsePlan(minimalPlan)
    expect(tree.meta.projectName).toBe('Test Project')
    expect(tree.meta.description).toBe('A test plan')
  })
})

describe('validatePlan', () => {
  it('passes a clean minimal plan', () => {
    const report = validatePlan(parsePlan(minimalPlan))
    expect(report.totals.errors).toBe(0)
    // Warnings might exist (e.g. small phase sizes), but no errors.
    expect(report.ok).toBe(true)
  })

  it('detects duplicate task IDs', () => {
    const broken = minimalPlan.replace('T2.1:', 'T1.1:')
    const report = validatePlan(parsePlan(broken))
    expect(report.issues.some((i) => i.code === 'duplicate_task_id')).toBe(true)
    expect(report.ok).toBe(false)
  })

  it('detects orphan dependencies', () => {
    const broken = minimalPlan.replace(
      '- **Dependencies**: T1.1\n- **Description**:\n  - Build endpoint',
      '- **Dependencies**: T9.9\n- **Description**:\n  - Build endpoint'
    )
    const report = validatePlan(parsePlan(broken))
    expect(report.issues.some((i) => i.code === 'orphan_dependency')).toBe(true)
  })

  it('detects phase order violations', () => {
    // T1.1 depending on T2.1 (a later phase) is a violation
    const broken = minimalPlan.replace(
      '#### T1.1: Initialize repo and toolchain\n- [ ] **Status**: TODO\n- **Complexity**: Low\n- **Estimated**: 2 hours\n- **Dependencies**: None',
      '#### T1.1: Initialize repo and toolchain\n- [ ] **Status**: TODO\n- **Complexity**: Low\n- **Estimated**: 2 hours\n- **Dependencies**: T2.1'
    )
    const report = validatePlan(parsePlan(broken))
    expect(report.issues.some((i) => i.code === 'phase_order_violation')).toBe(true)
  })

  it('detects dependency cycles', () => {
    const cycled = `${minimalPlan}\n\n### Phase 4: Extra\n\n#### T4.1: First\n- [ ] **Status**: TODO\n- **Complexity**: Low\n- **Estimated**: 2 hours\n- **Dependencies**: T4.2\n- **Description**:\n  - x\n\n#### T4.2: Second\n- [ ] **Status**: TODO\n- **Complexity**: Low\n- **Estimated**: 2 hours\n- **Dependencies**: T4.1\n- **Description**:\n  - x\n`
    const report = validatePlan(parsePlan(cycled))
    expect(report.issues.some((i) => i.code === 'dependency_cycle')).toBe(true)
  })

  it('flags missing testing for a plain plan', () => {
    const noTests = `# Bare\n\n## Tasks & Implementation Plan\n\n### Phase 1: Foundation\n\n#### T1.1: Build feature\n- [ ] **Status**: TODO\n- **Complexity**: Medium\n- **Estimated**: 6 hours\n- **Dependencies**: None\n- **Description**:\n  - implement\n- **Acceptance Criteria**:\n  - works\n`
    const report = validatePlan(parsePlan(noTests))
    expect(report.issues.some((i) => i.code === 'missing_testing_section')).toBe(true)
  })

  it('flags missing production readiness items', () => {
    const noProd = `# Bare\n\n## Tasks & Implementation Plan\n\n### Phase 1: Foundation\n\n#### T1.1: Build feature\n- [ ] **Status**: TODO\n- **Complexity**: Medium\n- **Estimated**: 6 hours\n- **Dependencies**: None\n- **Description**:\n  - implement\n- **Acceptance Criteria**:\n  - works\n`
    const report = validatePlan(parsePlan(noProd))
    const codes = new Set(report.issues.map((i) => i.code))
    expect(codes.has('missing_deployment_task')).toBe(true)
    expect(codes.has('missing_monitoring_task')).toBe(true)
    expect(codes.has('missing_security_task')).toBe(true)
  })

  it('flags vague task names', () => {
    const vague = minimalPlan.replace(
      '#### T2.1: Implement user login',
      '#### T2.1: Misc stuff'
    )
    const report = validatePlan(parsePlan(vague))
    expect(report.issues.some((i) => i.code === 'vague_name')).toBe(true)
  })
})

describe('instruction precision', () => {
  // A feature task with no files, no contract, no steps, no verify.
  const thinPlan = `# Bare

## Tasks & Implementation Plan

### Phase 1: Foundation

#### T1.1: Setup repo
- [ ] **Status**: TODO
- **Complexity**: Low
- **Estimated**: 2 hours
- **Dependencies**: None
- **Description**:
  - git init

### Phase 2: Core

#### T2.1: Build the dashboard feature properly
- [ ] **Status**: TODO
- **Complexity**: High
- **Estimated**: 10 hours
- **Dependencies**: T1.1
- **Description**:
  - Handle the data and make it work

### Phase 3: Testing

#### T3.1: Test the dashboard
- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 4 hours
- **Dependencies**: T2.1
- **Description**:
  - cover it
`

  it('flags a feature task with no touchpoints or contract', () => {
    const report = validatePlan(parsePlan(thinPlan))
    const codes = new Set(
      report.issues.filter((i) => i.taskId === 'T2.1').map((i) => i.code)
    )
    expect(codes.has('missing_touchpoints')).toBe(true)
    expect(codes.has('missing_contract')).toBe(true)
    expect(codes.has('missing_constraints')).toBe(true) // High complexity
    expect(codes.has('thin_instructions')).toBe(true)
  })

  it('does not flag the phase-1 setup task or the test task', () => {
    const report = validatePlan(parsePlan(thinPlan))
    const flagged = new Set(
      report.issues
        .filter((i) => i.code === 'missing_contract')
        .map((i) => i.taskId)
    )
    expect(flagged.has('T1.1')).toBe(false) // phase 1 setup
    expect(flagged.has('T3.1')).toBe(false) // test task
  })

  it('reports a precision summary with a low average for a thin plan', () => {
    const report = validatePlan(parsePlan(thinPlan))
    expect(report.precision).toBeDefined()
    expect(report.precision!.scoredTasks).toBe(1) // only T2.1 is a feature task
    expect(report.precision!.avgScore).toBeLessThan(50)
  })

  it('scores a precise task highly and does not flag it', () => {
    const precise = `# Bare

## Tasks & Implementation Plan

### Phase 1: Foundation

#### T1.1: Setup repo
- [ ] **Status**: TODO
- **Complexity**: Low
- **Estimated**: 2 hours
- **Dependencies**: None
- **Description**:
  - git init

### Phase 2: Core

#### T2.1: Implement JWT login endpoint
- [ ] **Status**: TODO
- **Complexity**: High
- **Estimated**: 10 hours
- **Dependencies**: T1.1
- **Test Task**: T3.1
- **Description**:
  - **Touchpoints**: create src/routes/auth/login.ts, edit src/routes/index.ts
  - **Contract**: POST /api/auth/login, request { email, password }, response 200 { token }, 401 on invalid
  - **Steps**:
  - 1. Validate body with Zod
  - 2. Look up user and compare password hash
  - 3. Sign and return token
  - **Constraints**: do not add refresh tokens; must not touch session middleware
- **Acceptance Criteria**:
  - Valid creds return 200 with a decodable JWT
  - Wrong password returns 401

### Phase 3: Testing

#### T3.1: Test login endpoint
- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 4 hours
- **Dependencies**: T2.1
- **Description**:
  - cover all paths
`
    const report = validatePlan(parsePlan(precise))
    const t21 = report.precision!.tasks.find((t) => t.taskId === 'T2.1')!
    expect(t21.score).toBeGreaterThanOrEqual(80)
    const codes = new Set(
      report.issues.filter((i) => i.taskId === 'T2.1').map((i) => i.code)
    )
    expect(codes.has('missing_touchpoints')).toBe(false)
    expect(codes.has('missing_contract')).toBe(false)
    expect(codes.has('thin_instructions')).toBe(false)
  })
})

describe('phase outline (goal / exit criteria / non-goals)', () => {
  const outlinePlan = `# Demo - Project Plan

## Overview

**Description**: A demo

## Non-Goals

- No mobile app in this milestone
- No third-party integrations yet

## Tasks & Implementation Plan

### Phase 1: Foundation

**Goal**: Stand up the toolchain and data layer.

**Exit Criteria**:
- Fresh clone builds and lints
- CI green on PRs

#### T1.1: Initialize repo
- [ ] **Status**: TODO
- **Complexity**: Low
- **Estimated**: 2 hours
- **Dependencies**: None
- **Description**:
  - git init

### Phase 2: Core

#### T2.1: Build a core feature
- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 6 hours
- **Dependencies**: T1.1
- **Description**:
  - implement it
- **Acceptance Criteria**:
  - works
`

  it('parses phase goal and exit criteria', () => {
    const tree = parsePlan(outlinePlan)
    const p1 = tree.phases.find((p) => p.number === 1)!
    expect(p1.goal).toBe('Stand up the toolchain and data layer.')
    expect(p1.exitCriteria).toEqual(['Fresh clone builds and lints', 'CI green on PRs'])
  })

  it('parses non-goals into plan meta', () => {
    const tree = parsePlan(outlinePlan)
    expect(tree.meta.nonGoals).toEqual([
      'No mobile app in this milestone',
      'No third-party integrations yet',
    ])
  })

  it('round-trips goal + exit criteria through serialize', () => {
    const tree = parsePlan(outlinePlan)
    const tree2 = parsePlan(serializePlan(tree))
    const p1 = tree2.phases.find((p) => p.number === 1)!
    expect(p1.goal).toBe('Stand up the toolchain and data layer.')
    expect(p1.exitCriteria).toEqual(['Fresh clone builds and lints', 'CI green on PRs'])
    // tasks preserved
    expect(tree2.phases.flatMap((p) => p.tasks).length).toBe(
      tree.phases.flatMap((p) => p.tasks).length
    )
  })

  it('flags a phase with no goal and a plan with no non-goals', () => {
    const bare = `# Bare

## Tasks & Implementation Plan

### Phase 1: Foundation

#### T1.1: Setup
- [ ] **Status**: TODO
- **Complexity**: Low
- **Estimated**: 2 hours
- **Dependencies**: None
- **Description**:
  - git init
`
    const report = validatePlan(parsePlan(bare))
    const codes = new Set(report.issues.map((i) => i.code))
    expect(codes.has('missing_phase_goal')).toBe(true)
    expect(codes.has('missing_exit_criteria')).toBe(true)
    expect(codes.has('missing_non_goals')).toBe(true)
  })

  it('does not flag goal/non-goals when present', () => {
    const report = validatePlan(parsePlan(outlinePlan))
    const codes = new Set(report.issues.map((i) => i.code))
    expect(codes.has('missing_non_goals')).toBe(false)
    // Phase 1 has a goal; should not be flagged
    const p1GoalMissing = report.issues.some(
      (i) => i.code === 'missing_phase_goal' && i.phase === 1
    )
    expect(p1GoalMissing).toBe(false)
  })
})

describe('traceability (feature → task coverage)', () => {
  const planWith = (featureTaskName: string) => `# Demo - Project Plan

## Overview

**Description**: A demo

## Core Features

- Inventory CRUD
- Multi-store sync

## Tasks & Implementation Plan

### Phase 1: Foundation

**Goal**: Toolchain.

**Exit Criteria**:
- builds

#### T1.1: Setup
- [ ] **Status**: TODO
- **Complexity**: Low
- **Estimated**: 2 hours
- **Dependencies**: None
- **Description**:
  - git init

### Phase 2: Core

**Goal**: Core value.

**Exit Criteria**:
- works

#### T2.1: ${featureTaskName}
- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 6 hours
- **Dependencies**: T1.1
- **Description**:
  - build it
- **Acceptance Criteria**:
  - works
`

  it('parses a Core Features section into meta', () => {
    const tree = parsePlan(planWith('Implement inventory CRUD'))
    expect(tree.meta.features).toEqual(['Inventory CRUD', 'Multi-store sync'])
  })

  it('flags a declared feature with no implementing task', () => {
    // Only "Inventory CRUD" has a task; "Multi-store sync" does not.
    const report = validatePlan(parsePlan(planWith('Implement inventory CRUD')))
    const uncoveredIssue = report.issues.find((i) => i.code === 'feature_not_covered')
    expect(uncoveredIssue).toBeDefined()
    expect(uncoveredIssue!.message).toContain('Multi-store sync')
    expect(report.coverage).toBeDefined()
    expect(report.coverage!.features).toBe(2)
    expect(report.coverage!.covered).toBe(1)
    expect(report.coverage!.uncovered).toEqual(['Multi-store sync'])
  })

  it('marks all features covered when each has a task', () => {
    const plan = planWith('Implement inventory CRUD').replace(
      '### Phase 2: Core\n\n**Goal**: Core value.\n\n**Exit Criteria**:\n- works\n',
      `### Phase 2: Core

**Goal**: Core value.

**Exit Criteria**:
- works

#### T2.2: Build multi-store sync engine
- [ ] **Status**: TODO
- **Complexity**: High
- **Estimated**: 10 hours
- **Dependencies**: T1.1
- **Description**:
  - sync stores
- **Acceptance Criteria**:
  - converge
`
    )
    const report = validatePlan(parsePlan(plan))
    expect(report.coverage!.covered).toBe(2)
    expect(report.issues.some((i) => i.code === 'feature_not_covered')).toBe(false)
  })

  it('omits coverage when no features are declared', () => {
    const noFeatures = planWith('Implement inventory CRUD').replace(
      '## Core Features\n\n- Inventory CRUD\n- Multi-store sync\n\n',
      ''
    )
    const report = validatePlan(parsePlan(noFeatures))
    expect(report.coverage).toBeUndefined()
  })
})

describe('analyzeGaps (adversarial what-is-missing)', () => {
  it('flags missing categories and recognizes addressed ones', () => {
    const plan = `# Demo

## Tasks & Implementation Plan

### Phase 1: Foundation

#### T1.1: Add versioned database migrations with rollback
- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 4 hours
- **Dependencies**: None
- **Description**:
  - reversible schema migrations
  - backup and restore drill
`
    const report = analyzeGaps(parsePlan(plan))
    const addressed = new Set(report.addressed.map((c) => c.key))
    const missing = new Set(report.missing.map((c) => c.key))
    // migration + backup mentioned → addressed
    expect(addressed.has('data_migration')).toBe(true)
    expect(addressed.has('backup_recovery')).toBe(true)
    // nothing about a11y, pagination, ui states, concurrency → missing
    expect(missing.has('accessibility')).toBe(true)
    expect(missing.has('pagination')).toBe(true)
    expect(missing.has('ui_states')).toBe(true)
    expect(missing.has('concurrency')).toBe(true)
  })

  it('every category is either addressed or missing, never both', () => {
    const report = analyzeGaps(parsePlan('# Empty\n\n## Tasks & Implementation Plan\n'))
    expect(report.addressed.length + report.missing.length).toBe(report.categories.length)
    // a bare plan addresses nothing
    expect(report.addressed.length).toBe(0)
    expect(report.missing.length).toBe(report.categories.length)
  })

  it('each missing category carries a probing question and a suggested task', () => {
    const report = analyzeGaps(parsePlan('# Empty\n\n## Tasks & Implementation Plan\n'))
    for (const c of report.missing) {
      expect(c.prompt.length).toBeGreaterThan(0)
      expect(c.suggestedTask.length).toBeGreaterThan(0)
    }
  })
})

describe('buildOutline', () => {
  const input = {
    projectName: 'Acme',
    description: 'B2B inventory tool for SMB retailers with multi-store sync.',
    targetUsers: 'Retail managers',
    projectType: 'fullstack',
    nonGoals: ['No mobile app this milestone'],
    successCriteria: ['Two stores stay in sync in production'],
    phases: [
      {
        number: 2,
        name: 'Core Features',
        goal: 'Deliver inventory CRUD and multi-store sync end-to-end.',
        exitCriteria: ['Inventory editable and persists', 'Two stores converge within 30s'],
      },
      {
        number: 1,
        name: 'Foundation',
        goal: 'Stand up repo, DB, auth, and CI so feature work can begin.',
        exitCriteria: ['Fresh clone builds and CI is green'],
      },
    ],
  }

  it('builds a task-less skeleton that passes the outline gate', () => {
    const tree = buildOutline(input)
    // Phases sorted by number, no tasks
    expect(tree.phases.map((p) => p.number)).toEqual([1, 2])
    expect(tree.phases.every((p) => p.tasks.length === 0)).toBe(true)
    const report = validateOutline(tree)
    expect(report.ok).toBe(true)
    expect(report.issues.some((i) => i.code === 'missing_phase_goal')).toBe(false)
    expect(report.issues.some((i) => i.code === 'missing_non_goals')).toBe(false)
  })

  it('round-trips goal/exit/non-goals through serialize + parse', () => {
    const tree2 = parsePlan(buildOutlineMarkdown(input))
    const p1 = tree2.phases.find((p) => p.number === 1)!
    expect(p1.goal).toBe('Stand up repo, DB, auth, and CI so feature work can begin.')
    expect(p1.exitCriteria).toEqual(['Fresh clone builds and CI is green'])
    expect(tree2.meta.nonGoals).toEqual(['No mobile app this milestone'])
    expect(tree2.meta.successCriteria).toEqual(['Two stores stay in sync in production'])
  })
})

describe('stage validators (outline / phase)', () => {
  it('validateOutline ignores task-level detail and does not require tasks', () => {
    // Phases with goals + exit criteria but ZERO tasks — would be an
    // error for validatePlan (empty_plan), but fine for the outline gate.
    const outlineOnly = `# Demo - Project Plan

## Overview

**Description**: A demo

## Non-Goals

- No mobile app yet

## Tasks & Implementation Plan

### Phase 1: Foundation

**Goal**: Stand up the toolchain.

**Exit Criteria**:
- Builds and lints

### Phase 2: Core Features

**Goal**: Deliver the core value.

**Exit Criteria**:
- Features work end-to-end
`
    const report = validateOutline(parsePlan(outlineOnly))
    expect(report.ok).toBe(true)
    // No task-level or empty_plan errors leak in
    expect(report.issues.some((i) => i.code === 'empty_plan')).toBe(false)
    expect(report.issues.some((i) => i.code === 'missing_touchpoints')).toBe(false)
  })

  it('validateOutline flags missing goal, non-sequential numbering, empty outline', () => {
    const bad = `# Demo

## Tasks & Implementation Plan

### Phase 1: Foundation

#### T1.1: Setup
- [ ] **Status**: TODO
- **Complexity**: Low
- **Estimated**: 2 hours
- **Dependencies**: None
- **Description**:
  - x

### Phase 3: Skipped Two

**Goal**: Something.
`
    const report = validateOutline(parsePlan(bad))
    const codes = new Set(report.issues.map((i) => i.code))
    expect(codes.has('missing_phase_goal')).toBe(true) // Phase 1 has no goal
    expect(codes.has('phase_numbering')).toBe(true) // 1, 3 — gap
  })

  it('validateOutline reports empty_outline for a plan with no phases', () => {
    const report = validateOutline(parsePlan('# Empty\n\nNo phases here.\n'))
    expect(report.ok).toBe(false)
    expect(report.issues.some((i) => i.code === 'empty_outline')).toBe(true)
  })

  it('validatePhase scopes issues + precision to one phase', () => {
    const plan = `# Demo

## Tasks & Implementation Plan

### Phase 1: Foundation

**Goal**: Toolchain.

**Exit Criteria**:
- builds

#### T1.1: Setup
- [ ] **Status**: TODO
- **Complexity**: Low
- **Estimated**: 2 hours
- **Dependencies**: None
- **Description**:
  - git init

### Phase 2: Core

**Goal**: Core value.

**Exit Criteria**:
- works

#### T2.1: Build a thin feature
- [ ] **Status**: TODO
- **Complexity**: High
- **Estimated**: 10 hours
- **Dependencies**: T1.1
- **Description**:
  - do the thing
- **Acceptance Criteria**:
  - it works

### Phase 3: Testing & Deployment

**Goal**: Ship it.

**Exit Criteria**:
- deployed

#### T3.1: Test and deploy the feature
- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 4 hours
- **Dependencies**: T2.1
- **Description**:
  - cover paths
- **Acceptance Criteria**:
  - green in CI
`
    const report = validatePhase(parsePlan(plan), 2)
    // Only phase-2 tasks scored
    expect(report.precision!.scoredTasks).toBe(1)
    expect(report.precision!.tasks[0]!.taskId).toBe('T2.1')
    // T2.1 is thin → flagged within the phase gate
    expect(report.issues.some((i) => i.taskId === 'T2.1' && i.code === 'missing_touchpoints')).toBe(true)
    // No phase-1 task issues leak in
    expect(report.issues.some((i) => i.taskId === 'T1.1')).toBe(false)
    // Plan-global production warnings are not part of the phase gate
    expect(report.issues.some((i) => i.code === 'missing_deployment_task')).toBe(false)
  })

  it('validatePhase errors on a non-existent or empty phase', () => {
    const plan = `# Demo

## Tasks & Implementation Plan

### Phase 1: Foundation

**Goal**: x

#### T1.1: Setup
- [ ] **Status**: TODO
- **Complexity**: Low
- **Estimated**: 2 hours
- **Dependencies**: None
- **Description**:
  - x
`
    const missing = validatePhase(parsePlan(plan), 9)
    expect(missing.ok).toBe(false)
    expect(missing.issues.some((i) => i.code === 'invalid_phase_number')).toBe(true)
  })
})

describe('composeDescription', () => {
  it('emits labeled spec sections the precision check detects', () => {
    const desc = composeDescription('Keep two store inventories converged.', {
      touchpoints: ['create src/sync/engine.ts', 'edit src/sync/index.ts'],
      contract: 'syncStores(a, b): Promise<SyncResult>; last-write-wins',
      steps: ['Diff snapshots', 'Resolve conflicts', 'Retry on failure'],
      constraints: ['do not change the inventory schema'],
      verify: 'pnpm test src/sync',
    })
    expect(desc).toContain('**Touchpoints**')
    expect(desc).toContain('**Contract**')
    expect(desc).toContain('**Steps**')
    expect(desc).toContain('**Constraints**')
    expect(desc).toContain('**Verify**')
    // Steps are numbered
    expect(desc).toContain('1. Diff snapshots')
  })

  it('is additive — empty spec returns just the normalized body', () => {
    const desc = composeDescription('Build the thing\nWire it up', {})
    expect(desc).toBe('  - Build the thing\n  - Wire it up')
  })

  it('lifts a thin task to high precision when used in a plan', () => {
    const plan = `# Bare

## Tasks & Implementation Plan

### Phase 1: Foundation

#### T1.1: Setup
- [ ] **Status**: TODO
- **Complexity**: Low
- **Estimated**: 2 hours
- **Dependencies**: None
- **Description**:
  - git init

### Phase 2: Core

#### T2.1: Implement the sync engine
- [ ] **Status**: TODO
- **Complexity**: High
- **Estimated**: 10 hours
- **Dependencies**: T1.1
- **Test Task**: T3.1
- **Description**:
${composeDescription('Keep two store inventories converged in near-real-time.', {
  touchpoints: ['create src/sync/engine.ts'],
  contract: 'POST /api/sync, request { a, b }, response 200 { status }',
  steps: ['Diff', 'Resolve', 'Retry'],
  constraints: ['do not change inventory schema'],
  verify: 'pnpm test src/sync',
})}
- **Acceptance Criteria**:
  - Stores converge within 30s

### Phase 3: Testing

#### T3.1: Test sync engine
- [ ] **Status**: TODO
- **Complexity**: Medium
- **Estimated**: 4 hours
- **Dependencies**: T2.1
- **Description**:
  - cover paths
`
    const report = validatePlan(parsePlan(plan))
    const t21 = report.precision!.tasks.find((t) => t.taskId === 'T2.1')!
    expect(t21.score).toBe(100)
  })
})

describe('scaffoldPlan', () => {
  it('produces a plan that passes validation cleanly', () => {
    const markdown = scaffoldPlan({
      projectName: 'Acme',
      projectType: 'fullstack',
      description: 'A SaaS app for retail inventory management.',
      targetUsers: 'SMB retailers',
      features: ['Inventory CRUD', 'Multi-store sync', 'Sales reports'],
      stack: {
        frontend: 'React',
        backend: 'Node + Hono',
        database: 'PostgreSQL',
        hosting: 'Railway',
      },
      flags: { auth: true, realtime: true, fileUploads: false },
    })
    const report = validatePlan(parsePlan(markdown))
    expect(report.totals.errors).toBe(0)
  })

  it('stamps spec prompts on feature tasks so they are not flagged thin', () => {
    const markdown = scaffoldPlan({
      projectName: 'Acme',
      projectType: 'fullstack',
      description: 'A SaaS app for retail inventory management.',
      features: ['Inventory CRUD', 'Multi-store sync'],
      stack: { frontend: 'React', backend: 'Node + Hono', database: 'PostgreSQL' },
      flags: { auth: true },
    })
    expect(markdown).toContain('**Touchpoints**')
    expect(markdown).toContain('**Contract**')
    const report = validatePlan(parsePlan(markdown))
    // Phase-2 feature tasks should not be flagged for missing touchpoints
    // or contract — the scaffold stamps the section prompts.
    const phase2Flagged = report.issues.filter(
      (i) =>
        (i.code === 'missing_touchpoints' || i.code === 'missing_contract') &&
        i.taskId?.startsWith('T2.')
    )
    expect(phase2Flagged.length).toBe(0)
    // And the plan reports a precision summary.
    expect(report.precision).toBeDefined()
    expect(report.precision!.avgScore).toBeGreaterThanOrEqual(70)
  })

  it('rountrips through parse + serialize without losing tasks', () => {
    const markdown = scaffoldPlan({
      projectName: 'Acme',
      projectType: 'backend-api',
      description: 'API for internal tools',
      features: ['Health check', 'Item CRUD'],
      stack: { backend: 'Node + Hono', database: 'PostgreSQL' },
      flags: { auth: true },
    })
    const tree = parsePlan(markdown)
    const re = serializePlan(tree)
    const tree2 = parsePlan(re)
    expect(tree2.phases.length).toBe(tree.phases.length)
    expect(tree2.phases.flatMap((p) => p.tasks).length).toBe(
      tree.phases.flatMap((p) => p.tasks).length
    )
  })
})

describe('refinePlan', () => {
  it('drops orphan dependencies', () => {
    const broken = minimalPlan.replace(
      '- **Dependencies**: T1.1\n- **Description**:\n  - Build endpoint',
      '- **Dependencies**: T9.9\n- **Description**:\n  - Build endpoint'
    )
    const tree = parsePlan(broken)
    const report = validatePlan(tree)
    const { fixes } = refinePlan(tree, report)
    expect(fixes.some((f) => f.includes('orphan'))).toBe(true)
    const reReport = validatePlan(tree)
    expect(reReport.issues.some((i) => i.code === 'orphan_dependency')).toBe(false)
  })

  it('renumbers duplicate task IDs', () => {
    const broken = minimalPlan.replace('T2.1:', 'T1.1:')
    const tree = parsePlan(broken)
    const report = validatePlan(tree)
    const { fixes } = refinePlan(tree, report)
    expect(fixes.some((f) => f.includes('Renumbered'))).toBe(true)
    const reReport = validatePlan(tree)
    expect(reReport.issues.some((i) => i.code === 'duplicate_task_id')).toBe(false)
  })

  it('breaks cycles', () => {
    const cycled = `${minimalPlan}\n\n### Phase 4: Extra\n\n#### T4.1: First task in extra phase\n- [ ] **Status**: TODO\n- **Complexity**: Low\n- **Estimated**: 2 hours\n- **Dependencies**: T4.2\n- **Description**:\n  - First\n\n#### T4.2: Second task in extra phase\n- [ ] **Status**: TODO\n- **Complexity**: Low\n- **Estimated**: 2 hours\n- **Dependencies**: T4.1\n- **Description**:\n  - Second\n`
    const tree = parsePlan(cycled)
    const report = validatePlan(tree)
    const { fixes } = refinePlan(tree, report)
    expect(fixes.some((f) => f.includes('cycle'))).toBe(true)
    const reReport = validatePlan(tree)
    expect(reReport.issues.some((i) => i.code === 'dependency_cycle')).toBe(false)
  })
})
