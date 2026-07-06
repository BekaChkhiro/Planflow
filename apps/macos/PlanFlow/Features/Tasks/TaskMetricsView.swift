import SwiftUI

/// Aggregate task metrics for a project, derived from real API data.
struct TaskMetrics {
    var total = 0
    var counts: [TaskStatus: Int] = [:]

    init(_ tasks: [PlanTask]) {
        total = tasks.count
        for status in TaskStatus.allCases { counts[status] = 0 }
        for task in tasks { counts[task.status, default: 0] += 1 }
    }

    var done: Int { counts[.done] ?? 0 }
    var progress: Double { total > 0 ? Double(done) / Double(total) : 0 }
}

/// A polished metrics header: a progress ring plus per-status stat cards.
struct TaskMetricsView: View {
    let metrics: TaskMetrics
    var isLoading = false
    var onReload: () -> Void = {}
    var onConfigure: (() -> Void)?

    var body: some View {
        HStack(spacing: Theme.Spacing.xl) {
            progressBlock
            Divider().frame(height: 44).overlay(Color.hairline)
            HStack(spacing: Theme.Spacing.md) {
                ForEach(TaskStatus.boardOrder) { status in
                    StatCard(status: status, count: metrics.counts[status] ?? 0)
                }
            }
            Spacer(minLength: 0)
            if let onConfigure {
                Button(action: onConfigure) { Image(systemName: "gearshape") }
                    .buttonStyle(.borderless)
                    .help("Configure task automation (Claude routine)")
            }
            Button(action: onReload) {
                if isLoading { ProgressView().controlSize(.small) }
                else { Image(systemName: "arrow.clockwise") }
            }
            .buttonStyle(.borderless)
            .help("Reload tasks")
            .disabled(isLoading)
        }
        .padding(Theme.Spacing.lg)
        .background(Color.sidebar, in: RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
            .strokeBorder(Color.hairline, lineWidth: 1))
        .padding(.horizontal, Theme.Spacing.lg)
        .padding(.top, Theme.Spacing.md)
    }

    private var progressBlock: some View {
        HStack(spacing: Theme.Spacing.md) {
            ProgressRing(progress: metrics.progress)
                .frame(width: 52, height: 52)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(Int(metrics.progress * 100))% complete")
                    .font(.headline)
                Text("\(metrics.done) of \(metrics.total) tasks done")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

struct ProgressRing: View {
    let progress: Double
    var body: some View {
        ZStack {
            Circle().stroke(Color.hairline, lineWidth: 5)
            Circle()
                .trim(from: 0, to: max(0.001, progress))
                .stroke(Color.accent, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.smooth, value: progress)
            Text("\(Int(progress * 100))")
                .font(.caption.weight(.bold).monospacedDigit())
        }
    }
}

struct StatCard: View {
    let status: TaskStatus
    let count: Int

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack(spacing: 5) {
                Circle().fill(status.tint).frame(width: 7, height: 7)
                Text(status.title.uppercased())
                    .font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
            }
            Text("\(count)").font(.title2.weight(.semibold).monospacedDigit())
        }
        .frame(minWidth: 64, alignment: .leading)
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.vertical, Theme.Spacing.sm)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
            .strokeBorder(Color.hairline, lineWidth: 1))
    }
}
