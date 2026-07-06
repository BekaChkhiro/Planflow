import Foundation
import Observation

/// Owns chat view-models for the app's lifetime, so running agent sessions and
/// their transcripts survive tab/project navigation. Supports multiple parallel
/// sessions per project (like conversation tabs), each persisted to its own file.
@MainActor
@Observable
final class ChatSessionStore {
    // projectId → ordered list of sessions (most-recently-active first)
    private var sessionsByProject: [String: [ChatViewModel]] = [:]
    private var selectedByProject: [String: String] = [:]   // projectId → sessionKey

    /// All sessions for a project, loading persisted ones on first access.
    func sessions(for context: ChatContext) -> [ChatViewModel] {
        ensureLoaded(context)
        return sessionsByProject[context.projectId] ?? []
    }

    /// The currently-selected session for a project.
    func selected(for context: ChatContext) -> ChatViewModel {
        ensureLoaded(context)
        let list = sessionsByProject[context.projectId] ?? []
        if let key = selectedByProject[context.projectId],
           let match = list.first(where: { $0.sessionKey == key }) {
            return match
        }
        let first = list.first ?? newSession(for: context)
        selectedByProject[context.projectId] = first.sessionKey
        return first
    }

    func select(_ session: ChatViewModel, in context: ChatContext) {
        selectedByProject[context.projectId] = session.sessionKey
    }

    /// Creates a fresh session and selects it.
    @discardableResult
    func newSession(for context: ChatContext) -> ChatViewModel {
        let vm = ChatViewModel(context: context)
        sessionsByProject[context.projectId, default: []].insert(vm, at: 0)
        selectedByProject[context.projectId] = vm.sessionKey
        return vm
    }

    func delete(_ session: ChatViewModel, in context: ChatContext) {
        session.deletePersisted()
        sessionsByProject[context.projectId]?.removeAll { $0.sessionKey == session.sessionKey }
        if selectedByProject[context.projectId] == session.sessionKey {
            selectedByProject[context.projectId] = sessionsByProject[context.projectId]?.first?.sessionKey
        }
        if sessionsByProject[context.projectId]?.isEmpty ?? true {
            newSession(for: context)
        }
    }

    /// True if any session for a project is currently running.
    func hasRunning(projectId: String) -> Bool {
        (sessionsByProject[projectId] ?? []).contains { $0.isBusy }
    }

    // MARK: - Loading

    private func ensureLoaded(_ context: ChatContext) {
        let key = context.projectId
        guard sessionsByProject[key] == nil else { return }

        // Reconstruct sessions from persisted files (one JSON per session).
        let dir = ChatViewModel.sessionsDir(projectId: key)
        let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil))?
            .filter { $0.pathExtension == "json" } ?? []

        var loaded: [ChatViewModel] = files.compactMap { url in
            let sessionKey = url.deletingPathExtension().lastPathComponent
            let vm = ChatViewModel(context: context, sessionKey: sessionKey)
            return vm.messages.isEmpty ? nil : vm   // skip empty leftovers
        }
        loaded.sort { $0.lastActivity > $1.lastActivity }

        if loaded.isEmpty {
            sessionsByProject[key] = []
            newSession(for: context)
        } else {
            sessionsByProject[key] = loaded
            selectedByProject[key] = loaded.first?.sessionKey
        }
    }
}
