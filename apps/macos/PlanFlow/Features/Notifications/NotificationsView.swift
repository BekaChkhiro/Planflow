import SwiftUI

struct NotificationsView: View {
    var toggleSidebar: () -> Void = {}
    @State private var items: [AppNotification] = []
    @State private var isLoading = false
    @State private var error: String?

    var body: some View {
        VStack(spacing: 0) {
            ChromeHeader(toggleSidebar: toggleSidebar) {
                Text("Notifications").font(.headline)
            } center: {
                EmptyView()
            } trailing: {
                Button { Task { await load() } } label: {
                    if isLoading { ProgressView().controlSize(.small) }
                    else { Image(systemName: "arrow.clockwise") }
                }
                .buttonStyle(.borderless)
                .help("Reload notifications")
                .disabled(isLoading)
            }
            Divider().overlay(Color.hairline)
            content
        }
        .background(Color.canvas)
        .task { await load() }
    }

    @ViewBuilder
    private var content: some View {
        Group {
            if let error, items.isEmpty {
                ContentUnavailableView("Couldn't load notifications", systemImage: "exclamationmark.triangle",
                    description: Text(error))
            } else if items.isEmpty && !isLoading {
                ContentUnavailableView("You're all caught up", systemImage: "bell.slash",
                    description: Text("No notifications."))
            } else {
                List(items) { item in
                    HStack(alignment: .top, spacing: Theme.Spacing.md) {
                        Image(systemName: item.unread ? "circle.fill" : "circle")
                            .font(.system(size: 8))
                            .foregroundStyle(item.unread ? Theme.accent : .secondary)
                            .padding(.top, 5)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.displayTitle).font(.callout.weight(item.unread ? .semibold : .regular))
                            if let body = item.displayBody {
                                Text(body).font(.caption).foregroundStyle(.secondary).lineLimit(3)
                            }
                            if let date = item.createdAt {
                                Text(date.relativeShort).font(.caption2).foregroundStyle(.tertiary)
                            }
                        }
                    }
                    .padding(.vertical, 2)
                    .listRowBackground(Color.clear)
                }
                .listStyle(.inset)
                .scrollContentBackground(.hidden)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.canvas)
    }

    private func load() async {
        isLoading = true; error = nil
        defer { isLoading = false }
        do { items = try await PlanFlowAPI.notifications() }
        catch { self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription }
    }
}
