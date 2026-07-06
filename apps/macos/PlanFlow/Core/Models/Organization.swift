import Foundation

struct Organization: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    var slug: String?
    var role: String?            // current user's role in this org
    var memberCount: Int?
    var createdAt: Date?
}

struct OrganizationMember: Codable, Identifiable, Hashable {
    let id: String
    var userId: String?
    var email: String?
    var name: String?
    var role: String?
    var joinedAt: Date?

    var displayName: String { name ?? email ?? "Unknown" }
}
