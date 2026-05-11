/**
 * Task parser unit tests
 *
 * The parser's contract is non-obvious and load-bearing for the sync
 * upsert: an optional field is `undefined` when the markdown did not
 * contain it (so the sync layer can preserve the DB value), and only
 * set when the parser actually saw the value. These tests pin that
 * contract so a future refactor can't silently re-introduce defaults
 * that would resurrect the destructive-sync bug.
 */

import { describe, it, expect } from 'vitest'
import { parsePlanTasks } from '../task-parser.js'

describe('parsePlanTasks — header format', () => {
  it('returns task with only the fields the markdown contains', () => {
    const md = [
      '#### **T1.1**: Build login form',
      '',
      'Just a header — no metadata lines.',
    ].join('\n')

    const [task] = parsePlanTasks(md)

    expect(task.taskId).toBe('T1.1')
    expect(task.name).toBe('Build login form')
    expect(task.status).toBeUndefined()
    expect(task.complexity).toBeUndefined()
    expect(task.estimatedHours).toBeUndefined()
    expect(task.dependencies).toBeUndefined()
  })

  it('reads an explicit DONE status only when present', () => {
    const md = [
      '#### **T1.2**: Wire up backend',
      '- [x] **Status**: DONE',
    ].join('\n')

    const [task] = parsePlanTasks(md)
    expect(task.status).toBe('DONE')
  })

  it('reads dependencies from a Dependencies line', () => {
    const md = [
      '#### **T2.3**: Run migrations',
      '- **Dependencies**: T2.1, T2.2',
    ].join('\n')

    const [task] = parsePlanTasks(md)
    expect(task.dependencies).toEqual(['T2.1', 'T2.2'])
  })

  it('reads complexity and estimated hours when present', () => {
    const md = [
      '#### **T3.1**: Index codebase',
      '- **Complexity**: High',
      '- **Estimated**: 6 hours',
    ].join('\n')

    const [task] = parsePlanTasks(md)
    expect(task.complexity).toBe('High')
    expect(task.estimatedHours).toBe(6)
  })

  it('reads Georgian Dependencies/Complexity labels', () => {
    const md = [
      '#### **T4.1**: ქართული taski',
      '- **სირთულე**: 🔴 მაღალი',
      '- **დამოკიდებულებები**: T1.1',
    ].join('\n')

    const [task] = parsePlanTasks(md)
    expect(task.complexity).toBe('High')
    expect(task.dependencies).toEqual(['T1.1'])
  })
})

describe('parsePlanTasks — table format', () => {
  it('returns table tasks with only the columns the table has', () => {
    const md = [
      '| ID    | Task          | Status |',
      '|-------|---------------|--------|',
      '| T5.1  | Set up CI     | DONE   |',
      '| T5.2  | Write README  | TODO   |',
    ].join('\n')

    const tasks = parsePlanTasks(md)
    expect(tasks).toHaveLength(2)
    const t51 = tasks.find((t) => t.taskId === 'T5.1')!
    expect(t51.status).toBe('DONE')
    // No Complexity / Estimated / Dependencies columns → all undefined.
    expect(t51.complexity).toBeUndefined()
    expect(t51.estimatedHours).toBeUndefined()
    expect(t51.dependencies).toBeUndefined()
  })

  it('treats "-" in a status column as absent, not as a value', () => {
    const md = [
      '| ID    | Task    | Status |',
      '|-------|---------|--------|',
      '| T6.1  | Foo     | -      |',
    ].join('\n')

    const [task] = parsePlanTasks(md)
    expect(task.status).toBeUndefined()
  })
})

describe('parsePlanTasks — combined formats', () => {
  it('merges per-field: table provides status, header provides dependencies', () => {
    // A real PROJECT_PLAN.md mixes a summary table at the top with
    // detailed task blocks lower down. The parser should overlay the
    // two without one wiping the other's fields.
    const md = [
      '| ID    | Task     | Status      |',
      '|-------|----------|-------------|',
      '| T7.1  | Migrate  | IN_PROGRESS |',
      '',
      '#### **T7.1**: Migrate',
      '- **Dependencies**: T6.5',
      '- **Estimated**: 4 hours',
    ].join('\n')

    const [task] = parsePlanTasks(md)
    expect(task.status).toBe('IN_PROGRESS')        // from the table
    expect(task.dependencies).toEqual(['T6.5'])    // from the header block
    expect(task.estimatedHours).toBe(4)            // from the header block
    expect(task.complexity).toBeUndefined()        // neither contained it
  })

  it('header status (when present) wins over table status', () => {
    const md = [
      '| ID    | Task     | Status |',
      '|-------|----------|--------|',
      '| T8.1  | Refactor | TODO   |',
      '',
      '#### **T8.1**: Refactor',
      '- [x] **Status**: DONE',
    ].join('\n')

    const [task] = parsePlanTasks(md)
    expect(task.status).toBe('DONE')
  })

  it('an empty plan returns an empty array', () => {
    expect(parsePlanTasks('')).toEqual([])
  })
})
