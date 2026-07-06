import Foundation
import SwiftUI

enum TaskRunState: String, Codable {
    case queued        // firing the routine
    case running       // cloud session working; task not yet complete
    case verifying     // one gate condition met, waiting for the other
    case done          // both gates met (PlanFlow DONE + PR merged)
    case failed        // fire failed
    case stopped       // user detached tracking

    var isActive: Bool { self == .queued || self == .running || self == .verifying }

    var label: String {
        switch self {
        case .queued: return "Starting…"
        case .running: return "Running"
        case .verifying: return "Verifying"
        case .done: return "Completed"
        case .failed: return "Failed"
        case .stopped: return "Stopped"
        }
    }

    var tint: Color {
        switch self {
        case .queued, .running: return .blue
        case .verifying: return .orange
        case .done: return .green
        case .failed: return .red
        case .stopped: return .secondary
        }
    }
}

/// An autonomous cloud run started for a task via a Claude Code routine.
struct TaskRun: Codable, Identifiable {
    let id: String            // task UUID (one active run per task)
    var projectId: String
    var taskHumanId: String
    var taskName: String
    var sessionId: String
    var sessionURL: String
    var state: TaskRunState
    var startedAt: Date
    var error: String?

    // Gate conditions (both required for `done`).
    var planflowDone: Bool = false
    var prMerged: Bool = false
}
