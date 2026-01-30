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
 * MCP Tool definition interface
 */
export interface ToolDefinition<TInput = unknown> {
  /** Unique tool name (e.g., "planflow_login") */
  name: string

  /** Human-readable description shown in tool listings */
  description: string

  /** Zod schema for input validation */
  inputSchema: z.ZodType<TInput>

  /** Tool implementation function */
  execute: (input: TInput) => Promise<ToolResult>
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
