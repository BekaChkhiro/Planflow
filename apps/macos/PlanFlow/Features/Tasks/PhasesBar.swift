import SwiftUI

/// A phase derived from tasks sharing the same `T<phase>.<n>` id prefix.
struct TaskPhase: Identifiable {
    let number: Int
    let tasks: [PlanTask]
    var id: Int { number }

    var title: String { number == 0 ? "Backlog" : "Phase \(number)" }
    var total: Int { tasks.count }
    var done: Int { tasks.filter { $0.status == .done }.count }
    var inProgress: Int { tasks.filter { $0.status == .inProgress }.count }
    var remaining: Int { total - done }
    var progress: Double { total > 0 ? Double(done) / Double(total) : 0 }
    var isComplete: Bool { total > 0 && done == total }

    /// Extracts the phase number from a task id like "T1.2" → 1 (0 if none).
    static func phaseNumber(from taskId: String) -> Int {
        guard taskId.hasPrefix("T") || taskId.hasPrefix("t") else { return 0 }
        let digits = taskId.dropFirst().prefix { $0.isNumber }
        return Int(digits) ?? 0
    }
}

/// A horizontal strip of phase cards showing how many tasks remain per phase.
struct PhasesBar: View {
    let phases: [TaskPhase]

    var body: some View {
        if phases.count > 1 {
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                Text("PHASES").font(.caption2.weight(.semibold)).foregroundStyle(.tertiary)
                    .padding(.horizontal, Theme.Spacing.lg)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Theme.Spacing.sm) {
                        ForEach(phases) { PhaseCard(phase: $0) }
                    }
                    .padding(.horizontal, Theme.Spacing.lg)
                }
            }
            .padding(.top, Theme.Spacing.md)
        }
    }
}

private struct PhaseCard: View {
    let phase: TaskPhase

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: Theme.Spacing.xs) {
                Text(phase.title).font(.callout.weight(.semibold))
                if phase.isComplete {
                    Image(systemName: "checkmark.circle.fill").font(.caption).foregroundStyle(.green)
                }
                Spacer(minLength: Theme.Spacing.md)
            }
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text("\(phase.remaining)")
                    .font(.title3.weight(.bold).monospacedDigit())
                    .foregroundStyle(phase.isComplete ? .secondary : .primary)
                Text("left").font(.caption).foregroundStyle(.secondary)
                Spacer(minLength: 0)
                Text("\(phase.done)/\(phase.total)")
                    .font(.caption.monospacedDigit()).foregroundStyle(.tertiary)
            }
            ProgressView(value: phase.progress)
                .tint(phase.isComplete ? .green : Color.accent)
                .controlSize(.small)
        }
        .frame(width: 150)
        .padding(Theme.Spacing.md)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
            .strokeBorder(Color.hairline, lineWidth: 1))
    }
}
