import SwiftUI

enum DetailRoute: Hashable {
    case project(String)
    case notifications
}

struct MainView: View {
    @Environment(AppState.self) private var appState
    @Environment(ProjectsStore.self) private var projects

    @State private var route: DetailRoute?
    @State private var columnVisibility: NavigationSplitViewVisibility = .all

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            ProjectSidebar(route: $route)
                .navigationSplitViewColumnWidth(min: 250, ideal: 270, max: 340)
                .toolbar(removing: .sidebarToggle)
        } detail: {
            detail
        }
        .task {
            await appState.loadOrganizations()
            await projects.loadAll(organizations: appState.organizations)
            if route == nil, let first = projects.projects.first { route = .project(first.id) }
        }
        .onChange(of: projects.selectedID) { _, newValue in
            if let id = newValue { route = .project(id) }
        }
    }

    private func toggleSidebar() {
        withAnimation(.snappy) {
            columnVisibility = (columnVisibility == .detailOnly) ? .all : .detailOnly
        }
    }

    @ViewBuilder
    private var detail: some View {
        switch route {
        case .project(let id):
            if let project = projects.projects.first(where: { $0.id == id }) {
                ProjectDetailView(project: project, toggleSidebar: toggleSidebar).id(project.id)
            } else {
                EmptyProjectsView()
            }
        case .notifications:
            NotificationsView(toggleSidebar: toggleSidebar)
        case nil:
            EmptyProjectsView()
        }
    }
}

struct EmptyProjectsView: View {
    @Environment(ProjectsStore.self) private var projects
    @Environment(AppState.self) private var appState

    var body: some View {
        ContentUnavailableView {
            Label("No project selected", systemImage: "square.stack.3d.up")
        } description: {
            Text(projects.isLoading ? "Loading your projects…" : "Select a project from the sidebar to view its plan and tasks.")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.canvas)
    }
}
