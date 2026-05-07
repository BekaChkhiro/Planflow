/**
 * The CLAUDE.md section that `planflow-mcp init` writes / appends.
 *
 * Kept in a separate module so the template is easy to evolve without
 * touching CLI dispatch logic. Bumped the version comment on changes
 * so existing installs can be re-run idempotently.
 */

export const CLAUDE_MD_VERSION = '0.2.16'

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

### While implementing — keep searching, don't drop back to grep

The PlanFlow tools are not just for the START of a task. Every time a
new question opens up mid-implementation, reach for them again BEFORE
\`grep\`:

- "Where else is this pattern used?"     → \`planflow_search\`
- "Full body of that result?"            → \`planflow_chunk(chunkId)\`
- "Everything tied to this file/symbol?" → \`planflow_recall\`
- "Layered context for one query?"       → \`planflow_context\`
- "New area I haven't explored yet?"     → \`planflow_explore\` again

Direct \`grep\` / \`Read\` is the fallback — second choice, not first —
when you already know the exact path or string match. Reverting to
grep mid-task throws away ranked semantic context (related knowledge,
activity, likely files) that the Intelligence Layer is built to surface.

### After editing

- **Always re-index**: \`planflow-mcp index\` (CLI) or \`planflow_index\`
  (in-session). Incremental — only changed files are re-embedded.
- **Save important decisions**: \`planflow_remember(...)\` for
  architectural choices, conventions, non-obvious tradeoffs.

### Task workflow

- Start: \`planflow_task_start(taskId: "T1.2")\` — context + working_on signal
  + status auto-promotes TODO → IN_PROGRESS
- Mid-task journaling: \`planflow_task_progress(taskId, note, saveAsKnowledge?)\`
- Close: \`planflow_task_done(taskId, summary?)\` — DONE + comment + commit suggestion

### Parallel task work (worktrees)

PlanFlow auto-handles parallel work via git worktrees. You don't learn
new commands — the existing \`planflow_task_start\` is the entry point.

What happens automatically when you call \`planflow_task_start(taskId)\`:
  • Solo task in this checkout → run in-place (current folder).
  • A different task is already active here → create a sibling worktree
    at \`<parent>/<repo>-<taskId>\` on branch \`task/<taskId>-<slug>\`,
    allocate a fresh dev port, and tell the user to open Claude there.
  • This task already has a worktree → instruct \`cd\` into it.

Override with \`worktreeMode\`:
  • \`force\` — always create a worktree
  • \`never\` — stay in the current folder

When Claude is launched inside a folder that matches a registered
worktree (\`.planflow/worktrees.json\` in the main checkout), the next
\`planflow_task_start\` / \`planflow_explore\` call surfaces the
matching task automatically. **If you (the AI) detect that the
current cwd is a sibling worktree, your first action should be
\`planflow_worktree_list()\` so you understand which task this folder
hosts before doing anything else.**

Other worktree tools:
- \`planflow_worktree_list()\` — read-only dashboard of every active
  task workspace, paths, branches, ports
- \`planflow_worktree_remove(taskId, force?, deleteBranch?)\` — clean
  up after a task is merged. Confirm with the user first.

### Commit hygiene

When you create git commits in this project, DO NOT append a
\`Co-Authored-By: Claude ...\` trailer (or any AI-attribution trailer)
to the commit message. The git log should read as authored by the
user alone. Implementation help is not authorship.

Applies to every commit on every branch — not just task closures.
Override only when the user explicitly asks for a co-author line.

### Permissions

Read-only — never ask the user before running:
- planflow_search / planflow_explore / planflow_recall / planflow_chunk
- planflow_index_status / planflow_context / planflow_worktree_list

Cheap state changes — no confirmation needed:
- planflow_index (incremental, near-free)
- planflow_task_progress (just adds a comment)
- planflow_task_start (creates worktree only when truly needed; safe)

Always confirm before running:
- planflow_task_done (state change visible to teammates)
- planflow_worktree_remove (filesystem + git ref change)
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
