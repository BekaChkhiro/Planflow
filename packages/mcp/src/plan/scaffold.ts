/**
 * PlanFlow MCP — Plan scaffolder
 *
 * Generates a production-ready PROJECT_PLAN.md from a structured
 * ScaffoldInput. Every generated plan is guaranteed to:
 *
 *   • Include a testing strategy (unit / integration / E2E)
 *   • Include a production-readiness checklist (deploy / monitor /
 *     errors / security / env)
 *   • Pair every Medium/High feature task with a companion test task
 *   • Use unique, ordered task IDs (T1.1, T1.2, ...)
 *   • Pass `planflow_plan_validate` with zero errors out of the box
 *
 * The scaffold output is intentionally verbose — short descriptions
 * trigger validator warnings, so we err on the side of detail.
 */

import type {
  PhaseNode,
  PlanTree,
  ScaffoldInput,
  TaskNode,
} from './types.js'
import { serializePlan } from './serializer.js'
import { scaffoldSpecPrompts } from './task-spec.js'

/**
 * Generate a complete PROJECT_PLAN.md as a string from a ScaffoldInput.
 */
export function scaffoldPlan(input: ScaffoldInput): string {
  const tree = buildPlanTree(input)
  return serializePlan(tree)
}

/**
 * Build the structured PlanTree — exposed so callers can mutate
 * before serializing (e.g. inject custom phases).
 */
export function buildPlanTree(input: ScaffoldInput): PlanTree {
  const today = new Date().toISOString().slice(0, 10)

  // Build phases sequentially so each can chain dependencies onto the
  // last task of the previous phase. The "last task of Phase N" is a
  // natural gate before Phase N+1 begins.
  const foundation = buildFoundationPhase(input)
  const core = buildCoreFeaturesPhase(input, lastTaskId(foundation))
  const advanced = buildAdvancedPhase(input, lastTaskId(core))
  const testDeploy = buildTestingAndDeployPhase(
    input,
    lastTaskId(advanced),
    flattenFeatureIds(core)
  )

  const phases: PhaseNode[] = [foundation, core, advanced, testDeploy]

  // Renumber feature/test task pairs across phases consistently
  linkTestPairs(phases)

  // Stamp the precise-task template onto feature tasks so generated plans
  // start agent-ready: each gets explicit Touchpoints/Contract/Constraints/
  // Verify section prompts the user (or refining LLM) fills with specifics.
  addSpecPromptsToFeatureTasks(phases)

  return {
    meta: {
      projectName: input.projectName,
      description: input.description,
      targetUsers: input.targetUsers,
      projectType: humanProjectType(input.projectType),
      status: 'Planning',
      createdDate: today,
      lastUpdated: today,
    },
    preamble: buildPreamble(input, today),
    postamble: buildPostamble(input),
    phases,
    source: '',
  }
}

// ─────────────────────────────────────────────────────────────────
// Preamble (everything before Phase 1)
// ─────────────────────────────────────────────────────────────────

function buildPreamble(input: ScaffoldInput, today: string): string {
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
  lines.push(`**Project Type**: ${humanProjectType(input.projectType)}`)
  lines.push('')
  lines.push(`**Status**: Planning (0% complete)`)
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## Core Features')
  lines.push('')
  lines.push('The intent this plan must deliver (every feature should map to a task):')
  lines.push('')
  for (const f of input.features) lines.push(`- ${f}`)
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## Non-Goals')
  lines.push('')
  lines.push('What this project deliberately does NOT do (keeps scope honest — edit these):')
  lines.push('')
  lines.push('- _(fill in: out-of-scope features deferred to a later milestone)_')
  lines.push('- _(fill in: platforms / integrations explicitly not supported yet)_')
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## Architecture')
  lines.push('')
  lines.push('### System Overview')
  lines.push('')
  lines.push('```mermaid')
  lines.push(buildArchitectureDiagram(input))
  lines.push('```')
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## Tech Stack')
  lines.push('')
  lines.push(buildTechStack(input))
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## Testing Strategy')
  lines.push('')
  lines.push(buildTestingStrategy(input))
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## Production Readiness Checklist')
  lines.push('')
  lines.push(buildProductionChecklist(input))
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## Tasks & Implementation Plan')
  lines.push('')
  return lines.join('\n')
}

