/**
 * PlanFlow MCP Server — Central Tool Annotations
 *
 * MCP `ToolAnnotations` are behavioral hints the client surfaces to the
 * model and — crucially for Claude Code — to its permission engine. A
 * tool flagged `readOnlyHint: true` is auto-run without a permission
 * prompt, so this map is the *structured* version of the read-only /
 * cheap-write / confirm classification we used to keep only as prose in
 * the user's CLAUDE.md.
 *
 * Single source of truth, keyed by tool name. `server.ts` applies these
 * in the `list_tools` response; a tool may still override inline via its
 * own `annotations` field (see `ToolDefinition`).
 *
 * Conventions:
 *   • readOnlyHint    — no side effects (pure read / pure generator). The
 *                       signal Claude Code uses to skip the prompt.
 *   • destructiveHint  — only meaningful when NOT read-only. `true` marks
 *                       state changes a teammate would see or that drop
 *                       local work; we want these to stay prompt-gated.
 *   • idempotentHint   — re-running with the same args converges (safe to
 *                       retry). NOT set on append-style writes (comment,
 *                       progress, remember) where each call adds a row.
 *   • openWorldHint    — `true` when the call reaches the PlanFlow cloud
 *                       API; `false` for purely local index / git / config.
 *
 * NOTE: per-arg nuance can't be expressed here (a single `planflow_use`
 * call may set-or-clear, `planflow_index` may incrementally-update or
 * `purge`). We annotate for the COMMON, safe path and leave the rare
 * destructive variant (purge / clear / unlink) to agent judgment + the
 * CLAUDE.md "always confirm" guidance.
 */

import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'

/** Pure read of the local vector index / git / generated content. */
const localRead = (title: string): ToolAnnotations => ({
  title,
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: false,
})

/** Pure read that reaches the PlanFlow cloud API. */
const cloudRead = (title: string): ToolAnnotations => ({
  title,
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: true,
})

/** Mutating call against the cloud; `idempotent` when re-runs converge. */
const cloudWrite = (title: string, idempotent: boolean): ToolAnnotations => ({
  title,
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: idempotent,
  openWorldHint: true,
})

/** Destructive change (visible to teammates / drops local work). */
const destructive = (title: string, openWorld: boolean): ToolAnnotations => ({
  title,
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: openWorld,
})

export const TOOL_ANNOTATIONS: Record<string, ToolAnnotations> = {
  // ── Auth ────────────────────────────────────────────────────────────
  planflow_login: cloudWrite('Log in to PlanFlow', true),
  planflow_logout: cloudWrite('Log out of PlanFlow', true),
  planflow_whoami: cloudRead('Show current PlanFlow user'),

  // ── Read-only: local intelligence layer ─────────────────────────────
  planflow_search: localRead('Search code & docs'),
  planflow_explore: localRead('Explore a change intent'),
  planflow_chunk: localRead('Read an indexed chunk'),
  planflow_context: localRead('Layered context for a query'),
  planflow_index_status: localRead('Show index status'),
  planflow_index_diff: localRead('Show what would re-index'),
  planflow_worktree_list: localRead('List worktrees'),

  // ── Read-only: pure plan generators / validators (no persistence) ────
  planflow_plan_outline: localRead('Draft a plan outline'),
  planflow_plan_scaffold: localRead('Scaffold a plan'),
  planflow_plan_validate: localRead('Validate a plan'),
  planflow_plan_gaps: localRead('Find plan gaps'),
  planflow_plan_refine: localRead('Refine plan content'),
  planflow_task_create: localRead('Draft task content'),
  planflow_phase_create: localRead('Draft phase content'),

  // ── Read-only: cloud reads ───────────────────────────────────────────
  planflow_projects: cloudRead('List PlanFlow projects'),
  planflow_task_list: cloudRead('List tasks'),
  planflow_task_next: cloudRead('Suggest next task'),
  planflow_comments: cloudRead('List task comments'),
  planflow_activity: cloudRead('Show team activity'),
  planflow_changes: cloudRead('Show recent changes'),
  planflow_notifications: cloudRead('Show notifications'),
  planflow_agent_status: cloudRead('Show agent / teammate status'),
  planflow_recall: cloudRead('Recall saved knowledge'),

  // ── Cheap writes (mutating, prompt-gated by default in Claude Code) ──
  planflow_create: cloudWrite('Create a project', false),
  planflow_use: {
    title: 'Set or inspect current project',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false, // local config link; clear/unlink left to confirm
  },
  planflow_sync: cloudWrite('Sync plan with cloud', false),
  planflow_task_update: cloudWrite('Update task status', true),
  planflow_task_edit: cloudWrite('Edit task details', true),
  planflow_task_start: cloudWrite('Start a task (signal focus)', true),
  planflow_task_progress: cloudWrite('Add task progress note', false),
  planflow_working_on: cloudWrite('Signal what you are working on', true),
  planflow_comment: cloudWrite('Comment on a task', false),
  planflow_remember: cloudWrite('Save knowledge', false),
  planflow_index: {
    title: 'Index code & docs',
    readOnlyHint: false,
    destructiveHint: false, // incremental is cheap; `purge` left to confirm
    idempotentHint: true,
    openWorldHint: true,
  },

  // ── Destructive (always prompt) ──────────────────────────────────────
  planflow_task_done: destructive('Mark task done & clean up', true),
  planflow_worktree_remove: destructive('Remove a worktree', false),
  planflow_post_merge_cleanup: destructive('Clean up after merge', false),
}
