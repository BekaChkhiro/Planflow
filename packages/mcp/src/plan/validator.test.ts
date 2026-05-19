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
