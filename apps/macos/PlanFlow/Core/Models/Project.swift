import Foundation

struct Project: Codable, Identifiable, Hashable {
    let id: String
    var name: String
    var description: String?
    var organizationId: String?
    var plan: String?            // markdown PROJECT_PLAN.md content
    var archivedAt: Date?
    var createdAt: Date?
    var updatedAt: Date?

    // GitHub link
    var githubRepository: String?
    var githubRepoUrl: String?
    var githubDefaultBranch: String?

    var isArchived: Bool { archivedAt != nil }
}