function buildArchitectureDiagram(input: ScaffoldInput): string {
  const lines: string[] = ['graph TB']
  switch (input.projectType) {
    case 'fullstack':
      lines.push('    subgraph "Client"')
      lines.push(`        FE[${input.stack.frontend ?? 'Frontend'}]`)
      lines.push('    end')
      lines.push('    subgraph "Server"')
      lines.push(`        BE[${input.stack.backend ?? 'API'}]`)
      if (input.flags.auth) lines.push('        AUTH[Auth Service]')
      lines.push('    end')
      lines.push('    subgraph "Data"')
      lines.push(`        DB[(${input.stack.database ?? 'Database'})]`)
      if (input.flags.fileUploads) lines.push('        STORE[Object Storage]')
      lines.push('    end')
      lines.push('    FE --> BE')
      if (input.flags.auth) lines.push('    BE --> AUTH')
      lines.push('    BE --> DB')
      if (input.flags.fileUploads) lines.push('    BE --> STORE')
      if (input.flags.realtime) lines.push('    FE -.->|WebSocket| BE')
      break
    case 'backend-api':
      lines.push('    CLIENT[API Client]')
      lines.push(`    API[${input.stack.backend ?? 'API Server'}]`)
      if (input.flags.auth) lines.push('    AUTH[Auth Service]')
      lines.push(`    DB[(${input.stack.database ?? 'Database'})]`)
      lines.push('    CLIENT --> API')
      if (input.flags.auth) lines.push('    API --> AUTH')
      lines.push('    API --> DB')
      break
    case 'frontend-spa':
      lines.push('    USER[User Browser]')
      lines.push(`    APP[${input.stack.frontend ?? 'SPA'}]`)
      lines.push('    API[Backend API]')
      lines.push('    USER --> APP')
      lines.push('    APP --> API')
      break
    default:
      lines.push('    APP[Application]')
      lines.push('    USER[User] --> APP')
  }
  return lines.join('\n')
}

function buildTechStack(input: ScaffoldInput): string {
  const lines: string[] = []
  if (input.stack.frontend) {
    lines.push('### Frontend')
    lines.push(`- **Framework**: ${input.stack.frontend}`)
    lines.push('- **Language**: TypeScript')
    lines.push('- **Testing**: Vitest + React Testing Library (or framework equivalent)')
    lines.push('')
  }
  if (input.stack.backend) {
    lines.push('### Backend')
    lines.push(`- **Framework**: ${input.stack.backend}`)
    lines.push(`- **Language**: ${input.stack.language ?? 'TypeScript'}`)
    lines.push('- **Validation**: Zod / equivalent')
    lines.push('- **Testing**: Vitest + Supertest')
    lines.push('')
  }
  if (input.stack.database) {
    lines.push('### Database')
    lines.push(`- **Primary**: ${input.stack.database}`)
    lines.push('- **Migrations**: Versioned schema migrations from day one')
    lines.push('')
  }
  lines.push('### DevOps & Infrastructure')
  lines.push(`- **Hosting**: ${input.stack.hosting ?? 'TBD'}`)
  lines.push('- **CI/CD**: GitHub Actions')
  lines.push('- **Monitoring**: Sentry (errors) + structured logs')
  lines.push('- **Secrets**: .env locally, secret store in production')
  return lines.join('\n')
}

function buildTestingStrategy(_input: ScaffoldInput): string {
  return [
    'Testing is not a final phase — it runs alongside every feature.',
    '',
    '- **Unit tests**: Pure functions, services, validators. Run on every commit.',
    '- **Integration tests**: API endpoints with a real database (Testcontainers or local Docker).',
    '- **E2E tests**: Critical user flows (signup, core feature, payment if applicable). Run nightly + pre-release.',
    '- **Acceptance criteria**: Every Medium/High task lists explicit, testable criteria. Tests turn each criterion into a check.',
    '- **Coverage gate**: Minimum 70% line coverage on services; CI blocks merges below this.',
    '- **Companion test tasks**: Each feature task is paired with a test task (linked via `**Test Task**: T<id>`).',
  ].join('\n')
}

