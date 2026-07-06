import SwiftUI

enum ProjectTab: String, CaseIterable, Identifiable {
    case chat = "Chat"
    case tasks = "Tasks"
    case plan = "Plan"
    case activity = "Activity"
    var id: String { rawValue }
    var symbol: String {
        switch self {
        case .chat: return "bubble.left.and.text.bubble.right"
        case .tasks: return "checklist"
        case .plan: return "doc.text"
        case .activity: return "clock.arrow.circlepath"
        }
    }
}

struct ProjectDetailView: View {
    let project: Project
    var toggleSidebar: () -> Void = {}

    @Environment(ProjectsStore.self) private var projects
    @Environment(WorkspaceStore.self) private var workspaces

    @State private var tab: ProjectTab = .chat
    @State private var fullProject: Project?
    @State private var isLoadingPlan = false

    private var linkedFolder: Workspace? { workspaces.folder(forProjectId: project.id) }
    private var displayed: Project { fullProject ?? project }

    var body: some View {
        VStack(spacing: 0) {
            ChromeHeader(toggleSidebar: toggleSidebar) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(project.name).font(.headline).lineLimit(1)
                    Text(subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
            } center: {
                SegmentedTabBar(selection: $tab)
            } trailing: {
                folderControl
            }
            Divider().overlay(Color.hairline)
            content
        }
        .background(Color.canvas)
        .task(id: project.id) { await loadPlan() }
    }

    private var subtitle: String {
        if let folder = linkedFolder { return "\(projects.orgName(for: project)) · 📁 \(folder.name)" }
        return projects.orgName(for: project)
    }

    @ViewBuilder
    private var content: some View {
        switch tab {
        case .plan:
            PlanView(project: displayed, isLoading: isLoadingPlan) { await loadPlan(force: true) }
        case .tasks:
            TaskBoardView(project: project)
        case .activity:
            ActivityView(projectId: project.id, projectName: project.name)
        case .chat:
            ChatView(context: workspaces.chatContext(for: project)) {
                workspaces.promptToLinkFolder(toProjectId: project.id, projectName: project.name)
            }
            .id("\(project.id)-\(linkedFolder?.id.uuidString ?? "none")")
        }
    }

    @ViewBuilder
    private var folderControl: some View {
        if let folder = linkedFolder {
            Menu {
                Label(folder.path, systemImage: "folder").labelStyle(.titleAndIcon)
                Divider()
                Button("Reveal in Finder") {
                    NSWorkspace.shared.activateFileViewerSelecting([folder.resolvedURL])
                }
                Button("Unlink Folder", role: .destructive) { workspaces.unlink(projectId: project.id) }
            } label: {
                Label("Linked", systemImage: "link")
            }
            .help("A local folder is linked to this project")
        } else {
            Button {
                workspaces.promptToLinkFolder(toProjectId: project.id, projectName: project.name)
            } label: {
                Label("Link Folder", systemImage: "link.badge.plus")
            }
            .help("Link a local codebase folder to enable the agent")
        }
    }

    private func loadPlan(force: Bool = false) async {
        if fullProject != nil && !force { return }
        isLoadingPlan = true
        defer { isLoadingPlan = false }
        fullProject = try? await projects.fullProject(project.id)
    }
}

// MARK: - Plan tab

struct PlanView: View {
    let project: Project
    var isLoading: Bool
    var reload: () async -> Void

    var body: some View {
        if let plan = project.plan, !plan.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            ScrollView {
                MarkdownView(markdown: plan)
                    .padding(Theme.Spacing.xl)
                    .frame(maxWidth: 880, alignment: .leading)
                    .frame(maxWidth: .infinity)
            }
        } else if isLoading {
            ProgressView("Loading plan…").frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ContentUnavailableView {
                Label("No plan yet", systemImage: "doc.text")
            } description: {
                Text("This project doesn't have a plan document. Link a folder and ask the agent to scaffold one.")
            } actions: {
                Button("Reload") { Task { await reload() } }
            }
        }
    }
}

