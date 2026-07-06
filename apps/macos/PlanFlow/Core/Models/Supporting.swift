import Foundation

struct Comment: Codable, Identifiable, Hashable {
    let id: String
    var taskId: String?
    var authorId: String?
    var authorName: String?
    var content: String
    var createdAt: Date?
    var updatedAt: Date?
}

struct ActivityEntry: Codable, Identifiable, Hashable {
    let id: String
    var type: String?
    var action: String?
    var actorName: String?
    var summary: String?
    var description: String?
    var createdAt: Date?

    var displayText: String {
        summary ?? description ?? action ?? type ?? "Activity"
    }
}

struct KnowledgeItem: Codable, Identifiable, Hashable {
    let id: String
    var projectId: String?
    var title: String?
    var content: String?
    var category: String?
    var createdAt: Date?
}

struct AppNotification: Codable, Identifiable, Hashable {
    let id: String
    var type: String?
    var title: String?
    var body: String?
    var message: String?
    var read: Bool?
    var isRead: Bool?
    var createdAt: Date?

    var unread: Bool { !(read ?? isRead ?? false) }
    var displayTitle: String { title ?? type ?? "Notification" }
    var displayBody: String? { body ?? message }
}