function buildProductionChecklist(input: ScaffoldInput): string {
  const lines: string[] = [
    'These are mandatory for shipping. The validator will flag missing items.',
    '',
    '- [ ] Deployment pipeline configured (CI/CD)',
    '- [ ] Environment management (.env.example, secret store)',
    '- [ ] Logging (structured, centralized)',
    '- [ ] Error tracking (Sentry / equivalent)',
    '- [ ] Monitoring & uptime alerts',
    '- [ ] Global error boundaries on the frontend',
    '- [ ] API error handler with consistent response shape',
    '- [ ] Rate limiting on public endpoints',
    '- [ ] Input validation on every endpoint',
    '- [ ] Security review (dependencies, auth, sanitization)',
  ]
  if (input.flags.auth) {
    lines.push('- [ ] Password hashing (bcrypt/argon2), no plaintext storage')
    lines.push('- [ ] Token rotation + revocation strategy')
  }
  if (input.flags.payments) {
    lines.push('- [ ] PCI-compliant payment provider (Stripe / equivalent)')
    lines.push('- [ ] Idempotency keys on payment endpoints')
  }
  if (input.flags.fileUploads) {
    lines.push('- [ ] Upload size + MIME-type limits')
    lines.push('- [ ] Virus scanning or signed-URL pattern')
  }
  return lines.join('\n')
}

function buildPostamble(_input: ScaffoldInput): string {
  return [
    '',
    '---',
    '',
    '## Progress Tracking',
    '',
    '### Overall Status',
    '**Total Tasks**: 0 (filled by sync)',
    '**Completed**: 0 / 0',
    '',
    '### Current Focus',
    '🎯 **Next Task**: T1.1',
    '',
    '---',
    '',
    '## Success Criteria',
    '',
    '### Minimum Viable Product (MVP)',
    '- All Phase 2 core features implemented end-to-end',
    '- Test coverage gate passing on services',
    '- Deployed to a production environment',
    '- Sentry/monitoring receiving events',
    '- Critical user flow works with no console errors',
    '',
  ].join('\n')
}

// ─────────────────────────────────────────────────────────────────
// Phase builders
// ─────────────────────────────────────────────────────────────────

