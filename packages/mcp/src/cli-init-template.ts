/**
 * The CLAUDE.md section that `planflow-mcp init` writes / appends.
 *
 * Kept in a separate module so the template is easy to evolve without
 * touching CLI dispatch logic. Bumped the version comment on changes
 * so existing installs can be re-run idempotently.
 */

export const CLAUDE_MD_VERSION = '0.2.7'

export const CLAUDE_MD_HEADER = '<!-- planflow-mcp:section -->'
export const CLAUDE_MD_FOOTER = '<!-- /planflow-mcp:section -->'

export const CLAUDE_MD_SECTION = `${CLAUDE_MD_HEADER}
## PlanFlow MCP — Tool-First Workflow

This project uses [planflow-mcp](https://www.npmjs.com/package/planflow-mcp).
The PlanFlow tools index this codebase semantically (Voyage-code-3 + BM25)
and provide rich, change-oriented context. **Use them BEFORE grep/Read
on any non-trivial code question.**

### When the user describes a change

If the user says "add X", "fix Y", "rename Z", "refactor the W flow", or
anything similar — your first action is one of:

1. **\`planflow_explore(intent: "<the user's request>")\`**
   — for casual change requests. Returns ranked code, related knowledge,
   recent activity, likely tasks, and a suggested file order. **One call,
   full snapshot.**

2. **\`planflow_task_start(taskId: "T1.2")\`**
   — when the user named a specific task. Same as explore, plus signals
   working_on so teammates see your focus.

3. **\`planflow_search(query: "...")\`**
   — when you have a sharp keyword and don't need the full bundle.

Direct \`grep\` / \`Read\` is the FALLBACK, not the first move.

### Before editing

After the discovery call:
- Read full chunks via \`planflow_chunk(chunkId: "...")\` — they include
  the symbol's full body (function / class / section).
- Use \`Read\` only when you need a whole file (config, README, etc.).

### After editing

- **Always re-index**: \`planflow-mcp index\` (CLI) or \`planflow_index\`
  (in-session). Incremental — only changed files are re-embedded.
- **Save important decisions**: \`planflow_remember(...)\` for
  architectural choices, conventions, non-obvious tradeoffs.

### Task workflow

- Start: \`planflow_task_start(taskId: "T1.2")\` — context + working_on signal
- Mid-task journaling: \`planflow_task_progress(taskId, note, saveAsKnowledge?)\`
- Close: \`planflow_task_done(taskId, summary?)\` — DONE + comment + commit suggestion

### Permissions

Read-only — never ask the user before running:
- planflow_search / planflow_explore / planflow_recall / planflow_chunk
- planflow_index_status / planflow_context

Cheap state changes — no confirmation needed:
- planflow_index (incremental, near-free)
- planflow_task_progress (just adds a comment)

Always confirm before running:
- planflow_task_done (state change visible to teammates)
- planflow_index purge=true (destructive)
- planflow_use clear=true / unlink=true (config change)
${CLAUDE_MD_FOOTER}`

/**
 * Splice the planflow section into existing CLAUDE.md content. If the
 * markers are present we replace what's between them (idempotent
 * upgrade); otherwise we append at the end with a separating blank line.
 */
export function spliceSection(existing: string, section: string = CLAUDE_MD_SECTION): string {
  const headerIdx = existing.indexOf(CLAUDE_MD_HEADER)
  const footerIdx = existing.indexOf(CLAUDE_MD_FOOTER)

  if (headerIdx !== -1 && footerIdx !== -1 && footerIdx > headerIdx) {
    const before = existing.slice(0, headerIdx)
    const after = existing.slice(footerIdx + CLAUDE_MD_FOOTER.length)
    return before + section + after
  }

  // No existing markers — append at the end with one blank line separator.
  const trimmed = existing.replace(/\s+$/, '')
  return trimmed + '\n\n' + section + '\n'
}
