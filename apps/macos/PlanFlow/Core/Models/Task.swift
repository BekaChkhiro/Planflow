import Foundation
import SwiftUI

enum TaskStatus: String, Codable, CaseIterable, Identifiable {
    case todo = "TODO"
    case inProgress = "IN_PROGRESS"
    case done = "DONE"
    case blocked = "BLOCKED"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .todo: return "To Do"
        case .inProgress: return "In Progress"
        case .done: return "Done"
        case .blocked: return "Blocked"
        }
    }

    var tint: Color {
        switch self {
        case .todo: return .secondary
        case .inProgress: return .blue
        case .done: return .green
        case .blocked: return .red
        }
    }

    /// Column ordering on the board.
    static var boardOrder: [TaskStatus] { [.todo, .inProgress, .blocked, .done] }
}

enum TaskComplexity: String, Codable, CaseIterable, Identifiable {
    case low = "Low"
    case medium = "Medium"
    case high = "High"

    var id: String { rawValue }

    var tint: Color {
        switch self {
        case .low: return .green
        case .medium: return .orange
        case .high: return .red
        }
    }
}

/// A PlanFlow task (mirrors the `tasks` table; many fields optional/defensive).
struct PlanTask: Codable, Identifiable, Hashable {
    let id: String
    var projectId: String?
    var taskId: String           // human id, e.g. "T1.2"
    var name: String
    var description: String?
    var details: String?         // full rich markdown spec / context
    var status: TaskStatus
    var complexity: TaskComplexity?
    var estimatedHours: Int?
    var dependencies: [String]?
    var displayOrder: Int?

    var assigneeId: String?
    var assigneeName: String?
    var assigneeEmail: String?

    var lockedBy: String?
    var lockedByName: String?

    // GitHub
    var githubIssueNumber: Int?
    var githubIssueUrl: String?
    var githubPrNumber: Int?
    var githubPrUrl: String?
    var githubPrState: String?

    var createdAt: Date?
    var updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, projectId, taskId, name, description, details, status, complexity
        case estimatedHours, dependencies, displayOrder
        case assigneeId, assigneeName, assigneeEmail
        case lockedBy, lockedByName
        case githubIssueNumber, githubIssueUrl, githubPrNumber, githubPrUrl, githubPrState
        case createdAt, updatedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        projectId = try? c.decode(String.self, forKey: .projectId)
        taskId = (try? c.decode(String.self, forKey: .taskId)) ?? ""
        name = (try? c.decode(String.self, forKey: .name)) ?? "Untitled"
        description = try? c.decode(String.self, forKey: .description)
        details = try? c.decode(String.self, forKey: .details)
        status = (try? c.decode(TaskStatus.self, forKey: .status)) ?? .todo
        complexity = try? c.decode(TaskComplexity.self, forKey: .complexity)
        estimatedHours = try? c.decode(Int.self, forKey: .estimatedHours)
        dependencies = try? c.decode([String].self, forKey: .dependencies)
        displayOrder = try? c.decode(Int.self, forKey: .displayOrder)
        assigneeId = try? c.decode(String.self, forKey: .assigneeId)
        assigneeName = try? c.decode(String.self, forKey: .assigneeName)
        assigneeEmail = try? c.decode(String.self, forKey: .assigneeEmail)
        lockedBy = try? c.decode(String.self, forKey: .lockedBy)
        lockedByName = try? c.decode(String.self, forKey: .lockedByName)
        githubIssueNumber = try? c.decode(Int.self, forKey: .githubIssueNumber)
        githubIssueUrl = try? c.decode(String.self, forKey: .githubIssueUrl)
        githubPrNumber = try? c.decode(Int.self, forKey: .githubPrNumber)
        githubPrUrl = try? c.decode(String.self, forKey: .githubPrUrl)
        githubPrState = try? c.decode(String.self, forKey: .githubPrState)
        createdAt = try? c.decode(Date.self, forKey: .createdAt)
        updatedAt = try? c.decode(Date.self, forKey: .updatedAt)
    }
}