function buildFoundationPhase(input: ScaffoldInput): PhaseNode {
  const tasks: TaskNode[] = []
  let n = 1

  tasks.push({
    taskId: `T1.${n++}`,
    phase: 1,
    name: 'Initialize repository and toolchain',
    description: [
      `  - Initialize ${input.projectName} repo (git, .gitignore)`,
      '  - Configure TypeScript strict mode',
      '  - Set up ESLint + Prettier with shared config',
      '  - Add editorconfig and pre-commit hooks (lint + format)',
      '  - Write README skeleton (setup, run, test sections)',
    ].join('\n'),
    status: 'TODO',
    complexity: 'Low',
    estimatedHours: 2,
    dependencies: [],
    acceptanceCriteria: [
      'Repo clones cleanly on a fresh machine',
      '`npm install && npm run lint` succeeds',
      'Pre-commit hook blocks unformatted commits',
    ],
  })

  tasks.push({
    taskId: `T1.${n++}`,
    phase: 1,
    name: 'Set up environment & secrets management',
    description: [
      '  - Create .env.example documenting every required variable',
      '  - Add runtime env validation (zod / envalid) — fail fast on boot',
      '  - Document local vs. CI vs. production secret sources',
      '  - Add secrets to deployment platform (no committed secrets)',
    ].join('\n'),
    status: 'TODO',
    complexity: 'Low',
    estimatedHours: 2,
    dependencies: [`T1.1`],
    acceptanceCriteria: [
      'Missing env var crashes the app on boot with a clear message',
      '.env is in .gitignore and never committed',
      '.env.example covers every variable referenced in code',
    ],
  })

  if (input.stack.database) {
    tasks.push({
      taskId: `T1.${n++}`,
      phase: 1,
      name: `Provision ${input.stack.database} and migrations`,
      description: [
        `  - Stand up ${input.stack.database} locally (Docker compose)`,
        '  - Configure ORM / query builder',
        '  - Add migration tooling (versioned, idempotent)',
        '  - Create baseline schema (users, audit columns)',
        '  - Write seed script for local dev data',
      ].join('\n'),
      status: 'TODO',
      complexity: 'Medium',
      estimatedHours: 4,
      dependencies: [`T1.2`],
      acceptanceCriteria: [
        'Fresh checkout → `npm run db:migrate` succeeds',
        'Migrations are reversible',
        'Seed script populates local dev data',
      ],
    })
  }

  if (input.flags.auth) {
    tasks.push({
      taskId: `T1.${n++}`,
      phase: 1,
      name: 'Implement authentication & session handling',
      description: [
        '  - Password hashing (bcrypt or argon2)',
        '  - JWT or session-cookie auth (decide and document)',
        '  - Register / login / logout endpoints',
        '  - Auth middleware that protects routes',
        '  - Token refresh / rotation strategy',
        '  - Rate limit on auth endpoints',
      ].join('\n'),
      status: 'TODO',
      complexity: 'High',
      estimatedHours: 10,
      dependencies: tasks
        .slice(-1)
        .map((t) => t.taskId)
        .filter(Boolean),
      acceptanceCriteria: [
        'Cannot access protected route without a valid token',
        'Passwords are never stored in plaintext',
        'Expired tokens are rejected with 401',
        'Rate limit returns 429 after threshold',
      ],
    })
  }

  tasks.push({
    taskId: `T1.${n++}`,
    phase: 1,
    name: 'Set up logging, error tracking, and request tracing',
    description: [
      '  - Structured logger (JSON output, request ID per request)',
      '  - Wire Sentry (or equivalent) for unhandled errors',
      '  - Add global error handler that returns a consistent shape',
      '  - Frontend error boundary (if applicable)',
      '  - Document log levels and retention',
    ].join('\n'),
    status: 'TODO',
    complexity: 'Medium',
    estimatedHours: 4,
    dependencies: [`T1.1`],
    acceptanceCriteria: [
      'Unhandled exception in any route is captured by Sentry',
      'Every log line carries a request ID',
      'Error responses follow a documented JSON shape',
    ],
  })

  tasks.push({
    taskId: `T1.${n++}`,
    phase: 1,
    name: 'Set up CI pipeline (lint, type-check, test)',
    description: [
      '  - GitHub Actions workflow on PR and main',
      '  - Steps: install, lint, type-check, unit tests',
      '  - Cache dependencies for speed',
      '  - Block merges on red CI',
      '  - Add status badge to README',
    ].join('\n'),
    status: 'TODO',
    complexity: 'Medium',
    estimatedHours: 3,
    dependencies: [`T1.1`],
    acceptanceCriteria: [
      'PR with failing tests cannot be merged',
      'CI completes in under 5 minutes for the empty project',
    ],
  })

  return {
    number: 1,
    name: 'Foundation',
    goal: 'Stand up the repo, toolchain, data layer, and cross-cutting concerns so feature work can begin on solid ground.',
    exitCriteria: [
      'A fresh clone builds, lints, and runs the empty app',
      'CI is green on every PR; migrations and env validation work',
      'Logging + error tracking capture a test error end-to-end',
    ],
    tasks,
  }
}

function buildCoreFeaturesPhase(
  input: ScaffoldInput,
  foundationGateTaskId: string
): PhaseNode {
  const tasks: TaskNode[] = []
  let n = 1
  const phase = 2

  const features =
    input.features.length > 0
      ? input.features
      : ['Core feature 1', 'Core feature 2', 'Core feature 3']

  let previousFeatureId: string | null = null
  for (const feature of features) {
    const featureId = `T${phase}.${n++}`
    // First feature gates on the foundation; each subsequent feature
    // gates on the previous one. This is conservative but documents
    // the natural build-up; if features are independent, users can
    // delete a dependency edge later.
    const deps = previousFeatureId
      ? [previousFeatureId]
      : foundationGateTaskId
        ? [foundationGateTaskId]
        : []
    tasks.push({
      taskId: featureId,
      phase,
      name: `Implement ${feature}`,
      description: [
        `  - Design data model for "${feature}"`,
        `  - Backend endpoints / business logic`,
        `  - Frontend UI for "${feature}" (if applicable)`,
        `  - Input validation on all entry points`,
        `  - Error handling with user-visible feedback`,
      ].join('\n'),
      status: 'TODO',
      complexity: 'Medium',
      estimatedHours: 6,
      dependencies: deps,
      acceptanceCriteria: [
        `Happy path for "${feature}" works end-to-end`,
        'All inputs are validated; invalid inputs return a clear error',
        'Errors are logged with enough context to debug',
      ],
    })

    // Paired test task — placeholder ID, will be assigned in phase 4
    tasks[tasks.length - 1]!.testTaskId = `T4.test-${featureId}`
    previousFeatureId = featureId
  }

  return {
    number: phase,
    name: 'Core Features',
    goal: `Deliver the core features end-to-end (${features.join(', ')}) — the product's primary value.`,
    exitCriteria: [
      'Every core feature works end-to-end on the happy path',
      'All inputs validated; errors surface clearly to the user',
      'Each feature is demo-able to a stakeholder',
    ],
    tasks,
  }
}

