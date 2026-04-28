/**
 * PlanFlow MCP Server - Tool Type Definitions
 *
 * Defines the structure for MCP tools.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { z } from 'zod'

/**
 * Re-export CallToolResult as ToolResult for convenience
 */
export type ToolResult = CallToolResult

/**
 * Per-call context handed to a tool's `execute()`.
 *
 * Most tools ignore this; long-running ones (planflow_index, explore,
 * recall) call `sendProgress(...)` so Claude can render a live status
 * line during the call instead of just a spinner.
 */
export interface ToolExecutionContext {
  /**
   * Push a `notifications/progress` message to the MCP client. Always
   * defined — when no progressToken was supplied with the request, the
   * function is a cheap no-op so callers don't have to null-check.
   *
   * @param progress  monotonically increasing counter (e.g. files done)
   * @param total     final value, when known
   * @param message   short human-readable label
   */
  sendProgress: (progress: number, total?: number, message?: string) => Promise<void>
}

/**
 * MCP Tool definition interface.
 *
 * `inputSchema` is typed as `z.ZodTypeAny` so that schemas built with
 * `.refine()` / `.transform()` (which return `ZodEffects`) are assignable
 * here — Zod's variance makes a generic `z.ZodType<TInput>` slot reject
 * those even though they produce the same parsed type at runtime.
 */
export interface ToolDefinition<TInput = unknown> {
  /** Unique tool name (e.g., "planflow_login") */
  name: string

  /** Human-readable description shown in tool listings */
  description: string

  /** Zod schema for input validation */
  inputSchema: z.ZodTypeAny

  /**
   * Tool implementation. The optional second argument carries per-call
   * helpers (right now: a progress notifier). Existing tools that don't
   * declare it stay backwards compatible — TS structural typing makes
   * a 1-arg function assignable here.
   */
  execute: (input: TInput, ctx?: ToolExecutionContext) => Promise<ToolResult>
}

/**
 * Create a successful tool result
 */
export function createSuccessResult(text: string): ToolResult {
  return {
    content: [{ type: 'text', text }],
  }
}

/**
 * Create an error tool result
 */
export function createErrorResult(text: string): ToolResult {
  return {
    content: [{ type: 'text', text }],
    isError: true,
  }
}

/**
 * Format data as a nice table for CLI output
 */
export function formatTable(
  headers: string[],
  rows: string[][],
  options?: { padding?: number }
): string {
  const padding = options?.padding ?? 2

  // Calculate column widths
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length))
  )

  // Format header row
  const headerRow = headers.map((h, i) => h.padEnd(widths[i]!)).join(' '.repeat(padding))
  const separator = widths.map((w) => '-'.repeat(w)).join(' '.repeat(padding))

  // Format data rows
  const dataRows = rows.map((row) =>
    row.map((cell, i) => (cell ?? '').padEnd(widths[i]!)).join(' '.repeat(padding))
  )

  return [headerRow, separator, ...dataRows].join('\n')
}

/**
 * Format a list with bullet points
 */
export function formatList(items: string[], bullet = '•'): string {
  return items.map((item) => `${bullet} ${item}`).join('\n')
}

/**
 * Format key-value pairs
 */
export function formatKeyValue(pairs: Record<string, unknown>): string {
  const maxKeyLength = Math.max(...Object.keys(pairs).map((k) => k.length))
  return Object.entries(pairs)
    .map(([key, value]) => `${key.padEnd(maxKeyLength)}: ${String(value)}`)
    .join('\n')
}
