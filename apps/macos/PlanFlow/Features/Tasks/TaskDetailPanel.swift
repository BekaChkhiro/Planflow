import SwiftUI

/// A detail panel for a single task, sliding in from the left of the board.
struct TaskDetailPanel: View {
    let task: PlanTask
    var run: TaskRun?
    var onClose: () -> Void
    var onStatusChange: (TaskStatus) -> Void
    var onStart: () -> Void = {}
    var onStop: () -> Void = {}

    private var pid: String { task.projectId ?? "" }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider().overlay(Color.hairline)
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
                    title
                    runSection
                    statusControl
                    if let description = task.description, !description.isEmpty {
                        section("Description") {
                            Text(description).font(.callout).foregroundStyle(.primary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    TaskDetailsSection(projectId: pid, taskId: task.taskId,
                                       initialDetails: task.details)
                    TaskAttachmentsSection(projectId: pid, taskId: task.taskId)
                    metadata
                    dependencies
                    github
                    dates
                }
                .padding(Theme.Spacing.lg)
            }
        }
        .background(Color.sidebar)
        .overlay(alignment: .trailing) {
            Rectangle().fill(Color.hairline).frame(width: 1)
        }
        .shadow(color: .black.opacity(0.25), radius: 16, x: 6)
    }

    // MARK: Sections

    private var header: some View {
        HStack {
            Text(task.taskId).font(.callout.monospaced().weight(.bold)).foregroundStyle(Color.accent)
            Pill(text: task.status.title, color: task.status.tint)
            Spacer()
            Button(action: onClose) { Image(systemName: "xmark") }
                .buttonStyle(.borderless).foregroundStyle(.secondary)
                .help("Close")
        }
        .padding(.horizontal, Theme.Spacing.lg)
        .padding(.top, Chrome.topInset)
        .padding(.bottom, Theme.Spacing.sm)
    }

    private var title: some View {
        Text(task.name).font(.title3.weight(.semibold))
            .fixedSize(horizontal: false, vertical: true)
    }

    @ViewBuilder
    private var runSection: some View {
        if let run, run.state != .stopped {
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                HStack {
                    RunBadge(state: run.state)
                    Spacer()
                    if run.state.isActive {
                        Button("Stop", role: .destructive, action: onStop)
                            .controlSize(.small)
                    }
                }
                if run.state.isActive {
                    gateRow("Marked done in PlanFlow", done: run.planflowDone)
                    gateRow("Pull request merged", done: run.prMerged)
                }
                if let error = run.error {
                    Text(error).font(.caption).foregroundStyle(.red)
                }
                if !run.sessionURL.isEmpty, let url = URL(string: run.sessionURL) {
                    Link(destination: url) {
                        Label("Open cloud session", systemImage: "arrow.up.forward.app")
                            .font(.callout)
                    }
                }
            }
            .padding(Theme.Spacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                .strokeBorder(Color.hairline, lineWidth: 1))
        } else if task.status != .done {
            Button(action: onStart) {
                Label("Start with Claude routine", systemImage: "play.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        }
    }

    private func gateRow(_ text: String, done: Bool) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            Image(systemName: done ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(done ? .green : .secondary)
            Text(text).font(.caption).foregroundStyle(.secondary)
        }
    }

    private var statusControl: some View {
        section("Status") {
            HStack(spacing: Theme.Spacing.sm) {
                ForEach(TaskStatus.boardOrder) { status in
                    Button { onStatusChange(status) } label: {
                        Text(status.title)
                            .font(.caption.weight(.medium))
                            .padding(.horizontal, Theme.Spacing.sm)
                            .padding(.vertical, 5)
                            .foregroundStyle(task.status == status ? Color.white : Color.secondary)
                            .background(task.status == status ? status.tint : Color.surface,
                                        in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    @ViewBuilder
    private var metadata: some View {
        section("Properties") {
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                if let complexity = task.complexity {
                    metaRow("Complexity") { Pill(text: complexity.rawValue, color: complexity.tint) }
                }
                if let hours = task.estimatedHours {
                    metaRow("Estimate") { Text("\(hours)h").font(.callout) }
                }
                if let assignee = task.assigneeName ?? task.assigneeEmail {
                    metaRow("Assignee") {
                        Label(assignee, systemImage: "person.crop.circle").font(.callout)
                    }
                }
                if let locked = task.lockedByName ?? task.lockedBy {
                    metaRow("Locked by") {
                        Label(locked, systemImage: "lock.fill").font(.callout).foregroundStyle(.orange)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var dependencies: some View {
        if let deps = task.dependencies, !deps.isEmpty {
            section("Dependencies") {
                FlowChips(items: deps)
            }
        }
    }

    @ViewBuilder
    private var github: some View {
        if task.githubIssueNumber != nil || task.githubPrNumber != nil {
            section("GitHub") {
                VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                    if let issue = task.githubIssueNumber {
                        linkRow(symbol: "smallcircle.circle", text: "Issue #\(issue)", url: task.githubIssueUrl)
                    }
                    if let pr = task.githubPrNumber {
                        linkRow(symbol: "arrow.triangle.pull",
                                text: "PR #\(pr)" + (task.githubPrState.map { " · \($0)" } ?? ""),
                                url: task.githubPrUrl)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var dates: some View {
        if task.createdAt != nil || task.updatedAt != nil {
            section("Timeline") {
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    if let created = task.createdAt {
                        Text("Created \(created.relativeShort)").font(.caption).foregroundStyle(.secondary)
                    }
                    if let updated = task.updatedAt {
                        Text("Updated \(updated.relativeShort)").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    // MARK: Helpers

    private func section(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            Text(title.uppercased()).font(.caption2.weight(.semibold)).foregroundStyle(.tertiary)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func metaRow(_ label: String, @ViewBuilder value: () -> some View) -> some View {
        HStack {
            Text(label).font(.callout).foregroundStyle(.secondary)
            Spacer()
            value()
        }
    }

    private func linkRow(symbol: String, text: String, url: String?) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            Image(systemName: symbol).foregroundStyle(.secondary)
            if let url, let link = URL(string: url) {
                Link(text, destination: link).font(.callout)
            } else {
                Text(text).font(.callout)
            }
            Spacer()
        }
    }
}

/// Wrapping chips for dependency ids.
private struct FlowChips: View {
    let items: [String]
    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 56), spacing: 6, alignment: .leading)],
                  alignment: .leading, spacing: 6) {
            ForEach(items, id: \.self) { item in
                Text(item)
                    .font(.caption.monospaced())
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Color.surface, in: Capsule())
                    .overlay(Capsule().strokeBorder(Color.hairline, lineWidth: 1))
            }
        }
    }
}