function buildAdvancedPhase(
  input: ScaffoldInput,
  coreGateTaskId: string
): PhaseNode {
  const tasks: TaskNode[] = []
  const phase = 3
  let n = 1
  const gateDeps = coreGateTaskId ? [coreGateTaskId] : []

  if (input.flags.realtime) {
    tasks.push({
      taskId: `T${phase}.${n++}`,
      phase,
      name: 'Add real-time updates over WebSocket',
      description: [
        '  - WebSocket server with auth handshake',
        '  - Frontend client + reconnection logic',
        '  - Broadcast key domain events',
        '  - Backpressure / message size limits',
      ].join('\n'),
      status: 'TODO',
      complexity: 'High',
      estimatedHours: 10,
      dependencies: depsForNext(tasks, gateDeps),
      acceptanceCriteria: [
        'Dropped connection auto-reconnects within 3s',
        'Unauthenticated WebSocket connections are rejected',
        'Server rejects messages larger than the configured limit',
      ],
    })
  }

  if (input.flags.fileUploads) {
    tasks.push({
      taskId: `T${phase}.${n++}`,
      phase,
      name: 'Implement secure file uploads',
      description: [
        '  - Size + MIME-type validation server-side',
        '  - Signed URLs or scanned storage path',
        '  - Cleanup of orphaned uploads',
        '  - User-visible progress + error handling',
      ].join('\n'),
      status: 'TODO',
      complexity: 'Medium',
      estimatedHours: 6,
      dependencies: depsForNext(tasks, gateDeps),
      acceptanceCriteria: [
        'Files over the size limit are rejected before upload',
        'Executable MIME types are rejected',
        'Orphaned files are cleaned up by a scheduled job',
      ],
    })
  }

  if (input.flags.payments) {
    tasks.push({
      taskId: `T${phase}.${n++}`,
      phase,
      name: 'Integrate payments (PCI-compliant provider)',
      description: [
        '  - Stripe (or equivalent) SDK integration',
        '  - Idempotency keys on charge endpoints',
        '  - Webhook handler with signature verification',
        '  - Refund + dispute flow',
      ].join('\n'),
      status: 'TODO',
      complexity: 'High',
      estimatedHours: 12,
      dependencies: depsForNext(tasks, gateDeps),
      acceptanceCriteria: [
        'Duplicate charge attempts are blocked by idempotency key',
        'Unsigned webhooks are rejected',
        'Refunds reverse the original charge in the DB',
      ],
    })
  }

  if (input.flags.notifications) {
    tasks.push({
      taskId: `T${phase}.${n++}`,
      phase,
      name: 'Add transactional notifications (email / push)',
      description: [
        '  - Provider integration (Resend / SendGrid / etc.)',
        '  - Templates + i18n placeholders',
        '  - Unsubscribe / preference management',
        '  - Retry on transient failures',
      ].join('\n'),
      status: 'TODO',
      complexity: 'Medium',
      estimatedHours: 5,
      dependencies: depsForNext(tasks, gateDeps),
      acceptanceCriteria: [
        'Failed sends are retried with backoff',
        'Unsubscribed users do not receive marketing emails',
      ],
    })
  }

  // Always add hardening
  tasks.push({
    taskId: `T${phase}.${n++}`,
    phase,
    name: 'Security hardening pass',
    description: [
      '  - Input sanitization + output encoding',
      '  - CSRF protection on state-changing routes',
      '  - Rate limiting on public endpoints',
      '  - Dependency audit (npm audit / snyk)',
      '  - Review auth flows for common pitfalls (OWASP top 10)',
    ].join('\n'),
    status: 'TODO',
    complexity: 'Medium',
    estimatedHours: 6,
    dependencies: depsForNext(tasks, gateDeps),
    acceptanceCriteria: [
      'Rate limiter returns 429 under load test',
      'No high-severity dependencies in audit',
      'Security checklist signed off',
    ],
  })

  // If user didn't pick any advanced features, give them a meaningful default
  if (tasks.length === 1) {
    tasks.unshift({
      taskId: `T${phase}.0`,
      phase,
      name: 'Performance & polish pass',
      description: [
        '  - Profile critical paths',
        '  - Add caching where measurements justify it',
        '  - Reduce bundle / response size',
        '  - Accessibility audit (frontend)',
      ].join('\n'),
      status: 'TODO',
      complexity: 'Medium',
      estimatedHours: 5,
      dependencies: gateDeps,
    })
    // Renumber
    tasks.forEach((t, i) => {
      t.taskId = `T${phase}.${i + 1}`
    })
  }

  return {
    number: phase,
    name: 'Advanced Features & Hardening',
    goal: 'Add the differentiating features and harden the system against security, abuse, and edge cases.',
    exitCriteria: [
      'Advanced features work and are covered by tests',
      'Security pass complete: rate limits, input sanitization, dependency audit clean',
      'No known high-severity vulnerabilities',
    ],
    tasks,
  }
}

