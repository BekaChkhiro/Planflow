import Foundation

/// Drives a persistent `claude -p --input-format stream-json --output-format
/// stream-json` subprocess for one workspace. User turns are written to stdin
/// as stream-json messages; events are parsed from stdout and published.
final class ClaudeAgentSession {
    struct Config {
        var binaryPath: String
        var workingDirectory: URL
        var model: String?
        var permissionMode: AgentPermissionMode
        var mcpConfigPath: String?
        /// When set, resume an existing CLI session to preserve conversation context.
        var resumeSessionId: String?
        /// Extra system-prompt text (e.g. the active PlanFlow project id).
        var appendSystemPrompt: String?
    }

    private var process: Process?
    private var stdinHandle: FileHandle?
    private let writeQueue = DispatchQueue(label: "tools.planflow.agent.stdin")
    private var stdoutBuffer = Data()

    private(set) var sessionId: String?
    var isRunning: Bool { process?.isRunning ?? false }

    // Tracks in-flight tool_use blocks by stream index → (id, name, jsonBuffer).
    private struct PendingTool { let id: String; let name: String; var json: String }
    private var pendingTools: [Int: PendingTool] = [:]

    private var continuation: AsyncStream<AgentEvent>.Continuation?
    private(set) lazy var events: AsyncStream<AgentEvent> = {
        AsyncStream { continuation in
            self.continuation = continuation
        }
    }()

    let config: Config
    init(config: Config) { self.config = config }

    // MARK: - Lifecycle

    func start() throws {
        guard process == nil else { return }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: config.binaryPath)
        process.currentDirectoryURL = config.workingDirectory

        var args = [
            "-p",
            "--input-format", "stream-json",
            "--output-format", "stream-json",
            "--include-partial-messages",
            "--verbose",
            "--permission-mode", config.permissionMode.cliValue,
            "--add-dir", config.workingDirectory.path,
            // PlanFlow's own MCP tools are core to the app — always pre-approved
            // so they never get auto-denied in headless mode.
            "--allowedTools", "mcp__planflow-mcp",
        ]
        if let model = config.model, !model.isEmpty { args += ["--model", model] }
        if let mcp = config.mcpConfigPath { args += ["--mcp-config", mcp] }
        if let resume = config.resumeSessionId, !resume.isEmpty { args += ["--resume", resume] }
        if let prompt = config.appendSystemPrompt, !prompt.isEmpty {
            args += ["--append-system-prompt", prompt]
        }
        process.arguments = args

        var env = ProcessInfo.processInfo.environment
        env["PATH"] = ClaudeBinaryLocator.augmentedPATH()
        env["CLAUDE_CODE_ENTRYPOINT"] = "planflow-mac"
        process.environment = env

        let stdinPipe = Pipe()
        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        process.standardInput = stdinPipe
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe
        stdinHandle = stdinPipe.fileHandleForWriting

        stdoutPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if data.isEmpty { return }
            self?.handleStdout(data)
        }
        stderrPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
            self?.continuation?.yield(.log(text.trimmingCharacters(in: .whitespacesAndNewlines)))
        }
        process.terminationHandler = { [weak self] proc in
            self?.continuation?.yield(.exited(code: proc.terminationStatus))
            self?.continuation?.finish()
        }

        self.process = process
        try process.run()
    }

    func stop() {
        process?.terminationHandler = nil
        try? stdinHandle?.close()
        process?.terminate()
        process = nil
        continuation?.finish()
    }

    // MARK: - Sending

    /// Sends a user turn to the running session.
    func send(_ text: String) {
        let message: [String: Any] = [
            "type": "user",
            "message": ["role": "user", "content": [["type": "text", "text": text]]],
        ]
        writeLine(message)
    }

    /// Replies to a live permission request.
    func reply(to request: PermissionRequest, decision: PermissionDecision) {
        var responseBody: [String: Any]
        switch decision {
        case .allow(let updated):
            var allow: [String: Any] = ["behavior": "allow"]
            allow["updatedInput"] = (updated ?? request.input).asFoundationObject
            responseBody = allow
        case .deny(let reason):
            responseBody = ["behavior": "deny", "message": reason ?? "Denied by user"]
        }
        let envelope: [String: Any] = [
            "type": "control_response",
            "response": [
                "subtype": "success",
                "request_id": request.id,
                "response": responseBody,
            ],
        ]
        writeLine(envelope)
    }

    /// Acknowledges a control request we don't specifically handle.
    private func ackControl(_ requestId: String) {
        let envelope: [String: Any] = [
            "type": "control_response",
            "response": ["subtype": "success", "request_id": requestId, "response": [:]],
        ]
        writeLine(envelope)
    }

    private func writeLine(_ object: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: object) else { return }
        var line = data
        line.append(0x0A) // newline
        writeQueue.async { [weak self] in
            try? self?.stdinHandle?.write(contentsOf: line)
        }
    }

    // MARK: - Receiving

    private func handleStdout(_ data: Data) {
        stdoutBuffer.append(data)
        while let newlineIndex = stdoutBuffer.firstIndex(of: 0x0A) {
            let lineData = stdoutBuffer[stdoutBuffer.startIndex..<newlineIndex]
            stdoutBuffer.removeSubrange(stdoutBuffer.startIndex...newlineIndex)
            guard !lineData.isEmpty else { continue }
            parseLine(Data(lineData))
        }
    }

    private func parseLine(_ data: Data) {
        guard let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let type = root["type"] as? String else { return }

        switch type {
        case "system":
            handleSystem(root)
        case "stream_event":
            handleStreamEvent(root["event"] as? [String: Any] ?? [:])
        case "user":
            handleUser(root)
        case "result":
            handleResult(root)
        case "control_request":
            handleControlRequest(root)
        default:
            break // rate_limit_event, assistant snapshots, etc. — ignored here
        }
    }

    private func handleSystem(_ root: [String: Any]) {
        guard (root["subtype"] as? String) == "init" else { return }
        let sid = root["session_id"] as? String ?? ""
        sessionId = sid
        let mcpServers = (root["mcp_servers"] as? [[String: Any]])?
            .compactMap { $0["name"] as? String } ?? []
        emit(.sessionStarted(
            sessionId: sid,
            model: root["model"] as? String,
            tools: root["tools"] as? [String] ?? [],
            mcpServers: mcpServers,
            permissionMode: root["permissionMode"] as? String))
    }

    private func handleStreamEvent(_ event: [String: Any]) {
        guard let eventType = event["type"] as? String else { return }
        switch eventType {
        case "content_block_start":
            let index = event["index"] as? Int ?? 0
            if let block = event["content_block"] as? [String: Any],
               (block["type"] as? String) == "tool_use" {
                let id = block["id"] as? String ?? UUID().uuidString
                let name = block["name"] as? String ?? "tool"
                pendingTools[index] = PendingTool(id: id, name: name, json: "")
            }
        case "content_block_delta":
            let index = event["index"] as? Int ?? 0
            guard let delta = event["delta"] as? [String: Any],
                  let deltaType = delta["type"] as? String else { return }
            switch deltaType {
            case "text_delta":
                if let t = delta["text"] as? String { emit(.textDelta(t)) }
            case "thinking_delta":
                if let t = delta["thinking"] as? String { emit(.thinkingDelta(t)) }
            case "input_json_delta":
                if let partial = delta["partial_json"] as? String {
                    pendingTools[index]?.json += partial
                }
            default:
                break
            }
        case "content_block_stop":
            let index = event["index"] as? Int ?? 0
            if let tool = pendingTools.removeValue(forKey: index) {
                let input = JSONValue.parse(jsonString: tool.json) ?? .object([:])
                emit(.toolCallStarted(id: tool.id, name: tool.name, input: input))
            }
        case "message_stop":
            emit(.assistantMessageComplete)
        default:
            break
        }
    }

    private func handleUser(_ root: [String: Any]) {
        guard let message = root["message"] as? [String: Any],
              let content = message["content"] as? [[String: Any]] else { return }
        for block in content where (block["type"] as? String) == "tool_result" {
            let toolUseId = block["tool_use_id"] as? String ?? ""
            let isError = block["is_error"] as? Bool ?? false
            let text = Self.flattenContent(block["content"])
            emit(.toolResult(toolUseId: toolUseId, content: text, isError: isError))
        }
    }

    private func handleResult(_ root: [String: Any]) {
        let isError = (root["is_error"] as? Bool) ?? ((root["subtype"] as? String) != "success")
        emit(.turnFinished(
            resultText: root["result"] as? String,
            costUSD: root["total_cost_usd"] as? Double,
            isError: isError,
            durationMs: root["duration_ms"] as? Int))
    }

    private func handleControlRequest(_ root: [String: Any]) {
        let requestId = root["request_id"] as? String ?? ""
        guard let request = root["request"] as? [String: Any] else { ackControl(requestId); return }
        let subtype = request["subtype"] as? String

        if subtype == "can_use_tool" {
            let toolName = request["tool_name"] as? String ?? "tool"
            let input = JSONValue.fromFoundation(request["input"]) ?? .object([:])
            let suggestions = JSONValue.fromFoundation(request["permission_suggestions"])
            emit(.permissionRequest(PermissionRequest(
                id: requestId, toolName: toolName, input: input, suggestions: suggestions)))
        } else {
            // initialize / hook_callback / mcp_message etc. — acknowledge to avoid stalls.
            ackControl(requestId)
        }
    }

    // MARK: - Helpers

    private func emit(_ event: AgentEvent) {
        continuation?.yield(event)
    }

    /// Flattens a tool_result `content` (string or array of blocks) to text.
    static func flattenContent(_ content: Any?) -> String {
        if let s = content as? String { return s }
        if let blocks = content as? [[String: Any]] {
            return blocks.compactMap { block -> String? in
                if (block["type"] as? String) == "text" { return block["text"] as? String }
                return nil
            }.joined(separator: "\n")
        }
        return ""
    }
}

extension JSONValue {
    static func parse(jsonString: String) -> JSONValue? {
        guard let data = jsonString.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(JSONValue.self, from: data)
    }

    static func fromFoundation(_ object: Any?) -> JSONValue? {
        guard let object, !(object is NSNull) else { return nil }
        guard let data = try? JSONSerialization.data(withJSONObject: object) else {
            if let s = object as? String { return .string(s) }
            return nil
        }
        return try? JSONDecoder().decode(JSONValue.self, from: data)
    }

    var asFoundationObject: Any {
        switch self {
        case .string(let s): return s
        case .number(let n): return n
        case .bool(let b): return b
        case .null: return NSNull()
        case .array(let a): return a.map { $0.asFoundationObject }
        case .object(let o): return o.mapValues { $0.asFoundationObject }
        }
    }
}
