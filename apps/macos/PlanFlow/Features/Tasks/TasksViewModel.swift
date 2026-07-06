import Foundation
import Observation

@MainActor
@Observable
final class TasksViewModel {
    let projectId: String
    let projectName: String
    var tasks: [PlanTask] = []
    var isLoading = false
    var error: String?

    init(projectId: String, projectName: String) {
        self.projectId = projectId
        self.projectName = projectName
    }

    var metrics: TaskMetrics { TaskMetrics(tasks) }

    /// Tasks grouped into phases, derived from the `T<phase>.<n>` id prefix.
    var phases: [TaskPhase] {
        var groups: [Int: [PlanTask]] = [:]
        for task in tasks {
            let phase = TaskPhase.phaseNumber(from: task.taskId)
            groups[phase, default: []].append(task)
        }
        return groups
            .map { TaskPhase(number: $0.key, tasks: $0.value) }
            .sorted { $0.number < $1.number }
    }

    func tasks(in status: TaskStatus) -> [PlanTask] {
        tasks.filter { $0.status == status }
            .sorted { ($0.displayOrder ?? 0, $0.taskId) < ($1.displayOrder ?? 0, $1.taskId) }
    }

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            tasks = try await PlanFlowAPI.tasks(projectId: projectId)
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    func move(_ task: PlanTask, to status: TaskStatus) async {
        guard task.status != status else { return }
        if let index = tasks.firstIndex(where: { $0.id == task.id }) {
            tasks[index].status = status
        }
        do {
            try await PlanFlowAPI.updateTaskStatus(projectId: projectId, taskId: task.id, status: status)
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            await load()
        }
    }
}