function buildTestingAndDeployPhase(
  input: ScaffoldInput,
  advancedGateTaskId: string,
  featureTaskIds: string[]
): PhaseNode {
  const tasks: TaskNode[] = []
  const phase = 4
  let n = 1
  // The unit/integration test task covers Phase 2 features directly,
  // so it depends on them. Fall back to the Phase 3 gate if there
  // are no Phase 2 features.
  const testGate = featureTaskIds.length > 0
    ? featureTaskIds
    : advancedGateTaskId
      ? [advancedGateTaskId]
      : []

  tasks.push({
    taskId: `T${phase}.${n++}`,
    phase,
    name: 'Unit & integration test coverage',
    description: [
      '  - Unit tests for pure logic (≥70% line coverage)',
      '  - Integration tests against a real DB (Testcontainers / local Docker)',
      '  - Add coverage gate in CI',
      '  - Document how to write & run tests',
    ].join('\n'),
    status: 'TODO',
    complexity: 'High',
    estimatedHours: 10,
    dependencies: testGate,
    acceptanceCriteria: [
      'CI fails if coverage drops below the gate',
      'Integration suite uses an isolated database per run',
    ],
  })

  tasks.push({
    taskId: `T${phase}.${n++}`,
    phase,
    name: 'End-to-end tests for critical flows',
    description: [
      '  - Playwright or Cypress setup',
      '  - Tests for: signup/login (if auth), happy path for each core feature',
      '  - Run on PR and nightly',
      '  - Capture video / screenshots on failure',
    ].join('\n'),
    status: 'TODO',
    complexity: 'Medium',
    estimatedHours: 8,
    dependencies: depsForNext(tasks, testGate),
    acceptanceCriteria: [
      'E2E suite is green against a deployed preview',
      'Failures upload artifacts for debugging',
    ],
  })

  tasks.push({
    taskId: `T${phase}.${n++}`,
    phase,
    name: 'Production deployment pipeline',
    description: [
      `  - Configure production environment on ${input.stack.hosting ?? 'host'}`,
      '  - Build & push Docker images (if applicable)',
      '  - Zero-downtime deployment strategy',
      '  - Rollback plan documented',
      '  - Database backups + restore drill',
    ].join('\n'),
    status: 'TODO',
    complexity: 'High',
    estimatedHours: 8,
    dependencies: depsForNext(tasks, testGate),
    acceptanceCriteria: [
      'Merge to main deploys automatically to production',
      'Rollback to previous deployment completes in under 5 minutes',
      'Restored DB backup matches the source snapshot',
    ],
  })

  tasks.push({
    taskId: `T${phase}.${n++}`,
    phase,
    name: 'Monitoring, alerting & observability',
    description: [
      '  - Dashboards for request rate, error rate, latency',
      '  - Alerts on error spikes and uptime',
      '  - Log search across all services',
      '  - Document on-call procedure',
    ].join('\n'),
    status: 'TODO',
    complexity: 'Medium',
    estimatedHours: 5,
    dependencies: depsForNext(tasks, testGate),
    acceptanceCriteria: [
      'A simulated outage fires an alert',
      'Errors above threshold page the on-call channel',
    ],
  })

  tasks.push({
    taskId: `T${phase}.${n++}`,
    phase,
    name: 'Documentation & launch prep',
    description: [
      '  - README covers setup, run, deploy',
      '  - API reference (OpenAPI / equivalent)',
      '  - Runbook for common incidents',
      '  - Privacy / terms (if applicable)',
    ].join('\n'),
    status: 'TODO',
    complexity: 'Low',
    estimatedHours: 3,
    dependencies: depsForNext(tasks, testGate),
  })

  return {
    number: phase,
    name: 'Testing, Deployment & Launch',
    goal: 'Prove the system works under test, ship it to production, and make it observable and operable.',
    exitCriteria: [
      'Test coverage gate passes in CI; E2E suite green against a preview',
      'Merge to main deploys to production with a working rollback',
      'Monitoring and alerts fire on a simulated outage',
    ],
    tasks,
  }
}

