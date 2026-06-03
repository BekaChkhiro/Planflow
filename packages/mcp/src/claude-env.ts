/**
 * PlanFlow MCP — Claude Code runtime environment.
 *
 * Claude Code injects a handful of environment variables into stdio MCP
 * servers it launches. Reading them lets planflow behave correctly inside
 * a Claude Code session without any extra configuration:
 *
 *   • CLAUDE_PROJECT_DIR     — absolute path of the project the user opened
 *                              (v2.1.139). Authoritative project root, even
 *                              when the server's cwd is something else.
 *   • CLAUDE_CODE_SESSION_ID — unique id for the current Claude Code session
 *                              (v2.1.154). Lets the backend distinguish one
 *                              developer's parallel sessions/windows so
 *                              presence ("working on") stays per-session.
 *   • CLAUDECODE=1           — set when running under Claude Code at all.
 *   • CLAUDE_EFFORT          — active effort level (v2.1.133), e.g. "high".
 *
 * All accessors degrade gracefully: nothing here is required, and outside
 * Claude Code every getter returns a safe fallback.
 */

import { existsSync, statSync } from 'node:fs'

/** True when the process was launched by Claude Code (`CLAUDECODE=1`). */
export function isClaudeCode(): boolean {
  return process.env['CLAUDECODE'] === '1'
}

/**
 * The current Claude Code session id, or undefined when not running under
 * Claude Code. Used to tag API requests so presence/activity can be scoped
 * to a single session rather than the whole user.
 */
export function getSessionId(): string | undefined {
  const id = process.env['CLAUDE_CODE_SESSION_ID']
  return id && id.trim() ? id : undefined
}

/** The active effort level (e.g. "high"), or undefined when unset. */
export function getEffort(): string | undefined {
  const level = process.env['CLAUDE_EFFORT']
  return level && level.trim() ? level : undefined
}

/**
 * Resolve the project root. Prefers Claude Code's `CLAUDE_PROJECT_DIR`
 * (the directory the user actually opened) over `process.cwd()` — the two
 * differ when Claude Code launches the server from somewhere other than
 * the project root. Falls back to cwd when the env var is missing or
 * doesn't point at a real directory.
 */
export function getProjectDir(): string {
  const dir = process.env['CLAUDE_PROJECT_DIR']
  if (dir && dir.trim()) {
    try {
      if (existsSync(dir) && statSync(dir).isDirectory()) {
        return dir
      }
    } catch {
      // fall through to cwd
    }
  }
  return process.cwd()
}
