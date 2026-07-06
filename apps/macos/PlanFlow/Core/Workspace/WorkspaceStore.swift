import Foundation
import Observation
import AppKit

@MainActor
@Observable
final class WorkspaceStore {
    private(set) var workspaces: [Workspace] = []
    var selectedID: Workspace.ID?

    private let defaultsKey = "linkedWorkspaces"

    var selected: Workspace? {
        guard let selectedID else { return workspaces.first }
        return workspaces.first { $0.id == selectedID }
    }

    init() { load() }

    // MARK: - Persistence

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: defaultsKey),
              let decoded = try? JSONDecoder().decode([Workspace].self, from: data) else { return }
        workspaces = decoded
        selectedID = decoded.first?.id
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(workspaces) {
            UserDefaults.standard.set(data, forKey: defaultsKey)
        }
    }

    // MARK: - Mutations

    /// Presents an open panel and links the chosen folder.
    func promptToLinkFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = "Link Folder"
        panel.message = "Choose a codebase folder to link as a PlanFlow workspace."
        if panel.runModal() == .OK, let url = panel.url {
            link(url: url)
        }
    }

    func link(url: URL) {
        let bookmark = try? url.bookmarkData(options: [.withSecurityScope],
                                             includingResourceValuesForKeys: nil, relativeTo: nil)
        var workspace = Workspace(name: url.lastPathComponent, path: url.path, bookmark: bookmark)
        if let config = PlanConfig.read(at: url) {
            workspace.linkedProjectId = config.cloud?.projectId
            workspace.linkedProjectName = config.cloud?.projectName
        }
        workspace.lastOpened = Date()

        // Avoid duplicates by path.
        if let existing = workspaces.firstIndex(where: { $0.path == url.path }) {
            workspaces[existing] = workspace
            selectedID = workspace.id
        } else {
            workspaces.insert(workspace, at: 0)
            selectedID = workspace.id
        }
        persist()
    }

    /// The folder linked to a given PlanFlow project, if any.
    func folder(forProjectId projectId: String) -> Workspace? {
        workspaces.first { $0.linkedProjectId == projectId }
    }

    /// Resolves a working directory for chatting in a project. Uses the linked
    /// codebase folder when present; otherwise an app-managed directory seeded
    /// with a `.plan-config.json` so `planflow-mcp` targets the right project.
    func chatContext(for project: Project) -> ChatContext {
        if let folder = folder(forProjectId: project.id) {
            return ChatContext(projectId: project.id, displayName: folder.name,
                               workingDirectory: folder.resolvedURL, isFolderLinked: true)
        }
        let dir = appManagedDirectory(for: project)
        return ChatContext(projectId: project.id, displayName: project.name,
                           workingDirectory: dir, isFolderLinked: false)
    }

    /// Creates (once) `~/Library/Application Support/PlanFlow/workspaces/<id>`
    /// and writes a minimal `.plan-config.json` linking it to the cloud project.
    private func appManagedDirectory(for project: Project) -> URL {
        let fm = FileManager.default
        let base = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PlanFlow/workspaces/\(project.id)", isDirectory: true)
        try? fm.createDirectory(at: base, withIntermediateDirectories: true)

        let configURL = base.appendingPathComponent(".plan-config.json")
        if !fm.fileExists(atPath: configURL.path) {
            let config: [String: Any] = [
                "cloud": ["projectId": project.id, "projectName": project.name, "autoSync": true],
            ]
            if let data = try? JSONSerialization.data(withJSONObject: config, options: [.prettyPrinted]) {
                try? data.write(to: configURL)
            }
        }
        return base
    }

    /// Presents an open panel and links the chosen folder to a specific project.
    func promptToLinkFolder(toProjectId projectId: String, projectName: String) {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = "Link Folder"
        panel.message = "Choose the local codebase folder for “\(projectName)”."
        if panel.runModal() == .OK, let url = panel.url {
            link(url: url, toProjectId: projectId, projectName: projectName)
        }
    }

    func link(url: URL, toProjectId projectId: String, projectName: String) {
        let bookmark = try? url.bookmarkData(options: [.withSecurityScope],
                                             includingResourceValuesForKeys: nil, relativeTo: nil)
        var workspace = Workspace(name: url.lastPathComponent, path: url.path, bookmark: bookmark)
        workspace.linkedProjectId = projectId
        workspace.linkedProjectName = projectName
        workspace.lastOpened = Date()

        // One folder per project: replace any existing link for this project or path.
        workspaces.removeAll { $0.linkedProjectId == projectId || $0.path == url.path }
        workspaces.insert(workspace, at: 0)
        selectedID = workspace.id
        persist()
    }

    func unlink(projectId: String) {
        workspaces.removeAll { $0.linkedProjectId == projectId }
        persist()
    }

    func remove(_ workspace: Workspace) {
        workspaces.removeAll { $0.id == workspace.id }
        if selectedID == workspace.id { selectedID = workspaces.first?.id }
        persist()
    }

    func touch(_ workspace: Workspace) {
        guard let index = workspaces.firstIndex(where: { $0.id == workspace.id }) else { return }
        workspaces[index].lastOpened = Date()
        persist()
    }

    /// Re-reads `.plan-config.json` to refresh the cloud project linkage.
    func refreshLinkage(_ workspace: Workspace) {
        guard let index = workspaces.firstIndex(where: { $0.id == workspace.id }) else { return }
        if let config = PlanConfig.read(at: workspace.resolvedURL) {
            workspaces[index].linkedProjectId = config.cloud?.projectId
            workspaces[index].linkedProjectName = config.cloud?.projectName
            persist()
        }
    }
}