// ─────────────────────────────────────────────────────────────────
// Cross-phase linking
// ─────────────────────────────────────────────────────────────────

/**
 * Append precise-spec section prompts to every feature task — Medium/High
 * complexity, not the Phase-1 setup work, not a test task. Mirrors the
 * validator's `isFeatureTask` predicate so the tasks the precision check
 * scores are exactly the ones that carry the template.
 */
function addSpecPromptsToFeatureTasks(phases: PhaseNode[]): void {
  const lastPhase = Math.max(...phases.map((p) => p.number), 0)
  for (const phase of phases) {
    for (const t of phase.tasks) {
      if (t.complexity === 'Low') continue
      if (t.phase === 1) continue
      if (lastPhase > 1 && t.phase === lastPhase) continue
      if (/\b(test|tests|testing|unit|integration|e2e|qa)\b/i.test(t.name)) continue
      t.description = scaffoldSpecPrompts(t.description)
    }
  }
}

function linkTestPairs(phases: PhaseNode[]): void {
  const testPhase = phases.find((p) => /test|qa/i.test(p.name))
  if (!testPhase) return
  const featurePhases = phases.filter((p) => p !== testPhase)

  // For each Medium/High feature task that has a placeholder testTaskId,
  // replace it with the unit/integration test task ID (the first test
  // task in the testing phase). This means the validator sees a real
  // pointer and won't complain about missing test coverage.
  const sharedTestId = testPhase.tasks[0]?.taskId
  if (!sharedTestId) return

  for (const phase of featurePhases) {
    for (const t of phase.tasks) {
      if (t.testTaskId?.startsWith('T4.test-') || t.testTaskId === undefined) {
        if (t.complexity !== 'Low' && !/test|qa/i.test(t.name)) {
          t.testTaskId = sharedTestId
        }
      }
    }
  }
}

/**
 * Return a sensible dependency list for the next task being pushed
 * into `tasks`: chain on the previous task if one exists, otherwise
 * fall back to the inter-phase gate.
 */
function depsForNext(tasks: TaskNode[], gate: string[]): string[] {
  const prev = tasks[tasks.length - 1]
  return prev ? [prev.taskId] : gate
}

function lastTaskId(phase: PhaseNode): string {
  const last = phase.tasks[phase.tasks.length - 1]
  return last?.taskId ?? ''
}

function flattenFeatureIds(phase: PhaseNode): string[] {
  return phase.tasks.map((t) => t.taskId)
}

function humanProjectType(t: ScaffoldInput['projectType']): string {
  switch (t) {
    case 'fullstack':
      return 'Full-Stack Web Application'
    case 'backend-api':
      return 'Backend API'
    case 'frontend-spa':
      return 'Frontend SPA'
    case 'mobile':
      return 'Mobile App'
    case 'cli':
      return 'CLI Tool'
    case 'library':
      return 'Library / SDK'
    default:
      return 'Project'
  }
}
