/**
 * Tests for the `planflow-mcp setup` subcommand — patching .mcp.json with
 * `alwaysLoad: true` so Claude Code loads planflow tools eagerly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runSetupCommand } from '../cli.js'

let dir: string
let prevCwd: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'planflow-setup-'))
  prevCwd = process.cwd()
  process.chdir(dir)
})

afterEach(() => {
  process.chdir(prevCwd)
  rmSync(dir, { recursive: true, force: true })
})

function readMcp(): any {
  return JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf-8'))
}

describe('runSetupCommand', () => {
  it('creates .mcp.json with an eager planflow entry when none exists', () => {
    expect(runSetupCommand()).toBe(0)
    const cfg = readMcp()
    expect(cfg.mcpServers['planflow-mcp'].alwaysLoad).toBe(true)
    expect(cfg.mcpServers['planflow-mcp'].command).toBe('npx')
  })

  it('preserves other servers and only adds the planflow entry', () => {
    writeFileSync(join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'x' } } }))
    expect(runSetupCommand()).toBe(0)
    const cfg = readMcp()
    expect(cfg.mcpServers.other.command).toBe('x')
    expect(cfg.mcpServers['planflow-mcp'].alwaysLoad).toBe(true)
  })

  it('flips alwaysLoad on an existing entry without clobbering its command', () => {
    writeFileSync(
      join(dir, '.mcp.json'),
      JSON.stringify({ mcpServers: { 'planflow-mcp': { command: 'node', args: ['custom.js'] } } })
    )
    expect(runSetupCommand()).toBe(0)
    const cfg = readMcp()
    expect(cfg.mcpServers['planflow-mcp'].alwaysLoad).toBe(true)
    expect(cfg.mcpServers['planflow-mcp'].command).toBe('node')
    expect(cfg.mcpServers['planflow-mcp'].args).toEqual(['custom.js'])
  })

  it('detects a planflow server registered under a different key', () => {
    writeFileSync(
      join(dir, '.mcp.json'),
      JSON.stringify({ mcpServers: { pf: { command: 'npx', args: ['-y', 'planflow-mcp'] } } })
    )
    expect(runSetupCommand()).toBe(0)
    const cfg = readMcp()
    expect(cfg.mcpServers.pf.alwaysLoad).toBe(true)
    expect(cfg.mcpServers['planflow-mcp']).toBeUndefined()
  })

  it('is idempotent when already eager', () => {
    runSetupCommand()
    const first = readFileSync(join(dir, '.mcp.json'), 'utf-8')
    expect(runSetupCommand()).toBe(0)
    expect(readFileSync(join(dir, '.mcp.json'), 'utf-8')).toBe(first)
  })

  it('refuses to overwrite invalid JSON', () => {
    writeFileSync(join(dir, '.mcp.json'), '{ not valid json')
    expect(runSetupCommand()).toBe(1)
    // Original content left untouched.
    expect(readFileSync(join(dir, '.mcp.json'), 'utf-8')).toBe('{ not valid json')
  })
})
