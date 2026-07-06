import Foundation
import Observation

/// Tracks autonomous task runs (cloud Claude Code sessions started via routines).
/// Polls PlanFlow until BOTH gates are satisfied — the task is marked DONE by the
/// agent AND its pull request is merged — before considering the run complete.
@MainActor
@Observable
final class TaskRunStore {
    private(set) var runs: [String: TaskRun] = [:]     // taskId → run
    private var pollers: [String: Task<Void, Never>] = [:]
    private var loadedProjects: Set<String> = []

    private let pollInterval: UInt64 = 15 * 1_000_000_000  // 15s

    // MARK: Query

    func run(for taskId: String) -> TaskRun? { runs[taskId] }

    /// The status to display for a task: while a run is active but not fully
    /// gated, never show DONE — force In Progress so the board reflects reality.
    func effectiveStatus(for task: PlanTask) -> TaskStatus {
        guard let run = runs[task.id], run.state.isActive else { return task.status }
        return task.status == .done ? .inProgress : task.status
    }

    // MARK: Start

    func start(task: PlanTask, project: Project, config: RoutineConfig) {
        loadIfNeeded(project.id)
        var run = TaskRun(
            id: task.id, projectId: project.id, taskHumanId: task.taskId, taskName: task.name,
            sessionId: "", sessionURL: "", state: .queued, startedAt: Date())
        runs[task.id] = run
        persist(project.id)

        Task {
            do {
                let result = try await RoutineClient.fire(config, text: Self.prompt(for: task, project: project))
                run.sessionId = result.sessionId
                run.sessionURL = result.sessionURL
                run.state = .running
                runs[task.id] = run
                persist(project.id)
                startPolling(taskId: task.id, projectId: project.id)
            } catch {
                run.state = .failed
                run.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
                runs[task.id] = run
                persist(project.id)
            }
        }
    }

    func stop(taskId: String) {
        pollers[taskId]?.cancel()
        pollers[taskId] = nil
        if var run = runs[taskId], run.state.isActive {
            run.state = .stopped
            runs[taskId] = run
            persist(run.projectId)
        }
    }

    func dismiss(taskId: String) {
        pollers[taskId]?.cancel(); pollers[taskId] = nil
        let projectId = runs[taskId]?.projectId
        runs[taskId] = nil
        if let projectId { persist(projectId) }
    }

    // MARK: Polling / gating

    private func startPolling(taskId: String, projectId: String) {
        pollers[taskId]?.cancel()
        pollers[taskId] = Task { [weak self] in
            while !Task.isCancelled {
                await self?.pollOnce(taskId: taskId, projectId: projectId)
                if let state = self?.runs[taskId]?.state, !state.isActive { break }
                try? await Task.sleep(nanoseconds: self?.pollInterval ?? 15_000_000_000)
            }
        }
    }

    private func pollOnce(taskId: String, projectId: String) async {
        guard var run = runs[taskId] else { return }
        guard let tasks = try? await PlanFlowAPI.tasks(projectId: projectId),
              let task = tasks.first(where: { $0.id == taskId }) else { return }

        run.planflowDone = (task.status == .done)
        run.prMerged = (task.githubPrState?.lowercased() == "merged")

        if run.planflowDone && run.prMerged {
            run.state = .done
        } else if run.planflowDone || run.prMerged {
            run.state = .verifying
        } else {
            run.state = .running
        }
        runs[taskId] = run
        persist(projectId)
    }

    // MARK: Prompt

    private static func prompt(for task: PlanTask, project: Project) -> String {
        var lines = [
            "Execute this PlanFlow task end-to-end in the repository.",
            "",
            "Task ID: \(task.taskId)",
            "Title: \(task.name)",
        ]
        if let d = task.description, !d.isEmpty { lines.append("Description: \(d)") }
        if let deps = task.dependencies, !deps.isEmpty {
            lines.append("Depends on: \(deps.joined(separator: ", "))")
        }
        lines.append("PlanFlow project ID: \(project.id)")
        lines.append("")
        lines.append(contentsOf: [
            "Instructions:",
            "1. Call planflow_task_start(taskId: \"\(task.taskId)\") to mark it in progress.",
            "2. Implement the task fully on a `claude/task-\(task.taskId)` branch. Run the project's tests and make them pass.",
            "3. Open a pull request with your changes and link it to the task (planflow-mcp GitHub tools).",
            "4. Only when the work is complete and the PR is open, call planflow_task_done(taskId: \"\(task.taskId)\") with a short summary.",
            "Do NOT mark the task done prematurely. The task is considered finished only once the PR is merged.",
        ])
        return lines.joined(separator: "\n")
    }

    // MARK: Persistence

    private func loadIfNeeded(_ projectId: String) {
        guard !loadedProjects.contains(projectId) else { return }
        loadedProjects.insert(projectId)
        guard let data = try? Data(contentsOf: persistURL(projectId)),
              let saved = try? JSONDecoder().decode([TaskRun].self, from: data) else { return }
        for run in saved {
            runs[run.id] = run
            if run.state.isActive { startPolling(taskId: run.id, projectId: projectId) }
        }
    }

    func loadIfNeededPublic(_ projectId: String) { loadIfNeeded(projectId) }

    private func persist(_ projectId: String) {
        let list = runs.values.filter { $0.projectId == projectId }
        let url = persistURL(projectId)
        Task.detached(priority: .background) {
            if let data = try? JSONEncoder().encode(list) { try? data.write(to: url) }
        }
    }

    private func persistURL(_ projectId: String) -> URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PlanFlow/runs", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("\(projectId).json")
    }
}
