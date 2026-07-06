import Foundation
import Observation

/// Loads and holds every project the user can see across all their
/// organizations, so projects can be browsed without linking a folder first.
@MainActor
@Observable
final class ProjectsStore {
    private(set) var projects: [Project] = []
    private(set) var orgNames: [String: String] = [:]   // organizationId → name
    var isLoading = false
    var error: String?

    var selectedID: Project.ID?
    var searchText: String = ""

    var selected: Project? {
        guard let selectedID else { return nil }
        return projects.first { $0.id == selectedID }
    }

    /// Projects grouped by organization, honoring the search filter.
    var groupedFiltered: [(org: String, projects: [Project])] {
        let needle = searchText.trimmingCharacters(in: .whitespaces).lowercased()
        let filtered = needle.isEmpty ? projects : projects.filter {
            $0.name.lowercased().contains(needle) ||
            ($0.description?.lowercased().contains(needle) ?? false)
        }
        let groups = Dictionary(grouping: filtered) { orgName(for: $0) }
        return groups
            .map { (org: $0.key, projects: $0.value.sorted { $0.name < $1.name }) }
            .sorted { $0.org < $1.org }
    }

    func orgName(for project: Project) -> String {
        if let id = project.organizationId, let name = orgNames[id] { return name }
        return "Personal"
    }

    /// Loads projects from all of the user's organizations.
    func loadAll(organizations: [Organization]) async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        orgNames = Dictionary(uniqueKeysWithValues: organizations.map { ($0.id, $0.name) })

        var collected: [Project] = []
        var firstError: String?
        await withTaskGroup(of: Result<[Project], Error>.self) { group in
            for org in organizations {
                group.addTask {
                    do { return .success(try await PlanFlowAPI.projects(organizationId: org.id)) }
                    catch { return .failure(error) }
                }
            }
            for await result in group {
                switch result {
                case .success(let items): collected.append(contentsOf: items)
                case .failure(let e): firstError = firstError ?? e.localizedDescription
                }
            }
        }

        // De-duplicate by id (a project could surface under multiple memberships).
        var seen = Set<String>()
        projects = collected.filter { seen.insert($0.id).inserted }
        if projects.isEmpty, let firstError { error = firstError }
        if selectedID == nil { selectedID = projects.first?.id }
    }

    /// Fetches the full project (including the `plan` markdown) for a detail view.
    func fullProject(_ id: String) async throws -> Project {
        try await PlanFlowAPI.project(id)
    }
}
