import SwiftUI

/// Controls & shows the server-side sequential task pipeline for a project.
/// The pipeline runs on the backend (continues with the laptop off); this bar
/// starts/pauses it and polls its status.
struct PipelineBar: View {
    let project: Project
    var onNeedSetup: () -> Void

    @Environment(RoutineConfigStore.self) private var configStore
    @State private var pipeline: PipelineState?
    @State private var busy = false

    var body: some View {
        Group {
            if let p = pipeline, p.isActive || p.status == "completed" || p.status == "error" {
                activeBar(p)
            } else {
                startBar
            }
        }
        .padding(Theme.Spacing.md)
        .background(Color.sidebar, in: RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
            .strokeBorder((pipeline?.tint ?? Color.hairline).opacity(pipeline?.isActive == true ? 0.4 : 1),
                          lineWidth: 1))
        .padding(.horizontal, Theme.Spacing.lg)
        .padding(.top, Theme.Spacing.md)
        .task(id: project.id) {
            while !Task.isCancelled {
                pipeline = await PlanFlowAPI.pipelineStatus(projectId: project.id)
                try? await Task.sleep(for: .seconds(8))
            }
        }
    }

    private var startBar: some View {
        HStack(spacing: Theme.Spacing.md) {
            IconChip(symbol: "play.fill", tint: .accent, size: 30)
            VStack(alignment: .leading, spacing: 1) {
                Text("Auto-run all tasks in sequence").font(.subheadline.weight(.semibold))
                Text("Runs on the server — continues even if you close your laptop.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Button(action: start) {
                if busy { ProgressView().controlSize(.small) }
                else { Text("Start pipeline") }
            }
            .buttonStyle(.borderedProminent)
            .disabled(busy)
        }
    }

    private func activeBar(_ p: PipelineState) -> some View {
        HStack(spacing: Theme.Spacing.md) {
            if p.status == "running" { ProgressView().controlSize(.small) }
            else { Circle().fill(p.tint).frame(width: 9, height: 9) }
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: Theme.Spacing.sm) {
                    Text("Pipeline · \(p.title)").font(.subheadline.weight(.semibold))
                    if let t = p.currentTaskId {
                        Text(t).font(.caption.monospaced()).foregroundStyle(Color.accent)
                    }
                }
                HStack(spacing: Theme.Spacing.sm) {
                    if let m = p.message {
                        Text(m).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                    if let s = p.sessionUrl, let url = URL(string: s) {
                        Link(destination: url) {
                            Label("Open session", systemImage: "arrow.up.forward.app")
                                .font(.caption)
                        }
                    }
                }
            }
            Spacer()
            if p.status == "running" {
                Button("Pause") { act { try await PlanFlowAPI.pipelinePause(projectId: project.id) } }
                    .controlSize(.small)
            } else if p.status == "paused" {
                Button("Resume") { act { try await PlanFlowAPI.pipelineResume(projectId: project.id) } }
                    .controlSize(.small)
            }
            Button("Stop", role: .destructive) {
                Task { await PlanFlowAPI.pipelineStop(projectId: project.id); pipeline = nil }
            }
            .controlSize(.small)
        }
    }

    private func start() {
        guard let cfg = configStore.config(for: project.id) else { onNeedSetup(); return }
        busy = true
        Task {
            pipeline = try? await PlanFlowAPI.pipelineStart(projectId: project.id, fireUrl: cfg.fireURL, token: cfg.token)
            busy = false
        }
    }

    private func act(_ action: @escaping () async throws -> PipelineState) {
        Task { pipeline = try? await action() }
    }
}
