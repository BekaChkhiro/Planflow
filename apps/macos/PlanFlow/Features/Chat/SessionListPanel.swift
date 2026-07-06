import SwiftUI

/// Right-hand panel listing a project's chat sessions, with the ability to
/// start new ones and switch between parallel sessions.
struct SessionListPanel: View {
    let context: ChatContext
    @Environment(ChatSessionStore.self) private var store

    var body: some View {
        let sessions = store.sessions(for: context)
        let selected = store.selected(for: context)

        VStack(spacing: 0) {
            header
            Divider().overlay(Color.hairline)
            ScrollView {
                LazyVStack(spacing: 3) {
                    ForEach(sessions) { session in
                        SessionRow(session: session, isSelected: session.sessionKey == selected.sessionKey)
                            .onTapGesture { store.select(session, in: context) }
                            .contextMenu {
                                Button("Delete", role: .destructive) { store.delete(session, in: context) }
                            }
                    }
                }
                .padding(Theme.Spacing.sm)
            }
        }
        .background(Color.sidebar, in: RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.lg, style: .continuous)
            .strokeBorder(Color.hairline, lineWidth: 1))
        .padding(.top, Chrome.topInset - 6)
        .padding(.bottom, Theme.Spacing.md)
        .padding(.trailing, Theme.Spacing.md)
        .padding(.leading, Theme.Spacing.xs)
    }

    private var header: some View {
        HStack {
            Text("SESSIONS").font(.caption2.weight(.semibold)).foregroundStyle(.tertiary)
            Spacer()
            Button {
                store.newSession(for: context)
            } label: {
                Image(systemName: "square.and.pencil")
            }
            .buttonStyle(.borderless)
            .help("New session")
        }
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.vertical, Theme.Spacing.sm)
    }
}

private struct SessionRow: View {
    let session: ChatViewModel
    let isSelected: Bool

    @State private var hovering = false

    private var timeLabel: String {
        abs(session.lastActivity.timeIntervalSinceNow) < 60 ? "now" : session.lastActivity.relativeShort
    }

    var body: some View {
        HStack(spacing: Theme.Spacing.sm) {
            Circle()
                .fill(session.isBusy ? Color.green : Color.secondary.opacity(0.35))
                .frame(width: 5, height: 5)
            Text(session.title.isEmpty ? "New chat" : session.title)
                .font(.callout).lineLimit(1)
                .foregroundStyle(isSelected ? Color.primary : Color.secondary)
            Spacer(minLength: Theme.Spacing.sm)
            Text(timeLabel).font(.caption2).foregroundStyle(.tertiary)
        }
        .padding(.horizontal, Theme.Spacing.sm)
        .padding(.vertical, 7)
        .background(isSelected ? Color.surfaceSelected : (hovering ? Color.surfaceHover : Color.clear),
                    in: RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous))
        .contentShape(Rectangle())
        .onHover { hovering = $0 }
    }
}
