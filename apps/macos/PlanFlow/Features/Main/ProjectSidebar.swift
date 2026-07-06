import SwiftUI

struct ProjectSidebar: View {
    @Environment(AppState.self) private var appState
    @Environment(ProjectsStore.self) private var projects
    @Environment(WorkspaceStore.self) private var workspaces
    @Binding var route: DetailRoute?

    var body: some View {
        @Bindable var projects = projects
        VStack(spacing: 0) {
            brandBar
            searchField
            list
            Divider().overlay(Color.hairline)
            accountFooter
        }
        .background(Color.sidebar)
    }

    // MARK: Brand

    private var brandBar: some View {
        HStack(spacing: Theme.Spacing.sm) {
            IconChip(symbol: "square.stack.3d.up.fill", tint: .accent, size: 26)
            Text("PlanFlow").font(.headline.weight(.semibold))
            Spacer()
            Button {
                Task { await projects.loadAll(organizations: appState.organizations) }
            } label: {
                if projects.isLoading { ProgressView().controlSize(.small) }
                else { Image(systemName: "arrow.clockwise") }
            }
            .buttonStyle(.borderless)
            .help("Reload projects")
        }
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.top, Chrome.topInset)
        .padding(.bottom, Theme.Spacing.sm)
    }

    private var searchField: some View {
        @Bindable var projects = projects
        return HStack(spacing: Theme.Spacing.xs) {
            Image(systemName: "magnifyingglass").font(.caption).foregroundStyle(.secondary)
            TextField("Search projects", text: $projects.searchText)
                .textFieldStyle(.plain).font(.callout)
            if !projects.searchText.isEmpty {
                Button { projects.searchText = "" } label: { Image(systemName: "xmark.circle.fill") }
                    .buttonStyle(.borderless).foregroundStyle(.tertiary)
            }
        }
        .padding(.horizontal, Theme.Spacing.sm)
        .padding(.vertical, 6)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
            .strokeBorder(Color.hairline, lineWidth: 1))
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.bottom, Theme.Spacing.sm)
    }

    // MARK: List

    private var list: some View {
        List(selection: $route) {
            Label("Notifications", systemImage: "bell")
                .tag(DetailRoute.notifications)

            if projects.projects.isEmpty && !projects.isLoading {
                Text(projects.error ?? "No projects yet")
                    .font(.caption).foregroundStyle(.secondary)
                    .listRowSeparator(.hidden)
            }

            ForEach(projects.groupedFiltered, id: \.org) { group in
                Section(group.org) {
                    ForEach(group.projects) { project in
                        ProjectRow(project: project,
                                   isLinked: workspaces.folder(forProjectId: project.id) != nil)
                            .tag(DetailRoute.project(project.id))
                    }
                }
            }
        }
        .listStyle(.sidebar)
        .scrollContentBackground(.hidden)
    }

    // MARK: Footer

    private var accountFooter: some View {
        HStack(spacing: Theme.Spacing.sm) {
            Circle().fill(Color.accent.opacity(0.22))
                .frame(width: 28, height: 28)
                .overlay(Text(appState.currentUser?.initials ?? "?")
                    .font(.caption.weight(.bold)).foregroundStyle(Color.accent))
            VStack(alignment: .leading, spacing: 0) {
                Text(appState.currentUser?.displayName ?? "—")
                    .font(.caption.weight(.medium)).lineLimit(1)
                Text(appState.currentUser?.email ?? "")
                    .font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer()
            Menu {
                SettingsLink { Text("Settings…") }
                Divider()
                Button("Sign Out", role: .destructive) { Task { await appState.signOut() } }
            } label: {
                Image(systemName: "ellipsis.circle")
            }
            .menuStyle(.borderlessButton)
            .frame(width: 22)
            .accessibilityLabel("Account options")
        }
        .padding(Theme.Spacing.sm)
    }
}

struct ProjectRow: View {
    let project: Project
    let isLinked: Bool

    var body: some View {
        HStack(spacing: Theme.Spacing.sm) {
            Image(systemName: project.isArchived ? "archivebox" : "folder")
                .font(.callout).foregroundStyle(project.isArchived ? .tertiary : .secondary)
                .frame(width: 18)
            Text(project.name).lineLimit(1)
            Spacer(minLength: 0)
            if isLinked {
                Image(systemName: "link").font(.caption2).foregroundStyle(Color.accent)
                    .help("A local folder is linked")
            }
        }
    }
}
