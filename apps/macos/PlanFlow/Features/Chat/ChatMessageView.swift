import SwiftUI

struct ChatMessageView: View {
    let message: ChatMessage

    var body: some View {
        switch message.role {
        case .user: userBubble
        case .assistant: assistantBlock
        case .system: systemNote
        }
    }

    private var userBubble: some View {
        HStack {
            Spacer(minLength: 60)
            Text(message.text)
                .textSelection(.enabled)
                .padding(Theme.Spacing.md)
                .background(Theme.accent.opacity(0.18), in: RoundedRectangle(cornerRadius: Theme.Radius.md))
                .frame(maxWidth: 620, alignment: .trailing)
        }
    }

    private var assistantBlock: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.md) {
            avatar
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                if !message.thinking.isEmpty { ThinkingView(text: message.thinking) }
                ForEach(message.toolCalls) { call in
                    ToolCallView(call: call)
                }
                if !message.text.isEmpty {
                    if message.isError {
                        Text(message.text)
                            .textSelection(.enabled)
                            .foregroundStyle(.red)
                            .fixedSize(horizontal: false, vertical: true)
                    } else {
                        MarkdownView(markdown: message.text)
                    }
                }
                if message.isStreaming && !message.hasContent {
                    ProgressView().controlSize(.small)
                }
                if let cost = message.costUSD {
                    Text(String(format: "$%.4f", cost))
                        .font(.caption2).foregroundStyle(.tertiary)
                }
            }
            .frame(maxWidth: 820, alignment: .leading)
            Spacer(minLength: 40)
        }
    }

    private var avatar: some View {
        Circle().fill(Theme.accent.opacity(0.2))
            .frame(width: 28, height: 28)
            .overlay(Image(systemName: "sparkle").font(.caption).foregroundStyle(Theme.accent))
    }

    private var systemNote: some View {
        HStack(spacing: Theme.Spacing.sm) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
            Text(message.text).font(.callout).foregroundStyle(.secondary)
            Spacer()
        }
        .padding(Theme.Spacing.sm)
        .background(Color.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: Theme.Radius.sm))
    }
}

struct ThinkingView: View {
    let text: String
    @State private var expanded = false
    var body: some View {
        DisclosureGroup(isExpanded: $expanded) {
            Text(text)
                .font(.callout)
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, Theme.Spacing.xs)
        } label: {
            Label("Thinking", systemImage: "brain")
                .font(.caption).foregroundStyle(.secondary)
        }
    }
}
