import Foundation
import SwiftUI

struct PipelineState: Codable, Hashable {
    var projectId: String
    var status: String              // running | paused | completed | error
    var currentTaskId: String?
    var sessionUrl: String?
    var message: String?

    var isActive: Bool { status == "running" || status == "paused" }

    var tint: Color {
        switch status {
        case "running": return .blue
        case "paused": return .orange
        case "completed": return .green
        case "error": return .red
        default: return .secondary
        }
    }

    var title: String {
        switch status {
        case "running": return "Running"
        case "paused": return "Paused"
        case "completed": return "Completed"
        case "error": return "Error"
        default: return status.capitalized
        }
    }
}
