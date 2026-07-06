import Foundation
import Observation

@MainActor
@Observable
final class ChatViewModel: Identifiable {
    let context: ChatContext
    let sessionKey: String        // unique per chat session (persistence + identity)
    var id: String { sessionKey }

    var title: String = "New chat"
    var lastActivity: Date = Date()

    var messages: [ChatMessage] = []
    var inputText: String = ""
    var isBusy = false
    var selectedModel: AgentModel {
        didSet { UserDefaults.standard.set(selectedModel.rawValue, forKey: "agentModel") }
    }
    var pendingPermission: PermissionRequest?
    var sessionInfo: String?
    var startupError: String?

    private var session: ClaudeAgentSession?
    private var eventTask: Task<Void, Never>?
    private var lastSessionId: String?   // for resuming context across CLI restarts

    /// Internal tools that are noise in the transcript (schema loading, etc.).
    private static let hiddenTools: Set<String> = ["ToolSearch"]

    init(context: ChatContext, sessionKey: String = UUID().uuidString) {
        self.context = context
        self.sessionKey = sessionKey
        let saved = UserDefaults.standard.string(forKey: "agentModel")
        self.selectedModel = saved.flatMap(AgentModel.init) ?? .auto
        loadPersisted()
    }

    // MARK: - Persistence

    struct Persisted: Codable {
        var messages: [ChatMessage]
        var lastSessionId: String?
        var title: String?
        var lastActivity: Date?
    }

