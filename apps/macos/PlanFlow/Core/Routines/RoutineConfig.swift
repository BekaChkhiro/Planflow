import Foundation
import Observation

/// A project's Claude Code routine binding: the per-routine `/fire` endpoint and
/// its bearer token (created by the user at claude.ai/code/routines). Firing this
/// routine starts an autonomous cloud Claude Code session bound to the repo.
struct RoutineConfig: Equatable {
    var fireURL: String
    var token: String

    var isValid: Bool {
        guard let url = URL(string: fireURL), url.scheme?.hasPrefix("http") == true else { return false }
        return fireURL.contains("/fire") && !token.isEmpty
    }
}

@MainActor
@Observable
final class RoutineConfigStore {
    /// Bump to notify observers when a config changes.
    private var version = 0

    func config(for projectId: String) -> RoutineConfig? {
        _ = version
        guard let url = UserDefaults.standard.string(forKey: urlKey(projectId)),
              let token = KeychainStore.get(tokenAccount(projectId)),
              !url.isEmpty, !token.isEmpty else { return nil }
        return RoutineConfig(fireURL: url, token: token)
    }

    func save(_ config: RoutineConfig, for projectId: String) {
        UserDefaults.standard.set(config.fireURL, forKey: urlKey(projectId))
        KeychainStore.set(config.token, account: tokenAccount(projectId))
        version += 1
    }

    func clear(for projectId: String) {
        UserDefaults.standard.removeObject(forKey: urlKey(projectId))
        KeychainStore.delete(tokenAccount(projectId))
        version += 1
    }

    func hasConfig(for projectId: String) -> Bool { config(for: projectId) != nil }

    private func urlKey(_ projectId: String) -> String { "routineURL.\(projectId)" }
    private func tokenAccount(_ projectId: String) -> String { "routineToken.\(projectId)" }
}
