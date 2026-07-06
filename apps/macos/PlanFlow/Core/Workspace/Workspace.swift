import Foundation

/// A local codebase folder linked into PlanFlow. Becomes the working directory
/// for the Claude agent and (when a `.plan-config.json` is present) maps to a
/// PlanFlow cloud project.
struct Workspace: Codable, Identifiable, Hashable {
    let id: UUID
    var name: String
    var path: String
    var bookmark: Data?

    /// PlanFlow cloud project linkage, detected from `.plan-config.json`.
    var linkedProjectId: String?
    var linkedProjectName: String?
    var lastOpened: Date?

    init(id: UUID = UUID(), name: String, path: String, bookmark: Data? = nil) {
        self.id = id
        self.name = name
        self.path = path
        self.bookmark = bookmark
    }

    var resolvedURL: URL {
        if let bookmark {
            var stale = false
            if let url = try? URL(resolvingBookmarkData: bookmark, options: [.withSecurityScope],
                                  relativeTo: nil, bookmarkDataIsStale: &stale) {
                return url
            }
        }
        return URL(fileURLWithPath: path)
    }

    var isLinkedToCloud: Bool { linkedProjectId != nil }
}

/// The working context for a chat session: a directory the agent runs in,
/// plus whether that directory is the user's real linked codebase folder.
struct ChatContext: Hashable {
    let projectId: String
    let displayName: String
    let workingDirectory: URL
    let isFolderLinked: Bool
}

/// Shape of `.plan-config.json` at a workspace root (subset we care about).
struct PlanConfig: Decodable {
    struct Cloud: Decodable {
        let projectId: String?
        let projectName: String?
    }
    let cloud: Cloud?

    static func read(at folder: URL) -> PlanConfig? {
        let url = folder.appendingPathComponent(".plan-config.json")
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(PlanConfig.self, from: data)
    }
}