    /// Directory holding one JSON file per session for a project.
    static func sessionsDir(projectId: String) -> URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PlanFlow/sessions/\(projectId)", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private var persistURL: URL {
        Self.sessionsDir(projectId: context.projectId).appendingPathComponent("\(sessionKey).json")
    }

    private func loadPersisted() {
        guard let data = try? Data(contentsOf: persistURL),
              let saved = try? JSONDecoder().decode(Persisted.self, from: data) else { return }
        messages = saved.messages.map { var m = $0; m.isStreaming = false; return m }
        lastSessionId = saved.lastSessionId
        title = saved.title ?? "New chat"
        lastActivity = saved.lastActivity ?? Date()
        if lastSessionId != nil {
            sessionInfo = "Resumes previous session · planflow-mcp"
        }
    }

    private func persist() {
        let snapshot = Persisted(messages: messages, lastSessionId: lastSessionId,
                                 title: title, lastActivity: lastActivity)
        let url = persistURL
        Task.detached(priority: .background) {
            if let data = try? JSONEncoder().encode(snapshot) { try? data.write(to: url) }
        }
    }

    /// Deletes this session's persisted file and stops any live process.
    func deletePersisted() {
        stop()
        try? FileManager.default.removeItem(at: persistURL)
    }

    /// Clears the transcript and stops any live session (keeps the session slot).
    func clearHistory() {
        stop()
        messages.removeAll()
        lastSessionId = nil
        title = "New chat"
        try? FileManager.default.removeItem(at: persistURL)
    }

    var canSend: Bool {
        !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && pendingPermission == nil
    }

    // MARK: - Session control

    func send() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        inputText = ""
        if messages.allSatisfy({ $0.role != .user }) {
            title = String(text.prefix(48))   // title from the first user message
        }
        lastActivity = Date()
        messages.append(ChatMessage(role: .user, text: text))
        persist()

        if session == nil {
            do { try startSession() }
            catch {
                startupError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
                appendSystem(startupError ?? "Failed to start agent.")
                return
            }
        }
        isBusy = true
        session?.send(text)
    }

    func stop() {
        session?.stop()
        eventTask?.cancel()
        session = nil
        eventTask = nil
        isBusy = false
        pendingPermission = nil
    }

    func respondToPermission(_ decision: PermissionDecision) {
        guard let request = pendingPermission else { return }
        session?.reply(to: request, decision: decision)
        pendingPermission = nil
    }

    /// Tells the agent which PlanFlow project it's operating on so it can call
    /// planflow-mcp tools with the project ID directly instead of discovering it.
    private var projectSystemPrompt: String {
        """
        You are operating inside the PlanFlow project "\(context.displayName)" \
        (PlanFlow project ID: \(context.projectId)).
        When you call any planflow-mcp tool that accepts a projectId, pass this ID \
        directly — do NOT search the filesystem or run shell commands to discover it. \
        Prefer planflow-mcp tools (planflow_task_list, planflow_plan_outline, \
        planflow_explore, etc.) over reading files when answering questions about \
        this project's plan, tasks, or status.
        """
    }

    private func startSession() throws {
        guard let binary = ClaudeBinaryLocator.resolve() else {
            throw APIError.message("Could not find the `claude` CLI. Install Claude Code or set its path in Settings.")
        }
        let config = ClaudeAgentSession.Config(
            binaryPath: binary,
            workingDirectory: context.workingDirectory,
            model: selectedModel.cliValue,
            permissionMode: .bypassPermissions,
            mcpConfigPath: nil,
            resumeSessionId: lastSessionId,
            appendSystemPrompt: projectSystemPrompt)
        let session = ClaudeAgentSession(config: config)
        self.session = session
        eventTask = Task { [weak self] in
            for await event in session.events {
                self?.handle(event)
            }
        }
        try session.start()
    }

    // MARK: - Event handling

    private func handle(_ event: AgentEvent) {
        switch event {
        case .sessionStarted(let sid, let model, _, let mcp, let mode):
            lastSessionId = sid
            _ = mode
            let modelName = (model ?? "claude").replacingOccurrences(of: "claude-", with: "")
            let mcpNote = mcp.contains(where: { $0.contains("planflow") }) ? "planflow-mcp connected" : "\(mcp.count) MCP"
            sessionInfo = "\(modelName) · \(mcpNote)"
        case .thinkingDelta(let t):
            mutateStreamingAssistant { $0.thinking += t }
        case .textDelta(let t):
            mutateStreamingAssistant { $0.text += t }
        case .toolCallStarted(let id, let name, let input):
            guard !Self.hiddenTools.contains(name) else { break }   // suppress internal plumbing
            mutateStreamingAssistant { $0.toolCalls.append(ToolCall(id: id, name: name, input: input)) }
        case .toolResult(let toolUseId, let content, let isError):
            attachToolResult(toolUseId: toolUseId, content: content, isError: isError)
        case .assistantMessageComplete:
            break // a content turn ended; the `result` event finalizes the turn
        case .permissionRequest(let request):
            pendingPermission = request
        case .turnFinished(let resultText, let cost, let isError, _):
            finishTurn(resultText: resultText, cost: cost, isError: isError)
        case .failed(let message):
            appendSystem(message)
            isBusy = false
        case .exited(let code):
            if code != 0 && isBusy { appendSystem("Agent exited (code \(code)).") }
            isBusy = false
            session = nil
        case .log:
            break // stderr noise; surfaced only on failure paths
        }
    }

    /// Finds or creates the current streaming assistant message and mutates it.
    private func mutateStreamingAssistant(_ mutate: (inout ChatMessage) -> Void) {
        if let index = messages.lastIndex(where: { $0.role == .assistant && $0.isStreaming }) {
            mutate(&messages[index])
        } else {
            var message = ChatMessage(role: .assistant)
            message.isStreaming = true
            mutate(&message)
            messages.append(message)
        }
    }

    private func attachToolResult(toolUseId: String, content: String, isError: Bool) {
        for i in messages.indices.reversed() {
            if let j = messages[i].toolCalls.firstIndex(where: { $0.id == toolUseId }) {
                messages[i].toolCalls[j].result = content
                messages[i].toolCalls[j].isError = isError
                return
            }
        }
    }

    private func finishTurn(resultText: String?, cost: Double?, isError: Bool) {
        if let index = messages.lastIndex(where: { $0.role == .assistant && $0.isStreaming }) {
            messages[index].isStreaming = false
            messages[index].costUSD = cost
            messages[index].isError = isError
            if messages[index].text.isEmpty, let resultText, !resultText.isEmpty {
                messages[index].text = resultText
            }
        } else if let resultText, !resultText.isEmpty {
            var message = ChatMessage(role: .assistant, text: resultText)
            message.costUSD = cost
            message.isError = isError
            messages.append(message)
        }
        isBusy = false
        persist()
    }

    private func appendSystem(_ text: String) {
        messages.append(ChatMessage(role: .system, text: text, isError: true))
        persist()
    }
}
