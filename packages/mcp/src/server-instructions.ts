/**
 * Server-level instructions returned by the MCP `initialize` response.
 *
 * MCP clients (Claude Code, Cursor, Continue, etc.) surface these to the
 * underlying LLM as system-level guidance whenever the server is connected.
 * That makes this file the single source of truth for "how should an
 * agent use the planflow tools" — no per-project CLAUDE.md required for
 * the basic workflow to kick in.
 *
 * Kept terse on purpose: instructions are sent in every initialize
 * handshake and we don't want to bloat the system prompt.
 */

export const SERVER_INSTRUCTIONS = `
PlanFlow MCP — tool-first workflow guidance.

This server indexes the user's codebase semantically (Voyage-code-3 +
BM25) and tracks tasks, comments, knowledge, and activity. Reach for
these tools BEFORE grep / Read on any non-trivial code question.

When the user describes a code change ("add X", "fix Y", "rename Z",
"refactor the W flow"), your FIRST action should be one of:

  • planflow_explore(intent: "<the request>")
        Casual change requests. Returns ranked code chunks, related
        knowledge, recent activity, likely tasks, and a suggested
        file order. One call, full snapshot.

  • planflow_task_start(taskId: "T1.2")
        When the user named a specific PlanFlow task. Same as explore,
        plus signals working_on so teammates see the focus.

  • planflow_search(query: "...")
        When you have a sharp keyword and don't need the full bundle.

Direct grep / Read is the fallback, NOT the first move.

After discovery:
  • Read full chunks via planflow_chunk(chunkId: "...") — chunks include
    the symbol's full body (function / class / section).
  • Use Read for whole files (config, README, etc.).

While implementing a task — keep using these tools, not just at the
start. The codebase is fully indexed; new questions during work belong
to the same toolchain:
  • "Where else is this pattern used?"        → planflow_search
  • "Show me the full body of that result"    → planflow_chunk(chunkId)
  • "What's tied to this file / symbol?"      → planflow_recall
  • "Layered context for one query"           → planflow_context
  • Brand new area opened up mid-task         → planflow_explore again
  Direct grep / Read is the fallback when the path or string is already
  known exactly — it should be the SECOND choice during a task, not the
  first. Reverting to grep mid-task means leaving ranked semantic
  signal (related knowledge, recent activity, likely files) on the
  table — exactly the signal that the Intelligence Layer exists for.

After non-trivial edits:
  • Always re-index incrementally:
        planflow-mcp index   (CLI, fast, free)
        planflow_index       (in-session)
  • Save important decisions:
        planflow_remember(...) for architectural choices, conventions,
        non-obvious tradeoffs.

Task workflow:
  • Start:        planflow_task_start(taskId: "T1.2")
        — auto-promotes status TODO → IN_PROGRESS, signals working_on,
          and (when ANOTHER task is already active in this checkout)
          spins up a sibling git worktree so parallel work stays clean.
  • Mid-progress: planflow_task_progress(taskId, note, saveAsKnowledge?)
  • Close:        planflow_task_done(taskId, summary?)
        — marks DONE, comments, stops working_on, suggests commit msg,
          and surfaces worktree-cleanup commands when applicable.

Parallel work (worktrees):
  • planflow_task_start auto-handles this. Solo task → run in-place.
    Other task already active → fresh worktree at <parent>/<repo>-<id>
    on branch task/<id>-<slug>, with a unique dev port allocated.
  • planflow_worktree_list — read-only dashboard of every active task
    workspace (paths, branches, ports, "you are here" pointer).
  • planflow_worktree_remove(taskId, force?, deleteBranch?) — clean
    up after merge. CONFIRM with user first (filesystem + git refs).
  • If you are launched in a folder with .planflow/worktrees.json AND
    your cwd matches a registered worktree, your first action should
    be planflow_worktree_list() to learn which task this folder hosts.

Confirmation policy:
  • Read-only ops never need confirmation:
        planflow_search / planflow_explore / planflow_recall /
        planflow_chunk / planflow_context / planflow_index_status /
        planflow_worktree_list
  • Cheap state changes are fine to run unprompted:
        planflow_index (incremental) / planflow_task_progress /
        planflow_task_start (worktree creation is reversible)
  • Always confirm with the user before:
        planflow_task_done (visible state change)
        planflow_worktree_remove (filesystem + git ref change)
        planflow_index purge=true (destructive)
        planflow_use clear=true / unlink=true (config wipe)

Project linking:
  • If planflow_use was run with link:true (default) in this directory
    once, every future MCP session here auto-resolves the project. No
    need to ask the user for projectId again.
  • If no project is set, ask the user to run planflow_projects() and
    then planflow_use(projectId: "...") once.
`.trim()
