import Foundation

enum ChatRole: String, Codable { case user, assistant, system }

struct ToolCall: Identifiable, Codable {
    let id: String
    let name: String
    let input: JSONValue
    var result: String?
    var isError: Bool = false
    var isRunning: Bool { result == nil }

    /// Short, friendly tool label (strips MCP prefixes).
    var displayName: String {
        if name.hasPrefix("mcp__") {
            let parts = name.split(separator: "_").filter { !$0.isEmpty }
            return parts.last.map(String.init) ?? name
        }
        return name
    }

    /// A one-line summary of the most relevant input argument.
    var summary: String? {
        for key in ["command", "file_path", "path", "query", "intent", "pattern", "taskId", "description"] {
            if let v = input[key]?.stringValue, !v.isEmpty { return v }
        }
        return nil
    }
}

struct ChatMessage: Identifiable, Codable {
    var id = UUID()
    let role: ChatRole
    var text: String = ""
    var thinking: String = ""
    var toolCalls: [ToolCall] = []
    var isStreaming: Bool = false
    var isError: Bool = false
    var costUSD: Double?

    var hasContent: Bool {
        !text.isEmpty || !thinking.isEmpty || !toolCalls.isEmpty
    }
}
