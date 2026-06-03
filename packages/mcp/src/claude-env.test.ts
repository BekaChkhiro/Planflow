/**
 * Tests for the Claude Code runtime-environment accessors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getProjectDir, getSessionId, getEffort, isClaudeCode } from './claude-env.js'

const VARS = ['CLAUDE_PROJECT_DIR', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_EFFORT', 'CLAUDECODE']
let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = {}
  for (const v of VARS) {
    saved[v] = process.env[v]
    delete process.env[v]
  }
})

afterEach(() => {
  for (const v of VARS) {
    if (saved[v] === undefined) delete process.env[v]
    else process.env[v] = saved[v]
  }
})

describe('getSessionId', () => {
  it('returns the session id when set', () => {
    process.env['CLAUDE_CODE_SESSION_ID'] = 'sess-123'
    expect(getSessionId()).toBe('sess-123')
  })
  it('returns undefined when unset or blank', () => {
    expect(getSessionId()).toBeUndefined()
    process.env['CLAUDE_CODE_SESSION_ID'] = '   '
    expect(getSessionId()).toBeUndefined()
  })
})

describe('isClaudeCode', () => {
  it('is true only when CLAUDECODE=1', () => {
    expect(isClaudeCode()).toBe(false)
    process.env['CLAUDECODE'] = '1'
    expect(isClaudeCode()).toBe(true)
    process.env['CLAUDECODE'] = 'true'
    expect(isClaudeCode()).toBe(false)
  })
})

describe('getEffort', () => {
  it('returns the level when set', () => {
    process.env['CLAUDE_EFFORT'] = 'high'
    expect(getEffort()).toBe('high')
  })
  it('returns undefined when unset', () => {
    expect(getEffort()).toBeUndefined()
  })
})

describe('getProjectDir', () => {
  it('falls back to cwd when CLAUDE_PROJECT_DIR is unset', () => {
    expect(getProjectDir()).toBe(process.cwd())
  })

  it('uses CLAUDE_PROJECT_DIR when it points at a real directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'planflow-projdir-'))
    try {
      process.env['CLAUDE_PROJECT_DIR'] = dir
      expect(getProjectDir()).toBe(dir)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('falls back to cwd when CLAUDE_PROJECT_DIR does not exist', () => {
    process.env['CLAUDE_PROJECT_DIR'] = '/no/such/planflow/dir/xyz'
    expect(getProjectDir()).toBe(process.cwd())
  })
})
