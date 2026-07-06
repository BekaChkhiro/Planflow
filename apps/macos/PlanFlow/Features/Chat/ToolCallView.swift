import SwiftUI

struct ToolCallView: View {
    let call: ToolCall
    @State private var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                expanded.toggle()
            } label: {
                HStack(spacing: Theme.Spacing.sm) {
                    statusIcon
                    Text(call.displayName).font(.callout.weight(.medium))
                    if let summary = call.summary {
                        Text(summary)
                            .font(.caption.monospaced())
                            .foregroundStyle(.secondary)
                            .lineLimit(1).truncationMode(.middle)
                    }
                    Spacer()
                    Image(systemName: expanded ? "chevron.down" : "chevron.right")
                        .font(.caption2).foregroundStyle(.tertiary)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if expanded {
                VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                    section("Input", text: call.input.displayString)
                    if let result = call.result, !result.isEmpty {
                        section(call.isError ? "Error" : "Result", text: result, isError: call.isError)
                    }
                }
                .padding(.top, Theme.Spacing.sm)
            }
        }
        .padding(Theme.Spacing.sm)
        .background(Color.cardBackground, in: RoundedRectangle(cornerRadius: Theme.Radius.sm))
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.sm)
            .strokeBorder(Color.separatorColor.opacity(0.5), lineWidth: 1))
    }

    private var statusIcon: some View {
        Group {
            if call.isRunning {
                ProgressView().controlSize(.mini)
            } else if call.isError {
                Image(systemName: "xmark.circle.fill").foregroundStyle(.red)
            } else {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
            }
        }
        .frame(width: 16)
    }

    private func section(_ title: String, text: String, isError: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
            ScrollView(.horizontal, showsIndicators: false) {
                Text(text.prefix(4000))
                    .font(.caption.monospaced())
                    .foregroundStyle(isError ? .red : .primary)
                    .textSelection(.enabled)
                    .fixedSize()
            }
            .frame(maxHeight: 220)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.sm)
        .background(Color.subtleBackground, in: RoundedRectangle(cornerRadius: Theme.Radius.sm))
    }
}
