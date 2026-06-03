/**
 * Contract tests for structured output (#3).
 *
 * Guarantees the invariant Claude Code relies on: when a tool declares an
 * `outputSchema`, every success result carries a `structuredContent`
 * object that actually validates against that schema. A drift here would
 * make the client reject the tool result at runtime.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { taskListTool } from './task-list.js'
import { taskNextTool } from './task-next.js'
import { fixtures } from '../__tests__/test-utils.js'

vi.mock('../config.js', () => ({ isAuthenticated: vi.fn(() => true) }))
vi.mock('../api-client.js', () => ({ getApiClient: vi.fn() }))
vi.mock('../logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const PROJECT_ID = '660e8400-e29b-41d4-a716-446655440001'

async function mockTasks(tasks: unknown[]) {
  const { getApiClient } = await import('../api-client.js')
  vi.mocked(getApiClient).mockReturnValue({
    listTasks: vi.fn().mockResolvedValue({ projectName: 'Test Project', tasks }),
  } as any)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('task_list structured output', () => {
  it('declares an outputSchema', () => {
    expect(taskListTool.outputSchema).toBeDefined()
  })

  it('emits structuredContent matching the schema (populated list)', async () => {
    await mockTasks([
      fixtures.task({ taskId: 'T1.1', name: 'A', status: 'DONE' }),
      fixtures.task({ taskId: 'T1.2', name: 'B', status: 'TODO', dependencies: ['T1.1'] }),
    ])
    const result: any = await taskListTool.execute({ projectId: PROJECT_ID })
    expect(result.structuredContent).toBeDefined()
    const parsed = taskListTool.outputSchema!.safeParse(result.structuredContent)
    expect(parsed.success, JSON.stringify(parsed)).toBe(true)
    expect(result.structuredContent.tasks).toHaveLength(2)
    expect(result.structuredContent.tasks[1].dependencies).toEqual(['T1.1'])
  })

  it('emits schema-valid structuredContent for an empty list', async () => {
    await mockTasks([])
    const result: any = await taskListTool.execute({ projectId: PROJECT_ID })
    const parsed = taskListTool.outputSchema!.safeParse(result.structuredContent)
    expect(parsed.success, JSON.stringify(parsed)).toBe(true)
    expect(result.structuredContent.tasks).toEqual([])
  })
})

describe('task_next structured output', () => {
  it('declares an outputSchema', () => {
    expect(taskNextTool.outputSchema).toBeDefined()
  })

  it('recommendation result validates and exposes the pick', async () => {
    await mockTasks([
      fixtures.task({ taskId: 'T1.1', name: 'Done', status: 'DONE' }),
      fixtures.task({ taskId: 'T1.2', name: 'Ready', status: 'TODO', dependencies: ['T1.1'] }),
    ])
    const result: any = await taskNextTool.execute({ projectId: PROJECT_ID })
    const parsed = taskNextTool.outputSchema!.safeParse(result.structuredContent)
    expect(parsed.success, JSON.stringify(parsed)).toBe(true)
    expect(result.structuredContent.state).toBe('recommendation')
    expect(result.structuredContent.recommended?.taskId).toBe('T1.2')
  })

  it('all-complete result validates with recommended=null', async () => {
    await mockTasks([fixtures.task({ taskId: 'T1.1', name: 'Done', status: 'DONE' })])
    const result: any = await taskNextTool.execute({ projectId: PROJECT_ID })
    const parsed = taskNextTool.outputSchema!.safeParse(result.structuredContent)
    expect(parsed.success, JSON.stringify(parsed)).toBe(true)
    expect(result.structuredContent.state).toBe('all_complete')
    expect(result.structuredContent.recommended).toBeNull()
  })

  it('empty project validates as state=empty', async () => {
    await mockTasks([])
    const result: any = await taskNextTool.execute({ projectId: PROJECT_ID })
    const parsed = taskNextTool.outputSchema!.safeParse(result.structuredContent)
    expect(parsed.success, JSON.stringify(parsed)).toBe(true)
    expect(result.structuredContent.state).toBe('empty')
  })
})
