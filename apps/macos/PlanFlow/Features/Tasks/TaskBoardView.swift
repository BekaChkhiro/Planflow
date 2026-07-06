import SwiftUI
import UniformTypeIdentifiers

struct TaskBoardView: View {
    let project: Project
    @State private var vm: TasksViewModel
    @State private var selectedTaskId: String?
    @State private var showRoutineSetup = false

    @Environment(TaskRunStore.self) private var runStore
    @Environment(RoutineConfigStore.self) private var configStore

    init(project: Project) {
        self.project = project
        _vm = State(initialValue: TasksViewModel(projectId: project.id, projectName: project.name))
    }

    private var selectedTask: PlanTask? {
        guard let selectedTaskId else { return nil }
        return vm.tasks.first { $0.id == selectedTaskId }
    }

    private func tasks(in status: TaskStatus) -> [PlanTask] {
        vm.tasks.filter { runStore.effectiveStatus(for: $0) == status }
            .sorted { ($0.displayOrder ?? 0, $0.taskId) < ($1.displayOrder ?? 0, $1.taskId) }
    }

    var body: some View {
        content
            .task(id: vm.projectId) { await vm.load() }
            .sheet(isPresented: $showRoutineSetup) {
                RoutineSetupSheet(project: project)
            }
    }

    private func startTask(_ task: PlanTask) {
        guard let config = configStore.config(for: project.id) else {
            showRoutineSetup = true
            return
        }
        runStore.start(task: task, project: project, config: config)
    }

    @ViewBuilder
    private var content: some View {
        if let error = vm.error, vm.tasks.isEmpty {
            ContentUnavailableView("Couldn't load tasks", systemImage: "exclamationmark.triangle", description: Text(error))
        } else if vm.tasks.isEmpty && !vm.isLoading {
            ContentUnavailableView {
                Label("No tasks yet", systemImage: "checklist")
            } description: {
                Text("Open the Chat tab and ask the agent to scaffold a plan and create tasks.")
            }
        } else {
            ZStack(alignment: .leading) {
                VStack(spacing: 0) {
                    PipelineBar(project: project, onNeedSetup: { showRoutineSetup = true })
                    TaskMetricsView(metrics: vm.metrics, isLoading: vm.isLoading,
                                    onReload: { Task { await vm.load() } },
                                    onConfigure: { showRoutineSetup = true })
                    PhasesBar(phases: vm.phases)
                    board
                }

                if let task = selectedTask {
                    TaskDetailPanel(
                        task: task,
                        run: runStore.run(for: task.id),
                        onClose: { selectedTaskId = nil },
                        onStatusChange: { newStatus in Task { await vm.move(task, to: newStatus) } },
                        onStart: { startTask(task) },
                        onStop: { runStore.stop(taskId: task.id) })
                        .frame(width: 380)
                        .transition(.move(edge: .leading).combined(with: .opacity))
                        .zIndex(1)
                }
            }
            .animation(.snappy, value: selectedTaskId)
        }
    }

    private var board: some View {
        ScrollView(.horizontal) {
                HStack(alignment: .top, spacing: Theme.Spacing.md) {
                    ForEach(TaskStatus.boardOrder) { status in
                        TaskColumn(status: status, tasks: tasks(in: status),
                                   selectedId: selectedTaskId,
                                   onSelect: { task in
                                       selectedTaskId = (selectedTaskId == task.id) ? nil : task.id
                                   },
                                   onStart: startTask)
                    }
                }
                .padding(Theme.Spacing.lg)
            }
            .onReceive(NotificationCenter.default.publisher(for: .taskDropped)) { note in
                guard let id = note.userInfo?["id"] as? String,
                      let raw = note.userInfo?["status"] as? String,
                      let status = TaskStatus(rawValue: raw),
                      let task = vm.tasks.first(where: { $0.id == id }) else { return }
                Task { await vm.move(task, to: status) }
            }
    }
}

struct TaskColumn: View {
    let status: TaskStatus
    let tasks: [PlanTask]
    var selectedId: String?
    var onSelect: (PlanTask) -> Void = { _ in }
    var onStart: (PlanTask) -> Void = { _ in }

