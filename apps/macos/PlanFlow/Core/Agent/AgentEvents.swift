import Foundation

/// Coarse permission mode passed to the CLI via `--permission-mode`.
enum AgentPermissionMode: String, CaseIterable, Identifiable {
    case plan
    case `default`
    case acceptEdits
    case bypassPermissions

    var id: String { rawValue }

    var cliValue: String { rawValue }

    var title: String {
        switch self {
        case .plan: return "Plan (read-only)"
        case .default: return "Ask each tool"
        case .acceptEdits: return "Auto-accept edits"
        case .bypassPermissions: return "Full access"
        }
    }

    /// Compact label for the segmented control.
    var shortTitle: String {
        switch self {
        case .plan: return "Plan"
        case .default: return "Ask"
        case .acceptEdits: return "Edits"
        case .bypassPermissions: return "Full"
        }
    }

    var symbol: String {
        switch self {
        case .plan: return "eye"
        case .default: return "hand.raised"
        case .acceptEdits: return "pencil"
        case .bypassPermissions: return "bolt"
        }
    }
}

/// Selectable model for the agent session.
enum AgentModel: String, CaseIterable, Identifiable {
    case auto = "Default"
    case opus = "Opus 4.8"
    case sonnet = "Sonnet 4.6"
    case haiku = "Haiku 4.5"

    var id: String { rawValue }

    /// Value passed to `--model`; nil keeps the CLI default (opus-4-8[1m]).
    var cliValue: String? {
        switch self {
        case .auto: return nil
        case .opus: return "opus"
        case .sonnet: return "sonnet"
        case .haiku: return "haiku"
        }
    }
}

/// A live permission request surfaced by the CLI control protocol.
struct PermissionRequest: Identifiable {
    let id: String           // control request_id
    let toolName: String
    let input: JSONValue
    var suggestions: JSONValue?
}

/// The user's decision on a permission request.
enum PermissionDecision {
    case allow(updatedInput: JSONValue?)
    case deny(reason: String?)
}

/// High-level events emitted by an agent session, consumed by the UI.
enum AgentEvent {
    case sessionStarted(sessionId: String, model: String?, tools: [String], mcpServers: [String], permissionMode: String?)
    case thinkingDelta(String)
    case textDelta(String)
    case assistantMessageComplete
    case toolCallStarted(id: String, name: String, input: JSONValue)
    case toolResult(toolUseId: String, content: String, isError: Bool)
    case permissionRequest(PermissionRequest)
    case turnFinished(resultText: String?, costUSD: Double?, isError: Bool, durationMs: Int?)
    case log(String)
    case failed(String)
    case exited(code: Int32)
}
