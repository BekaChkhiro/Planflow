# PlanFlow for Mac

A native macOS (SwiftUI) client for PlanFlow whose centerpiece is an **embedded
Claude agent**: it runs the `claude` CLI in headless (`-p` / stream-json) mode
directly inside a linked codebase folder, so the agent sees your code,
`CLAUDE.md`, and the `planflow-mcp` tools — and can create & manage plan tasks
from chat.

## Highlights

- **Agent Chat (flagship)** — streams a persistent `claude -p
  --input-format stream-json --output-format stream-json` session per workspace.
  Renders thinking, tool calls (with input/result), and final answers live.
- **Variable permission mode + live confirmation** — pick Plan / Ask each tool /
  Auto-accept edits / Full access. In "Ask" mode, the CLI's `can_use_tool`
  control requests surface an in-app Allow/Deny prompt.
- **Folder / codebase linking** — link any local folder as a workspace. The
  folder becomes the agent's working directory; if it contains
  `.plan-config.json` it's mapped to its PlanFlow cloud project.
- **Tasks board** — a Kanban view of the linked project's tasks, read from the
  PlanFlow REST API, with drag-to-move status. Tasks are *created* by the agent
  via `planflow-mcp` (single source of truth, synced to cloud).
- **Projects / Activity / Notifications / Settings** — supporting parity screens
  over the production API, with JWT auth + transparent refresh stored in the
  Keychain.

## Requirements

- macOS 14+, Xcode 16+ (built & verified with Xcode 26 / Swift 6 toolchain).
- [`xcodegen`](https://github.com/yonyz/XcodeGen) — `brew install xcodegen`.
- The [`claude` CLI](https://docs.claude.com/claude-code) installed and signed in
  (`claude` on your PATH, or set a custom path in Settings → Agent).

## Build & run

```bash
cd apps/macos
xcodegen generate          # produces PlanFlow.xcodeproj (git-ignored)
open PlanFlow.xcodeproj     # ⌘R in Xcode
# or headless:
xcodebuild -project PlanFlow.xcodeproj -scheme PlanFlow -configuration Debug build
```

The project file is generated from `project.yml`; edit the YAML (not the
`.xcodeproj`) and re-run `xcodegen generate`.

## Configuration

- **API endpoint** — defaults to production (`https://api.planflow.tools`).
  Override in Settings → Advanced (or `defaults write tools.planflow.mac
  apiBaseURL http://localhost:3001`).
- **Claude binary** — auto-detected from common locations / login shell; override
  in Settings → Agent.
- **App Sandbox is disabled** (see `Resources/PlanFlow.entitlements`) because the
  app spawns the `claude` subprocess and reads arbitrary user-selected folders.

## Architecture

```
PlanFlow/
  App/            App entry, AppState (auth/session), RootView
  Config/         AppConfig (API base, WS URL)
  Core/
    Networking/   APIClient (async + JWT refresh), PlanFlowAPI, envelope models
    Auth/         Keychain + TokenStore
    Models/       Codable domain models (User, Project, PlanTask, …)
    Agent/        ClaudeAgentSession (subprocess + stream-json protocol),
                  ClaudeBinaryLocator, event/JSON models, ChatModels
    Workspace/    Workspace + WorkspaceStore (folder linking, bookmarks)
  Features/
    Auth/ Chat/ Tasks/ Projects/ Activity/ Notifications/ Settings/ Main/
  DesignSystem/   Theme, Card, Pill
```

### Agent stream protocol

`ClaudeAgentSession` writes user turns to stdin as
`{"type":"user","message":{...}}` and parses newline-delimited stdout events:
`system/init` (session id, tools, MCP servers), `stream_event` (text/thinking
deltas, `tool_use` + `input_json_delta`), `user` (tool results), `result`
(turn end), and `control_request` (`can_use_tool` → permission UI). Context is
preserved across CLI restarts via `--resume <session_id>`.

## Status & next steps

This is a working foundation (auth, agent chat, folder linking, tasks board,
core parity screens compile & run). Not yet implemented toward full web parity:
realtime WebSocket presence/typing/locks, comments thread UI, team &
organization management, GitHub integration screens, knowledge browser, native
APNs push, and subscription/billing flows. The networking, models, and realtime
URL plumbing are in place to add these incrementally.