    @State private var isTargeted = false

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack(spacing: Theme.Spacing.sm) {
                Circle().fill(status.tint).frame(width: 8, height: 8)
                Text(status.title).font(.subheadline.weight(.semibold))
                Text("\(tasks.count)").font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 6).padding(.vertical, 1)
                    .background(Color.surface, in: Capsule())
                Spacer()
            }
            .padding(.horizontal, Theme.Spacing.xs)
            .padding(.top, Theme.Spacing.xs)

            ScrollView {
                LazyVStack(spacing: Theme.Spacing.sm) {
                    ForEach(tasks) { task in
                        TaskCard(task: task, isSelected: task.id == selectedId,
                                 onStart: { onStart(task) })
                            .onTapGesture { onSelect(task) }
                            .draggable(task.id)
                    }
                }
                .padding(.bottom, Theme.Spacing.sm)
            }
        }
        .frame(width: 290)
        .padding(Theme.Spacing.sm)
        .background(isTargeted ? status.tint.opacity(0.1) : Color.sidebar,
                    in: RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
            .strokeBorder(isTargeted ? status.tint.opacity(0.4) : Color.hairline, lineWidth: 1))
        .dropDestination(for: String.self) { items, _ in
            // The board view resolves the dragged id back to a task.
            NotificationCenter.default.post(name: .taskDropped,
                object: nil, userInfo: ["id": items.first ?? "", "status": status.rawValue])
            return true
        } isTargeted: { isTargeted = $0 }
    }
}

extension Notification.Name {
    static let taskDropped = Notification.Name("taskDropped")
}

struct TaskCard: View {
    let task: PlanTask
    var isSelected: Bool = false
    var onStart: () -> Void = {}
    @State private var hovering = false
    @Environment(TaskRunStore.self) private var runStore

    private var run: TaskRun? { runStore.run(for: task.id) }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack(spacing: Theme.Spacing.xs) {
                Text(task.taskId).font(.caption.monospaced().weight(.semibold))
                    .foregroundStyle(Theme.accent)
                Spacer()
                if let run, run.state != .stopped {
                    RunBadge(state: run.state)
                } else if hovering && task.status != .done {
                    Button(action: onStart) {
                        Image(systemName: "play.fill").font(.caption2)
                    }
                    .buttonStyle(.borderless).foregroundStyle(Color.accent)
                    .help("Start this task with a Claude routine")
                }
                if let complexity = task.complexity {
                    Pill(text: complexity.rawValue, color: complexity.tint)
                }
            }
            Text(task.name).font(.callout.weight(.medium))
                .fixedSize(horizontal: false, vertical: true)
            if let description = task.description, !description.isEmpty {
                Text(description).font(.caption).foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            HStack(spacing: Theme.Spacing.sm) {
                if let assignee = task.assigneeName {
                    Label(assignee, systemImage: "person.crop.circle")
                        .font(.caption2).foregroundStyle(.secondary)
                }
                if task.lockedBy != nil {
                    Image(systemName: "lock.fill").font(.caption2).foregroundStyle(.orange)
                }
                Spacer()
                if let pr = task.githubPrNumber {
                    Label("#\(pr)", systemImage: "arrow.triangle.pull")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(hovering ? Color.surfaceHover : Color.surface,
                    in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
            .strokeBorder(isSelected ? Color.accent : Color.hairline, lineWidth: isSelected ? 1.5 : 1))
        .onHover { hovering = $0 }
    }
}

struct RunBadge: View {
    let state: TaskRunState
    var body: some View {
        HStack(spacing: 4) {
            if state.isActive {
                ProgressView().controlSize(.mini)
            } else {
                Circle().fill(state.tint).frame(width: 6, height: 6)
            }
            Text(state.label).font(.caption2.weight(.medium))
        }
        .foregroundStyle(state.tint)
        .padding(.horizontal, 6).padding(.vertical, 2)
        .background(state.tint.opacity(0.12), in: Capsule())
    }
}
