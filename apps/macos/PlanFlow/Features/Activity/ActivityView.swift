import SwiftUI

struct ActivityView: View {
    let projectId: String
    let projectName: String

    @State private var entries: [ActivityEntry] = []
    @State private var isLoading = false
    @State private var error: String?

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Recent activity").font(.subheadline.weight(.medium)).foregroundStyle(.secondary)
                Spacer()
                Button { Task { await load() } } label: {
                    if isLoading { ProgressView().controlSize(.small) }
                    else { Image(systemName: "arrow.clockwise") }
                }
                .buttonStyle(.borderless)
                .help("Reload activity")
                .disabled(isLoading)
            }
            .padding(.horizontal, Theme.Spacing.lg)
            .padding(.vertical, Theme.Spacing.sm)
            Divider().overlay(Color.hairline)
            content
        }
        .task(id: projectId) { await load() }
    }

    @ViewBuilder
    private var content: some View {
        if let error, entries.isEmpty {
            ContentUnavailableView("Couldn't load activity", systemImage: "exclamationmark.triangle",
                description: Text(error))
        } else if entries.isEmpty && !isLoading {
            ContentUnavailableView("No activity yet", systemImage: "clock",
                description: Text("Activity will appear here as work happens."))
        } else {
            List(entries) { entry in
                HStack(alignment: .top, spacing: Theme.Spacing.md) {
                    Image(systemName: "circle.fill").font(.system(size: 6))
                        .foregroundStyle(Color.accent).padding(.top, 6)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(entry.displayText).font(.callout)
                        HStack(spacing: Theme.Spacing.sm) {
                            if let actor = entry.actorName {
                                Text(actor).font(.caption2).foregroundStyle(.secondary)
                            }
                            if let date = entry.createdAt {
                                Text(date.relativeShort).font(.caption2).foregroundStyle(.tertiary)
                            }
                        }
                    }
                }
                .listRowBackground(Color.clear)
                .padding(.vertical, 2)
            }
            .listStyle(.inset)
            .scrollContentBackground(.hidden)
        }
    }

    private func load() async {
        isLoading = true; error = nil
        defer { isLoading = false }
        do { entries = try await PlanFlowAPI.activity(projectId: projectId) }
        catch { self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription }
    }
}
