/**
 * PlanFlow MCP — Adversarial gap analysis
 *
 * Stage 5 of plan authoring: the "what's missing" pass. The structural
 * validator catches inconsistency; traceability catches unbuilt features.
 * Neither catches the work people *forget to plan at all* — data
 * migrations, rollback, race conditions, empty/error states, and so on.
 *
 * This is deliberately ADVISORY, not pass/fail: it detects which
 * commonly-forgotten categories have no footprint in the plan and turns
 * each into a probing question. A missing category is a prompt to decide
 * ("is this intentional, or a gap?"), not an assertion that it's
 * required — so the analysis is honest about the limits of a lexical
 * scan and leaves the judgement to the author.
 */

import type { PlanTree } from './types.js'
import { flattenTasks } from './validator.js'

export interface GapCategory {
  key: string
  label: string
  /** True if the plan already has a lexical footprint for this category. */
  present: boolean
  /** Adversarial question to make the author decide. */
  prompt: string
  /** A concrete task to add if it turns out to be a real gap. */
  suggestedTask: string
}

export interface GapReport {
  categories: GapCategory[]
  addressed: GapCategory[]
  missing: GapCategory[]
}

interface GapDef {
  key: string
  label: string
  pattern: RegExp
  prompt: string
  suggestedTask: string
}

// Curated set of high-value, broadly-applicable categories that plans
// routinely omit. Kept distinct from checkProduction's deploy/monitor/
// security/env so the two don't double-report.
const GAP_DEFS: GapDef[] = [
  {
    key: 'data_migration',
    label: 'Data migration & schema versioning',
    pattern: /\b(migrat\w*|schema version\w*|backfill|seed data|data model change)\b/i,
    prompt: 'How does the schema evolve once there is real data? Is there a versioned, reversible migration path?',
    suggestedTask: 'Add versioned, reversible DB migrations + a backfill strategy for existing data.',
  },
  {
    key: 'backup_recovery',
    label: 'Backup, rollback & disaster recovery',
    pattern: /\b(backup|restore|disaster recovery|rollback|point-in-time|snapshot)\b/i,
    prompt: 'If a deploy or a write goes wrong in production, how do you roll back and restore data?',
    suggestedTask: 'Add automated backups + a documented, tested rollback & restore procedure.',
  },
  {
    key: 'concurrency',
    label: 'Concurrency, races & idempotency',
    pattern: /\b(concurren\w*|race condition|idempoten\w*|locking|transaction\w*|atomic|optimistic|deduplicat\w*)\b/i,
    prompt: 'What happens under simultaneous requests or retries — double-submits, lost updates, duplicate side-effects?',
    suggestedTask: 'Add idempotency keys / transactional boundaries / optimistic locking on concurrent write paths.',
  },
  {
    key: 'ui_states',
    label: 'Empty / loading / error states (UX)',
    pattern: /\b(empty state|loading state|error state|skeleton|spinner|fallback ui|no results|error boundary)\b/i,
    prompt: 'For each screen, what shows while loading, when empty, and when the request fails?',
    suggestedTask: 'Add explicit empty, loading, and error states for each primary screen/flow.',
  },
  {
    key: 'pagination',
    label: 'Pagination & large-data handling',
    pattern: /\b(paginat\w*|infinite scroll|cursor|offset|page size|virtualiz\w*|streaming|chunk\w*)\b/i,
    prompt: 'What happens when a list or query grows to thousands of rows — is it paginated/bounded?',
    suggestedTask: 'Add pagination (cursor/offset) and bounded queries on list endpoints and large views.',
  },
  {
    key: 'accessibility',
    label: 'Accessibility (a11y)',
    pattern: /\b(accessib\w*|a11y|aria|screen reader|wcag|keyboard nav\w*|focus management)\b/i,
    prompt: 'Is the UI usable by keyboard and screen reader (focus order, ARIA, contrast)?',
    suggestedTask: 'Add an accessibility pass: keyboard navigation, ARIA labels, focus management, contrast.',
  },
]

/**
 * Run the adversarial gap scan over a plan. Builds a corpus from the
 * preamble (Brief), every task's name + description, and phase goals /
 * exit criteria, then reports which categories are present vs. missing.
 */
export function analyzeGaps(plan: PlanTree): GapReport {
  const tasks = flattenTasks(plan)
  const corpus = [
    plan.preamble,
    ...tasks.map((t) => `${t.name} ${t.description}`),
    ...plan.phases.map((p) => `${p.goal ?? ''} ${(p.exitCriteria ?? []).join(' ')}`),
  ]
    .join('\n')
    .toLowerCase()

  const categories: GapCategory[] = GAP_DEFS.map((d) => ({
    key: d.key,
    label: d.label,
    present: d.pattern.test(corpus),
    prompt: d.prompt,
    suggestedTask: d.suggestedTask,
  }))

  return {
    categories,
    addressed: categories.filter((c) => c.present),
    missing: categories.filter((c) => !c.present),
  }
}
